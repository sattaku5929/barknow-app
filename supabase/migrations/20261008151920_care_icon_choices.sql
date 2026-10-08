-- Expand icon choices only. Existing rows, completions, RLS and policies remain unchanged.
BEGIN;
ALTER TABLE public.wt_care_goals DROP CONSTRAINT wt_care_goals_goal_type_check;
ALTER TABLE public.wt_care_goals ADD CONSTRAINT wt_care_goals_goal_type_check
  CHECK (goal_type IN ('brush','teeth','paws','bath','nails','ears','training','custom','walk','meal','water','toilet','sleep','home','ball','toy','nose','book','star','people','hospital','medicine','vaccine','weight','temperature','shield','car','travel','school','park','birthday','camera'));
COMMIT;
