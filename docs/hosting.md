# Hosting it for free, without a domain

The goal here is narrow and worth stating: a working link you can send to
someone, at no cost, today. Not a production deployment. The difference is not
a detail — it is the whole of section 3 below.

---

## What runs

One container. The root `Dockerfile` builds both halves and the server serves
both: the API on `/graphql` and the file endpoints, the interface on
everything else.

That is not the better architecture. `server/Dockerfile` and `web/Dockerfile`
with nginx in front is, and `docker-compose.prod.yml` runs it — the interface
sits on a static server, the API scales on its own, and rebuilding one does not
touch the other. Use that when there is a real machine.

The single container exists for the case where the host runs exactly one. On a
free tier a second service means a second address, a CORS entry and a network
hop between the two, and that hop is reliably the first thing that does not
work.

The interface is built with `VITE_API_URL=/graphql`, so it asks the origin it
was served from. The same image therefore runs under any address without being
rebuilt — which is the point when the address is assigned to you.

---

## What the host has to provide

Short list, and any host that meets it will do:

| Need | Why |
| --- | --- |
| Builds a Dockerfile | Both halves are built in it |
| One exposed port | `PORT`, or 4000 by default |
| `DATABASE_URL` to a Postgres 16 | The migrations were written against it |
| A health path | `/health` — it touches nothing external on purpose |

Nothing else is required to start. Everything below is optional and named
where it matters.

### Environment

| Variable | Required | What happens without it |
| --- | --- | --- |
| `DATABASE_URL` | yes | Will not start |
| `DATABASE_CA_CERT` | when the database is elsewhere | The connection either fails to verify or is downgraded to unverified — see below |
| `JWT_SECRET` | yes | Will not start |
| `MAIL_ENCRYPTION_KEY` | for mailboxes | Storing mailbox credentials is **refused** rather than stored in the clear |
| `TOTP_ENCRYPTION_KEY` | for two-factor sign-in | Enabling two-factor sign-in is **refused** rather than storing the secret in the clear. A separate key from the mailbox one on purpose: separate purposes, separate keys |
| `BETREIBER_EMAILS` | for the operator page | Nobody sees *Mehr → Betrieb*. Comma-separated sign-in addresses; the account also needs two-factor sign-in. Shows accounts and workspaces (metadata only), never customer records |
| `PROTOKOLL_AENDERUNGEN_MONATE`, `PROTOKOLL_SICHERHEIT_MONATE` | no | Change log kept 24 months, security log 12 months (minimum 6 and 3). See [betrieb.md](betrieb.md) |
| `WARTUNGSMODUS` | no | `true` makes Stegwerk read-only until removed — an emergency switch; normally use an announcement with maintenance on *Mehr → Betrieb* |
| `WEB_ORIGIN` | for mail | Links in invitations, password resets and address confirmations point nowhere |
| `SMTP_*`, `MAIL_FROM` | yes, in practice | Outgoing mail is written to a file in the container instead of sent — and since an invitation is only accepted by a confirmed address, and an address is only confirmed through a mailed link, nobody can be added to a workspace |
| `LEGAL_*` | before inviting outsiders | The Impressum says the provider details are not published yet; the gap is named at startup instead |
| `LEGAL_HOSTING`, `LEGAL_PRIVACY_CONTACT`, `LEGAL_SUPERVISORY_AUTHORITY` | before inviting outsiders | The privacy policy shows those gaps in place of the answers |
| `LEGAL_PRIVACY_REVIEWED` | before inviting outsiders | The privacy policy says, visibly, that it has not been reviewed |
| `LEGAL_BACKUP_DESCRIPTION` | before signing a DPA | Annex 2 of the processing agreement shows a gap where the backup regime belongs — which is correct until someone knows the answer |
| `LEGAL_DPA_REVIEWED` | before signing a DPA | The agreement is marked, on the page and on the PDF, as an unreviewed draft |
| `SENTRY_DSN` | no | No error reporting |
| `CSP_CONNECT_SRC` | only with browser error reporting | The policy blocks the browser's error reports — see below |
| `STRIPE_*` | no | The installation does not charge: no trial expiry, no seat limit, and the billing page says so instead of listing plans nobody can buy |

