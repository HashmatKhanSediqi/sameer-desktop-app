# FMT v1.0 — Release Readiness

Honest release assessment as of **FMT v1.0.2**.  
**Do not claim manual verification unless it was actually performed.**

---

## 1. Scale Claims (Precise)

| Claim | Status |
|-------|--------|
| Stress-tested with **100,000 customers** | VERIFIED (automated integration tests) |
| Stress-tested with **300,000 transactions** | VERIFIED (automated integration tests) |
| Backup create ~2–7s / ~18 MB at that scale | VERIFIED (automated; latest run ~7.2s / 18.08 MB) |
| Customer list / search / history at that scale without loading full tables into renderer | VERIFIED (automated) |
| **1,000,000 customers / ~5,000,000 transactions** | **Not empirically validated** — `npm run test:extreme` did not complete successfully (runs failed or were stopped mid-seed / mid-suite) |

### STEP 10 hardening (code present; extreme run incomplete)

- Report paging uses `listPageForReport` (avoids UI `MAX_PAGE_SIZE` clamp under-count)
- Exact customer-number search shortcut + migration `006_customer_number_nocase.sql`
- Extreme suite gated behind `test:extreme` / `FMT_RUN_EXTREME_SCALE=1`
- Crash-recovery scale smoke + IPC user-flow smoke in default suite

### Expected behavior beyond tested scale

SQL-side pagination, aggregation, and indexes (`005_query_indexes.sql`, `006_customer_number_nocase.sql`) are designed to continue scaling. Remaining bottlenecks before claiming 1M readiness:

- Customer search uses `LIKE` for partial matches (no FTS5); exact `C-####` / `RARE-####` use equality
- All-customer PDF/Excel reports may still consume substantial memory (chunked SQL; full model still O(N))
- Backup time and archive size grow with DB + images
- Aggregate SQL uses `CAST(amount AS REAL)` (theoretical precision drift at extreme totals)
- Full 1M/5M seed is multi-hour and memory-heavy; prior runs were killed or failed before a green suite

---

## 2. Feature Status Matrix

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Authentication | VERIFIED | Automated tests; default `admin` / `admin123` |
| 2 | Customers | VERIFIED | CRUD, photos, hard delete with cascade |
| 3 | Customer pagination | VERIFIED | SQL-side page/limit |
| 4 | Customer search | VERIFIED | SQL `LIKE`; FTS5 not implemented |
| 5 | Cash In | VERIFIED | Automated + UI present |
| 6 | Cash Out | VERIFIED | May allow negative balances (known limitation) |
| 7 | Transfers | VERIFIED | Atomic pair + insufficient-balance gate |
| 8 | Transactions | VERIFIED | Create/edit/delete; transfer rows immutable as designed |
| 9 | Currencies | VERIFIED | AFN/USD/EUR seed; Settings add |
| 10 | Currency deactivate/reactivate | VERIFIED | Settings currency registry |
| 11 | Database integrity | VERIFIED | Startup `integrity_check`; `DATABASE_CORRUPTED` |
| 12 | SQLite WAL | VERIFIED | Connection pragmas + tests |
| 13 | Foreign keys | VERIFIED | `PRAGMA foreign_keys = ON` |
| 14 | Busy timeout | VERIFIED | `busy_timeout = 5000` |
| 15 | Database migrations | VERIFIED | 001–006; failure does not record version |
| 16 | 100k+ customer scalability | VERIFIED | Automated stress test |
| 17 | 300k+ transaction scalability | VERIFIED | Automated stress test |
| 18 | Backup creation | VERIFIED | Manual + validated create |
| 19 | Automatic close backup | VERIFIED | Automated unit tests; Electron quit path implemented |
| 20 | Backup validation | VERIFIED | Manifest, signature, integrity, zip limits |
| 21 | Backup retention | VERIFIED | Auto-close 10; safety 5; manual never auto-deleted |
| 22 | Restore | VERIFIED | Automated tests |
| 23 | Restore rollback / safety backup | VERIFIED | Safety backup validated before replace |
| 24 | Crash recovery | VERIFIED (automated) | WAL + crash sentinel + integrity on open; no dedicated corruption UI |
| 25 | PDF reports | VERIFIED | Automated PDF header / layout tests |
| 26 | Dari PDF | IMPLEMENTED BUT NOT MANUALLY VERIFIED | Automated shaping/font tests; visual QA on real printer/PDF viewer recommended |
| 27 | Pashto PDF | IMPLEMENTED BUT NOT MANUALLY VERIFIED | Same as Dari |
| 28 | Excel import/export | VERIFIED | Automated import + Excel report tests |
| 29 | Localization | VERIFIED | EN / fa-AF / ps namespaces + RTL layout |
| 30 | FMT branding | VERIFIED | `productName: FMT`, UI branding |
| 31 | FMT icon | VERIFIED | `assets/icons/icon.ico` wired in electron-builder |
| 32 | Windows installer | VERIFIED | `npm run build:win` produces `dist/FMT-Setup.exe` |
| 33 | Desktop shortcut | IMPLEMENTED BUT NOT MANUALLY VERIFIED | NSIS `createDesktopShortcut: true` |
| 34 | Start Menu shortcut | IMPLEMENTED BUT NOT MANUALLY VERIFIED | NSIS `createStartMenuShortcut: true` |
| 35 | Uninstall data preservation | IMPLEMENTED BUT NOT MANUALLY VERIFIED | `deleteAppDataOnUninstall: false` |
| 36 | TypeScript | VERIFIED | `npm run typecheck` |
| 37 | Automated tests | VERIFIED | **235 passed / 1 skipped** (v1.0.2; `test:extreme` skipped) |
| 38 | Production Windows build | VERIFIED | `npm run build:win` succeeds |
| 39 | Code signing | KNOWN LIMITATION | Authenticode not configured; installer remains unsigned. Icon embedding uses `afterPack` rcedit (`signAndEditExecutable: false`) |
| 40 | Clean Windows installation testing | KNOWN LIMITATION | Full clean Windows VM manual validation has **not** been performed in this audit |
| 41 | In-app updater (electron-updater + GitHub Releases) | FIXED in v1.0.2 | v1.0.1 failed because the GitHub repo was private (`releases.atom` 404). Repo is now public; `app-update.yml` sets `private: false`; `setFeedURL` removed. Live 1.0.1→1.0.2 install verification follows publication. |

