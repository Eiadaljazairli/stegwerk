# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report them privately through GitHub: open the **Security** tab of this
repository and choose **Report a vulnerability**. Include the affected version
or commit, steps to reproduce, and the impact you expect.

You will get an answer within a few days. Once a fix is released, the report
is published as a GitHub Security Advisory, with credit if you want it.

## Supported versions

Only the latest release on the default branch receives security fixes.

## Running Stegwerk safely

- Put a TLS-terminating reverse proxy in front of the web container.
- Keep `.env.prod` out of version control; `scripts/setup.sh` creates it with
  random secrets and mode `600`.
- Rotate `JWT_SECRET`, `MAIL_ENCRYPTION_KEY` and `TOTP_ENCRYPTION_KEY` as
  described in [docs/schluesselrotation.md](docs/schluesselrotation.md).
- Back up the database regularly, see [docs/sicherung.md](docs/sicherung.md).
