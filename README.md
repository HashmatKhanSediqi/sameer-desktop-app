# FMT

Offline desktop customer accounting for Windows.

## Product

| | |
|-|-|
| Product name | **FMT** |
| Version | 1.2.3 |
| Platform | Windows 10/11 x64 |
| Installer | `dist/FMT-Setup.exe` (after `npm run build:win`) |
| Database | Local SQLite (WAL) |
| Languages | English, Dari (`fa-AF`), Pashto (`ps`) |

## Compatibility identifiers (intentional)

User data and app identity still use historical path / ID values so existing installations keep working:

- User data: `%APPDATA%\CustomerAccounting\`
- Install directory: `%LOCALAPPDATA%\Programs\CustomerAccounting\`
- App ID: `com.customeraccounting.app`
- npm package name: `customer-accounting`

These are **not** the product brand. The brand is **FMT**.

## Development

```bash
npm install
npm run fonts:fetch   # if fonts are missing
npm run icons:build   # if icon assets need regenerating
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build:win
```

## Documentation

Authoritative product and architecture documentation lives in [`project-context/`](./project-context/README.md).

Release assessment: [`project-context/release-readiness.md`](./project-context/release-readiness.md).

In-app updates (GitHub Releases / `electron-updater`): [`project-context/update-system.md`](./project-context/update-system.md). The packaged app reads `app-update.yml` and the public GitHub Releases feed (`releases.atom` + `latest.yml`). The repository must remain **public** so end users do not need `GH_TOKEN`.

## Default credentials

| Username | Password |
|----------|----------|
| `admin` | `admin123` |

Do not change these defaults unless explicitly requested.

## License

UNLICENSED (private).
