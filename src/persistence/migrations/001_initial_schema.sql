-- D-Fence — initial schema.
-- Hand-written, not ORM-generated: the entity class diagram is the source of truth and the
-- schema must be readable against it (Lab 2 AI-TECH-STACK.md §3).
-- TODO(Lab 3): one CREATE TABLE per entity class, in the order of lab3/class-diagram-design-entity.puml.

CREATE EXTENSION IF NOT EXISTS postgis;

-- TODO: account, session, audit_record
-- TODO: saved_location (point geography(Point,4326)), alert_subscription, alert
-- TODO: cluster (boundary geography(Polygon,4326)), cluster_snapshot, rainfall_station,
--       rainfall_reading, cluster_rainfall, region_forecast
-- TODO: priority_score, driver_contribution
-- TODO: report, report_photo, corroboration
-- TODO: work_order, completion_evidence, treatment_record
-- TODO: ingestion_run, source_health, configuration

-- Spatial indexes are not optional: 1.2.5, 3.1.8 and 5.1.7 are the three queries this schema
-- exists to make fast, and 10.1.3 bounds a 500-cluster scoring cycle at 60 seconds.
-- TODO: CREATE INDEX ... USING GIST (boundary);
-- TODO: CREATE INDEX ... USING GIST (point);
