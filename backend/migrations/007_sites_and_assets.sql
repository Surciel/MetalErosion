-- Step 2 of the post-defense re-scope: an inventory of steel elements.
-- A SITE is a place (a building, a plant, a project) with one exposure environment.
-- An ASSET is one steel element on a site (a truss, a railing, a tank). A scan may belong
-- to an asset; repeated scans of the same asset form its inspection history.
--
-- Requires 006_element_and_environment.sql. Safe to run more than once.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  environment text not null check (environment in ('C2', 'C3', 'C4', 'C5')),
  -- True for sites filled by the demo seeding tool; shown as "Demo data" in the app.
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  tag text not null,                       -- the element's mark on drawings, e.g. "T-3"
  name text,                               -- a short description
  element_type text not null check (
    element_type in (
      'Structural member',
      'Roofing and cladding sheet',
      'Railing, stair and grating',
      'Door, gate and fence',
      'Tank, pipe and duct',
      'Equipment housing and support'
    )
  ),
  surface_area_m2 numeric check (surface_area_m2 is null or surface_area_m2 > 0),
  coating_system text,
  last_coated_on date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site_id, tag)
);

create index if not exists assets_site_idx on public.assets (site_id);

-- Deleting an asset keeps its scans; they become scans with no asset.
alter table public.scans
  add column if not exists asset_id uuid references public.assets (id) on delete set null;

create index if not exists scans_asset_created_idx on public.scans (asset_id, created_at);

-- The backend reads and writes these tables with the service key and checks who may
-- change what itself, as it does for scans. Row level security with no policies blocks every other
-- route to the data.
alter table public.sites enable row level security;
alter table public.assets enable row level security;
