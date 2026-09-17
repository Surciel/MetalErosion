# History Feature Database Setup

The History tab now supports user-defined scan titles. The title is used for:

- Searching scan history.
- Displaying a readable scan name instead of only the uploaded filename.
- Editing a scan name from the History tab or scan detail page.

## Required `scans` change

Add a nullable text column to `public.scans`:

```sql
ALTER TABLE public.scans
ADD COLUMN IF NOT EXISTS title TEXT;
```

The backend accepts titles up to 120 characters. Add the matching database constraint:

```sql
ALTER TABLE public.scans
ADD CONSTRAINT scans_title_length
CHECK (title IS NULL OR char_length(title) <= 120);
```

If the constraint already exists, do not create it a second time.

## Existing records

Backfill existing rows so older scans remain searchable and display a useful title. The stored image URL may include a signed-query suffix, so remove the URL path prefix and query string when deriving the fallback filename:

```sql
UPDATE public.scans
SET title = COALESCE(
  NULLIF(title, ''),
  NULLIF(
    regexp_replace(
      regexp_replace(image_url, '^.*/', ''),
      '\\?.*$',
      ''
    ),
  ''),
  'Untitled scan'
)
WHERE title IS NULL OR title = '';
```

Keeping `title` nullable preserves compatibility with records created before this feature. The backend falls back to the image filename when a legacy record has no title.

## Backend contract

New analysis records should store the initial title, normally the uploaded filename or the custom name entered before scanning:

```text
scans.title = user-provided title or uploaded filename
```

The authenticated history response should include:

```json
{
  "title": "Workshop wrench",
  "filename": "rusty-wrench.jpg"
}
```

The title-edit operation is:

```text
PATCH /history/{scan_id}
```

with this JSON body:

```json
{
  "title": "Workshop wrench"
}
```

The backend must continue to verify the bearer token and update only a scan owned by the authenticated user. Corrosion percentage, ASTM grade, priority, recommendation, and detection coordinates must remain model-derived and read-only.

## Applying the change

Run the SQL in the Supabase SQL Editor or add equivalent statements to the team’s external migration system. Verify the following afterward:

1. `public.scans.title` exists and accepts existing rows.
2. Existing scans have a non-empty fallback title.
3. A new scan stores its initial title.
4. An owner can edit the title through `PATCH /history/{scan_id}`.
5. A different authenticated user cannot edit or read the scan.
6. Titles longer than 120 characters or containing only whitespace are rejected by the API.