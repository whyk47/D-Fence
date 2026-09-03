-- D-Fence — initial schema.
--
-- Hand-written, not ORM-generated: the entity class diagram is the source of truth and the schema
-- must be readable against it (Lab 2 AI-TECH-STACK.md §3). One table per entity class, in the order
-- of lab3/class-diagram-design-entity.puml, with the requirement each non-obvious column serves.
--
-- Three conventions, chosen once and applied throughout:
--
--  1. **Enumerations are `text` with a CHECK**, not Postgres ENUM types. An ENUM cannot have a value
--     removed and needs ALTER TYPE to gain one; a CHECK is a one-line migration. The constraint is
--     still real — an unknown status is rejected by the database, not merely by TypeScript.
--  2. **Spatial columns are `geography`, not `geometry`.** Distances in §1.2.5, §3.1.8 and §5.1.7
--     are in metres over Singapore, and `geography` measures metres on a spheroid. `geometry`
--     would measure degrees and every threshold in the requirements would silently be wrong.
--  3. **Timestamps are `timestamptz`.** A `timestamp` without a zone in a system whose calendar
--     dates are Singapore's is how the 2026-09-04 overdue defect happened in application code; the
--     database will not repeat it. Calendar dates that are genuinely dates (a scheduled date, a
--     completion date) stay `date`.

CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================================
-- §2 Accounts, roles and access control
-- =============================================================================================

CREATE TABLE IF NOT EXISTS account (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,                          -- 2.1.1, 2.1.4
  auth_user_id     text NOT NULL DEFAULT '',                      -- the provider owns the credential (10.3.1)
  email_verified   boolean NOT NULL DEFAULT false,                -- 2.1.6
  role             text NOT NULL CHECK (role IN ('Resident', 'OperationsManager', 'CleaningCrew')),
  is_active        boolean NOT NULL DEFAULT true,                 -- 2.2.5
  telegram_chat_id text,                                          -- 6.1.6, null until linked
  -- 2.1.10 is five consecutive failures within fifteen minutes, so a bare counter is not enough:
  -- first_failure_at is what makes the window real.
  failed_attempts  integer NOT NULL DEFAULT 0,
  first_failure_at timestamptz,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token          text NOT NULL UNIQUE,                            -- 2.1.8
  issued_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),              -- 2.1.9's inactivity timeout
  terminated_at  timestamptz                                      -- 2.1.12
);
CREATE INDEX IF NOT EXISTS session_account_idx ON session (account_id);

-- 2.4.1: actor, action, target entity id, timestamp. All four, or it is not the trail.
CREATE TABLE IF NOT EXISTS audit_record (
  id            bigserial PRIMARY KEY,
  account_id    uuid NOT NULL,                                    -- deliberately NOT a foreign key: see below
  action        text NOT NULL,
  target_entity text NOT NULL,
  target_id     uuid,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
-- No FK to account, and no ON DELETE CASCADE anywhere near this table. 10.4.3 deletes an account;
-- 2.4.2 says the audit record may not be deleted by any role. A cascade would make the second rule
-- false whenever the first one ran, and the row proving a deletion happened would be the row the
-- deletion destroyed. The id survives as an opaque key to an account that no longer exists.
CREATE INDEX IF NOT EXISTS audit_record_occurred_idx ON audit_record (occurred_at DESC);

-- 2.4.2 — enforced by the database, not by the absence of a method in the repository. The
-- application connects as the project owner, so REVOKE would not bind it; a trigger does.
CREATE OR REPLACE FUNCTION audit_record_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit records cannot be % (2.4.2)', lower(TG_OP);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_record_no_change ON audit_record;
CREATE TRIGGER audit_record_no_change
  BEFORE UPDATE OR DELETE ON audit_record
  FOR EACH ROW EXECUTE FUNCTION audit_record_is_append_only();

-- =============================================================================================
-- §1.1 Clusters
-- =============================================================================================

CREATE TABLE IF NOT EXISTS cluster (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id           text NOT NULL UNIQUE,                       -- 1.1.5, the NEA feed's identity
  locality            text NOT NULL,
  boundary            geography(Polygon, 4326) NOT NULL,          -- 3.1.8, 5.1.7
  case_size           integer NOT NULL CHECK (case_size >= 0),
  case_delta          integer NOT NULL DEFAULT 0,                 -- 1.1.8
  change_class        text NOT NULL CHECK (change_class IN ('NEW','GROWN','UNCHANGED','SHRUNK','CLOSED')),
  trajectory          text NOT NULL CHECK (trajectory IN ('Growing','Stable','Receding')),
  -- 1.1.15: comma-separated free text naming breeding-habitat types, not counts. Frequently null
  -- in the live feed, which is why 1.1.16 defines the empty case.
  habitats_homes              text[] NOT NULL DEFAULT '{}',
  habitats_public_places      text[] NOT NULL DEFAULT '{}',
  habitats_construction_sites text[] NOT NULL DEFAULT '{}',
  forecast_region     text CHECK (forecast_region IN ('north','south','east','west','central')),  -- 1.3.2
  heavy_rain_expected boolean NOT NULL DEFAULT false,             -- 1.3.3
  forecast_valid_from timestamptz,                                -- 1.3.4
  forecast_valid_to   timestamptz,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),         -- 1.1.6
  last_updated_at     timestamptz NOT NULL DEFAULT now(),         -- 1.1.7
  is_active           boolean NOT NULL DEFAULT true               -- 1.1.10
);
-- Not optional. 1.2.5, 3.1.8 and 5.1.7 are the three queries this schema exists to make fast, and
-- 10.1.3 bounds a 500-cluster scoring cycle at 60 seconds.
CREATE INDEX IF NOT EXISTS cluster_boundary_idx ON cluster USING GIST (boundary);
CREATE INDEX IF NOT EXISTS cluster_active_idx ON cluster (is_active) WHERE is_active;

