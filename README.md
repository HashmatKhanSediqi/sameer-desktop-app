# FMT

FMT is an open-source, offline-first desktop customer accounting and teller application for Windows.

## Product

| | |
|-|-|
| Product name | **FMT** |
| Version | 1.4.3 |
| Platform | Windows 10/11 x64 |
| Installer | `dist/FMT-Setup.exe` (after `npm run build:win`) |
| Database | Local SQLite (WAL) |
| Languages | English, Dari (`fa-AF`), Pashto (`ps`) |
| License | MIT |

FMT is designed to keep day-to-day accounting data local. The application uses Electron, React, TypeScript, and SQLite, with automated tests and a Windows release workflow.

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

Before submitting a change, run the checks relevant to your work:

```bash
npm run typecheck
npm test
npm run build
```

Windows installer verification requires Windows x64:

```bash
npm run build:win
```

## Contributing

Contributions, bug reports, documentation improvements, and well-scoped feature proposals are welcome.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes. Please keep financial-data integrity, offline operation, compatibility, localization, and migration safety in mind when proposing changes.

## Security

Please do **not** disclose suspected security vulnerabilities in a public issue before they can be assessed. See [SECURITY.md](./SECURITY.md) for the reporting process and security scope.

## Documentation

Authoritative product and architecture documentation lives in [`project-context/`](./project-context/README.md).

Release assessment: [`project-context/release-readiness.md`](./project-context/release-readiness.md).

In-app updates (GitHub Releases / `electron-updater`): [`project-context/update-system.md`](./project-context/update-system.md). The packaged app reads `app-update.yml` and the public GitHub Releases feed (`releases.atom` + `latest.yml`). The repository must remain **public** so end users do not need `GH_TOKEN`.

## Default credentials

| Username | Password |
|----------|----------|
| `admin` | `admin123` |

For real installations, change the default administrator password after initial setup.

## License

FMT is licensed under the [MIT License](./LICENSE).

Copyright (c) 2026 Hashmat Khan Sediqi.
