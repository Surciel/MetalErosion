# Free Render deployment: frontend and Docker backend

Both services use the `Test-Deploy` branch of `Surciel/MetalErosion`.

| Component | Render service | Hosting |
| --- | --- | --- |
| Frontend | Static Site | Free static hosting |
| Backend | Docker Web Service | `plan: free` |

`render.yaml` defines both services. It contains no paid compute plans, disks,
databases, background workers, or autoscaling. The existing Supabase project
continues to provide authentication, scan data, and image storage.

## Deploy from the current branch

1. Commit and push `render.yaml` and these documentation changes to `Test-Deploy`.
2. Open Render > New > Blueprint, connect `Surciel/MetalErosion`, select
   `Test-Deploy`, and use `render.yaml`.
3. Provide the backend Supabase URL and service-role key, frontend Supabase URL
   and anon key, and the exact deployed frontend origin for `FRONTEND_ORIGINS`.
4. Verify the backend is Free and the frontend is a Static Site before applying.
5. Once Render assigns URLs, confirm `VITE_API_BASE_URL` is the backend's public
   HTTPS URL and `FRONTEND_ORIGINS` is the frontend's exact HTTPS origin. Redeploy
   after changing either variable.

The Blueprint wires the frontend API URL from the backend's
`RENDER_EXTERNAL_URL`. If creating services manually, copy the actual assigned
backend URL into the frontend environment after creation. Do not guess a URL
from the service name.

## Manual service settings

| Setting | Backend | Frontend |
| --- | --- | --- |
| Branch | `Test-Deploy` | `Test-Deploy` |
| Runtime | Docker | Static Site |
| Root Directory | Leave blank | `frontend` |
| Dockerfile | `./backend/Dockerfile` | N/A |
| Docker context | `./backend` | N/A |
| Compute plan | Free | N/A; static hosting is free |
| Build command | Dockerfile | `npm ci --include=dev && npm run build` |
| Publish directory | N/A | `dist` |
| Start / Docker command | Leave blank | N/A |
| Health check | `/health` | N/A |
| Node version | N/A | `24.13.0` |
| `SKIP_INSTALL_DEPS` | N/A | `true` |

Frontend rewrite: source `/*`, destination `/index.html`, action **Rewrite**.
This makes direct visits to `/reset-password` work.

## Credentials and model settings

Backend secret configuration: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Frontend configuration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Never put the service-role key in the frontend or commit `.env` files.

The backend also uses the non-secret values in `render.yaml`:
`SUPABASE_STORAGE_BUCKET=metal-scans`, `SUPABASE_STORAGE_PRIVATE=true`,
`SUPABASE_SIGNED_URL_TTL=3600`, `MODEL_PATH=models/best.pt`,
`METAL_CLASSIFIER_PATH=models/metal_cls.pt`, `RUST_MEASUREMENT=hybrid`,
`METAL_CLASSIFIER_THRESHOLD=0.4`, `MODEL_CONFIDENCE=0.15`,
`VALIDATION_CONFIDENCE=0.5`, and `MIN_SURFACE_AREA_RATIO=0.05`.

Add the Render frontend origin to Supabase Auth's allowed URLs and its
`/reset-password` path to Redirect URLs. Use the same Supabase project for both
services. Existing schema and Storage bucket setup must already be complete.

## Verify

After both deploys are Live:

- Open the frontend root and `/reset-password` directly.
- Open `BACKEND_URL/health`. With the packaged models the response should be
  `{"status":"ok","segmentation_model_loaded":true,"metal_classifier_loaded":true}`.
- Sign in, load history, analyze a valid metal image, reload, and confirm the scan
  and image persist in Supabase.
- Check logs and RAM while analyzing. The health endpoint confirms initialization;
  it does not test remote Supabase availability or run inference.

## Free-tier behavior and spending

### Memory troubleshooting

A passing `/health` request confirms model loading, not that a full scan fits in
512 MiB. The original PyTorch process was observed using about 423-443 MiB before
analysis and was restarted after exceeding the Free plan's memory limit.

The backend configuration bounds OpenBLAS, OpenMP, and MKL to one thread, limits
glibc allocation arenas, requests trimming of releasable heap memory, and disables
the oneDNN primitive cache. These are memory-reduction measures, not a hard cap
on inference allocations. The same settings were applied directly to the running
Render backend; `render.yaml` and the Docker defaults preserve them for later builds.

The source also computes the existing one-feature OLS slope with NumPy instead of
importing scikit-learn at API startup, and measures full-resolution lighting in
64-row strips instead of allocating a full LAB copy of every upload. Neither
change reduces inference resolution or changes the trained model weights or
configured thresholds. Source changes take effect only after pushing `Test-Deploy`.

Validate a complete scan and peak memory after deployment. If the backend still
exceeds 512 MiB, a smaller inference runtime (for example, validated ONNX exports)
or a different inference host is required. Do not claim that allocator tuning
alone guarantees Free-plan compatibility, and do not enable a paid plan.

The Free backend has 512 MB RAM and 0.1 CPU. It sleeps after 15 minutes without
inbound traffic and cold starts on the next request. The two YOLO models may
exceed the memory limit during startup or inference. A successful image build
alone does not prove that the Free backend can run image analysis. No paid
upgrade is authorized; report any capacity failure before changing architecture.

Render includes 750 Free instance hours per workspace per month, shared with
other Free web services. Static hosting does not consume those instance hours.
Build minutes and outbound bandwidth also have workspace-wide allowances.
If a payment method is attached, excess bandwidth or build usage can incur
charges even when the service's compute plan is Free. The service configuration
cannot impose a global zero-dollar bandwidth cap. Check Billing and the build
pipeline spend limit before deploying; no paid resources should be enabled.

## Optional local container test

With Docker running and a real `backend/.env`, from the repository root:

```powershell
docker build --platform linux/amd64 -t metalerosion-api ./backend
docker run --rm --name metalerosion-api -p 10000:10000 --env-file backend/.env metalerosion-api
```

Then run `Invoke-RestMethod http://localhost:10000/health` in another terminal.
Render builds from Git directly, so Docker Desktop is not needed for deployment.

References: https://render.com/docs/free, https://render.com/docs/static-sites,
https://render.com/docs/docker, https://render.com/docs/blueprint-spec,
https://render.com/docs/build-pipeline.
