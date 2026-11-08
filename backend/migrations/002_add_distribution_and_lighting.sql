-- Pre-defense analysis fields for scans.
-- distribution_type: ASTM D610 rust distribution letter (S = spot, G = general,
--                    P = pinpoint, H = hybrid); null when no rust was found.
-- lighting_status:   ok | low_light | overexposed (rejected exposures are never saved).
-- days_to_critical:  predicted days until 33% rust coverage at the scan's asset category.
alter table public.scans
  add column if not exists distribution_type text,
  add column if not exists lighting_status text,
  add column if not exists days_to_critical integer;

alter table public.scans
  drop constraint if exists scans_distribution_type_check;
alter table public.scans
  add constraint scans_distribution_type_check
  check (distribution_type is null or distribution_type in ('S', 'G', 'P', 'H'));