---

## Backups

Two layers, because neither alone is enough.

Hostinger takes a weekly image of the whole machine. That is a floor, not a
plan: in the worst case a week of work is missing, and what comes back is the
whole machine rather than the database.

So the deploy script also installs a nightly `pg_dump` as a systemd timer.

| | |
|---|---|
| Where | `/var/backups/stegwerk/`, mode 700, each dump 600 |
| When | 03:20, with up to five minutes of jitter |
| Kept | 14 days |
| Missed run | Caught up on the next boot (`Persistent=true`) — a cron job at 03:20 simply skips a night the machine spent rebooting |

```bash
systemctl list-timers stegwerk-sicherung   # when it next runs
systemctl start stegwerk-sicherung         # run one now
journalctl -u stegwerk-sicherung -n 20     # what happened last night
ls -lh /var/backups/stegwerk/
```

A dump only counts as written once it has been read back: the script writes to
`.teil`, runs `pg_restore --list` over it, and only then renames it. An
interrupted dump leaves nothing rather than a full-sized file that cannot be
restored — which is the kind of thing you find out on the day you need it.

Restoring replaces everything:

```bash
stegwerk-zurueckspielen /var/backups/stegwerk/stegwerk-20261017-032000.dump
```

It checks the file first, asks you to type a word rather than press y, stops
the application, restores in one transaction, starts it again and waits for
`/health`.

**Copy them off this machine.** A backup that lives only on the server it
backs up is gone with the server. `scp`, `rclone` to object storage, anything
— but somewhere else.

---

## Doing it

`render.yaml` in the repository root describes the whole thing, and Render
reads it. Any comparable host works the same way with its own file.

1. Push the repository somewhere the host can read.
2. Create a Blueprint from `render.yaml`. It creates the service and the
   database and generates `JWT_SECRET` and `MAIL_ENCRYPTION_KEY`.
3. Wait for the first build. It compiles both halves, so it is not quick.
4. The host assigns an address. Put that address into `WEB_ORIGIN` and let it
   redeploy — otherwise every invitation link points at nothing.
5. Open the address and register the first account. It becomes the owner of
   its workspace.

Migrations run on start, before the server listens. That is deliberately the
opposite of `docker-compose.prod.yml`, which runs them once in a separate
container: with more than one instance two would race the same migration, and
TypeORM's lock is per connection. Here there is exactly one instance, and a
deploy that needs someone to remember a manual step is a deploy that will one
day not get it.

---

## When it answers "Not Found"

A plain-text `Not Found` on every path, `/health` included, means nothing of
this application answered. The request never reached it.

Look at the service's own logs first, in this order:

1. **Did the build finish?** It compiles both halves and is not quick. A build
   that failed leaves the address answering nothing.
2. **Did the migrations run?** The container runs them before listening, and
   they print `Applied …` for each. If they hang or fail — a database that is
   still starting, a `DATABASE_URL` that is wrong — the server never listens.
3. **Does the last line say it is listening?** `Stegwerk API listening on …`
   and, when the interface is served from the same process,
   `Oberfläche wird mit ausgeliefert aus /app/web-dist`. If the second line is
   missing, the interface is not in the image and every path but the API
   returns a 404.
4. **Do the ports agree?** `PORT` in the environment, `EXPOSE` in the
   Dockerfile and the container's own health check must name the same port.
   They did not on the first attempt here: the check knocked on 4000 while the
   process listened on 10000, so the container never counted as healthy and
   nothing was routed to it. From outside that looks exactly like an
   application that does not exist.

---

## The headers the browser is sent