---

## 3. Known Risks (Must Not Be Hidden)

These STEP 8 findings remain true unless separately fixed and re-verified:

1. **Backups are currently unencrypted.** Anyone with filesystem access to a `.cab` file can read accounting data.
2. **Pre-login restore is intentionally available without a normal authenticated session** (`backup:validate` / `restore:execute`). Physical access + IPC can restore. UI confirmation is still required.
3. **Cash-out / edit may allow negative balances** unless business rules later require a balance gate (transfers already enforce insufficient balance).
4. **`CAST(amount AS REAL)`** in balance aggregation can theoretically introduce precision issues at extreme values. Application writes use Decimal string amounts.
5. **Auto-close backup failure does not prevent application shutdown.** Quit continues after timeout/failure; failure is logged.
6. **Dedicated zip-bomb unit test is optional / not currently present.** Size/entry/uncompressed limits exist and are exercised indirectly.
7. **Full clean Windows VM manual validation has not been performed** unless separately executed.
8. **Code signing is not configured.**
9. **FTS5 is not currently implemented** for customer search.
10. **Extremely large all-customer reports may still consume substantial memory.**
11. **Live in-app update install from an older FMT build has not been manually verified on a clean Windows VM.** GitHub Release metadata and artifacts are published; end-user update UX should be spot-checked after distribution.

---

## 4. Release Blockers

| Item | Blocker? | Notes |
|------|----------|-------|
| Automated typecheck / tests / Windows build | No | Passing as of STEP 8/9 |
| Unsigned installer / SmartScreen warnings | Decision | Not a functional blocker; operational trust issue |
| Unencrypted backups | Decision | Document for operators; encryption deferred |
| Clean VM install not manually verified | Soft | Strongly recommended before wide distribution |
| Negative cash-out balances | Decision | Confirm with business owner |

**No silent data-destruction or restore-without-rollback release blockers were identified after STEP 8 hardening.**

---

## 5. Non-Blocking Risks / Optional Future (v1.1+)

- Backup encryption (password-protected `.cab`)
- FTS5 customer search
- Streaming / chunked all-customer reports
- Authenticode code signing
- Dedicated corruption recovery UI
- Rate limiting on password recovery IPC
- Playwright E2E suite
- Insufficient-balance gate on cash-out/edit (if required by business)
- Live in-app update install smoke test on a clean Windows VM (Release is published)

---

## 6. Is FMT ready to be released as v1.0?

**Conditionally yes for a controlled / known-user distribution**, provided operators accept:

- Unsigned installer (SmartScreen)
- Unencrypted backups
- No clean-VM manual sign-off yet
- Known accounting/search/report limitations above

**Not recommended as an unrestricted public mass release** until at least:

1. Clean Windows 10/11 VM install + shortcut + uninstall(keep data) smoke test
2. Visual Dari/Pashto PDF spot-check on a real PDF viewer
3. Explicit business decision on negative cash-out balances and backup encryption messaging

Answer for reviewers:

> FMT v1.0 is **feature-complete and automated-test green**, with production-hardening from STEPs 7–8. It is **release-capable for controlled rollout**, but **not unconditionally “production ready for unattended public distribution”** until manual install verification and the decision items above are resolved.
