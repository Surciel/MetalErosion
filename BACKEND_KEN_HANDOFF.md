# Backend Ken Handoff

## Purpose

The backend integration is ready for frontend/UI work. The remaining work is to connect the existing frontend surfaces to the protected backend APIs and preserve the authenticated Supabase workflow.

## Required Frontend Changes

### 1. Use the persisted Supabase Storage URL

The frontend currently prefers the local browser preview URL after analysis. Update the frontend API adapter so it prefers the backend-provided `image_url`.

Update `frontend/src/services/api.ts` so:

- Analysis results use `data.image_url` when available.
- History records use `record.image_url`.
- History detail pages display the persisted Supabase image URL.
- Local object URLs are used only as temporary upload previews.

This ensures images continue working after page reloads and when viewed from another device.

### 2. Stop relying on browser-supplied identity

The current frontend sends `user_id` from `frontend/src/services/api.ts` and `frontend/src/pages/CalculatingPage.tsx`.

The backend treats that value only as a compatibility field. The preferred frontend behavior is:

- Continue sending the Supabase access token in the `Authorization` header.
- Stop sending `user_id` after the adapter is updated.
- Never use a manually entered or client-provided user ID for authorization.

The backend derives the authenticated user ID from the verified Supabase token.

### 3. Connect the admin page to backend APIs

The current `App.tsx` initializes accounts and recovery requests as empty arrays and calculates metrics locally. Replace those placeholders with service-backed requests.

Add frontend API methods for:

- `GET /admin/accounts`
- `PATCH /admin/accounts/{account_id}`
- `GET /admin/metrics`
- `GET /admin/recovery-requests`
- `PATCH /admin/recovery-requests/{request_id}`

Wire these methods into:

- `frontend/src/App.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/pages/AdminPage.tsx`

The admin UI should support:

- Loading states
- Empty states
- Expired-session handling for HTTP `401`
- Unauthorized handling for HTTP `403`
- Conflict handling for HTTP `409`
- Mutation failure messages
- Refreshing admin data after successful mutations

### 4. Do not trust the frontend role

The frontend may use a role value to decide whether admin navigation should be displayed, but that value is not a security boundary.

The backend checks `profiles.role` server-side. Every admin request must include the authenticated Supabase access token.

The role mapping in `App.tsx` should be coordinated with the actual Supabase profile or claims configuration so the displayed role is consistent with the server-authoritative role.

### 5. Handle the account-status limitation

The confirmed Supabase schema does not contain an account status column.

Therefore:

- Do not assume account deactivation is persisted.
- Do not show a successful deactivate or restore result unless the schema is expanded.
- Handle the backend HTTP `409` response clearly if the status endpoint is called.
- Prefer disabling or labeling the status control as unavailable until an account-status schema is confirmed.

The backend intentionally avoids inventing an unconfirmed column or table.

## Frontend Environment Variables

The frontend should use:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The frontend must never receive or bundle the backend `SUPABASE_KEY`.

Backend-only configuration is documented in `backend/.env.example`.

## API Field Mapping

The backend returns:

- `astm_grade`
- `priority_level`
- `recommendation`
- `rust_percentage`
- `image_url`
- `scan_id`
- `created_at`

The frontend should map these fields consistently to:

- `astmGrade`
- `priorityLevel`
- `dss`
- `rustPercent`
- `imageUrl`
- `id`
- `createdAt`

Do not invent Class A/B/C labels or explanation text that the backend does not return.

## Authentication Requirements

- Use the real Supabase email/password authentication flow.
- Restore the Supabase session on page reload.
- Include the current access token in requests to protected FastAPI endpoints.
- Clear local authenticated state when the session expires or the user signs out.
- Surface backend `401` responses as a session-expired or re-login message.
- Never expose service-role credentials in frontend code, environment variables, bundles, or logs.

## History Requirements

The frontend should call `GET /history` after a user session is restored and after a successful analysis.

History behavior should:

- Display the authenticated user’s scans only.
- Preserve newest-first ordering.
- Display an empty state for a new user.
- Use the backend `image_url` for history cards and detail pages.
- Refresh or update local history after a scan is successfully persisted.

## Analysis Requirements

For `POST /analyze-corrosion`:

- Send the image as multipart form data.
- Include the Supabase bearer token.
- Do not depend on `user_id` for security.
- Preserve the returned `scan_id` and `created_at`.
- Prefer the returned `image_url` over the temporary browser object URL.
- Display backend errors clearly, including invalid-image HTTP `400` responses.

## Admin Security Requirements

Admin navigation can be hidden from non-admin users, but UI hiding is not sufficient protection.

The backend remains responsible for rejecting unauthorized requests:

- Missing or invalid token: HTTP `401`
- Authenticated non-admin user: HTTP `403`
- Unsupported account-status mutation: HTTP `409`

The frontend should handle all three responses without presenting a success state.

## Recommended Developer Message

> Backend integration is ready. Update the frontend API adapter to use the authenticated Supabase access token, prefer backend `image_url` values over temporary local previews, and load history from `GET /history`. Do not rely on client-provided user IDs or roles for authorization. Connect the admin dashboard to the protected `/admin/accounts`, `/admin/metrics`, and `/admin/recovery-requests` endpoints, including loading, empty, `401`, `403`, `409`, and mutation-error states. Account deactivation is currently unavailable because the confirmed Supabase schema has no status column. Use the documented API field mappings, and keep all service-role credentials backend-only.

## Related Documentation

- `BACKEND_AGENT_HANDOFF.md` — original backend requirements
- `BACKEND_HANDOFF_RESULTS.md` — completed backend work and validation results
- `backend/.env.example` — backend configuration template
