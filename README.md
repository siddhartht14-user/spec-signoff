# Spec Sign-off

Project folders, architect review links, tasks from comments, dashboard and 7-day escalation.

## Environment variables (Vercel project settings)
- `BLOB_READ_WRITE_TOKEN` : set automatically when a private Blob store is connected
- `SESSION_SECRET` : long random string (signs sessions and architect links)
- `TEAM_PASSCODE` : shared passcode the Haworth team uses to sign in
- `CRON_SECRET` : random string; Vercel sends it to the daily escalation cron
- `RESEND_API_KEY` and `MAIL_FROM` : outbound email (e.g. `Spec Sign-off <signoff@yourdomain.com>`)

## Layout
- `public/index.html` : the app (single file) and `public/shim.js` (talks to `/api/*`)
- `api/*.js` : serverless functions (db, upload, blob, mail, link, r, login, me, escalate)
- `vercel.json` : rewrites and the daily cron
