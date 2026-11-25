# ProjectTrack: Final Year Project Management System

ProjectTrack is a web portal for a college department to run final-year projects from team formation to final submission.

- **Students** register a team and project, upload a document for each stage, and see their guide's feedback, deadlines and marks.
- **Project guides** review uploads (approve, request changes or reject), award marks, extend deadlines for a team, schedule meetings and post remarks.
- **The Head of Department (HOD)** approves proposals, allocates guides, manages users, configures stages and deadlines for each academic year, watches progress on a dashboard, and exports reports and backups.

Stack: **Next.js 15** (App Router, TypeScript, server actions), **PostgreSQL** through **Prisma**, Tailwind CSS. It runs on any Node.js host. The recommended free setup is **Supabase** (PostgreSQL and file storage) plus **Vercel** (hosting).

---

## Features

| Area | What it does |
|---|---|
| Roles & sign-in | Student, Guide and HOD dashboards. Email and password sign-in with bcrypt hashes and signed, HTTP-only session cookies (12 h). Temporary passwords must be changed at first sign-in. Repeated failed sign-ins are throttled. Deactivated accounts are blocked immediately. |
| 14-stage lifecycle | Default stages: Team Formation, Guide Allocation, Title Proposal, Abstract, Literature Survey, SRS, System Design, Review 1, Implementation Phase 1, Review 2, Implementation Phase 2 & Testing, Report Draft, Final Review & Viva, Final Submission. The HOD can rename, reorder, add, turn off or delete stages and set each stage's deadline, allowed file types, maximum marks and whether it needs an upload. Stages unlock in order. |
| Deadlines & calendar | Department deadlines per stage, per-team extensions with a reason, and a bulk "move deadlines by N days". A month calendar shows deadlines, reviews, meetings and holidays. Countdown and overdue flags appear everywhere, and late uploads are marked. Dates are entered and shown in `APP_TIMEZONE` (default Asia/Kolkata). |
| Documents | Versioned uploads (v1, v2, …) with notes, file type and size checks, private storage, and downloads only through an access-checked route. |
| Reviews | Approve, request changes or reject, with comments and marks capped at the stage maximum. Only the latest pending version can be reviewed. A project is marked completed automatically when every stage is approved. |
| Notifications | In-app notification centre for submissions, reviews, allocations, deadline changes, remarks and events. Emails are also sent when SMTP is configured, never to demo accounts. A reminder job sends 3-day, 1-day and overdue reminders, each once per stage. |
| Reports | Excel workbook (Projects, Stage matrix, Deadlines, Submissions, Students), a PDF department report, and a PDF report for any single project. |
| Analytics | HOD dashboard: projects by current stage, guide workload, teams needing attention, average progress, pending reviews and recent activity. |
| Audit log | Records sign-ins, uploads, downloads, reviews, deadline changes, account changes, exports and backups, with a searchable HOD view. |
| Backups | HOD can download a JSON export (without password hashes). `npm run backup` writes a full server-side backup including uploaded files. Database backups are also covered by `pg_dump` or Supabase's daily backups. |
| Academic years | Several batches, each with its own stages and deadlines. A new year can be created from the defaults or copied from an earlier year, keeping deadline offsets. One year is active at a time, and old years can be archived. |
| Demo data | Demo accounts and everything they touch are flagged `isDemo` and never mix with real data. A demo user cannot see real records and a real user cannot see demo records, and demo data stays out of real reports and backups. |

---

## Demo accounts

After `npm run db:seed` (password for all of them: **`Demo@123`**):

| Role | Email |
|---|---|
| HOD | `hod@demo.projecttrack` |
| Guide | `guide1@demo.projecttrack`, `guide2@demo.projecttrack` |
| Student | `student1@demo.projecttrack` … `student10@demo.projecttrack` |

The demo has five teams at different stages: one with a pending review, one with changes requested, one overdue, and one proposal waiting for the HOD. Re-running the seed resets the demo data and leaves real data alone. In production, set `DEMO_MODE=false` to hide the demo buttons on the sign-in page. To remove demo data completely, run `SKIP_DEMO=true npm run db:seed`.

---

## Run it locally

