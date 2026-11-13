-- Allows the "Unmapped Category" option (fallback rate 0.09% per day, see
-- backend/asset_categories.py). Safe to run more than once.
alter table public.scans
  drop constraint if exists scans_asset_category_check;
alter table public.scans
  add constraint scans_asset_category_check
  check (
    asset_category is null
    or asset_category in ('Hardware', 'Vehicles', 'Household', 'Metal Walls', 'Unmapped Category')
  );
