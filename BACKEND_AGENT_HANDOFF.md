# Backend Agent Handoff

## Ownership Boundary

The project owner is continuing the frontend work separately. This handoff is for the backend agent only.

Backend scope:

- `backend/main.py`
- `backend/requirements.txt`
- Supabase integration, Storage, authentication, RLS, and backend API contracts

Do not modify frontend components, pages, styling, or frontend behavior unless a coordinated API contract change is required and communicated clearly.

## Current Backend State

The backend is a FastAPI application in `backend/main.py`.

Current routes:

- `POST /analyze-corrosion`
- `POST /predict-maintenance`

The frontend expects an additional route:

- `GET /history`

The backend is started from the `backend/` directory so the relative model path resolves:

```powershell
cd backend
.\venv\Scripts\activate
python main.py
```

Required local runtime files:

- `backend/.env`
- `backend/models/best.pt`
- `backend/venv/`

Never expose `.env` values, access tokens, or service-role credentials.

## Confirmed Supabase Schema

### `profiles`

| Column | Type | Constraints / meaning |
| --- | --- | --- |
| `id` | UUID | Primary key; references `auth.users(id)`; required and unique |
| `role` | TEXT | Default `user`; allowed values: `user`, `admin` |
| `email` | TEXT | Required and unique; matches auth email |
| `username` | TEXT | Required and unique; case-insensitive lookup recommended |
| `created_at` | TIMESTAMPTZ | Default `NOW()` |

### `scans`

| Column | Type | Constraints / meaning |
| --- | --- | --- |
| `id` | UUID | Primary key; default `gen_random_uuid()` |
| `user_id` | UUID | Required foreign key to `profiles(id)` |
| `image_url` | TEXT | Required Supabase Storage public or signed URL |
| `rust_percentage` | NUMERIC(5,2) | Required and non-negative |
| `box_coordinates` | INTEGER[] | Optional flattened array `[x1, y1, x2, y2, ...]` |
| `created_at` | TIMESTAMPTZ | Default `NOW()`; used for history ordering and TTL cleanup |

### `password reset logs`

| Column | Type | Constraints / meaning |
| --- | --- | --- |
| `id` | UUID | Primary key; default `gen_random_uuid()` |
| `user_id` | UUID | Required foreign key to `profiles(id)` |
| `status` | TEXT | Default `verified`; allowed values include `verified`, `completed`, `failed` |
| `requested_at` | TIMESTAMPTZ | Default `NOW()` |

Do not invent additional tables or columns without confirming with the project owner.

## Required Backend Work

### 1. Verify authentication

The frontend sends a Supabase bearer token and currently also sends `user_id`. The backend must:

- Read the `Authorization: Bearer <token>` header.
- Verify the token with Supabase.
- Derive the authenticated user ID server-side.
- Stop trusting a browser-submitted `user_id` for authorization or ownership.
- Return `401` for missing or invalid tokens.

The submitted `user_id` may be removed from the request contract once the frontend is updated, or treated only as a compatibility field and checked against the verified token identity.

### 2. Finish corrosion analysis persistence

`POST /analyze-corrosion` should:

- Validate the upload content type and decoded image.
- Run the existing YOLO/OpenCV analysis.
- Upload the image to the agreed Supabase Storage bucket.
- Store the resulting public or signed URL in `scans.image_url`.
- Insert `user_id`, `image_url`, `rust_percentage`, and `box_coordinates` into `scans`.
- Return the inserted scan ID and timestamp.

The current implementation stores `file.filename` as `image_url`; that is not sufficient for persisted history.

Expected response fields:

```json
{
  "status": "success",
  "filename": "image.jpg",
  "image_url": "https://...",
  "rust_percentage": 12.34,
  "astm_grade": 6,
  "priority_level": "Moderate",
  "recommendation": "...",
  "box_coordinates": [],
  "scan_id": "uuid",
  "created_at": "timestamp"
}
```

### 3. Add protected history

Implement `GET /history`:

- Require a verified bearer token.
- Derive the user ID from the token.
- Return only that user’s scans.
- Order by `created_at DESC`.
- Return an empty list for a user with no scans.
- Include enough fields for the frontend history and detail pages:
  `id`, `user_id`, `image_url`, `rust_percentage`, `box_coordinates`, and `created_at`.

### 4. Add server-side admin authorization

Use `profiles.role` on the server. Do not trust a frontend role value.

Admin endpoints must reject non-admin users with `403`. Coordinate the endpoint names and response shapes with the frontend owner before implementation.

Potential backend-owned areas include:

- Account listing and role/status changes
- Scan metrics
- Password reset log listing and status updates

### 5. Configure CORS explicitly

Replace the current wildcard CORS configuration with configured frontend origins, for example through an environment variable. Do not use `allow_origins=["*"]` together with credentialed requests in production.

## Frontend Contract To Preserve

The frontend API adapter maps:

- `filename` -> image name
- `image_url` -> image URL
- `rust_percentage` -> rust percentage
- `astm_grade` -> ASTM grade
- `priority_level` -> priority/classification label
- `recommendation` -> recommendation text
- `scan_id` -> scan ID
- `created_at` -> display date and history ordering

Do not remove these fields from the API response without coordinating with the frontend owner.

## Storage And Security Questions

Confirm these before finalizing Storage code:

1. Exact Supabase Storage bucket name.
2. Whether the bucket is public or private.
3. Signed URL expiration time if private.
4. Storage object naming convention, preferably scoped by verified user ID.
5. RLS policies for `profiles`, `scans`, and `password reset logs`.
6. Whether backend access uses the Supabase service-role key or user-scoped access tokens.
7. Allowed frontend development and production origins for CORS.

## Backend Validation Checklist

From `backend/`:

```powershell
.\venv\Scripts\activate
python -m pip check
python -m compileall -q main.py
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Also test:

- Missing token returns `401`.
- Invalid token returns `401`.
- A valid user can analyze an image and receives a scan ID.
- The scan is stored with the verified user ID.
- A valid user sees only their own history.
- A new user receives an empty history list.
- A non-admin receives `403` from admin endpoints.
- Invalid image bytes return `400`, not an unhandled `500`.
- `/docs` is reachable at `http://127.0.0.1:8000/docs`.

## Do Not Do

- Do not trust `user_id` or `role` from the browser.
- Do not store a filename as `image_url`.
- Do not add mock scans, demo accounts, or fabricated history.
- Do not expose Supabase secrets in logs or responses.
- Do not change the frontend contract silently.
