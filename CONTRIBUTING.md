# Contributing to FMT

Thank you for your interest in contributing to FMT.

FMT is an offline-first Windows desktop application for customer accounting and teller workflows. Contributions should preserve financial-data integrity, local-first operation, backward compatibility, and safe database migrations.

## Ways to contribute

You can help by:

- reporting reproducible bugs;
- improving documentation;
- proposing focused features or usability improvements;
- adding or improving automated tests;
- fixing defects;
- improving localization for English, Dari, or Pashto;
- reviewing code and identifying security, reliability, or data-integrity issues.

For suspected security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Before starting

For non-trivial changes, open an issue or discussion first when practical so the scope and expected behavior can be agreed before implementation.

Before editing the code, read:

- `README.md`;
- `AGENTS.md`;
- `PROJECT_CONTEXT.md`;
- `project-context/README.md`;
- the relevant feature or architecture documentation under `project-context/`.

Current source code and current migrations are authoritative when historical documentation conflicts with implementation.

## Development setup

Requirements:

- Node.js compatible with the current lockfile and toolchain;
- npm;
- Windows x64 for producing and verifying the Windows installer.

Install dependencies and start development:

```bash
npm install
npm run fonts:fetch
npm run dev
```

Only run `npm run fonts:fetch` when the required bundled fonts are missing.

## Engineering expectations

Keep changes focused and avoid unrelated refactors.

Important project rules include:

- do not use binary floating-point arithmetic for authoritative money calculations;
- preserve existing user data and migration compatibility;
- do not bypass authentication or the typed IPC boundaries;
- keep Electron isolation and security settings intact;
- do not silently delete or overwrite customer accounting data;
- preserve offline operation for normal accounting workflows;
- update affected tests and documentation when behavior changes;
- keep user-facing localization consistent across supported languages when applicable.

See `AGENTS.md` and the project documentation for detailed architecture and domain rules.

## Verification

Run the checks appropriate to your change:

```bash
npm run typecheck
npm test
npm run build
```

For Windows packaging or release-related changes, also run on Windows x64:

```bash
npm run build:win
```

Do not claim a test, installer, or manual workflow is verified unless you actually ran that verification.

## Pull requests

A pull request should:

1. explain the problem and the proposed change;
2. remain focused on one coherent change;
3. describe any database, migration, security, or compatibility impact;
4. include or update tests when behavior changes;
5. list the verification commands that were actually run;
6. update documentation when user-visible behavior or architecture changes.

Screenshots are helpful for visible interface changes.

## Commit messages

Use concise, descriptive commit messages. Conventional prefixes such as `fix:`, `feat:`, `docs:`, `test:`, and `chore:` are welcome but not mandatory.

## License

By contributing to this repository, you agree that your contributions will be licensed under the repository's [MIT License](./LICENSE).
