# Batticaloa meeting – headcount & payments

A small Next.js app for the area joint meeting.

**Members** (on their phones)
1. Register with name, phone, club/branch and a 4–6 digit PIN.
2. Headcount page: going on the 4th night bus? How many people are coming with them (the member is counted automatically)?
   The stay on the 5th morning uses the same count. Coming back on the 5th night bus? Same people, or a different number.
3. After saving they go to their dashboard: their headcount (with an Edit button) and the payment details.
   Once the organiser has entered prices, the dashboard shows the amount, the bank details and a slip upload.
   Slip photos are shrunk on the phone (to about 1 MB) before upload.

**Organiser** – `/admin`
- Live totals for the going bus, the stay and the coming-back bus (members + others).
- "All counts" table: every member's going / stay / back numbers, amount and payment status, plus totals by club.
- "Payment details": per-person prices and bank details. Saving prices makes the amounts appear on members' dashboards.
- "Close the headcount" stops members changing their numbers.
- Each member: view slip, mark paid / reject with a note, set a custom amount, edit the headcount, reset the PIN, remove.
- Download everything as CSV.

## Storage

Everything (members, settings, bank slips) is stored in Postgres. Tables are created automatically the first time the app runs.

- With `DATABASE_URL` (or `POSTGRES_URL`) set, it uses that database through the Neon serverless driver.
- Without it (local development), it uses a built-in Postgres saved in `./data/pglite`, so no setup is needed.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (members) and http://localhost:3000/admin (organiser).
The organiser password is `ADMIN_PASSWORD` in `.env.local`.

## Deploy on Vercel

1. Push this folder to a GitHub repository and import it in Vercel (framework: Next.js, no other settings).
2. In the Vercel project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project.
   This adds `DATABASE_URL` to the environment variables.
3. In **Settings → Environment Variables** add:
   - `ADMIN_PASSWORD` – the organiser password
   - `SESSION_SECRET` – a long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
4. Redeploy. Open the site, register a test member, then remove it from `/admin`.

Notes
- Slips are limited to 4 MB (Vercel's upload limit is about 4.5 MB). Photos are shrunk automatically; large PDFs may need to be re-saved smaller.
- Neon's free plan (0.5 GB) holds several hundred slips.