Requirements: Node.js 20 or newer, and PostgreSQL 14 or newer (local, Docker, or a Supabase project).

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL, DIRECT_URL and AUTH_SECRET
npx prisma migrate deploy     # create the tables
npm run db:seed               # demo data + the current academic year with the default 14 stages
npm run create-hod -- --email hod@yourcollege.edu --name "Dr. Your Name" --password "ChooseAStrong#1"
npm run dev                   # http://localhost:3000
```

Quick PostgreSQL with Docker:
```bash
docker run -d --name pt-db -e POSTGRES_USER=projecttrack -e POSTGRES_PASSWORD=projecttrack -e POSTGRES_DB=projecttrack -p 5432:5432 postgres:16
```

### First steps as the real HOD
1. Sign in with the account you created with `create-hod`.
2. **Users**: add guides and students one at a time, or import a CSV (`name,email,role,rollNo`). Each new account gets a temporary password, shown once, which the user must change at first sign-in.
3. **Stages & Deadlines**: check the 14 stages and set real deadlines.
4. Students then sign in, and the team leader registers the project. Approve it and allocate a guide from **Projects**.

---

## Deploy: Supabase + Vercel (free tiers, browser only)

No local tools are needed. Vercel creates the database tables on every build (`vercel-build` runs `prisma migrate deploy`), and the first HOD account is created on the one-time `/setup` page.

1. **Supabase**: create a project. Under *Connect*, copy the **Transaction pooler** URI (port 6543) and add `?pgbouncer=true&connection_limit=1` to make `DATABASE_URL`. Copy the **Session pooler** URI (port 5432) as `DIRECT_URL`. Under *Storage*, create a **private** bucket named `projecttrack`. Under *Project Settings → API Keys*, copy the project URL and the `service_role` (secret) key.
2. **Vercel**: import the GitHub repository and add these environment variables:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (random, 32+ characters), `SETUP_TOKEN` (random), `CRON_SECRET` (random), `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=projecttrack`, `MAX_UPLOAD_MB=4`, `DEMO_MODE=true` (or `false`), and optionally the `SMTP_*` settings. Then deploy.
3. Open `https://<your-app>.vercel.app/setup`, enter the `SETUP_TOKEN`, and create the HOD account. You can optionally load the demo accounts at the same time. The page closes itself afterwards.
4. **Reminders**: `vercel.json` schedules `/api/cron/reminders` daily at 02:30 UTC (08:00 IST). Vercel sends `CRON_SECRET` automatically. On another host, call it with `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/reminders`.
5. **Upload size**: Vercel limits request bodies to about 4.5 MB, so keep `MAX_UPLOAD_MB=4` there. For larger files, such as code archives, host on a Node server (Render, Railway, a college VM or Docker), where `MAX_UPLOAD_MB` can be 25 or more.

Command-line alternative: `npx prisma migrate deploy`, `npm run db:seed`, and `npm run create-hod -- --email … --name … --password …`, run with the Supabase URLs in `.env`.

### Deploy on your own server (college VM)
```bash
npm ci && npm run build
npx prisma migrate deploy
npm start                     # port 3000; put Nginx/Caddy in front for HTTPS
```
With `STORAGE_DRIVER=local`, files go to `UPLOAD_DIR`. Back that folder up along with the database.

---

## Backups

- **In the app**: HOD → Backup → *Download export* (JSON of all records, without passwords).
- **Full backup on the server**: `npm run backup` writes `backups/<timestamp>/database.json` and a copy of `uploads/`.
- **Database dump**: `pg_dump "$DIRECT_URL" -Fc -f projecttrack-$(date +%F).dump`. Restore with `pg_restore -d "$DIRECT_URL" --clean projecttrack-YYYY-MM-DD.dump`.
- Supabase also keeps daily backups on its plans.

---

## Tests

```bash
npm test            # unit tests: stage states, deadlines, extensions, progress, access rules, timezone handling
npm run build && npm run test:e2e
```
The end-to-end suite starts the production server against a **new temporary database** (`projecttrack_e2e_<timestamp>`, dropped afterwards) and drives a real Chromium browser through 38 checks:
- **Role isolation**: students and guides get 404 for other teams' pages, files and reports, and HOD pages and APIs are blocked for other roles.
- **Uploads**: a disallowed file type is refused, a revised version is accepted, and uploads are locked while a review is pending.
- **Reviews**: a comment is required to request changes, marks are capped at the stage maximum, approving unlocks the next stage, and the team is notified.
- **Deadlines**: per-team extensions are entered in IST, HOD deadline edits notify teams, and the reminder job runs only once per stage.
- **Exports**: the Excel workbook's structure, the PDF reports, and a backup with no password hashes.
- **Demo/real separation**: a demo student cannot join a real team, and the demo HOD cannot open a real project.
- **Account lifecycle**: one-time setup page with a token, CSV import, forced password change, and deactivation.

It needs PostgreSQL. Point `TEST_DATABASE_SERVER` at a server where your user may create databases (default: local `projecttrack` user). GitHub Actions runs everything on every push (`.github/workflows/ci.yml`).

---

## Project layout

```
prisma/schema.prisma        data model (users, years, stages, projects, submissions, extensions, events, notifications, audit)
prisma/seed.ts              demo data + default academic year
scripts/                    create-hod, backup
src/lib/                    session auth, access rules, stage/deadline logic, storage, notifications, reminders, reports
src/app/actions/            server actions (all permission checks happen here, on the server)
src/app/(app)/              pages: student, guide, hod, projects, calendar, notifications, profile
src/app/api/                file download, reports, backup, reminder cron
tests/                      unit + end-to-end
```

## Security notes
- Every page, server action and API route checks the signed-in user's role and their relationship to the project on the server. Hidden buttons are not relied on.
- File downloads never expose storage paths. Requests for files a user may not see get the same 404 as missing files.
- Set a long random `AUTH_SECRET`, serve over HTTPS, and keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
