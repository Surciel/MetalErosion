# Supabase Database and Storage Integration Gaps

## Purpose

This document records the remaining database, Supabase Storage, and backend contract questions for the backend team. Frontend work will continue separately and should not invent database behavior while these items are being reviewed.

## Confirmed Signup Constraint: Recovery PIN

The `profiles.recovery_pin` column is defined as `CHAR(6)` and must contain exactly six digits. A three-digit PIN causes signup to fail when the profile row is created, producing a database error such as `Database error saving new user`.

The frontend now matches this database rule by using six separate one-digit inputs with:

- Automatic focus advance.
- Backspace and arrow-key navigation.
- Paste support for a six-digit value.
- Inline validation before calling Supabase.
- Preservation of leading zeroes by keeping the PIN as a string.

No database migration is required for this fix. Users must enter a value matching:

```text
^[0-9]{6}$
```

If the team wants to support three-digit PINs instead, the database constraint, security expectations, frontend validation, and any recovery workflow must be changed together. Six digits remains the current recommended rule.

### Signup verification checklist

- [ ] A signup with a six-digit PIN creates both the Auth user and the matching `profiles` row.
- [ ] A signup with a three-digit PIN is rejected by the frontend before the request is sent.
- [ ] Leading-zero PINs such as `001234` are accepted and stored as six characters.
- [ ] The Auth user/profile creation trigger, if used, handles `username` and `recovery_pin` correctly.
- [ ] Duplicate email and duplicate username errors are returned clearly to the frontend.

## Priority 1: Storage URL Design

### Current issue

The `scans.image_url` column stores the image URL returned by Supabase Storage. If the Storage bucket is private and the URL is signed, that URL can expire while the database record remains.

### Recommended solution

Store the permanent Storage object path in the database and generate a fresh signed URL when returning analysis or history responses.

Recommended additional column:

```sql
ALTER TABLE scans
ADD COLUMN storage_path TEXT;
```

Recommended object path:

```text
scans/{user_id}/{scan_id}.jpg
```

Then choose one model:

- Public bucket: `image_url` can remain a stable public URL.
- Private bucket: store `storage_path` and generate a new signed URL for every API response.

Do not rely on a permanently stored signed URL.

### Decisions needed

- Exact bucket name.
- Public or private bucket.
- Signed URL lifetime if private.
- Whether `storage_path` becomes required for new scans.
- Storage upload, read, and delete policies.

## Priority 2: Recovery Request Response Data

### Current issue

The `password_reset_logs` table currently returns only:

```text
id
user_id
status
requested_at
```

The frontend admin screen needs the related username and email. It should not display the raw UUID as the username.

### Recommended solution

Do not duplicate username and email in `password_reset_logs`. Join the log table with `profiles` in the backend response.

Expected response:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "username": "example-user",
  "email": "user@example.com",
  "status": "verified",
  "requested_at": "2026-09-14T12:00:00Z"
}
```

Possible implementation options:

1. Join `password_reset_logs` with `profiles` in the backend.
2. Create a read-only database view for recovery requests.
3. Query the logs and profiles separately in the backend and combine them.

The first option is usually the smallest change.

### Decisions needed

- Exact allowed status values.
- Whether frontend `pending` maps to database `verified`.
- Whether failed requests should be visible to admins.
- Whether completed requests remain visible in the admin list.

## Priority 3: Authoritative User Role

### Current issue

The frontend may read a role from Supabase user metadata, while backend authorization reads `profiles.role`. These values can disagree.

### Recommended solution

Use `profiles.role` as the authoritative role for authorization. The backend should verify the bearer token, derive the user ID, and then read the role from `profiles`.

A small protected endpoint is recommended:

```text
GET /me
```

Example response:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "example-user",
  "role": "admin",
  "created_at": "2026-09-14T12:00:00Z"
}
```

The frontend can use this response for display and navigation, but the backend must remain the security boundary.

