# Security

mode-gate gates Claude's tool calls only. It is not a sandbox: a mod runs with the user's permissions. Deny rules and organisation policy keep precedence.

See the "Security model" section of [docs/design.md](docs/design.md) for known routes around the gate and how each is closed.

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue for a vulnerability.

I aim to acknowledge a report within 7 days and to say how I plan to proceed within 14 days.

Reports about ways around the gate are in scope. This includes a tool call that is allowed when it should ask or be denied, and a way for Claude to change its own profiles. Anything that needs the user to run untrusted code outside Claude's tool calls is out of scope, as the gate does not cover it.
