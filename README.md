# Lab Results Patient Portal

A small web app that lets patients log in and view/download their own lab result
PDFs, sourced directly from your LIS's daily result folders (no data is copied
or duplicated — the app reads the share on demand).

## How it works

- Your LIS (SBSI LIS Pro) drops a new folder each day, e.g. `.PDF Results20260910`,
  containing category subfolders (`Chemistry`, `Hematology`, `Fecalysis`,
  `ImmunoSero`, `Urinalysis`, ...), each with PDFs named
  `<CaseNo>_<LASTNAME, FIRSTNAME MIDDLENAME>.pdf`.
- The app scans these folders live and matches files to the logged-in patient
  by case number.
- **Login is two-step:**
  1. **Verify** — patient enters case number + full name (as printed on their
     lab slip). The app checks this against the filenames on the share.
  2. **PIN** — on first successful verify, the patient sets a 4-8 digit PIN.
     From then on they log in with case number + PIN. The PIN is stored
     (hashed, bcrypt) in a small local SQLite database — separate from the LIS
     share, which is never written to.

This two-step design exists because case number + name alone is not secret —
it can appear on paperwork, wristbands, or be guessed — so relying on it alone
for a health-records login isn't safe. Requiring a self-chosen PIN after the
first visit means only the actual patient can access results going forward,
without needing to integrate with a separate hospital identity system.

## Project layout

```
lab-portal/
  server.js         Entry point
  config.js         Paths, env-driven settings
  db.js             SQLite schema (PINs + login attempt log only)
  scanner.js         Reads the LIS share, matches files to patients
  routes/auth.js     Verify / set-up PIN / login / logout
  routes/results.js  List results, stream a single PDF (with re-checked ownership)
  public/            Login page + dashboard (plain HTML/CSS/JS, no build step)
  sample-data/       Fake folders/files for local testing — safe to delete
```

## Setup

1. Install [Node.js](https://nodejs.org) 18+ on the server that will host this
   (it needs read access to the LIS share).
2. `npm install`
3. Copy `.env.example` to `.env` and fill in:
   - `LIS_ROOT` — the real path to the share, e.g. `\\172.22.60.5\SBSI LIS Pro`
     on Windows. **On Linux**, mount the SMB share first (e.g. via `cifs-utils`)
     and point `LIS_ROOT` at the local mount point instead — Linux can't read a
     `\\...\` UNC path directly.
   - `SESSION_SECRET` — generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PORT` — whatever's free on your server.
4. `node server.js` (or run it as a Windows service / with `pm2` / `systemd` so
   it restarts automatically — see "Running in production" below).
5. Visit `http://<server>:<port>/` from a patient's browser.

To try it locally first with the included fake data, just run `node server.js`
without setting `LIS_ROOT` — it'll use `sample-data/` automatically. Try case
number `9095708`, name `Rod Enterina`.

## Running in production — please don't skip this

- **Put it behind HTTPS.** This app sends case numbers, names, and lab result
  PDFs over the network — all of that needs to be encrypted in transit. Put a
  reverse proxy (IIS with a certificate, nginx, or Caddy) in front of it, then
  set `FORCE_HTTPS=true` in `.env` so session cookies are marked secure.
- **Restrict network exposure.** Only expose this to the network patients
  actually need to reach it from (e.g. your hospital's guest wifi + a
  registration kiosk), not the open internet, unless your organization has
  already reviewed that decision.
- **Back up `data/patients.db`** (holds patient PINs, hashed) as part of your
  normal backup routine — if it's lost, patients simply re-verify and set a
  new PIN, so this is low-severity but still worth doing.
- **Review the rate limits** in `routes/auth.js` (currently 10 attempts / 15
  minutes per IP) against your expected patient volume and adjust if a shared
  kiosk IP would hit that too easily.
- **Confirm the filename convention holds across all categories.** This app
  only picks up files matching `<CaseNo>_<Name>.pdf` exactly. If any category
  folder uses a different naming pattern, those files won't appear — worth
  spot-checking after deployment.
- **Data privacy compliance.** Since this exposes patient health records,
  confirm this deployment satisfies your facility's policies and the
  Philippine Data Privacy Act of 2012 (e.g. access logging, retention, breach
  notification procedures) — this app logs login attempts but you should
  review whether that's sufficient for your compliance needs.

## Known limitations

- If two different patients somehow share an identical case number in the
  LIS (shouldn't happen, but worth confirming with your LIS admin), the first
  matching file's name is what verification checks against.
- The scan walks the whole share on every request. For a single hospital's
  daily volume this is fast, but if the share grows very large, consider
  adding a cache with a short TTL (a few minutes) in `scanner.js`.
