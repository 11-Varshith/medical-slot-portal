# CareSlot - Medical Appointment Booking Portal

React (Vite) + Node/Express REST API. Data is stored in `server/data.json` (no MongoDB needed).

## Run
    npm run setup     # installs server + client deps and builds the frontend
    npm start         # http://localhost:5000

Dev mode (hot reload): `npm run dev:server` and `npm run dev:client` (http://localhost:5173).

## Demo logins (seeded on first run)
- Patient: patient@demo.com / patient123
- Doctor (choose "I am a doctor"): dr.rahul.sharma@demo.com / doctor123

Set `JWT_SECRET` in production. To reset data, delete `server/data.json`.

## Password recovery
The sign-in page includes a password recovery flow. Reset requests are stored in the JSON datastore as SHA-256 token hashes, expire after 30 minutes, and are invalidated after use.

- In local development without email settings, the reset page displays a development-only link after a matching account is entered.
- For Render, Resend's HTTPS API is recommended: set `RESEND_API_KEY`, `RESEND_FROM` (an address on a verified Resend domain), and `APP_URL` (the public frontend URL). This avoids SMTP connectivity restrictions. The API response or provider error is written to the backend logs without logging reset tokens.
- Alternatively, configure `SMTP_HOST`, `SMTP_PORT` (defaults to `587`), `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_SECURE=true` and `SMTP_FROM`. SMTP is used only when `RESEND_API_KEY` is not set.
- In production, set `APP_URL` to the public frontend URL and configure a provider and sender address; otherwise password recovery reports that it is unavailable.
- Never expose development reset links in a production environment.
