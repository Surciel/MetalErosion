-- Steps 3 and 5 of the post-defense re-scope.
--   * Engineer review: an engineer confirms a scan or corrects its rust % and
--     distribution. The AI's own values stay in rust_percentage / distribution_type.
--   * rust_method: how the rust % was measured, so a trend is only fitted across scans
--     measured the same way.
--   * inspector_name: who took the scan, as shown on the inspection report.
--   * Roles: 'user' (an inspector), 'engineer' and 'admin'. The stored name 'user' is
--     kept so existing accounts and the sign-up trigger need no change.
--
-- Safe to run more than once.

alter table public.scans
  add column if not exists rust_method text,
  add column if not exists inspector_name text,
  add column if not exists review_status text,
  add column if not exists reviewed_rust_percentage numeric,
  add column if not exists reviewed_distribution text,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.scans
  drop constraint if exists scans_review_status_check;
alter table public.scans
  add constraint scans_review_status_check
  check (review_status is null or review_status in ('confirmed', 'corrected'));

alter table public.scans
  drop constraint if exists scans_reviewed_rust_check;
alter table public.scans
  add constraint scans_reviewed_rust_check
  check (
    reviewed_rust_percentage is null
    or (reviewed_rust_percentage >= 0 and reviewed_rust_percentage <= 100)
  );

alter table public.scans
  drop constraint if exists scans_reviewed_distribution_check;
alter table public.scans
  add constraint scans_reviewed_distribution_check
  check (reviewed_distribution is null or reviewed_distribution in ('S', 'G', 'P', 'H'));

-- Allow the engineer role. Any existing check on profiles.role is replaced, whatever it
-- was named.
do $$
declare
  existing record;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', existing.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'engineer', 'admin'));

-- To make an account an engineer (replace the email):
--   update public.profiles set role = 'engineer' where email = 'someone@example.com';
-- An admin can also change roles from the Admin page.
