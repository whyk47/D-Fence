-- =============================================================================================
-- D-Fence — migration 002: align work_order.task_type with the TaskType enumeration.
--
-- 001 constrained the column to ('Fogging','LarvicideApplication','SourceRemoval','Inspection'),
-- which is not the enumeration the code has ever used. `entity/enums.ts` defines TaskType as
-- Fogging, Larviciding, RefuseClearance, DrainClearance and Inspection — the five task types
-- 8.1.4 names — so every work order the application could actually raise would have been refused
-- by the check constraint the moment work orders moved onto Postgres.
--
-- The constraint is corrected rather than dropped: a column that accepts any text is a column that
-- will one day hold a typo, and 8.3.7 has the completion evidence copy its task type from the work
-- order, so a bad value would propagate into the treatment record and out into 4.1.15's driver.
-- =============================================================================================

ALTER TABLE work_order DROP CONSTRAINT IF EXISTS work_order_task_type_check;
ALTER TABLE work_order ADD CONSTRAINT work_order_task_type_check
  CHECK (task_type IN ('Fogging','Larviciding','RefuseClearance','DrainClearance','Inspection'));

-- 001's priority check admitted 'Cancelled', which is a work-order STATUS and not a PriorityTier.
-- A cancelled work order keeps the priority it was raised at; its cancellation lives in `status`.
ALTER TABLE work_order DROP CONSTRAINT IF EXISTS work_order_priority_check;
ALTER TABLE work_order ADD CONSTRAINT work_order_priority_check
  CHECK (priority IN ('High','Medium','Low'));
