---
name: backend-frontend-integration
description: "Use when connecting the MetalErosion FastAPI and Supabase backend to the cleaned React frontend, implementing authentication, corrosion analysis, history, or admin data flows."
applyTo: "frontend/src/**/*.{ts,tsx},backend/**/*.py,backend/*requirements,README.md,frontend/README.md"
---

# MetalErosion Backend/Frontend Integration

Connect the existing React/Vite frontend to the FastAPI backend and Supabase without reintroducing mock data. Treat this file as the integration handoff for the next agent.

## Current State

- The frontend no longer contains seeded demo accounts, seeded scan history, random scan results, or duplicate auth pages.
- The frontend currently has empty account, recovery, and history collections in `App.tsx`.
- `App.tsx` deliberately displays `Supabase authentication is not connected yet.` for login and signup. Do not replace this with username-only or client-side fake authentication.
- `frontend/src/services/api.ts` currently implements only `analyzeCorrosion()`, calling `POST http://localhost:8000/analyze-corrosion` or `VITE_API_BASE_URL`.
- The backend currently exposes only `POST /analyze-corrosion`.
- The backend creates a Supabase client and optionally inserts into `scans`, but trusts the submitted `user_id`; it does not verify a Supabase access token.
- The backend currently stores `file.filename` in `image_url`; this is not a Supabase Storage URL.
- No local database, ORM, migrations, history endpoint, auth endpoint, admin endpoint, recovery endpoint, or frontend Supabase client exists in this repository.
- Supabase schema, RLS policies, Storage buckets, Auth configuration, and environment values are external and must be confirmed before implementation.

## Files That Must Be Reviewed

### Frontend entry and orchestration

- `frontend/src/App.tsx`
  - Replace disabled login/signup handlers with real auth service calls.
  - Restore the authenticated session on startup.
  - Populate `activeAccount` from verified Supabase user/profile data.
  - Load current-user history after authentication.
  - Pass the authenticated user ID or access token through the service layer, never from arbitrary form input.
  - Replace empty admin callbacks with API mutations and refresh state after successful operations.
  - Preserve the existing admin routing behavior: admins open the dashboard directly.

- `frontend/src/types/index.ts`
  - Align `Account`, `ScanResult`, `RecoveryRequest`, and `AdminMetrics` with the confirmed Supabase/backend schema.
  - Keep ASTM fields (`astmGrade`, `priorityLevel`) aligned with the backend response.
  - Make backend-optional explanation and image fields explicitly optional or provide them from a defined backend contract.
  - Add session, auth error, API error, and loading types if needed.

### Frontend API and authentication

- `frontend/src/services/api.ts`
  - Extend the service boundary for auth/session, analysis, history, and admin operations.
  - Keep response parsing and backend-to-frontend mapping here rather than inside page components.
  - Add an authenticated request helper that supplies the Supabase access token to FastAPI.
  - Do not send a user ID as the security mechanism once token verification is available.
  - Handle non-JSON error responses and expired sessions consistently.

- `frontend/src/components/AuthModal.tsx`
  - Connect `LoginCredentials` and `SignupCredentials` to Supabase Auth.
  - Preserve email/password validation, loading state, error state, password confirmation, and close/switch behavior.
  - Do not store plaintext passwords in React state beyond the form submission lifecycle or persist them locally.

- `frontend/package.json`
  - Add `@supabase/supabase-js` only if the chosen architecture uses a browser Supabase client.
  - Keep the dependency set minimal and document required environment variables.

- `frontend/.env.example` (create if absent)
  - Document `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` if the frontend uses Supabase Auth directly.
  - Never commit real keys or service-role credentials.

### Frontend analysis workflow

- `frontend/src/pages/HomePage.tsx`
  - Confirm the selected `File` is passed into the analysis flow and that object URLs are revoked when no longer needed.
  - Preserve image validation and upload UX.

- `frontend/src/pages/CalculatingPage.tsx`
  - Keep the real `analyzeCorrosion()` request.
  - Add cancellation/unmount handling, retry behavior, and a useful backend error state.
  - Do not add timers or random progress as a substitute for request state.

- `frontend/src/pages/ResultsPage.tsx`
- `frontend/src/pages/InfoPage.tsx`
- `frontend/src/pages/HistoryPage.tsx`
- `frontend/src/pages/HistoryDetailPage.tsx`
  - Review every use of `ScanResult` against the confirmed API shape.
  - Preserve empty, loading, and error states.
  - Ensure ASTM grade and priority are displayed consistently.
  - Do not restore Class A/B/C mock assumptions unless the backend contract is deliberately changed.

- `frontend/src/utils/severity.ts`
  - Confirm its color thresholds still make sense for rust percentage and the final product classification.

- `frontend/src/utils/adminMetrics.ts`
  - Use only for client-side presentation calculations if the backend does not provide metrics.
  - Prefer server-authoritative metrics for admin reporting once an admin endpoint exists.

### Frontend administration

- `frontend/src/pages/AdminPage.tsx`
  - Replace empty callbacks with service-backed account edits, status changes, and recovery handling.
  - Add loading, empty, error, and unauthorized states.
  - Do not treat the client-side `role` value as the security boundary.
  - Keep admin-only navigation and dashboard-as-admin-home behavior.

