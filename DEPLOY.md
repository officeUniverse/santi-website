# Santi Universe — Deploy & Update Guide

This is the live site (static HTML + a small Node function for the AEO tool).
Everything in the project **root** is the website. The `light/` and `dark/`
folders are the original template, kept only for reference (git-ignored).

---

## The two settings you'll want to fill in

1. **Lead webhook (n8n)** — open `assets/js/santi.js`, find near the top:
   ```js
   var SANTI_LEAD_WEBHOOK = window.SANTI_LEAD_WEBHOOK || "";
   ```
   Put your n8n **Webhook node** URL in the quotes:
   ```js
   var SANTI_LEAD_WEBHOOK = window.SANTI_LEAD_WEBHOOK || "https://YOUR-n8n/webhook/santi-leads";
   ```
   The contact form and newsletter then POST JSON to it, e.g.
   `{ "type": "contact", "name": "...", "email": "...", "phone": "...", "subject": "...", "message": "...", "page": "...", "submittedAt": "..." }`
   In n8n: **Webhook (POST)** → do whatever you like (email yourself, append to
   Google Sheets, push to a CRM, Slack, etc.). Until it's set, both forms tell
   visitors to email santi@santi.co.za so no lead is lost.

2. **AEO tool endpoint** — works automatically:
   - On **Netlify/Vercel** the front-end calls `/api/aeo` and the function answers (see below).
   - If your analyzer lives on a different domain, set in any page before `santi.js`/`aeo.js`:
     `<script>window.AEO_ENDPOINT = "https://your-analyzer/api/aeo";</script>`

---

## Recommended: deploy on Netlify (free) + auto-update from GitHub

This gives you (a) a live site, (b) the AEO tool running as a serverless
function, and (c) **remote updates** — every `git push` redeploys automatically.

1. **Create the GitHub repo & push** (one-time). From this folder:
   ```bash
   git init
   git add .
   git commit -m "Santi Universe website"
   gh repo create santi-website --private --source=. --push
   ```
   (Or let me run this for you.)

2. **Connect Netlify**: app.netlify.com → *Add new site* → *Import from GitHub*
   → pick the repo. Build settings are already in `netlify.toml`:
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
   No build command needed.

3. Netlify gives you a URL (e.g. `santi.netlify.app`). Add your domain
   `santi.co.za` under *Domain settings* when ready.

4. **Updating the site from anywhere** afterwards:
   ```bash
   # edit files, then:
   git add -A && git commit -m "what changed" && git push
   ```
   Netlify redeploys in ~30s. (I can also be pointed at the GitHub repo to make
   updates remotely.)

### AEO tool on Netlify
`netlify/functions/aeo.js` wraps the shared analyzer in `api/aeo.js`. The
redirect in `netlify.toml` maps `/api/aeo` → the function, so the tool works
with no front-end changes.

---

## Alternative: Vercel
Import the repo at vercel.com. `api/aeo.js` is already a compatible serverless
function, so `/api/aeo` works out of the box. Set `SANTI_LEAD_WEBHOOK` as above.

## Alternative: your existing WordPress / cPanel (PHP) hosting
Static pages + assets upload fine via FTP or Git. **But the AEO tool needs
Node**, which typical WordPress hosting doesn't run. If you want to stay on that
host, ask me to **port the AEO analyzer to a single `aeo.php`** — same checks,
same JSON — and it'll run next to the site. (Leads still go to n8n, so no PHP
mail needed.)

---

## Local preview
```bash
# static pages
python3 -m http.server 8000      # then open http://localhost:8000

# AEO API (separate terminal) — the page auto-targets :8849 on localhost
node api/server.js
```

## What's where
- `index.html`, `services.html`, `portfolio.html`, `about.html`, `contact.html`,
  `aeo.html`, `project-details.html`, `terms.html`, `privacy.html`, `cookies.html` — pages
- `assets/` — CSS, JS, fonts, images (`assets/css/santi.css`, `assets/js/santi.js` are the custom ones)
- `api/aeo.js` — AEO analyzer (shared); `api/server.js` — local server; `api/README.md` — details
- `netlify/functions/aeo.js`, `netlify.toml` — Netlify serverless setup
