# Adnate Pay Nest Agent Guide

Use this file as the first stop for AI/code-agent work in this repo. For deeper project memory, also read `.agents/brain.md`.

## Project Shape

- `client/`: React 19 + Vite banking dashboard.
- `server/`: Express 5 + Mongoose API.
- `client/src/api/axios.js`: shared Axios client. Default API URL is `http://127.0.0.1:5000/api`, override with `VITE_API_URL`.
- `server/app.js`: Express app, CORS, route mounting, error handlers.
- `server/server.js`: database connection, seed/backfill startup work, cron processors, and HTTP listener.

## Main Commands

Run commands from the matching folder.

Client:

```bash
cd client
npm run dev
npm run build
npm run lint
```

Server:

```bash
cd server
npm run dev
npm start
npm run admin:create
npm run migrate:account-od
npm run reconcile:od
```

## Coding Rules

- Keep client code in ES modules.
- Keep server code in CommonJS.
- Reuse existing UI helpers/components before creating new patterns:
  - `client/src/components/ui/`
  - `client/src/layouts/DashboardLayout.jsx`
  - `client/src/context/AuthContext.jsx`
- Reuse existing server boundaries:
  - routes in `server/routes/`
  - controllers in `server/controllers/`
  - models in `server/models/`
  - cross-cutting logic in `server/utils/`
  - auth/role/upload/error logic in `server/middleware/`
- Do not commit secrets from `server/.env`.
- Avoid editing generated/build/runtime folders unless explicitly requested:
  - `client/dist/`
  - `client/node_modules/`
  - `server/node_modules/`
  - `server/uploads/`
  - `tmp/`

## App Conventions

- Auth token key in local storage is `adnate-token`.
- Client routes are centralized in `client/src/routes/AppRoutes.jsx`.
- Protected routes use `ProtectedRoutes` with role arrays such as `customer`, `admin`, and `manager`.
- Customer pages live under `client/src/pages/customer/`.
- Admin pages live under `client/src/pages/admin/`.
- Manager page currently routes through `client/src/pages/manager/Dashboard.jsx`.
- API routes mount under `/api/*`.
- Server error handling should pass through `notFound` and `errorHandler`.

## Verification

- For client UI changes, run `npm run build` in `client/`.
- For lint-sensitive client changes, run `npm run lint` in `client/`.
- For server changes, run at least a syntax/startup-oriented check when possible. If MongoDB is unavailable, say that clearly instead of masking it.
- When changing business logic around transfers, loans, overdrafts, fixed deposits, recurring deposits, reports, or settlement, inspect the relevant controller, model, and utility together.

## Git Safety

- The worktree may contain user changes. Do not revert unrelated files.
- If generated PDF/image artifacts under `tmp/` show as deleted or modified, leave them alone unless the task is specifically about those artifacts.
