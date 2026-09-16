# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

React Compiler is not enabled on this template because of its impact on build & development performance. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## MetalErosion setup

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_BASE_URL=https://<render-service>.onrender.com
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-publishable-anon-key>
```

The frontend uses Supabase Auth for email/password signup, email confirmation, and password recovery. Configure these redirect URLs in Supabase Authentication > URL Configuration:

```text
https://<vercel-project>.vercel.app/reset-password
http://localhost:8443/reset-password
http://localhost:5173/reset-password
```

Deploy the frontend from the `frontend` directory with `npm run build`. See `VERCEL_URL_GUIDE.md` in the repository root for the Vercel, Render, and Supabase URL checklist.
## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
