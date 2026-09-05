-- =============================================================================================
-- D-Fence — migration 003: the audit trail's two identifier columns become text.
--
-- 001 typed `account_id` and `target_id` as `uuid`, on the reasonable assumption that everything
-- the system audits is keyed by one. It is not, and the exceptions are not edge cases:
--
--   * `SYSTEM_ACTOR_ID` is the literal string `'system'`. 1.1.x's scheduled ingestion and 4.1.x's
--     scoring cycle act with no signed-in user behind them, and 2.4.1 still wants an actor. A uuid
--     column cannot hold that, so every row the system itself would write was refused.
--   * A photograph's audit row names the object by its storage key, which is a UUID *plus an
--     extension* (`…-….jpg`). Close enough to look like a uuid, not close enough to cast as one.
--
-- **Why this was invisible.** `AuditRepository.append` swallows a failure deliberately — a logging
-- error must not turn a clean 403 into a 500, nor roll back a transition that already succeeded —
-- so a rejected INSERT would have produced a log line and a missing row rather than a visible
-- error. A constraint that silently drops the rows it dislikes is worse than no constraint, and
-- worst of all in the one table whose value is completeness.
--
-- The table is empty in every environment at the time of writing (this is the migration that makes
-- it start filling), so the conversion is unconditional and loses nothing. `USING … ::text` keeps
-- the cast explicit rather than relying on an implicit one.
--
-- 2.4.2's append-only trigger is untouched and still applies: ALTER TABLE is not UPDATE or DELETE
-- of a row, so the trigger neither fires nor needs to be dropped.
-- =============================================================================================

ALTER TABLE audit_record ALTER COLUMN account_id TYPE text USING account_id::text;
ALTER TABLE audit_record ALTER COLUMN target_id TYPE text USING target_id::text;

-- 2.4.1 names four things and an actor is one of them; a row without one is not a trail entry.
ALTER TABLE audit_record ALTER COLUMN account_id SET NOT NULL;

-- The trail is read two ways — newest-first across everything (2.4.1) and newest-first for one
-- entity (the work-order history `WorkOrderRoutes` promises). 001 indexed only the first. Without
-- this the per-entity read is a sequential scan over a table that only ever grows.
CREATE INDEX IF NOT EXISTS audit_record_target_idx
  ON audit_record (target_entity, target_id, occurred_at DESC);
