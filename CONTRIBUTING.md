# Contributing to Stegwerk

Thanks for helping. Bug reports, translations, documentation and code are all
welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on
  the approach before you spend time on it.
- Issues labelled `good first issue` are a good place to begin.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local setup

You need Node.js 20+, npm and Docker (for PostgreSQL).

```bash
git clone https://github.com/<owner>/stegwerk.git
cd stegwerk
npm install
npm run db:up                      # PostgreSQL 16 on localhost:5433
cp server/.env.example server/.env # set JWT_SECRET to any long random string
npm --workspace server run migration:run
npm run dev                        # API on :4000, web on :5273
```

Open http://localhost:5273 and create an account. To fill a workspace with
sample companies, contacts and deals:

```bash
node scripts/seed-demo.mjs you@example.com your-password
```

## Project layout

| Path      | What lives there                                        |
| --------- | ------------------------------------------------------- |
| `server/` | NestJS API, GraphQL (code-first), TypeORM, migrations   |
| `web/`    | React + Vite interface, Apollo Client                   |
| `scripts/`| Setup, backup, deployment and demo-data scripts         |
| `docs/`   | Operator and integration guides (mostly German)         |

## Checks

Run these before you open a pull request:

```bash
npm run typecheck   # server, web and GraphQL documents
npm run test        # server (Jest, needs the database) and web (Vitest)
```

Server tests read `DATABASE_URL`, for example
`postgres://weitblick:weitblick@localhost:5433/weitblick`.

## Database changes

Schema changes always come with a migration:

```bash
npm --workspace server run migration:generate src/database/migrations/YourChange
npm --workspace server run migration:run
```

## Language

The interface is German, and so are most identifiers and commit messages,
because the product targets businesses in Germany. English issues and pull
requests are welcome. Help with an English translation of the interface is
especially welcome.

## Pull requests

- Keep each pull request focused on one change.
- Add or update tests for behaviour you change.
- Describe what changed and why; screenshots help for interface changes.

By contributing you agree that your contribution is licensed under the
[GNU AGPL-3.0](LICENSE).
