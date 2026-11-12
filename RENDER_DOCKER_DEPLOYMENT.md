# Deploy the MetalErosion backend on Render with Docker

The backend is FastAPI plus YOLO, OpenCV, and Supabase. Render builds the image
directly from this Git repository. Docker Desktop is needed only for an optional
local container test. The frontend stays on Vercel.

## 1. Push the deployment files

Commit and push the changes on the branch you want Render to deploy. The actual
model files `backend/models/best.pt` and `backend/models/metal_cls.pt` are already
tracked and must remain available in that branch. No training step is required.

## 2. Create the Render service

Recommended: open https://dashboard.render.com/, choose **New > Blueprint**, and
connect `https://github.com/Surciel/MetalErosion` using the branch you pushed.
Use `render.yaml` as the Blueprint path. Supply the three prompted values:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRONTEND_ORIGINS`.
Review the service and compute plan before deploying.

The Blueprint selects the paid `1c-2g` plan (1 CPU, 2 GB RAM). This is a starting
estimate for two YOLO models, not a measured capacity guarantee. Monitor RAM
while analyzing an image. The Free plan has 512 MB RAM and may run out of memory;
it also sleeps after 15 minutes without inbound traffic. Docker does not remove
those Free-plan limits. No service is created just by editing this repository.

Alternatively, choose **New > Web Service**, connect the same repository, and use:

| Render setting | Value |
| --- | --- |
| Name | `metalerosion-api` (or your preferred unique name) |
| Branch | The branch containing these changes |
| Language/runtime | Docker |
| Region | Singapore |
| Root Directory | Leave blank (repository root) |
| Dockerfile Path | `./backend/Dockerfile` |
| Docker Build Context Directory | `./backend` |
| Docker Command | Leave blank; the image contains the startup command |
| Build Command | No separate command; Render builds the Dockerfile |
| Health Check Path | `/health` |
| Compute plan | `1c-2g` recommended starting point; review pricing |
| Auto Deploy | On Commit |

Choose either Blueprint or manual Web Service creation for this deployment.
For an existing service, check its source/runtime settings first rather than
creating a duplicate unintentionally. If the Dashboard does not offer the runtime
change you need, create a new Docker service and update the frontend API URL.

## 3. Backend environment variables

The Blueprint supplies the fixed values below. For manual service creation, add
every row in Render's Environment settings. Replace placeholders with your values.

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your existing server-only Supabase service-role key |
| `FRONTEND_ORIGINS` | `https://YOUR_FRONTEND.vercel.app` |
| `SUPABASE_STORAGE_BUCKET` | `metal-scans` |
| `SUPABASE_STORAGE_PRIVATE` | `true` |
| `SUPABASE_SIGNED_URL_TTL` | `3600` |
| `MODEL_PATH` | `models/best.pt` |
| `METAL_CLASSIFIER_PATH` | `models/metal_cls.pt` |
| `RUST_MEASUREMENT` | `hybrid` |
| `METAL_CLASSIFIER_THRESHOLD` | `0.4` |
| `MODEL_CONFIDENCE` | `0.15` |
| `VALIDATION_CONFIDENCE` | `0.5` |
| `MIN_SURFACE_AREA_RATIO` | `0.05` |

`FRONTEND_ORIGINS` accepts comma-separated exact origins, for example
`https://YOUR_FRONTEND.vercel.app,http://localhost:5173`. Do not add a trailing
slash, a URL path, or a wildcard. Use the actual production origin and any specific
preview origin you need to test.

Keep the service-role key on the backend only. Do not commit `.env` or put this key
in a `VITE_` variable. Render provides `PORT`; the image defaults to `10000` locally.
The model settings above match the tested configuration in `backend/.env.example`.

This deployment uses the existing Supabase project and `metal-scans` Storage
bucket. It does not create or migrate tables, change authentication settings, or
train models. Confirm the schema described in `HISTORY_DATABASE_SETUP.md` and
`SUPABASE_DATABASE_STORAGE_ISSUES.md`, and the checked-in migrations, are applied
as appropriate for your existing database. Images and scan history remain in
Supabase, so this backend does not need a Render persistent disk.

## 4. Verify the backend and connect the frontend

After Render reports the deploy as Live, open:

```text
https://YOUR_BACKEND.onrender.com/health
```

Expected response with the bundled models:

```json
{"status":"ok","segmentation_model_loaded":true,"metal_classifier_loaded":true}
```

The endpoint becomes available after model initialization. It does not test
Supabase connectivity, table permissions, Storage access, or inference accuracy.
Interactive API documentation is at `/docs`; the API does not serve a homepage at `/`.

In Vercel, set `VITE_API_BASE_URL=https://YOUR_BACKEND.onrender.com` for the relevant
environment and redeploy the frontend. Keep its existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Confirm `FRONTEND_ORIGINS` on Render matches that frontend.

Then log in, load history, analyze one valid metal image, and confirm its image
and result persist after a reload. This checks Supabase and inference beyond the
health probe. Check Render's logs and memory metrics during that request.

## Optional local Docker test

From the repository root, with Docker running and a real `backend/.env` configured:

```powershell
docker build --platform linux/amd64 -t metalerosion-api ./backend
docker run --rm --name metalerosion-api -p 10000:10000 --env-file backend/.env metalerosion-api
```

In another terminal:

```powershell
Invoke-RestMethod http://localhost:10000/health
```

To check a different port, run with `-e PORT=8080 -p 8080:8080` instead of the
default port mapping. Stop the running container with `docker stop metalerosion-api`.

## Changes made

| File | Change |
| --- | --- |
| `backend/Dockerfile` | Two-stage Python 3.12 image; CPU PyTorch first; existing requirements; OpenCV system libraries; both model files; non-root user; writable YOLO settings under `/tmp`; build-time ML import/CPU check; one Uvicorn worker; Render's port; graceful termination. |
| `backend/.dockerignore` | Only allows required code, requirements, Docker files, and the two models into the build context. Excludes credentials, environments, uploads, logs, and unrelated files. |
| `backend/main.py` | Adds public `GET /health`, lets deployment variables take precedence over `.env`, and names the preferred Supabase credential variable in startup errors. |
| `backend/.env.example` | Explains exact CORS origins, runtime port, and setting environment variables in Render. |
| `render.yaml` | Backend-only Docker Blueprint, Singapore region, paid `1c-2g` plan, health path, automatic deploys, manual secrets/origin, and tested model settings. |
| `README.md` | Replaces placeholder text with a project description and deployment guide link; converts the existing UTF-16 file to UTF-8. |
| `VERCEL_URL_GUIDE.md` | Replaces the native Python deployment instructions with Docker settings and links here. |
| `RENDER_DOCKER_DEPLOYMENT.md` | This guide, configuration tables, verification steps, and change list. |

The existing requirements and model weights are unchanged. Dependencies are not
fully version-locked, so a later clean image build may resolve newer packages.

## References

- Docker on Render: https://render.com/docs/docker
- Blueprint settings: https://render.com/docs/blueprint-spec
- Health checks: https://render.com/docs/health-checks
- Compute plans: https://render.com/docs/compute-plans
- Free-plan limits: https://render.com/docs/free
