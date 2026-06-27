# Project Brain: Adnate Pay Nest

This is a project-memory file for AI collaborators. Keep it factual and update it when the architecture or conventions change.

## What This App Is

Adnate Pay Nest is a banking/finance web app with role-based dashboards for customers, admins, and managers. The domain includes accounts, transfers, beneficiaries, overdrafts, loans, fixed deposits, recurring deposits, notifications, statements, reports, classifications, business rules, and settlement views.

## Current Architecture

- Frontend: React 19, Vite, React Router, Axios, Tailwind CSS, lucide-react, react-icons, Recharts.
- Backend: Node.js, Express 5, MongoDB/Mongoose, JWT auth, bcryptjs, multer uploads, nodemailer, PDFKit, node-cron.
- The frontend and backend are separate Node projects with separate `package.json` and lockfiles.
- Server defaults to port `5000`.
- Client dev server is Vite, commonly port `5173`.

## Important Entry Points

- Client app entry: `client/src/main.jsx`.
- Client routes: `client/src/routes/AppRoutes.jsx`.
- Client shared API client: `client/src/api/axios.js`.
- Server app setup: `server/app.js`.
- Server startup: `server/server.js`.
- Database config: `server/config/db.js`.

## Backend Map

Route groups:

- `authRoutes`: authentication.
- `userRoutes`: users/customers/managers/admin profile flows.
- `transferRoutes`: transfers and beneficiaries.
- `approvalRoutes`: approvals.
- `tierRoutes`: tiers/classifications.
- `overdraftRoutes`: overdraft features.
- `dashboardRoutes`: dashboard summaries.
- `notificationRoutes`: notifications.
- `businessRuleRoutes`: configurable business rules.
- `loanRoutes`: loans and EMI processing.
- `fixedDepositRoutes`: fixed deposits.
- `recurringDepositRoutes`: recurring deposits.
- `depositApprovalRoutes`: deposit approvals.
- `reportRoutes`: reports and PDFs.

Startup behavior:

- Connects to MongoDB.
- Seeds database data.
- Runs settlement ledger backfill unless disabled by `DISABLE_SETTLEMENT_BACKFILL=true`.
- Schedules EMI processing unless disabled by `DISABLE_EMI_PROCESSOR=true`.
- Schedules monthly repayment processing unless disabled by `DISABLE_MONTHLY_REPAYMENT_PROCESSOR=true`.

## Frontend Map

Customer-facing routes:

- `/`: dashboard.
- `/transfer`: transfer funds.
- `/accounts`: accounts.
- `/overdraft`: overdraft.
- `/loans`: loans.
- `/deposits`: combined deposits view.
- `/fixed-deposits`: deposits view with fixed tab.
- `/recurring-deposits`: deposits view with recurring tab.
- `/beneficiaries`, `/transactions`, `/statement`, `/notifications`, `/profile`.

Admin-facing routes:

- `/admin`: dashboard.
- `/admin/users`, `/admin/customers`, `/admin/managers`.
- `/admin/classifications`, `/admin/reports`, `/admin/settlement`.
- `/admin/business-rules`, `/admin/fixed-deposits`, `/admin/notifications`, `/admin/profile`.

Manager routes:

- `/manager`.
- `/manager/:section`.

## AI Working Rules For This Repo

- Start by reading the closest route, page/controller, model, and utility files before editing.
- Preserve the role-based routing model.
- Keep API paths consistent with the existing `/api/<resource>` naming.
- Prefer shared UI components from `client/src/components/ui/` for page structure, cards, tables, empty states, metrics, toasts, and charts.
- Do not invent new validation rules without checking existing utilities such as email, loan, overdraft, account type, and business-rule helpers.
- Be careful with financial calculations. Inspect both frontend formatting and backend source-of-truth logic.
- Be careful with scheduled processors and startup backfills. Make them idempotent where possible.
- For user-facing finance data, prefer explicit labels, currency formatting, dates, and statuses over ambiguous shorthand.

## Useful Prompts To Use With An AI

For a feature:

```text
Read AGENTS.md and .agents/brain.md first. Then implement <feature>. Keep changes scoped, reuse existing route/controller/model/UI patterns, and run the relevant client/server verification.
```

For a bug:

```text
Read AGENTS.md and .agents/brain.md first. Investigate <bug>. Explain the root cause, patch it, and verify with the smallest meaningful command.
```

For UI work:

```text
Read AGENTS.md and .agents/brain.md first. Update <screen>. Match the existing banking dashboard style, reuse shared UI components, and verify the layout on desktop and mobile if a browser is available.
```

## Open Questions To Fill Later

- Exact demo/admin/customer credentials, if safe to document.
- Required environment variables beyond what is present in `server/.env`.
- Deployment flow for frontend and backend.
- MongoDB collection/index expectations.
- Any manual QA checklist used by the team.
