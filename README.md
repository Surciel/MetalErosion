# Metal Erosion System

React/Vite frontend, FastAPI/YOLO corrosion analysis backend, and Supabase for
authentication, database, and image storage.

For free frontend and Docker backend deployment on Render, see
[RENDER_DOCKER_DEPLOYMENT.md](RENDER_DOCKER_DEPLOYMENT.md).

The repository includes `backend/Dockerfile`, `backend/.dockerignore`, and a
`render.yaml` for both services on the `Test-Deploy` branch. The backend uses
the Free compute plan and the frontend uses free static hosting. Credentials
are supplied through Render's environment settings, never through Git.