Set on every response, by `server/src/security-headers.ts` in the
single-container setup and by `web/security-headers.conf` behind nginx. The
two must say the same thing; a test fails if they drift.

Two of the decisions are worth knowing before you change anything.

**Styles may be inline, scripts may not.** The interface computes measurements
and writes them as `style` attributes — an appointment's height is its
duration, a funnel bar's width is its share. Around twenty places. Without
`style-src 'unsafe-inline'` the calendar loses its geometry, and it loses it
silently: a blocked attribute stays in the HTML and simply does nothing.
`script-src` stays strict, because the difference in what the two can do is
the whole point.

**The inline script in `index.html` is allowed by hash, not by exception.** It
sets the chosen colour scheme before anything is drawn. The server computes
that hash at boot from the file it is about to serve, so it cannot go stale.
The nginx config cannot do that, so the hash sits there as a string — and
`web/src/lib/csp-hash.spec.ts` fails if it stops matching. Without that test
the failure mode is a dark-theme user seeing a flash of white, which nobody
reports and nobody can reproduce.

**This path has been rehearsed, not just written**, and rehearsed again after
the schema changed — a runbook proved against the schema of two migrations ago
is not a proved runbook. The second run took a dump of a database with real
rows in all 33 tables, restored it into a fresh one, ran the migrations against
the restore (which found nothing to do, as it should) and compared the two:
identical, 1315 rows.

The first run covered the part the second did not. A second Postgres was
built locally with its own CA and `hostssl` only — the same situation a
managed provider puts you in — and the whole move was run against it: dump,
create, restore over TLS with the CA verified, migrations, and the
application serving real rows. Five connection cases were checked through the
code the application actually uses, and three of them were meant to fail:

| Case | Result |
| --- | --- |
| no `DATABASE_CA_CERT`, plain URL | refused — `no pg_hba.conf entry … no encryption` |
| `?sslmode=require`, no CA | refused — `unable to verify the first certificate` |
| correct CA | connected, read 24 rows |
| **a different CA** | refused — which is what makes the case above mean something |
| correct CA, base64-encoded | connected |

The second row is the one worth keeping. It is the reason `DATABASE_CA_CERT`
exists, and until this was run it was an inference from a unit test rather
than something anyone had watched happen.

`CSP_CONNECT_SRC` exists for one gap. `connect-src` is `'self'` plus the
origin of `SENTRY_DSN`, but the browser reports to `VITE_SENTRY_DSN`, which is
baked in at build time and which the server never sees. Same origin in the
usual case; if not, put the other one here, space-separated.

---

## Moving the database somewhere that does not expire

The host's free database has a deletion date. Any managed Postgres elsewhere
will do instead; what follows is the shape of the move, and the two things
about it that are not obvious.

**The order, because it is the whole safety of the operation.**

1. Take a dump of the current database, from the **external** connection
   string — the internal one only resolves inside the host's own network:

   ```
   DATABASE_URL='postgres://…' scripts/db-backup.sh
   ```

2. Create the new database. Postgres 16 if it is offered; that is what the
   migrations were written against.

3. Restore into it. `--no-owner --no-privileges` because the roles on the old
   host do not exist on the new one, and without these two the restore stops
   on every `ALTER … OWNER TO`:

   ```
   pg_restore --no-owner --no-privileges -d '<new external URL>' <dump file>
   ```

   Providers hand you a URL that already ends in `?sslmode=require`. For
   `pg_restore` that parameter is fine and does something useful. For the
   **application** it is worse than useless: `pg` turns `sslmode` in the URL
   into its own SSL configuration and overrides the one carrying your CA, so
   `DATABASE_CA_CERT` has no effect. `database-ssl.ts` removes the parameter
   whenever a certificate is present — see `databaseUrl` there. Paste the URL
   as the provider gives it.
   To have the restore verify the server as well, download the provider's CA
   and append `&sslmode=verify-ca&sslrootcert=/path/to/ca.crt`.

   One trap that costs an hour if you meet it cold: `sslmode=no-verify` is a
   **node-postgres** value, not a libpq one. It works in `DATABASE_URL` and is
   rejected outright by `psql` and `pg_restore`, which know only `disable`,
   `allow`, `prefer`, `require`, `verify-ca` and `verify-full`. The two halves
   of this repository talk to Postgres through different libraries and do not
   accept the same connection strings.

