# Vercel and Supabase URL Guide

This project uses Vercel for the React frontend, Render for the FastAPI inference service, and Supabase for authentication, database, and storage.

Replace every placeholder before deployment.

## URL placeholders

```text
Frontend production: https://<vercel-project>.vercel.app
Frontend custom domain: https://<your-domain>
Frontend local: http://localhost:8443
Frontend Vite local: http://localhost:5173
Backend Render: https://<render-service>.onrender.com
Supabase project: https://<project-ref>.supabase.co
Password reset path: /reset-password
```

## Vercel project

Set the Vercel project root to `frontend`.

Build settings:

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
Install command: npm install
```

Add these variables in Vercel Project Settings > Environment Variables:

```text
VITE_API_BASE_URL=https://<render-service>.onrender.com
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-publishable-anon-key>
```

Add them to the environments that you use: Development, Preview, and Production. Preview values may point to the same Render service during the defense, but production values should be reviewed separately.

Never add `SUPABASE_SERVICE_ROLE_KEY` or any server-only key to Vercel frontend variables.

## Supabase Auth URL configuration

In Supabase Dashboard > Authentication > URL Configuration:

Set Site URL to the deployed frontend URL:

```text
https://<vercel-project>.vercel.app
```

Add only the URLs that are actually used as Redirect URLs:

```text
https://<vercel-project>.vercel.app/reset-password
https://<your-domain>/reset-password
http://localhost:8443/reset-password
http://localhost:5173/reset-password
```

For Vercel preview deployments, add the specific preview URL used for testing. Do not allow arbitrary redirect origins. The application requests password reset links using `/reset-password` so the reset form can be rendered after Supabase creates the recovery session.

Enable Email provider and Confirm email in Authentication > Providers. Configure the confirmation and recovery email templates to link through the Supabase-provided confirmation URL. Use a custom SMTP provider before public or high-volume use; the built-in mail service is intended for limited testing.

## Render backend

Create a Python web service from the `backend` directory. Use the repository's Python requirements and start FastAPI with a Render-compatible command, for example:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set these server-only variables in Render:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<server-only-supabase-key>
SUPABASE_STORAGE_BUCKET=metal-scans
SUPABASE_STORAGE_PRIVATE=true
SUPABASE_SIGNED_URL_TTL=3600
FRONTEND_ORIGINS=https://<vercel-project>.vercel.app,https://<your-domain>
MODEL_PATH=models/best.pt
```

Keep `SUPABASE_KEY` on Render only. It must never be bundled into the Vercel frontend.

Validate the YOLO model size, memory use, cold-start time, and request timeout on Render before the defense.

## Deployment smoke test

1. Open the deployed frontend directly at `/`.
2. Create a test account.
3. Confirm the verification email arrives.
4. Confirm the user cannot use protected features until email confirmation is complete, if that Supabase setting is enabled.
5. Request a password reset.
6. Open the email link and verify that `/reset-password` displays the new-password form.
7. Log in with the new password.
8. Upload one test image and confirm the request reaches the Render backend.
9. Confirm the browser console and network requests contain no service-role key.
10. Confirm Render CORS includes the exact deployed frontend origin.

## Before defense day

- Replace every `<placeholder>`.
- Confirm the Vercel Production URL, not only a Preview URL, is in Supabase Redirect URLs.
- Confirm the deployed frontend URL is in `FRONTEND_ORIGINS` on Render.
- Confirm Supabase email delivery works with the test accounts.
- Confirm the `profiles` trigger does not require the removed recovery PIN.
- Confirm the `scans.storage_path` column and `metal-scans` bucket exist.
- Keep local and production Supabase projects separate when possible.