- `frontend/src/components/SideMenu.tsx`
- `frontend/src/components/Header.tsx`
  - Verify navigation and logout use the real session lifecycle.
  - Ensure non-admin users cannot reach admin actions through UI navigation, while relying on backend authorization for actual protection.

### Backend API and persistence

- `backend/main.py`
  - Keep the single validated Supabase client initialization.
  - Add bearer-token verification and derive the user identity server-side.
  - Remove the client-trusted `user_id` pattern or treat it only as a non-authoritative compatibility field during migration.
  - Add the required endpoints for current-user history, admin accounts/metrics, recovery requests, and account mutations.
  - Validate image decoding before accessing `image.shape`.
  - Decide whether image files go to Supabase Storage; return a real image URL if they do.
  - Normalize the response to the frontend contract or keep the adapter in `api.ts`, but choose one source of truth and test it.
  - Restrict CORS to configured frontend origins instead of `*` when credentials are used.
  - Do not log Supabase keys, access tokens, or sensitive user data.

- `backend/backend requirements`
  - Confirm FastAPI, Supabase, dotenv, OpenCV, NumPy, Ultralytics, and multipart upload dependencies.
  - Add only dependencies required by the selected auth/token verification and Storage approach.

- `backend/.gitignore`
  - Confirm `.env`, model files, and generated artifacts remain excluded.

- `backend/.env.example` (create if absent)
  - Document required backend variables such as `SUPABASE_URL`, `SUPABASE_KEY` or a deliberately named service-role key, allowed frontend origins, and model path.
  - Never commit real credentials.

### Project documentation and external setup

- `README.md`
- `frontend/README.md`
  - Document startup commands, frontend/backend ports, environment variables, Supabase setup, schema expectations, Storage bucket name, Auth configuration, and RLS policies.
  - State clearly that the backend currently has only partial Supabase integration unless the next agent completes the missing endpoints.

- Supabase dashboard or migration files (not currently present)
  - Confirm the `scans` table columns and types.
  - Define profiles/accounts, roles, account status, and recovery-request tables if needed.
  - Define Storage bucket and object policies.
  - Define RLS policies for user-owned scans and admin-only operations.
  - Record schema changes as migrations or SQL checked into the repository.

## Required Data Contracts

### Authentication

Use Supabase Auth email/password unless the project owner chooses another provider. The frontend needs:

- Supabase user ID
- Email
- Access token/session
- Profile username
- Role/admin status from a protected profile or claims source
- Session restoration and sign-out behavior

The backend must verify the access token and must not trust a role or user ID sent only by the browser.

### Analysis response

The current backend returns:

```json
{
  "status": "success",
  "filename": "image.jpg",
  "rust_percentage": 12.34,
  "astm_grade": 6,
  "priority_level": "Moderate",
  "recommendation": "...",
  "box_coordinates": [],
  "scan_id": "..."
}
```

The integration must define how these map to `ScanResult`:

- `filename` -> `imageName`
- Storage URL or a documented preview URL -> `imageUrl`
- `rust_percentage` -> `rustPercent`
- `astm_grade` -> `astmGrade`
- `priority_level` -> `priorityLevel` and display label
- `recommendation` -> `dss`
- `scan_id` -> `id`
- authenticated user -> `accountId`
- server timestamp -> `createdAt` and formatted `date`

Do not silently invent explanation fields. Either return them from the backend or make the frontend presentation handle their absence.

### History

Add a protected endpoint or Supabase query that returns the authenticated user’s scans ordered newest first. It must provide enough data for `HistoryPage` and `HistoryDetailPage`, and it must return an empty list for a new user rather than demo records.

### Administration

Admin operations require server-side authorization and should cover:

- Account listing
- Account role/status updates
- Scan metrics by day/week/month
- Recovery request listing
- Recovery request status updates

## Implementation Order

1. Confirm Supabase schema, Auth setup, RLS, Storage, and environment variables.
2. Add a single frontend Supabase client or define that all Supabase access stays behind FastAPI.
3. Implement backend token verification and current-user identity derivation.
4. Complete auth/session service and connect `AuthModal` and `App.tsx`.
5. Complete analysis response/storage handling and update `api.ts` adapter.
6. Add current-user history loading and connect history pages.
7. Add protected admin endpoints and connect `AdminPage`.
8. Add loading, empty, error, expired-session, and unauthorized states.
9. Update documentation and environment examples.

## Acceptance Checks

- No `MOCK_`, `generateMockResult`, random result generation, demo credentials, or fabricated account data exists in `frontend/src`.
- Login and signup use real Supabase Auth or a documented backend auth endpoint.
- Reloading the page restores a valid session or returns to the signed-out state.
- A scan upload reaches FastAPI, persists only under the verified user identity, and renders the actual ASTM result.
- History survives reload and is scoped to the signed-in user.
- Admin pages and mutations reject non-admin users server-side.
- No secrets are exposed in the frontend bundle or logs.
- `npm run build` passes, backend tests/type checks pass, and API contract tests cover success, validation failure, expired session, and unauthorized admin requests.