4. Put the new `DATABASE_URL` and its `DATABASE_CA_CERT` into the service's
   environment and let it redeploy. Migrations run on start; against a
   restored database they find nothing to do and say so.

5. **Compare the two databases before you throw anything away.** Looking at
   the application is not enough: the dangerous outcome of a move is not the
   restore that fails — that one is loud — but the restore that finishes and
   is incomplete. `pg_restore` reports success, the app starts, the first
   screens look right, and a table that appears on none of them is empty.
   That surfaces weeks later, once the old database is gone.

   ```
   VON='<old external URL>' NACH='<new external URL>' \
     node server/dist/database/compare.js
   ```

   It counts every table in both — counts, not the planner's estimate, which
   after a fresh restore has no statistics and would read as empty — and
   compares the `migrations` table as well. Row counts that match while the
   migrations do not means the data is from a different time than the schema.
   Exit code 0 means identical; anything else prints what differs and says not
   to delete.

   Add `VON_CA_CERT` / `NACH_CA_CERT` if either side wants its own root
   certificate. Both connection strings come from the environment rather than
   the command line, because the command line is visible to anyone who can
   list processes on the machine.

   The tool itself has been checked against a known wrong answer, not only a
   known right one: a deleted row, a dropped table and a missing migration
   were each introduced deliberately, and each was reported. A checker that
   can only say "identical" says nothing.

6. Open the application and check that the data is there. Only now remove the
   `databases:` block from `render.yaml`, and afterwards look in the
   dashboard at what that removal actually did to the old database. Keep the
   dump until you have looked.

**Why `DATABASE_CA_CERT` exists.** Once the database is not on the same
network, the connection crosses the open one, and two separate things have to
be true: it is encrypted, and it reached the intended server. Appending
`?sslmode=require` feels like ordering both, and does not reliably mean both —
in `pg-connection-string` 2.x, `require` is an alias for `verify-full`, so the
certificate is checked against the system's trust store. Managed providers
commonly sign with their own per-project CA, which is in no such store, so the
connection fails; and the obvious way out, `sslmode=no-verify`, keeps the
encryption and drops the question of who answered.

So the provider's CA certificate goes into `DATABASE_CA_CERT` — PEM as
downloaded, or base64 if newlines will not survive the trip — and the
connection verifies against it. Leave it empty and nothing is imposed: the URL
decides, which is what a database inside the same network wants.
`server/src/database/database-ssl.ts` is the one place this is decided, for
the application, the migration run and the CLI alike.

---

## 3. What you are not getting

Free means free of money, not free of consequences. Read this part before
showing anyone.

**It falls asleep.** Render spins a free web service down after 15 minutes
without inbound traffic. The next request starts it again, and that request
waits about a minute, staring at a loading page. If you send the link to
someone and they open it cold, that is their first impression of the product.

A free cron service (cron-job.org and others) fetching `/health` every ten
minutes prevents it. Ten, not fifteen: a schedule with no slack turns one
missed run into a spin-down.

| Setting | Value |
| --- | --- |
| URL | `https://your-address/health/ready` |
| Method | `GET` |
| Every | 10 minutes |
| Timezone | the one you live in — the schedule below is in local hours |
| Hours | 06:00 – 23:00, not around the clock (see the arithmetic below) |
| Notify | on failure |

**`/health/ready` is the right target — and it used to be the wrong one.**

While the database lived on the same host and never slept, `/health` was
correct: it is the liveness check, touches nothing external, and so the ping
could not fail for a reason that had nothing to do with the service. Scheduling
the readiness check meant a database blip would page you about the web service.