-- 1.1.5: append only. Snapshots are never overwritten — 1.1.8, 9.1.9 and 9.1.10 depend on history.
CREATE TABLE IF NOT EXISTS cluster_snapshot (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id   uuid NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL,
  case_size    integer NOT NULL,
  boundary     geography(Polygon, 4326) NOT NULL,
  fmel_upd_d   text NOT NULL DEFAULT ''                           -- the feed's own stamp (1.1.20)
);
CREATE INDEX IF NOT EXISTS cluster_snapshot_cluster_idx ON cluster_snapshot (cluster_id, retrieved_at DESC);
-- 7.3.1 reads every cluster's snapshots for a 30-day window, closed clusters included.
CREATE INDEX IF NOT EXISTS cluster_snapshot_retrieved_idx ON cluster_snapshot (retrieved_at);

-- =============================================================================================
-- §1.2 Rainfall  ·  §1.3 Forecast
-- =============================================================================================

CREATE TABLE IF NOT EXISTS rainfall_station (
  station_id text PRIMARY KEY,                                    -- the agency's id, not ours
  name       text NOT NULL,
  point      geography(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS rainfall_station_point_idx ON rainfall_station USING GIST (point);

CREATE TABLE IF NOT EXISTS rainfall_reading (
  station_id text NOT NULL REFERENCES rainfall_station(station_id) ON DELETE CASCADE,
  reading_at timestamptz NOT NULL,
  value_mm   numeric(6,2) NOT NULL CHECK (value_mm >= 0),
  -- 1.2.x: readings arrive in overlapping pages during a backfill, so the same reading is offered
  -- repeatedly. The key makes re-ingestion idempotent instead of duplicating the accumulation.
  PRIMARY KEY (station_id, reading_at)
);
CREATE INDEX IF NOT EXISTS rainfall_reading_at_idx ON rainfall_reading (reading_at DESC);

-- 1.2.6, 1.2.7, 1.2.8 — the per-cluster value and its rolling windows.
CREATE TABLE IF NOT EXISTS cluster_rainfall (
  cluster_id   uuid PRIMARY KEY REFERENCES cluster(id) ON DELETE CASCADE,
  current_mm   numeric(6,2) NOT NULL DEFAULT 0,
  accum_24h_mm numeric(7,1) NOT NULL DEFAULT 0,
  accum_72h_mm numeric(7,1) NOT NULL DEFAULT 0,
  is_stale     boolean NOT NULL DEFAULT true,                     -- 1.2.10
  computed_at  timestamptz NOT NULL DEFAULT now()
);

-- 1.3.5 — the flag's basis has to outlive the cycle that read it, so this is history, not a cache.
CREATE TABLE IF NOT EXISTS region_forecast (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region              text NOT NULL CHECK (region IN ('north','south','east','west','central')),
  forecast_text       text NOT NULL,
  heavy_rain_expected boolean NOT NULL,
  valid_from          timestamptz NOT NULL,                       -- 1.3.4
  valid_to            timestamptz NOT NULL,
  retrieved_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS region_forecast_latest_idx ON region_forecast (region, retrieved_at DESC);

-- =============================================================================================
-- §1.1/§1.4 Ingestion bookkeeping
-- =============================================================================================

CREATE TABLE IF NOT EXISTS ingestion_run (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  feature_count integer NOT NULL DEFAULT 0,                       -- 1.1.14
  -- 1.1.21: UNCHANGED is a success. A publisher that published nothing is evidence the source is
  -- alive, and 1.4.3 must not call a healthy feed stale because NEA had a quiet hour.
  outcome       text NOT NULL CHECK (outcome IN ('RUNNING','SUCCESS','UNCHANGED','FAILED')),
  trigger       text NOT NULL CHECK (trigger IN ('SCHEDULED','MANUAL'))
);
CREATE INDEX IF NOT EXISTS ingestion_run_source_idx ON ingestion_run (source, started_at DESC);

-- 1.1.20 — the publisher stamp at the last successful download, one row per source.
CREATE TABLE IF NOT EXISTS source_state (
  source           text PRIMARY KEY CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding')),
  publisher_stamp  text,
  marked_stale_at  timestamptz                                    -- 10.2.2
);

-- 1.4.1, 1.4.2 — derived on read by SourceHealthController, stored so a screen can page it.
CREATE TABLE IF NOT EXISTS source_health (
  source          text PRIMARY KEY CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding')),
  last_success_at timestamptz,
  is_warning      boolean NOT NULL DEFAULT false                  -- 1.4.3
);

-- =============================================================================================
-- §4 Priority scoring
-- =============================================================================================

CREATE TABLE IF NOT EXISTS priority_score (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       uuid NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  computed_at      timestamptz NOT NULL,
  score            numeric(6,2) NOT NULL,
  tier             text NOT NULL CHECK (tier IN ('High','Medium','Low','Cancelled')),
  -- 4.1.12: a driver that could not be computed is EXCLUDED and the score marked, because "no
  -- rainfall data" and "no rain" are different facts and the score has to tell them apart.
  is_degraded      boolean NOT NULL DEFAULT false,
  excluded_drivers text[] NOT NULL DEFAULT '{}',
  rank             integer NOT NULL,                              -- 4.1.14
  UNIQUE (cluster_id, computed_at)                                -- 4.1.11 keeps history, not a latest row
);
CREATE INDEX IF NOT EXISTS priority_score_latest_idx ON priority_score (computed_at DESC, rank);

-- 7.2.6 — the breakdown travels with the score so expanding a row costs no round trip.
CREATE TABLE IF NOT EXISTS driver_contribution (
  priority_score_id uuid NOT NULL REFERENCES priority_score(id) ON DELETE CASCADE,
  driver            text NOT NULL,
  raw_value         numeric(10,3) NOT NULL,
  normalised_value  numeric(6,4) NOT NULL,
  weight            numeric(4,3) NOT NULL,
  contribution      numeric(6,3) NOT NULL,
  PRIMARY KEY (priority_score_id, driver)
);

-- =============================================================================================
-- §3 Saved locations and exposure  ·  §6 Alerts
-- =============================================================================================

CREATE TABLE IF NOT EXISTS saved_location (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,  -- 10.4.3 deletes these outright
  input_text        text NOT NULL,
  resolved_address  text NOT NULL,
  point             geography(Point, 4326) NOT NULL,
  label             text NOT NULL CHECK (label IN ('Home','Workplace','School','Other')),
  name              text NOT NULL,
  exposure_status   text NOT NULL CHECK (exposure_status IN ('IN_CLUSTER','WITHIN_150M','CLEAR')),
  exposure_cluster_id       uuid REFERENCES cluster(id) ON DELETE SET NULL,
  exposure_cluster_locality text,
  exposure_case_size        integer,
  exposure_distance_metres  numeric(8,1),
  exposure_data_timestamp   timestamptz,
  rain_24h_mm       numeric(7,1),
  rain_72h_mm       numeric(7,1),
  -- Null until the first evaluation: an unevaluated location must not read as "checked just now
  -- and found clear", which is what a default of now() would say.
  evaluated_at      timestamptz
);
CREATE INDEX IF NOT EXISTS saved_location_point_idx ON saved_location USING GIST (point);
CREATE INDEX IF NOT EXISTS saved_location_account_idx ON saved_location (account_id);

CREATE TABLE IF NOT EXISTS alert_subscription (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_location_id uuid NOT NULL REFERENCES saved_location(id) ON DELETE CASCADE,  -- 3.1.12
  account_id        uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT false,               -- 6.1.1: absence means "not asked for"
  growth_threshold  integer NOT NULL DEFAULT 5 CHECK (growth_threshold >= 1),  -- 6.1.3, 6.1.4
  triggers          text[] NOT NULL DEFAULT '{}',
  UNIQUE (saved_location_id)
);

CREATE TABLE IF NOT EXISTS alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_location_id uuid REFERENCES saved_location(id) ON DELETE SET NULL,
  account_id        uuid NOT NULL,
  trigger_type      text NOT NULL CHECK (trigger_type IN ('EnteredCluster','ClusterGrowth','HeavyRainForecast')),
  sent_at           timestamptz NOT NULL DEFAULT now(),
  outcome           text NOT NULL CHECK (outcome IN ('Sent','Failed','Suppressed')),  -- 6.1.10
  attempts          integer NOT NULL DEFAULT 0 CHECK (attempts <= 3),                 -- 6.1.11
  payload           text NOT NULL,                                                    -- 6.1.8
  facts             jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- 6.1.9 — one alert per location per trigger type per 24 hours is answered by this index.
CREATE INDEX IF NOT EXISTS alert_cap_idx ON alert (saved_location_id, trigger_type, sent_at DESC);
CREATE INDEX IF NOT EXISTS alert_account_idx ON alert (account_id, sent_at DESC);

-- =============================================================================================
-- §5 Community reporting
-- =============================================================================================

CREATE TABLE IF NOT EXISTS report (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable, and ON DELETE SET NULL rather than CASCADE: 10.4.3 severs the reporter and keeps the
  -- report, because a verified report is evidence a crew was sent somewhere and 8.1.13 may link it
  -- to a work order. Cascading would rewrite an operational history other people acted on.
  reporter_id         uuid REFERENCES account(id) ON DELETE SET NULL,
  point               geography(Point, 4326) NOT NULL,
  type                text NOT NULL CHECK (type IN ('StandingWater','UnclearedRefuse','BlockedDrain','OvergrownVegetation','Other')),
  description         text NOT NULL CHECK (length(description) <= 500),   -- 5.1.4
  status              text NOT NULL CHECK (status IN ('Submitted','Verified','Rejected','Actioned','Closed')),
  cluster_id          uuid REFERENCES cluster(id) ON DELETE SET NULL,     -- 5.1.7, containment only
  locality_binding    text NOT NULL,                                      -- 5.1.8, 5.1.9
  corroboration_count integer NOT NULL DEFAULT 0,                         -- 5.1.14
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  moderator_id        uuid REFERENCES account(id) ON DELETE SET NULL,     -- 5.3.4
  moderated_at        timestamptz,
  moderation_reason   text,
  work_order_id       uuid                                                -- FK added after work_order exists
);
CREATE INDEX IF NOT EXISTS report_point_idx ON report USING GIST (point);
CREATE INDEX IF NOT EXISTS report_status_idx ON report (status, submitted_at);
-- 5.2.5 into 4.1.3: the verified-open count per cluster, in one query per scoring cycle.
CREATE INDEX IF NOT EXISTS report_cluster_open_idx ON report (cluster_id) WHERE status IN ('Verified','Actioned');

-- 8.3.21 needs the status a report held BEFORE it was Actioned, and a single previous_status column
-- would be wrong the moment a report is actioned, restored and actioned again.
CREATE TABLE IF NOT EXISTS report_status_change (
  id          bigserial PRIMARY KEY,
  report_id   uuid NOT NULL REFERENCES report(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_status_change_idx ON report_status_change (report_id, changed_at);

CREATE TABLE IF NOT EXISTS report_photo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES report(id) ON DELETE CASCADE,
  -- 10.3.5: the database holds the key, never the image, and the key is random rather than the
  -- uploaded filename — a filename leaks the reporter's device naming and makes URLs guessable.
  storage_key  text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),  -- 5.1.6
  size_bytes   integer NOT NULL CHECK (size_bytes <= 5242880)                     -- 5.1.6
);
CREATE INDEX IF NOT EXISTS report_photo_report_idx ON report_photo (report_id);

CREATE TABLE IF NOT EXISTS corroboration (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES report(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  -- 5.1.13 — a resident may confirm a given report once. Enforced here so a double-tap on a slow
  -- connection cannot raise the count a manager reads as "several neighbours saw this".
  UNIQUE (report_id, account_id)
);

-- =============================================================================================
-- §8 Work orders
-- =============================================================================================

CREATE TABLE IF NOT EXISTS work_order (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id          uuid NOT NULL REFERENCES cluster(id) ON DELETE RESTRICT,
  assignee_id         uuid REFERENCES account(id) ON DELETE SET NULL,
  source_report_id    uuid REFERENCES report(id) ON DELETE SET NULL,        -- 8.1.2
  task_type           text NOT NULL CHECK (task_type IN ('Fogging','LarvicideApplication','SourceRemoval','Inspection')),
  scheduled_date      date NOT NULL,                                        -- a date, not an instant
  priority            text NOT NULL CHECK (priority IN ('High','Medium','Low','Cancelled')),
  instructions        text NOT NULL DEFAULT '' CHECK (length(instructions) <= 1000),  -- 8.1.6
  status              text NOT NULL CHECK (status IN ('Created','Assigned','Accepted','InProgress','Completed','Verified','Rejected','Cancelled')),
  started_at          timestamptz,                                          -- 8.3.17, the work's start
  created_at          timestamptz NOT NULL DEFAULT now(),                   -- 7.3.4's left-hand end
  verified_at         timestamptz,                                          -- 7.3.4's right-hand end
  cancellation_reason text,                                                 -- 8.3.18
  issue_flag          boolean NOT NULL DEFAULT false,                       -- 8.3.8
  issue_reason        text
);
CREATE INDEX IF NOT EXISTS work_order_assignee_idx ON work_order (assignee_id, status);
CREATE INDEX IF NOT EXISTS work_order_cluster_open_idx ON work_order (cluster_id)
  WHERE status NOT IN ('Verified','Cancelled');                             -- 8.1.11
CREATE INDEX IF NOT EXISTS work_order_verified_idx ON work_order (verified_at) WHERE verified_at IS NOT NULL;

ALTER TABLE report DROP CONSTRAINT IF EXISTS report_work_order_fk;
ALTER TABLE report ADD CONSTRAINT report_work_order_fk
  FOREIGN KEY (work_order_id) REFERENCES work_order(id) ON DELETE SET NULL; -- 8.1.13, 8.5.1

-- 8.2.7 — every previous assignee is retained, so "who was on this before" has an answer.
CREATE TABLE IF NOT EXISTS work_order_assignment (
  id            bigserial PRIMARY KEY,
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  assignee_id   uuid REFERENCES account(id) ON DELETE SET NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_assignment_idx ON work_order_assignment (work_order_id, assigned_at);

CREATE TABLE IF NOT EXISTS completion_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id    uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  completed_at     timestamptz NOT NULL,
  task_performed   text NOT NULL,
  notes            text NOT NULL DEFAULT '',
  photo_keys       text[] NOT NULL DEFAULT '{}',                            -- 8.3.6
  rejection_reason text,                                                    -- 8.3.10
  submitted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS completion_evidence_idx ON completion_evidence (work_order_id, submitted_at DESC);

-- 8.3.12 — written when a work order is Verified; it is what moves 4.1.15's driver.
CREATE TABLE IF NOT EXISTS treatment_record (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id      uuid NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  work_order_id   uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  task_type       text NOT NULL,
  -- 8.3.12 names the COMPLETION date, not the verification date: the treatment happened when the
  -- crew did the work, and 4.1.15 measures recency from that. A Singapore calendar date.
  completion_date date NOT NULL
);
CREATE INDEX IF NOT EXISTS treatment_record_cluster_idx ON treatment_record (cluster_id, completion_date DESC);

-- =============================================================================================
-- §10.6.2 Configuration outside the code
-- =============================================================================================

CREATE TABLE IF NOT EXISTS configuration (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
