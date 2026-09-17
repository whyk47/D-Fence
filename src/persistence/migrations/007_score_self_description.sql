-- =============================================================================================
-- D-Fence — migration 007: the four things a score knows about itself and did not survive a restart.
--
-- `PriorityScore` carries urgency (4.1.7), the severity multiplier (4.2.8), the evidence tier
-- (4.3.9) and the name of the override rule that raised it to Critical (4.4.6). The table stored
-- none of them. Everything read back from the database therefore came back with those fields
-- unset, and `PestPriorityCalculator.describe` — the string 7.2.x puts beside the number — rendered
-- "evidence tier ?, severity ?" for every row that was not still in memory from the current cycle.
-- Worse for 4.4.6: a Critical row reloaded after a restart showed the tier and no reason for it,
-- which is the one thing 4.4.6 exists to prevent.
--
-- All four are NULLable and nothing is backfilled. Urgency for a historical mosquito row is
-- recoverable in principle (score / 100, because sigma(Mosquito) = 1.000 by construction) but
-- writing it would turn a derivation into a stored fact, and the first pest whose multiplier is not
-- 1.000 would make the same column mean two different things. A row written before this migration
-- does not know its urgency; NULL says so, and `describe` already renders "?" for it.
--
-- `override_rule_name` is the exception and is NOT NULL DEFAULT ''. Critical only became an
-- assignable tier in 005 and the override evaluator was not wired into the scoring cycle until
-- 2026-09-17, so no row that exists as this migration runs was raised by a rule. '' is not a
-- backfilled guess here; it is the true value for every one of them.
-- =============================================================================================

ALTER TABLE priority_score ADD COLUMN IF NOT EXISTS urgency numeric(6,5);
ALTER TABLE priority_score ADD COLUMN IF NOT EXISTS severity_multiplier numeric(4,3);
ALTER TABLE priority_score ADD COLUMN IF NOT EXISTS evidence_tier text;
ALTER TABLE priority_score ADD COLUMN IF NOT EXISTS override_rule_name text NOT NULL DEFAULT '';

-- NULL passes a CHECK, so this constrains the values that are present without asserting anything
-- about the rows that predate the column.
ALTER TABLE priority_score DROP CONSTRAINT IF EXISTS priority_score_evidence_tier_check;
ALTER TABLE priority_score ADD CONSTRAINT priority_score_evidence_tier_check
  CHECK (evidence_tier IS NULL OR evidence_tier IN ('A','B','C'));
