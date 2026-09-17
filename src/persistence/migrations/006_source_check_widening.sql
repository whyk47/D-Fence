-- =============================================================================================
-- D-Fence — migration 006: the two source CHECKs that 005 missed.
--
-- 005 widened `ingestion_run_source_check` to admit 'Observations' and 'OperatorRegistry', and
-- stopped there. `source_state` and `source_health` carry the *same* list of sources in their own
-- CHECK constraints, written in 001 when there were four sources and no reason to think there would
-- ever be more. Both were left narrow.
--
-- The symptom was not a failed insert in isolation. `IngestionRunRepository.recordRun` updates
-- `source_state` after a successful run, so the observation job downloaded from iNaturalist,
-- admitted its records, stored them, wrote its `ingestion_run` row — and then threw
-- `new row for relation "source_state" violates check constraint "source_state_source_check"`
-- while recording that it had succeeded. The exception propagated out of `observationCycle` and
-- aborted the rest of the cycle, so a feed that worked perfectly took the cycle down at the last
-- step. Observed on the live instance at 2026-09-17 01:58Z.
--
-- The lesson 005 should have applied and did not: a source is named in three tables, not one.
-- Widening one of them is not widening the set of sources the system accepts.
-- =============================================================================================

ALTER TABLE source_state DROP CONSTRAINT IF EXISTS source_state_source_check;
ALTER TABLE source_state ADD CONSTRAINT source_state_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry'));

ALTER TABLE source_health DROP CONSTRAINT IF EXISTS source_health_source_check;
ALTER TABLE source_health ADD CONSTRAINT source_health_source_check
  CHECK (source IN ('Clusters','Rainfall','Forecast','Geocoding','Observations','OperatorRegistry'));
