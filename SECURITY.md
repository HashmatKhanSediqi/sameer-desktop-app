# Security Policy

FMT stores customer accounting information locally and includes authentication, database migrations, backup/restore, reporting, and application-update functionality. Security reports that could affect financial data, authentication, backups, updates, or local data integrity are taken seriously.

## Supported version

Security fixes are intended for the latest published version of FMT. Older versions may not receive separate fixes. Users should update to the latest release after a security fix is published.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a vulnerability that could put users or their data at risk.

Use GitHub's private vulnerability reporting feature for this repository if it is available:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Provide the affected version, reproduction steps, expected and actual behavior, and potential impact.

If private vulnerability reporting is not available, contact the maintainer through the contact method shown on the GitHub profile rather than publishing exploit details publicly.

Please include, when possible:

- affected FMT version;
- Windows version;
- clear reproduction steps;
- relevant logs with secrets and personal/customer data removed;
- whether the issue affects confidentiality, integrity, authentication, backups, updates, or availability;
- a suggested fix, if you have one.

## Scope

Examples of security-relevant reports include:

- authentication or authorization bypass;
- arbitrary code execution;
- unsafe Electron IPC exposure;
- malicious or untrusted update execution;
- backup or restore vulnerabilities;
- database corruption or unauthorized modification;
- unintended disclosure of customer or financial information;
- path traversal or unsafe file handling;
- dependency vulnerabilities with a demonstrated impact on FMT.

General bugs, feature requests, and non-security reliability issues can be reported through normal GitHub issues.

## Disclosure

Please allow reasonable time to investigate and prepare a fix before publicly disclosing a vulnerability. Once a fix is available, relevant security information can be published in a way that helps users update without unnecessarily exposing them to avoidable risk.

## Security limitations

FMT is an offline-first desktop application, but local access to the Windows account or device can still affect application security. Current project documentation may also identify known limitations. Security-sensitive behavior should be evaluated against the current source code and current release documentation rather than historical claims.
