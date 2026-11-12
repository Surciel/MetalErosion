-- Analytics fields for scans. Safe to run more than once.
-- spread_coverage: share of the metal surface grid that contains rust (0 to 1), from the
--                  geometric spread analysis. It scales the regression slope, so it is
--                  stored to let history show the same prediction as the original scan.
-- quality_warnings: issues with a photo that was still analysed
--                  (slightly_blurry, small_surface).
alter table public.scans
  add column if not exists spread_coverage numeric,
  add column if not exists quality_warnings text[] not null default '{}';

-- Log of rejected scans (no image is stored), used for the admin rejection chart.
-- reason: not_metal_classifier (stage 1 classifier) | not_metal (no metal area found) |
--         too_dark | too_bright | too_blurry | too_small | unsupported_format | invalid_image
create table if not exists public.scan_rejections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists scan_rejections_created_at_idx
  on public.scan_rejections (created_at);
-- Only the backend (service role) reads and writes this table.
alter table public.scan_rejections enable row level security;

alter table public.scans
  drop constraint if exists scans_spread_coverage_check;
alter table public.scans
  add constraint scans_spread_coverage_check
  check (spread_coverage is null or (spread_coverage >= 0 and spread_coverage <= 1));
