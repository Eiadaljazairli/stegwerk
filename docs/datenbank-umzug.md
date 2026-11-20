# Moving the database off the free tier

The free Postgres on the current host has a deletion date. This is the move,
as commands, in the order they must run.

Read the two boxes first. Everything after them assumes you have.

> **The passwords are in the connection strings.** Put them in front of the
> single command that needs them, as written below — never `export` them into
> a shell that keeps a history file, and never pass them where the command
> line is visible to other processes.

> **Nothing is deleted until step 8 says so**, and step 8 depends on step 6
> saying the two databases are identical. If step 6 disagrees, stop: you still
> have both copies, and that is the whole point of doing it in this order.

**You do not get to choose the version on a free plan.** Aiven's free tier
offers PostgreSQL 18 and greys the version dropdown out: choosing it is a
Professional-tier feature. Neon and Supabase draw the line in similar places.
So the new database is two major versions ahead of the one every migration
here was written against, and that is a fact to work with rather than argue
with.

Three consequences, and only the third needs anything from you:

| | |
| --- | --- |
| dump **from** the old database (16) with your 16.10 tools | fine |
| restore **into** the new one (18) with the same tools | fine — `pg_restore` is executing SQL, and older-dump-into-newer-server is the ordinary upgrade path |
| dump **from** the new one (18) later, for backups | **fails** — `pg_dump` refuses a server newer than itself |

The third is not needed for the move. It is needed the first time you want a
backup of the new database, which is the entire reason for moving. Install the
PostgreSQL 18 client tools before then; they sit alongside the 16 ones and
nothing here depends on which is first in the path, because every call in this
document names its binary by full path.

---

## 1. Create the new database

At Aiven, Neon, Supabase or whoever: a PostgreSQL **16** instance on the free
plan.

**Pick the region closest to the web service**, not to you. Every query the
application makes crosses that distance, and it does so while somebody waits.
The web service is on Render; match its region — Frankfurt for a European
deployment. Getting this wrong is not fatal and is annoying to fix later,
because it means moving the database a second time.

Two things to collect from their dashboard:

- the **external** connection URI (Aiven calls it "Service URI"). It usually
  ends in `?sslmode=require`.

  **That parameter is a trap, and this repository now removes it for you.**
  In `pg`, `sslmode` in the URL builds its own SSL configuration and
  overrides the one the application passes — so `DATABASE_CA_CERT` had no
  effect at all, silently, on exactly the URL every provider hands out.
  Measured against this database, same certificate both times:

  | | |
  | --- | --- |
  | `?sslmode=require` + certificate | `self-signed certificate in certificate chain` |
  | no `sslmode` + certificate | connected, PostgreSQL 18.6 |

  `database-ssl.ts` strips it whenever a certificate is present, so you can
  paste the URL as given. The commands below leave `?sslmode=require` in
  place for exactly that reason: it is now harmless, and removing it by hand
  would be one more thing to get wrong. Command-line tools like `psql` and
  `pg_restore` are a different library and do need it — there it says
  `verify-ca` with the CA file, which checks rather than assumes.
- the **CA certificate** file. Aiven offers it as `ca.pem` on the service
  overview. You need it twice: once for the restore, once for the application.

**The free tier powers the database off when nothing uses it.** Aiven says so
plainly on the plan card, and the paid tier above it lists "inactive services
aren't powered off" as the thing you are buying. That is not the problem the
move solves — the problem was a database with a deletion date — but it is the
same shape as the web service falling asleep, and it has the same answer: the
cron ping that keeps the application awake keeps the database in use too. A
first request after a long quiet spell will be slow. Nothing is lost.

---

## 2. Run the migrations against the empty new database — first

Before the dump, before anything. The new database is empty, so this costs
thirty seconds and risks nothing; if PostgreSQL 18 rejects something these
migrations do, you find out now rather than with a half-finished move behind
you.

```bash
cd server
DATABASE_URL='postgres://…neue…URL…?sslmode=require'   DATABASE_CA_CERT="$(cat ~/Downloads/ca.pem)"   node dist/database/migrate.js
```

Expect a list of applied migrations ending without an error. If one fails,
stop here: nothing has been moved, the old database is untouched, and the
failure is a bug to fix in this repository rather than an emergency.

Then throw that schema away again — the restore in step 4 wants an empty
database, not one with tables already in it:

```bash
~/pgsql/bin/psql.exe 'postgres://…neue…URL…?sslmode=require'   -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
```

---

## 3. Take the dump

The **external** connection string of the *old* database — the internal one a
host shows you only resolves inside that host's own network.

```bash
DATABASE_URL='postgres://…alte…externe…URL…' scripts/db-backup.sh
```

