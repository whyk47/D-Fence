-- =============================================================================================
-- D-Fence — migration 008: the Gravitrap feed's areas, and a fifth source name.
--
-- NEA publishes `d_5d060d8b7838a15e8906fb22c50dbf51`, "Areas with High Aedes Population", as
-- polygons: the areas where its Gravitraps caught relatively more Aedes aegypti. It is the feed
-- step 9 of PEST-PRIORITY-MODEL.md §8 names, and it is deliberately ingested here WITHOUT being
-- wired into the score. The reasons are in that document and unchanged: an eighth tier A driver
-- contradicts 4.2.5 as written, has no requirement behind it, and would redistribute seven weights
-- that were each argued for individually. What was blocked was the scoring decision, not the
-- evidence — so the evidence is now collected, dated and visible, and the decision is still the
-- team's to make on a feed they can look at.
--
-- The area is stored as a polygon and not as a flag on `cluster`, because the two are different
-- things: a high-Aedes area is NEA's geography, published on NEA's schedule, and a cluster that
-- moves or closes must not take an area's evidence with it. Which localities intersect which areas
-- is then a PostGIS question asked when someone asks it.
--
-- **Every table that constrains a source name is widened here, not one of them.** That is the
-- lesson of 006, where 005 had widened `ingestion_run_source_check` alone and the observation job
-- threw while recording that it had succeeded. `SourceKind` gains `Gravitrap`; all three tables
-- learn about it in the same migration.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS high_aedes_area (
  object_id    text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  boundary     geography(MultiPolygon, 4326) NOT NULL,
  -- The publisher's own stamp, never the load date — the same distinction 1.6.7 draws for the
  -- operator registry. A screen that showed the load date would say this evidence is current when
  -- what it means is that we fetched it recently.
  published_at timestamptz,
  ingested_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS high_aedes_area_idx ON high_aedes_area USING GIST (boundary);

ALTER TABLE ingestion_run DROP CONSTRAINT IF EXISTS ingestion_run_source_check;
ALTER TABLE ingestion_run ADD CONSTRAINT ingestion_run_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry','Gravitrap'));

ALTER TABLE source_state DROP CONSTRAINT IF EXISTS source_state_source_check;
ALTER TABLE source_state ADD CONSTRAINT source_state_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry','Gravitrap'));

ALTER TABLE source_health DROP CONSTRAINT IF EXISTS source_health_source_check;
ALTER TABLE source_health ADD CONSTRAINT source_health_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry','Gravitrap'));
