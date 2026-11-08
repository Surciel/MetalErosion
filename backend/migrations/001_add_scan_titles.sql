alter table public.scans
add column if not exists title text;

update public.scans
set title = split_part(
  regexp_replace(image_url, '^.*/', ''),
  '?',
  1
)
where title is null;