It writes `~/weitblick-backups/weitblick-remote-<stamp>.dump` and prints the
path and size. **Write that path down.** The rest of this refers to it as
`$ABZUG`.

```bash
ABZUG=~/weitblick-backups/weitblick-remote-20261009-143000.dump   # your name here
ls -lh "$ABZUG"
```

A dump of a few hundred kilobytes is normal for this data. A dump of a few
hundred *bytes* is not — that is what an authentication failure looks like
when it is not reported as one. If you see that, stop and check the URL.

---

## 4. Restore into the new database

`--no-owner --no-privileges` because the roles of the old host do not exist on
the new one; without them the restore stops on every `ALTER … OWNER TO`.

```bash
~/pgsql/bin/pg_restore.exe --no-owner --no-privileges \
  -d 'postgres://…neue…URL…?sslmode=require' "$ABZUG"
```

To have the restore verify *which* server answered, not merely encrypt the
line to it, append the CA you downloaded:

```bash
~/pgsql/bin/pg_restore.exe --no-owner --no-privileges \
  -d 'postgres://…neue…URL…?sslmode=verify-ca&sslrootcert=/pfad/zu/ca.pem' \
  "$ABZUG"
```

**The trap that costs an hour if you meet it cold:** `sslmode=no-verify` is a
**node-postgres** value, not a libpq one. It works in `DATABASE_URL` for the
application and is rejected outright by `psql` and `pg_restore`, which know
only `disable`, `allow`, `prefer`, `require`, `verify-ca` and `verify-full`.
The two halves of this repository speak to Postgres through different
libraries and do not accept the same connection strings.

Warnings during the restore are normal and are not failures. Errors are.

---

## 5. Run the migrations against the restore

They should find nothing to do. That is the point of running them: if they
*do* find something, the dump and the code are from different times, and you
want to know that now rather than after the old database is gone.

```bash
cd server
DATABASE_URL='postgres://…neue…URL…?sslmode=require' \
  DATABASE_CA_CERT="$(cat ~/Downloads/ca.pem)" \
  node dist/database/migrate.js
```

Expected output: `Schema already up to date`.

---

## 6. Prove the two are identical

This is the step that makes the deletion in step 8 safe. Looking at the
application is not enough — the dangerous outcome of a move is not the restore
that fails, which is loud, but the one that finishes and is incomplete.

```bash
cd server
VON='postgres://…alte…URL…' \
NACH='postgres://…neue…URL…?sslmode=require' \
NACH_CA_CERT="$(cat ~/Downloads/ca.pem)" \
  node dist/database/compare.js
```

It counts every table on both sides and compares the applied migrations.

- **Exit 0**, ending in `Der alte Bestand darf weg` — identical. Continue.
- **Exit 1** — either the two differ, or the comparison never happened
  (a connection refused, a certificate rejected). Both print `NICHTS LÖSCHEN`.
  Do that: change nothing, delete nothing. You still have both databases and
  the dump.
- **Exit 2** — `VON` or `NACH` was not set. Nothing was contacted.

The distinction between "they differ" and "I could not look" is deliberate and
was a bug once: the first version exited 0 when the connection failed, so a
rejected certificate would have read as *identical*. All four outcomes are now
checked by running them — matching, differing, unreachable, and unset.

`VON_CA_CERT` exists too, if the old side ever needs its own root certificate.

---

## 7. Point the application at the new database

In the host's dashboard, on the **web service** (not the database):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the new external URI, with its `?sslmode=require` |
| `DATABASE_CA_CERT` | the contents of `ca.pem`, pasted whole |

If the dashboard mangles the newlines in the certificate, paste it base64
instead — `database-ssl.ts` accepts either:

```bash
base64 -w0 ~/Downloads/ca.pem
```

Save; the service redeploys. Then check, in this order:

```bash
curl -s https://weitblick.onrender.com/health/ready
```

`{"status":"ready","database":"reachable"}` means it is talking to the new
database. Then open the application and look at a record you recognise.

---

## 8. Only now, the old database

Remove the `databases:` block from `render.yaml`, commit, push. Afterwards
look in the dashboard at what that removal actually did — a blueprint change
does not always delete the resource, and "not always" is not something to
find out by assuming.

**Keep the dump.** Not until the deploy is green — until a week of ordinary
use has gone by. It costs nothing to keep and cannot be recreated once the
source is gone.

---

## What this does not solve

The new database has no backups either unless you arrange them. `db-backup.sh`
against the new `DATABASE_URL` on a schedule is the cheap version:

```bash
DATABASE_URL='postgres://…neue…URL…' scripts/db-backup.sh
```

Remote dumps are deliberately never pruned by that script — a dump of a hosted
database is often the only copy of something that exists nowhere else. Delete
those by hand, knowing what each one is.