### Database checks

- Normal users must not be able to update `profiles.role`.
- Only authorized admins should be able to change roles.
- `profiles.role` should retain its `user`/`admin` check constraint.

## Priority 4: Row Level Security

Confirm RLS policies for the following tables.

### `profiles`

- A user can read their own profile.
- A user cannot change their own role.
- Admin access to all profiles is controlled by backend authorization and the selected service-role/user-token model.

### `scans`

- A user can read only scans where `user_id` equals their authenticated user ID.
- A user can insert only scans belonging to their authenticated user ID.
- A user cannot update or delete another user’s scans.
- Admin access is explicitly defined if administrators need all scans.

### `password_reset_logs`

- Normal users cannot list all recovery logs.
- Only authorized admins can read recovery logs.
- Only authorized admins or the designated recovery workflow can update status.
- Users cannot update another user’s recovery request.

### Storage

- Upload paths are scoped by verified user ID.
- Users cannot read another user’s private objects.
- Backend upload permissions use a server-only Supabase key.
- The service-role key is never placed in frontend environment variables.

RLS should supplement backend authorization, not replace it.

## Optional: Account Status

### Current issue

The frontend previously contained Deactivate/Restore controls, but `profiles` has no account status column. The backend correctly returns `409` rather than pretending status changes work.

### Recommended decision

Do not add account status unless account deactivation is required for the current release. The frontend now treats this feature as unavailable.

If deactivation is required, use a migration such as:

```sql
ALTER TABLE profiles
ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE profiles
ADD CONSTRAINT profiles_status_check
CHECK (status IN ('active', 'deactivated'));
```

Then define whether deactivated users:

- Can log in.
- Can call protected API routes.
- Can upload new scans.
- Can read existing history.
- Count as active accounts in metrics.

Do not add this column without agreeing on those rules.

## Optional: Profile/Auth Email Consistency

The Supabase Auth email and `profiles.email` must not silently diverge.

Recommended options:

- Treat `auth.users.email` as authoritative and synchronize the profile value.
- Use Supabase’s email-change flow and update the profile after confirmation.
- Prevent admin profile email edits unless the Auth email is updated through the supported flow.

Do not update only `profiles.email` if the user’s login email remains different.

## Metrics Recommendation

Admin metrics should be calculated by the backend, not from the frontend’s currently loaded history.

Recommended endpoint shape:

```text
GET /admin/metrics?range=day
GET /admin/metrics?range=week
GET /admin/metrics?range=month
```

Recommended response:

```json
{
  "total_accounts": 10,
  "active_accounts": 9,
  "scans_today": 3,
  "scans_this_week": 18,
  "scans_this_month": 54,
  "selected_range_scans": 18
}
```

This avoids incomplete or stale metrics when the frontend has loaded only one user’s history.

## Backend Team Checklist

- [ ] Decide public versus private Storage.
- [ ] Add `storage_path` if private Storage is selected.
- [ ] Confirm bucket and Storage policies.
- [ ] Return recovery-request username and email through a profile join.
- [ ] Confirm recovery status values and frontend mapping.
- [ ] Keep `profiles.role` authoritative.
- [ ] Verify RLS for profiles, scans, recovery logs, and Storage.
- [ ] Decide whether account status is required.
- [ ] Prevent profile/Auth email inconsistency.
- [ ] Decide whether selected-range metrics should be calculated server-side.
- [ ] Communicate any final API response changes to the frontend owner.

## Frontend Boundary

Frontend work can continue without database changes for:

- Loading, empty, and error states.
- Admin routing and navigation.
- Analysis retry behavior.
- Session-expiration handling.
- API response adapters.
- Displaying persisted image URLs when provided.

Frontend should wait for backend confirmation before:

- Depending on private signed URL behavior.
- Displaying recovery usernames and emails.
- Implementing account deactivation.
- Treating frontend role metadata as authoritative.
