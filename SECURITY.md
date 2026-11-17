# Security Policy

## Supported versions

GeoNexus is currently an academic project under active development. No formal release or long-term support policy has been established yet.

## Reporting a vulnerability

Please do not publish credentials, exploit details, personal information, or sensitive land-record data in public issues.

For a suspected security vulnerability, contact the repository maintainer privately through the contact options available on the maintainer's GitHub profile. Include:

- A concise description of the issue.
- The affected component or file, if known.
- Reproduction steps that do not expose real user data.
- Potential impact and any suggested mitigation.

Allow reasonable time for investigation and remediation before public disclosure.

## Security expectations

- Never commit secrets or real production credentials.
- Use synthetic or authorized data in development and demonstrations.
- Validate and authorize requests on the backend.
- Apply least-privilege database credentials.
- Do not treat client-side validation as a security boundary.
