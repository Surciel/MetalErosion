-- Step 1 of the post-defense re-scope: a scan records the type of steel element and its
-- exposure environment (ISO 12944-2 corrosivity category) instead of an object category.
-- The environment sets the baseline corrosion rate; the element type sets the checks
-- shown in the maintenance answer. See backend/asset_profile.py.
--
-- scans.asset_category is kept for scans saved before this change. New scans leave it
-- empty. Safe to run more than once.

alter table public.scans
  add column if not exists element_type text,
  add column if not exists environment text;

alter table public.scans
  drop constraint if exists scans_element_type_check;
alter table public.scans
  add constraint scans_element_type_check
  check (
    element_type is null
    or element_type in (
      'Structural member',
      'Roofing and cladding sheet',
      'Railing, stair and grating',
      'Door, gate and fence',
      'Tank, pipe and duct',
      'Equipment housing and support'
    )
  );

alter table public.scans
  drop constraint if exists scans_environment_check;
alter table public.scans
  add constraint scans_environment_check
  check (environment is null or environment in ('C2', 'C3', 'C4', 'C5'));
