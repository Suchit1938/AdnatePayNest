# Decisions

Record project decisions here so future AI sessions do not accidentally undo them.

## Current Decisions

- Keep the frontend and backend as separate Node projects under `client/` and `server/`.
- Keep client code as ES modules because the React/Vite app uses `"type": "module"`.
- Keep server code as CommonJS because the backend currently uses `require` and `module.exports`.
- Keep backend API routes mounted under `/api/<resource>`.
- Keep role-based routing centralized in `client/src/routes/AppRoutes.jsx`.
- Use `ProtectedRoutes` for role access instead of adding ad hoc checks in every page.
- Use `client/src/api/axios.js` for authenticated API requests so token behavior stays consistent.
- Reuse shared UI components under `client/src/components/ui/` before adding new UI patterns.
- Treat backend controllers and utilities as the source of truth for financial calculations.
- Avoid changing generated/build/runtime folders unless a task specifically asks for it.

## Add New Decisions Here

- YYYY-MM-DD: Decision and reason.

