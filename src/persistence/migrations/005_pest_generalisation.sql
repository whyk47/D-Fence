-- =============================================================================================
-- D-Fence — migration 005: the v0.9 cross-pest model gets somewhere to live.
--
-- The generalisation shipped with entities, controllers, screens and 769 passing tests, and with
-- **no schema behind any of it**. Every test runs against the in-memory stores, so the gap was
-- invisible to the suite by construction: the only configuration that loses data is the one with a
-- database attached, which is the deployed one.
--
-- The severe case is `report`. `Report.pestType` is written by the form (5.1.15), enforced by the
-- controller, and read by 8.1.14 to decide whether a crew is sent or a referral is raised — and
-- `ReportRepository` had no column to put it in. A deployed instance would have accepted a snake
-- report and stored a report of no particular pest, then dispatched a cleaning crew to it. Nothing
-- would have errored.
--
-- The rest of this migration is the new model's own tables. They are additive: nothing here
-- rewrites a v0.8 row, and a v0.8 deployment that never loads `config/pests.default.json` keeps
-- scoring exactly as it did — which is 4.2.5 in operational form.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- §5.1 Reports carry a pest
-- ---------------------------------------------------------------------------------------------

-- Defaulted to Mosquito rather than left NULL. Every report that exists when this migration runs
-- was filed under the dengue-only product, so Mosquito is what those reports *are*; a NULL would
-- be a claim that we do not know, which is false and which 8.1.14 would then have to handle.
ALTER TABLE report ADD COLUMN IF NOT EXISTS pest_type text NOT NULL DEFAULT 'Mosquito';

-- 5.1.16 — mandatory for wildlife, absent for everything else, so it is nullable and the rule
-- lives in the controller. A CHECK constraint here would need to know each pest's class, which is
-- configuration (10.6.2) and does not belong in the schema.
ALTER TABLE report ADD COLUMN IF NOT EXISTS location_context text
  CHECK (location_context IS NULL OR location_context IN ('Indoor','Outdoor'));

-- 5.1.17 — optional on any report; 4.4.8 turns on it.
ALTER TABLE report ADD COLUMN IF NOT EXISTS injury_reported boolean NOT NULL DEFAULT false;

-- 4.1.3, 4.1.23, 4.1.26 — the scoring cycle now groups reports by (locality, pest) rather than by
-- locality alone, which is a different query and wants a different index.
CREATE INDEX IF NOT EXISTS report_locality_pest_idx ON report (cluster_id, pest_type)
  WHERE cluster_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- §4 Scores are keyed by locality AND pest
-- ---------------------------------------------------------------------------------------------

ALTER TABLE priority_score ADD COLUMN IF NOT EXISTS pest_type text NOT NULL DEFAULT 'Mosquito';

-- 4.4.5 — the critical override raises the tier and never the score, so Critical has to be a tier
-- the column will accept. Dropping and re-adding the constraint is the only way to widen a CHECK.
ALTER TABLE priority_score DROP CONSTRAINT IF EXISTS priority_score_tier_check;
ALTER TABLE priority_score ADD CONSTRAINT priority_score_tier_check
  CHECK (tier IN ('Critical','High','Medium','Low','Cancelled'));

-- The old uniqueness was (cluster_id, computed_at), which was correct while a locality had exactly
-- one score. A locality now has one score *per pest*, and leaving this alone would have let the
-- second pest scored in a cycle silently fail to insert.
ALTER TABLE priority_score DROP CONSTRAINT IF EXISTS priority_score_cluster_id_computed_at_key;
CREATE UNIQUE INDEX IF NOT EXISTS priority_score_locality_pest_at_key
  ON priority_score (cluster_id, pest_type, computed_at);

-- ---------------------------------------------------------------------------------------------
-- §1.5 Observations  ·  §1.6 The operator registry
-- ---------------------------------------------------------------------------------------------

ALTER TABLE ingestion_run DROP CONSTRAINT IF EXISTS ingestion_run_source_check;
ALTER TABLE ingestion_run ADD CONSTRAINT ingestion_run_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry'));

