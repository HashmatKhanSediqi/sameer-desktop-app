# FMT 1.4.2

FMT 1.4.2 is a reliability and financial-correctness update for Customer Accounting and Teller.

## Improvements

- Added a restricted Recovery Mode when the Customer Accounting database cannot start safely. Backups are validated before restoration, the existing database is preserved, failed attempts can be retried, and successful recovery returns to secure login.
- Made Customer Accounting balances, transfers, imports, and reports use exact decimal calculations.
- Made repeated backup imports assign independent transfer groups so restored transactions cannot affect an existing transfer accidentally.
- Separated Customer Accounting and Teller currency configuration while keeping company identity and authentication shared.
- Kept retired Teller denominations interpretable for active worksheets, export, and the next business day.
- Added clear Teller saving, saved, and failed states. Failed edits remain visible and retryable, and newer rapid edits cannot be overwritten by stale saves.
- Protected upgrades from legacy Teller schema 007/008 with a validated pre-migration database copy, preservation of active worksheets, and safe resume after interruption.
- Improved database shutdown, worksheet-row stability, export finalization, and recovery validation.

Customer Accounting backups protect the permanent accounting record. Teller remains a live operational worksheet, and the successfully exported Excel workbook remains its long-term archive.

## Download

Download **FMT-Setup.exe** and verify it against **SHA256SUMS.txt**. The installer is unsigned, so Windows SmartScreen or Microsoft Defender may warn about a newly published file hash.

Release assets:

- `FMT-Setup.exe`
- `latest.yml`
- `SHA256SUMS.txt`
