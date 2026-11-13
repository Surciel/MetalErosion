# Run MetalErosion locally

Run the backend and frontend in two separate PowerShell terminals from the repository root.

## Prerequisites

- Node.js and npm
- Python and the Windows Python launcher (`py`)
- A configured Supabase project

The backend needs the model files in `backend\models` and valid Supabase credentials. The frontend and backend `.env` files are ignored by Git; do not commit credentials.

## 1. Configure and run the backend

In the first terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `backend\.env` and set at least:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

Keep the service-role key on the backend only. The example file includes the storage bucket, allowed local frontend origins, and model settings; adjust them only if your setup differs. The expected model weights are `backend\models\best.pt` and `backend\models\metal_cls.pt`.

Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API is at `http://localhost:8000`; its interactive API documentation is at `http://localhost:8000/docs`.

## 2. Configure and run the frontend

Open a second terminal at the repository root:

```powershell
cd frontend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `frontend\.env` for local development:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The anon key is intended for browser use; never put the backend service-role key here. In Supabase Authentication URL Configuration, allow `http://localhost:5173/reset-password` as a redirect URL for local password recovery.

Start Vite:

```powershell
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Stop or troubleshoot

- Press **Ctrl+C** in each terminal to stop its server.
- If the backend exits during startup, check that `backend\.env` has valid Supabase values and that both model files exist.
- If the browser cannot reach the API, confirm the backend is running on port `8000` and `VITE_API_BASE_URL` is `http://localhost:8000`.
- If the frontend origin or Vite port changes, add that origin to `FRONTEND_ORIGINS` in `backend\.env`.
- Supabase schema, storage, and deployment configuration notes are in [VERCEL_URL_GUIDE.md](./VERCEL_URL_GUIDE.md).