-- 1.5.14 — nullable, and null for every source but Observations. The reasoning for putting these
-- on the shared table rather than in a second run table is in `entity/IngestionRun.ts`: 1.4.x reads
-- run history across all sources, and a separate table means either a union in every one of those
-- queries or a feed the health view cannot see.
ALTER TABLE ingestion_run ADD COLUMN IF NOT EXISTS pest_type text;
ALTER TABLE ingestion_run ADD COLUMN IF NOT EXISTS accepted_count integer;
ALTER TABLE ingestion_run ADD COLUMN IF NOT EXISTS rejected_count integer;

-- 1.5.11 — the supplier's own id is the primary key. That is the whole requirement: overlapping
-- runs re-present records we already hold, and a surrogate key would store each of them again,
-- inflating the density driver by exactly the overlap.
CREATE TABLE IF NOT EXISTS observation_record (
  observation_id        text PRIMARY KEY,
  pest_type             text NOT NULL,
  taxon_name            text NOT NULL,
  observed_on           date NOT NULL,                              -- 1.5.3
  point                 geography(Point, 4326) NOT NULL,
  -- 1.5.7 admits an absent accuracy: an unreported accuracy is not a bad one, and rejecting those
  -- would discard most of the older records in the window.
  positional_accuracy_m integer,
  quality_grade         text NOT NULL,
  -- 1.5.10 discards a record that binds to no locality, so a stored row always has one.
  locality_id           uuid NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  ingested_at           timestamptz NOT NULL DEFAULT now()
);
-- 4.1.24's input: count by pest, locality and window, which is one index.
CREATE INDEX IF NOT EXISTS observation_locality_pest_idx
  ON observation_record (locality_id, pest_type, observed_on DESC);

-- 1.6 — reference data, not a feed. `published_at` is the *source dataset's* publication date and
-- never the load date: 1.6.7 forbids presenting this as live, and the date is the only thing that
-- makes that visible to a viewer. It was 2024-06-06 when the dataset was verified.
CREATE TABLE IF NOT EXISTS vector_control_operator (
  postal_code     text NOT NULL,                                    -- 1.6.3, six digits
  company_name    text NOT NULL,
  block_or_house  text NOT NULL,
  street_name     text NOT NULL,
  telephone       text NOT NULL,
  -- Nullable: 1.6.4 may fail for one address without the registry failing to load, and such a row
  -- is kept rather than dropped — its name and telephone are still useful, and 1.6.8 skips it.
  point           geography(Point, 4326),
  published_at    timestamptz,
  PRIMARY KEY (postal_code, company_name)
);
CREATE INDEX IF NOT EXISTS vco_point_idx ON vector_control_operator USING GIST (point);

-- 1.6.5 — the geocode cache, separate from the registry and deliberately so. It must outlive any
-- single load: the registry is replaced wholesale on every successful load, and a cache inside it
-- would be discarded with the rows it belonged to, making every restart re-resolve all 290.
CREATE TABLE IF NOT EXISTS geocode_cache (
  postal_code text PRIMARY KEY,
  point       geography(Point, 4326) NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------------------------
-- §8.6 Referrals
-- ---------------------------------------------------------------------------------------------

-- 8.6.10 — a referral produces no work order. Its own table rather than a flag on `work_order`,
-- for the reason recorded on ReferralStore: giving the two one home is how someone eventually
-- writes a work order for a referred report.
CREATE TABLE IF NOT EXISTS referral (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES report(id) ON DELETE CASCADE,
  pest_type    text NOT NULL,
  authority    text NOT NULL,                                       -- 4.2.3
  contact      text NOT NULL,
  reason       text NOT NULL,
  referred_by  uuid REFERENCES account(id) ON DELETE SET NULL,
  referred_at  timestamptz NOT NULL DEFAULT now(),
  -- 8.6.8 — the outcome the authority reported back, null while the referral is open.
  outcome      text,
  outcome_at   timestamptz
);
-- 8.6.7 — a referred report is shown as referred, which is a lookup by report.
CREATE UNIQUE INDEX IF NOT EXISTS referral_report_idx ON referral (report_id);
CREATE INDEX IF NOT EXISTS referral_open_idx ON referral (referred_at DESC) WHERE outcome IS NULL;
