# Checklists

Use these checklists before saying a finance-related change is done.

## General Change

- Read `AGENTS.md` and `.agents/brain.md`.
- Inspect the closest route, page/controller, model, and utility.
- Keep the change scoped to the requested behavior.
- Preserve role-based access.
- Run the smallest meaningful verification command.
- Mention any verification that could not be run.

## UI And UX Quality

- UI should be user friendly, simple to understand, and easy to scan.
- Screens should feel real-world relevant for a banking/finance app, not like demo filler.
- Important actions, balances, statuses, dates, and amounts should be visible without hunting.
- Tables and cards should support quick comparison.
- Labels should use real banking language that normal users understand.
- Empty states should explain what is missing and what the user can do next.
- Error messages should be clear, helpful, and calm.
- Success messages should confirm exactly what changed.
- Layout should work well on mobile and desktop.
- Do not add decorative UI that makes financial data harder to read.

## Banking UI Standards

- Prioritize trust, clarity, and speed over decoration.
- Use realistic financial labels, statuses, and examples.
- Make high-risk actions like transfer, repayment, approval, and closure feel deliberate.
- Show confirmation before actions that move money or change account status.
- Keep dashboards scan-friendly: key numbers first, details second.
- Use spacing, grouping, and hierarchy to reduce decision effort.
- Make primary actions obvious and secondary actions available without visual noise.
- Avoid vague words such as `process`, `submit`, or `manage` when a clearer banking action exists.

## Transfer Flow

- Sender account exists and belongs to the right user.
- Receiver or beneficiary account is resolved correctly.
- Sender balance decreases exactly once.
- Receiver balance increases exactly once when applicable.
- Transaction or ledger rows are created with correct direction, amount, status, and reference.
- Insufficient balance is blocked before mutation.
- Approval requirements are respected.
- Notifications are created only when appropriate.
- API errors are clear and do not leak sensitive internals.
- Frontend refreshes balances and transaction lists after success.

## Loan Flow

- Loan eligibility and business rules are checked.
- Principal, interest, EMI, tenure, and repayment dates use backend source-of-truth logic.
- Disbursement updates the correct account or ledger.
- Repayments reduce the correct outstanding amounts.
- Overdue/cron processing is idempotent.
- Settlement ledger entries are created or updated consistently.
- Customer and admin views show matching statuses.

## Overdraft Flow

- Account type policy and customer eligibility are checked.
- Approved limit, used amount, available amount, and interest are consistent.
- Withdrawals cannot exceed allowed overdraft availability.
- Repayments allocate to the correct overdraft balance.
- Interest calculation uses the intended date range and rate.
- Frontend labels distinguish account balance, overdraft limit, used amount, and available amount.

## Fixed Deposit Flow

- Deposit amount, tenure, interest rate, maturity date, and maturity value are consistent.
- Approval state is respected.
- Customer and admin views show the same status meaning.
- Premature closure or maturity logic does not double-credit funds.
- Generated reports/PDFs are visually checked if layout changes.

## Recurring Deposit Flow

- Installment amount, schedule, interest, maturity date, and maturity value are consistent.
- Missed or due installments are handled explicitly.
- Approval and status transitions are respected.
- Customer dashboard and deposit detail pages agree.

## Reports And PDFs

- Report filters match backend query behavior.
- Totals match displayed rows.
- Currency and dates are formatted consistently.
- PDFs render without clipped text, footer overlap, or missing rows.
- Generated artifacts under `tmp/` are not committed unless intentionally requested.

## Auth And Roles

- Login stores token under `adnate-token`.
- Protected frontend routes use the correct role list.
- Backend route middleware checks auth before privileged actions.
- Admin-only, manager-only, and customer-only actions stay separated.
- Logout clears local auth state.
