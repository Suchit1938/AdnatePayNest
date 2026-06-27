# Known Bugs And Watch Areas

Use this file for bugs, suspicious behavior, fragile code paths, and risk notes.

## Known Issues

- None confirmed here yet.

- on adding benefi. check for same customer different account type.
- on scrolling the sidebar it restore to upside.
- email sending feature or SMTP model not working on hosted website. 
- 

## Watch Areas

- Transfers: verify sender balance, receiver balance, transaction rows, approvals, notifications, and insufficient-balance handling together.
- Loans: check EMI calculations, repayment schedules, overdue processing, settlement ledger rows, and cron side effects.
- Overdrafts: check approved limits, available balance, interest, repayment allocation, and account type policy logic.
- Deposits: check approval flow, maturity values, recurring schedules, and customer/admin visibility.
- Reports/PDFs: verify generated PDFs visually when layout changes.
- Authentication: preserve JWT storage key `adnate-token` and role-based route protections.
- Startup jobs: server startup can seed data, backfill settlement rows, and run scheduled processors depending on environment flags.
- Money formatting: keep frontend display formatting separate from backend numeric source-of-truth values.

## Bug Template

```text
## Title

- Status:
- Area:
- Steps to reproduce:
- Expected:
- Actual:
- Suspected files:
- Notes:
```

