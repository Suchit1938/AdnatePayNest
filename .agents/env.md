# Environment

Document environment variables here without storing secret values.

## Server

- `PORT`: HTTP port. Defaults to `5000`.
- `DB_RETRY_MS`: retry delay for database startup failures. Defaults to `10000`.
- `DISABLE_SETTLEMENT_BACKFILL`: set to `true` to skip settlement ledger backfill on startup.
- `DISABLE_EMI_PROCESSOR`: set to `true` to skip automatic EMI processing.
- `EMI_PROCESS_CRON`: cron expression for EMI processing. Defaults to `0 0 * * *`.
- `EMI_PROCESS_TIMEZONE`: timezone for scheduled processors. Defaults to `Asia/Kolkata`.
- `EMI_PROCESS_RUN_ON_START`: set to `false` to avoid running EMI processing immediately on startup.
- `MONTHLY_REPAYMENT_CRON`: cron expression for monthly repayment processing. Defaults to `0 1 1 * *`.
- `MONTHLY_REPAYMENT_RUN_ON_START`: set to `true` to run monthly repayment processing on startup.
- `DISABLE_MONTHLY_REPAYMENT_PROCESSOR`: set to `true` to skip monthly repayment scheduling.
- `MONGO_URI`: MongoDB connection string. Required if this is the name used by `server/config/db.js`.
- `JWT_SECRET`: JWT signing secret. Required if this is the name used by auth utilities.

## Client

- `VITE_API_URL`: backend API base URL. Defaults in code to `http://127.0.0.1:5000/api`.

## Notes

- Do not paste real secrets into this file.
- If a variable name differs from this list, update this file after checking the actual server config.

