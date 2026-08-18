# Deployment Guide

This app is one Node.js service: the Express backend serves both the API and the built React frontend from a single origin. You need exactly one thing that most "quick deploy" platforms don't give you by default: **persistent disk storage for the SQLite database file.** Skip that step and every quote your colleagues create will vanish the next time you deploy an update or the server restarts.

This guide uses **Render** because it makes that one thing easy through its dashboard (a "Persistent Disk" you attach to the service), it's inexpensive for a small internal tool, and you never have to touch a command line to manage it day to day. Railway and Fly.io both work too if you'd rather use those (same idea: attach a volume, mount it, point `DATABASE_PATH` at it) — the steps below carry over conceptually.

## 1. Push the code to GitHub

Render deploys from a Git repository. The project already has a local git repository with an initial commit. Create an empty repository on GitHub (github.com → New repository — don't initialize it with a README), then from the project folder:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

Use a **private** repository — this code doesn't contain secrets (`.env` is gitignored), but there's no reason to make an internal dealership tool public.

## 2. Create the Render Web Service

1. Sign up / log in at [render.com](https://render.com).
2. **New → Web Service**, connect your GitHub account, and select the repository.
3. Configure:
   - **Region**: closest to Belgium (Frankfurt).
   - **Branch**: `main`.
   - **Build Command**: `npm run deploy:build`
   - **Start Command**: `npm start`
   - **Instance Type**: the cheapest paid tier is plenty for a small sales team (the free tier works too, but spins down when idle and loses anything not on the persistent disk in between — fine to try first, upgrade if that's annoying).

## 3. Attach a persistent disk (the important part)

On the same service, under **Disks → Add Disk**:

- **Name**: `data`
- **Mount Path**: `/var/data`
- **Size**: 1 GB is enormous overkill for this database; the minimum Render offers is fine.

This gives the service a folder that survives redeploys and restarts — unlike the rest of the container's filesystem, which is thrown away every time you deploy.

## 4. Environment variables

Under **Environment**, add:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies and static frontend serving |
| `NPM_CONFIG_PRODUCTION` | `false` | Without this, Render's build step inherits `NODE_ENV=production` and `npm install` skips `devDependencies` — which includes `vite`, so the frontend build fails with `vite: not found`. This forces devDependencies to install at build time while `NODE_ENV` still stays `production` at runtime. |
| `DATABASE_PATH` | `/var/data/quotation.db` | Must point inside the disk you mounted in step 3 |
| `JWT_SECRET` | *(long random string)* | Generate one locally: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The server refuses to start in production without this. |
| `ADMIN_EMAIL` | e.g. `admin@unicars.be` | Bootstrap admin account, created automatically on first boot |
| `ADMIN_NAME` | e.g. `Beheerder` | |
| `ADMIN_PASSWORD` | *(a real password)* | If you skip this, a random one is generated and printed to the Render service logs once — set it explicitly instead so you don't have to go digging through logs |

Optional, only if you want the "e-mail PDF to customer" button and the "forgot password" reset e-mail to work:

| Key | Value |
|---|---|
| `SMTP_HOST` | your mail provider's SMTP host |
| `SMTP_PORT` | usually `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | the "from" address quotes and reset e-mails are sent from |
| `FRONTEND_URL` | your Render URL, e.g. `https://geely-offertes.onrender.com` | **Required** if you set the SMTP vars above — the password-reset e-mail builds its link from this. Without it, that link falls back to `http://localhost:3000` and won't work for anyone but you, on your own machine. |

You don't need `PORT` — Render sets it itself. `FRONTEND_URL` is otherwise unused (the frontend is served from the same origin, so there's no CORS to configure) — it only matters for the reset-link e-mail above.

## 5. Deploy

Click **Create Web Service**. Render builds and starts it. Watch the logs for:

```
✓ Database tables initialized
🚗 Geely Quotation Server running on http://localhost:...
✓ Connected to SQLite database at /var/data/quotation.db
```

Render gives you a URL like `https://geely-offertes.onrender.com` immediately, with HTTPS already set up.

## 6. First login

Go to the URL, log in with the `ADMIN_EMAIL`/`ADMIN_PASSWORD` you set. From there:

- **Beheer → Gebruikers**: create an account for each colleague (they can change their own password later via the name button in the header).
- **Beheer → Voertuigen / Opties**: double-check pricing matches the current Geely price list before anyone sends a real quote.

## 7. Custom domain (optional)

Render → your service → **Settings → Custom Domain**. Add something like `offertes.unicars.be` and follow the DNS instructions (a CNAME record at your domain registrar). HTTPS certificate is issued automatically.

## Backups

The database is a single file. Two ways to back it up:

1. **Manual**: log in as an admin → **Beheer → Back-up → Download back-up**. Do this occasionally, especially before any risky change.
2. **Automated**: `GET /api/admin/backup` requires an admin session cookie, so a simple scheduled `curl` won't work as-is without also handling login — the practical version is a small script that logs in via `/api/auth/login`, saves the cookie, then downloads `/api/admin/backup`, run on a schedule (cron, GitHub Actions, or Render's own Cron Jobs). Ask for this script if you want it — it's a quick addition once you're ready to automate it.

Either way, store the downloaded `.db` file somewhere other than the server itself (e.g. a shared drive), since a backup that lives next to the thing it's backing up doesn't protect you from losing the whole server.

## Updating the deployed app

Push to `main` — Render redeploys automatically. The persistent disk means your quotes, users, and catalog survive every redeploy; only the code changes.

## Troubleshooting

- **"FATAL: JWT_SECRET is not set"** in the logs → you deployed with `NODE_ENV=production` but forgot to set `JWT_SECRET`. Add it and redeploy.
- **Quotes disappear after a deploy** → `DATABASE_PATH` isn't pointing inside the mounted disk. Double-check step 3 and 4 match exactly (`/var/data` mount path, `/var/data/quotation.db` database path).
- **Can't log in with the admin account** → check the Render service logs from the very first boot; if `ADMIN_PASSWORD` wasn't set, the generated password was printed there once.
- **"Verstuur naar klant" (e-mail) fails with a 503** → SMTP environment variables aren't set (see step 4's optional table). This is expected until you configure them; PDF download still works without them.
