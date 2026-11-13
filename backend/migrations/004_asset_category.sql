-- Asset category chosen by the user for each scan. It sets the baseline corrosion rate
-- (see backend/asset_categories.py). Safe to run more than once.
-- Scans saved before this migration keep a null category: they were analysed with the
-- Hardware rate and are shown as "not recorded".
alter table public.scans
  add column if not exists asset_category text;

alter table public.scans
  drop constraint if exists scans_asset_category_check;
alter table public.scans
  add constraint scans_asset_category_check
  check (
    asset_category is null
    or asset_category in ('Hardware', 'Vehicles', 'Household', 'Metal Walls')
  );
