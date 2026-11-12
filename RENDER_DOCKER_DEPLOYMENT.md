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
  `{"status":"ok","inference_backend":"onnx","segmentation_model_loaded":true,"metal_classifier_loaded":true,"inference_image_size":512,"max_image_pixels":4194304}`.
- Sign in, load history, analyze a valid metal image, reload, and confirm the scan
  and image persist in Supabase.
- Check logs and RAM while analyzing. The health endpoint confirms initialization;
  it does not test remote Supabase availability or run inference.

## Free-tier behavior and spending

### Memory troubleshooting

The previous PyTorch build failed its memory preflight: 441.7 MiB after loading,
596.4 MiB peak, and 545.0 MiB still resident after two scans and cleanup. Lowering
inference resolution alone did not make that process fit the 512 MiB Free limit.

Docker now exports the two existing `.pt` checkpoints to float32 ONNX during a
separate build stage. The final server installs `requirements-runtime.txt` and
contains ONNX Runtime and the exported weights, without PyTorch, torchvision,
Ultralytics, scikit-learn, or pandas. Running Python directly still defaults to
the existing PyTorch path. Existing Render `MODEL_PATH` and classifier `.pt`
settings automatically resolve to sibling `.onnx` files when
`INFERENCE_BACKEND=onnx`, so manual service environment settings need no migration.

The exporter checks classifier preprocessing/probabilities, raw segmentation
outputs, boxes, and masks against the original models on synthetic square,
portrait and landscape inputs. Separate mask probes verify pixel rounding.
The ONNX adapter uses square letterboxing for the fixed 512px export; previous
PyTorch prediction used rectangular padding on non-square inputs, so the existing
published accuracy results still require a separate evaluation for this mode.
These checks cover conversion compatibility, not a real-photo accuracy study.

The final image rejects accidental imports/installation of the export stack.
It retains the same 480 MiB memory preflight with both real models and two 4.2 MP
synthetic uploads, plus a 300-mask reconstruction stress check. Do not raise or
remove that guard to make a failing build pass.
ONNX Runtime sessions use one thread, with CPU arenas and memory-pattern caching
disabled to limit retained allocations. A passing Docker preflight must still be
followed by an authenticated scan and memory observation on Render.

Render Free now opts into `MODEL_IMAGE_SIZE=512` and `INFERENCE_MAX_SIDE=512`.
This was selected to reduce peak inference memory after the 1024px deployment
continued restarting. The model weights and confidence thresholds remain the same,
but 512px can miss fine rust details. The published 1024px results must not be
treated as accuracy validation for this mode. Running Python directly retains
1024px defaults; Docker defaults and `render.yaml` explicitly use 512px.

`MAX_IMAGE_PIXELS=4194304` limits the decoded image to approximately 4.2 MP (for
example, 2048 x 2048). Oversized images receive HTTP 413 before pixel decoding,
with instructions to resize. One scan is admitted at a time; a simultaneous scan
receives HTTP 503 and `Retry-After: 5` instead of allocating another image.
Scans run in FastAPI's worker thread pool so the event loop can serve health probes.
Previous prediction inputs/results are released after each scan, while model
weights and warmup state are kept. Stage-specific RSS logs identify where a
remaining memory peak occurs. These bounds still need a real scan and peak-memory
check on Render; they are not a guarantee that every scan fits within 512 MiB.

The export stage uses headless Ultralytics, and the final image only installs
headless OpenCV. OpenCV uses one thread in addition to the numerical-library limits.
Docker runs both bundled models twice on a synthetic 2048 x 2048 image and logs
stage RSS/peak RSS. The build fails above a 480 MiB synthetic peak, preserving
headroom beneath 512 MiB. This fixture does not validate accuracy or every real
photo's detection-mask allocations, so a real scan still needs verification.

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

Validate a complete scan and peak memory after deployment. If the ONNX backend
still exceeds 512 MiB, further runtime work or a different free inference host is
required. Do not claim that allocator tuning alone guarantees Free-plan
compatibility, and do not enable a paid plan.

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

## Latest memory fix: changed files

| File | Change |
| --- | --- |
| `backend/main.py` | Select ONNX or local PyTorch at startup, map existing checkpoint paths to ONNX, expose the active runtime in `/health`. |
| `backend/onnx_inference.py` | NumPy/Pillow/OpenCV preprocessing, CPU ONNX sessions, class-aware suppression, bounded mask reconstruction and the result fields used by the existing scan flow. |
| `backend/requirements-runtime.txt` | Separate server dependencies with no PyTorch, torchvision or Ultralytics. |
| `backend/Dockerfile` | Export/verify in a build-only stage; install only runtime dependencies and copy ONNX artifacts to the final image; preserve the 480 MiB release gate. |
| `backend/.dockerignore` | Include the new runtime dependency list, adapter and build scripts. |
| `backend/tools/export_onnx_models.py` | Export both original checkpoints; check ONNX graphs, preprocessing, output compatibility and mask rules. |
| `backend/tools/verify_onnx_postprocessing.py` | Focused suppression and classifier input tests that also run without the ML stack. |
| `backend/tools/verify_inference_memory.py` | Require ONNX, reject heavy runtime imports, match the deployment's detection threshold/hybrid mode, retain the same memory budget with two images and a 300-mask stress check. |
| `backend/.env.example` | Document the backend selector and automatic checkpoint-path mapping. |
| `render.yaml` | Set `INFERENCE_BACKEND=onnx`; retain Free compute and 512px/4.2MP limits. |
| `RENDER_DOCKER_DEPLOYMENT.md` | Explain the measured failure, runtime change, validation limits and this file list. |

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
