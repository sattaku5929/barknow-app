-- Keep canonical keys, uniqueness, ownership policies and existing rows intact.
-- sort_order expresses display order, not a limit on selected themes.
ALTER TABLE public.wt_dog_observation_themes
  DROP CONSTRAINT wt_dog_observation_themes_sort_order_check;
ALTER TABLE public.wt_dog_observation_themes
  ADD CONSTRAINT wt_dog_observation_themes_sort_order_check CHECK (sort_order >= 1);
COMMENT ON TABLE public.wt_dog_observation_themes IS
  'Canonical observation themes selected for each dog; multiple selections allowed.';
COMMENT ON COLUMN public.wt_dog_observation_themes.sort_order IS
  'Positive display order, unique per dog; does not limit theme selections.';