The database now lives elsewhere and powers off when nothing uses it. That
changes which check is worth running, and one measurement settles it: with the
web service awake and nobody using it, `pg_stat_activity` on the database shows
**no connection from the application at all**. The pool releases idle
connections. So a `/health` ping keeps the web service warm and lets the
database fall asleep underneath it — and the check answers 200 while a real
visitor would still wait for the database to wake.

A check that does not exercise the thing you care about is not a check.
`/health/ready` opens a connection and runs `SELECT 1`, which keeps both ends
awake and, when it fails, fails about something you want to hear about.

`/health` remains what it is: the liveness check, and the right one for an
orchestrator that would restart the container on a failure. It is a poor
target for a keep-alive to an external database.

Two things that look like faults and are not. The first ping after a
spin-down often records as a timeout, because waking takes longer than the
pinger waits — it still woke the service. And `uptimeSeconds` in the reply is
the honest way to tell whether any of this works: read it twice a day apart,
and if it grew by roughly a day, nothing slept in between.

**Around the clock does not fit, and there are two services now.** Render
grants 750 free instance hours per workspace per calendar month — for the
workspace, not per service. Since the move there are two of them here, the old
service and the new one. Two kept awake around the clock is 1440 hours, far
over the line. So only the new one is pinged, and the old one goes as soon as
the new one has run quietly for a while. A service kept awake continuously uses 720 in a
30-day month and 744 in a 31-day month — under the limit, but with six hours
to spare and nothing left for a second free service. Waking hours only, say
06:00 to 23:00, costs about 527 hours in a long month. The price is that
someone opening the link at three in the morning waits the minute.

**The database expires, and the date is fixed on the day you create it.** A
free Render Postgres expires 30 days after creation, and 14 days after that
Render deletes it and everything in it. One gigabyte, one free instance per
workspace, and no backups of any kind — not "backups you have to enable",
none available. Write both dates down when you create it; the expiry is not
a warning that arrives, it is a date that passes.

This is the single hardest deadline in this document. Everything else here
degrades. This one deletes.

**No custom domain, so no trust.** `something.onrender.com` is fine for "have a
look at this". It is not fine for a login screen you ask a customer to type a
password into, and a thoughtful customer will notice.

**Mail does not leave the building** until SMTP is configured. Invitations,
password resets, address confirmations and dunning previews are written to a
file inside the container and vanish on restart. You can try every screen; you
cannot invite anyone.

That last one now cuts deeper than it used to. Accepting an invitation requires
a confirmed address, and the only way to confirm one is the link in a mail. On
an installation without SMTP nobody can join a second workspace — not because
the invitation is broken, but because its confirmation mail is sitting in
`var/mail` where the recipient cannot reach it. Confirming by hand is an
`UPDATE users SET "emailVerifiedAt" = now()`, which is a stopgap for your own
test account and not a way to run this.

---

## When it stops being a demo

In this order, because each one blocks the next:

1. **A database that does not expire, with backups**, and a restore you have
   actually performed — untested backups are a belief, not a backup. This is
   first not because it is the most visible but because it is the only one
   with a clock on it: the free database has a deletion date from the day it
   was created, and the others merely stay unfinished.
2. **A domain and TLS.** Both halves already assume HTTPS.
3. **A paid instance that does not sleep.** The cron ping above is a patch
   over this, and a patch that quietly spends the free hour budget.
4. **SMTP** on a domain that is allowed to send for it — SPF and DKIM, or the
   mail lands in spam and the product looks broken. Moved up in practice by
   the address confirmation: without working mail nobody can accept an
   invitation, so this is no longer only about looking finished.
5. **The legal pieces**: Impressum filled in, privacy policy, terms, and an
   AV-Vertrag for anyone whose customer data you hold. That last one is not
   optional in Germany and is not something to draft yourself.
