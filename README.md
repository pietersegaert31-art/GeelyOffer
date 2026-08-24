# Geely Quotation System

Internal quotation tool for the Unicars Geely dealership. Salespeople build a vehicle quote (model, uitvoering, opties, korting), the system prices it correctly under Belgian 21% BTW, and exports a branded PDF. Admins manage the vehicle/accessory catalog and colleague accounts.

## Features

- 🔐 **Accounts & roles** — every colleague logs in; admins manage the catalog and users, salespeople build and manage quotes
- 🚗 **Vehicle catalog** — Geely E5 and Starray EM-i, editable pricing/specs from the admin panel
- 📋 **Quote builder** — step-by-step wizard: model → uitvoering → opties → klantgegevens
- ✏️ **Quote editing** — revisit an existing quote to change options, discount, customer info, or status
- 🔁 **Duplicate & status workflow** — copy a quote for a new customer; track draft/sent/accepted/declined
- 🔍 **Search, filter, pagination** on the quotes overview
- 📧 **E-mail delivery** — send the PDF straight to the customer (requires SMTP configuration)
- 📄 **CSV export** — full quotes list for reporting
- 💰 **Correct BTW math** — Geely's published prices are already VAT-inclusive; excl./incl. BTW are shown consistently everywhere (app and PDF)
- 📑 **Branded PDF** — cover page with vehicle photo, pricing breakdown, standard equipment
- 💾 **SQLite** — file-based storage; see [DEPLOYMENT.md](./DEPLOYMENT.md) for why the file's location matters once this is hosted online
- 🧪 **Automated tests** — pricing math, equipment data, and an end-to-end auth/quote integration test (`npm test`)

## Project Structure

```
geely-quotation-system/
├── backend/                       # Express API (+ serves the built frontend in production)
│   ├── src/
│   │   ├── server.js              # Entry point, middleware, route mounting
│   │   ├── database/init.js       # SQLite schema, migrations, seed data, bootstrap admin
│   │   ├── middleware/auth.js     # requireAuth / requireAdmin
│   │   ├── routes/                # auth, users, vehicles, accessories, quotes, pricing, pdf, admin
│   │   ├── utils/                 # pricing math, auth (JWT), e-mail (nodemailer)
│   │   ├── data/                  # accessory seed data, standard-equipment reference data
│   │   └── test/                  # integration test (boots a real server against a temp DB)
│   └── .env.example
│
├── frontend/                      # React + Vite
│   └── src/
│       ├── context/AuthContext.jsx
│       └── components/            # LoginPage, QuoteBuilder, QuoteList, QuoteEditor, AdminPage, ...
│
├── package.json                   # Root scripts (dev, build, test, deploy:build)
├── DEPLOYMENT.md                  # How to put this online for colleagues
└── README.md
```

## Prerequisites

- Node.js 18+ and npm

## Local development

```bash
npm run install:all      # installs root, backend, and frontend dependencies
```

Copy `backend/.env.example` to `backend/.env` and fill it in — at minimum set `JWT_SECRET` to any long random string for local dev (see the file for what each variable does). Leaving `ADMIN_EMAIL`/`ADMIN_PASSWORD` unset is fine locally: a random admin password is generated and printed to the console on first boot.

```bash
npm run dev
```

- Backend: http://localhost:5000
- Frontend: http://localhost:3000 (proxies `/api` to the backend)

Log in with the bootstrap admin account shown in the backend console output on first run.

## Tests

```bash
npm test
```

Runs the pricing-math unit tests, standard-equipment data tests, and an integration test that boots a real server instance against an isolated temporary database (never touches your real data).

## Production build

```bash
npm run deploy:build   # install everything + build the frontend
npm start              # NODE_ENV=production node backend/src/server.js
```

In production, the backend also serves the built frontend (`frontend/dist`) from the same origin — one process, one URL, no separate CORS/cookie concerns. See [DEPLOYMENT.md](./DEPLOYMENT.md) for hosting instructions, required environment variables, and — importantly — how to avoid losing your database on redeploy.

## Database

SQLite, auto-created on first run. Tables: `users`, `vehicles`, `accessories`, `quotes`, `quote_items`, `pricing_tiers`. Location is controlled by `DATABASE_PATH` (defaults to `backend/data/quotation.db`).

To reset locally: stop the server, delete the file at `DATABASE_PATH`, restart.

To back up: log in as an admin and use **Beheer → Back-up → Download back-up**, or hit `GET /api/admin/backup` directly.

## API overview

All routes except `/health`, `/api/auth/login`, and static assets require a logged-in session (cookie-based). Routes under `/api/users`, and mutating routes under `/api/vehicles`/`/api/accessories`, require the `admin` role.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`
- `GET/POST/PUT/DELETE /api/users` (admin)
- `GET/POST/PUT /api/vehicles`
- `GET/POST/PUT/DELETE /api/accessories`
- `GET/POST/PUT/DELETE /api/quotes`, plus `/api/quotes/:id/duplicate`, `/api/quotes/:id/send-email`, `/api/quotes/export.csv`
- `POST /api/pricing/calculate`, `GET /api/pricing/discount-tier/:quantity`
- `GET /api/pdf/:quoteId`
- `GET /api/admin/backup` (admin)

## Pricing logic

Geely's published vehicle and accessory prices are **already VAT-inclusive** (Belgian adviesprijzen). A discount percentage is applied to the VAT-inclusive subtotal; the excl.-BTW amount is then derived by dividing back out the 21% rate — not by adding VAT on top of an already-inclusive price. See `backend/src/utils/pricing.js` and its tests for the exact formula.

## License

Internal tool for Unicars — not for redistribution.
