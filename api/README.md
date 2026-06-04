# Santi Universe — AEO analyzer (backend)

The free AEO tool (`/aeo.html`) needs a small backend that fetches a visitor's
URL **server-side** and scores its AI-readiness. (It can't run in the browser —
sites block cross-origin requests, and we need to read `robots.txt`, `llms.txt`,
`sitemap.xml`, etc.)

All the logic lives in **`aeo.js`** with zero dependencies. It exports:

- `analyze(url)` → `Promise<report>` — the pure analysis logic
- `handler(req, res)` — an HTTP handler (Node `http` / Vercel / Netlify style),
  also exported as `default`

`server.js` is a tiny standalone wrapper for local testing / self-hosting.

The front-end (`assets/js/aeo.js`) calls **`/api/aeo`** on the same domain by
default. To point it elsewhere, set `window.AEO_ENDPOINT` in `aeo.html`
(there's a commented line ready to uncomment).

---

## Run locally

```bash
node api/server.js              # listens on http://localhost:8849
# test it:
curl "http://localhost:8849/api/aeo?url=example.com"
```

## Deploy — pick ONE

### A) Same server as the site (Node host / VPS)
Run `node api/server.js` (use pm2 or a systemd service) and reverse-proxy
`/api/aeo` to it (nginx `proxy_pass http://127.0.0.1:8849;`). Front-end works
with its default `/api/aeo`.

### B) Vercel (recommended if the site is static)
1. Put `aeo.js` at `api/aeo.js` (already is).
2. Deploy the repo to Vercel. It auto-exposes `https://YOURSITE/api/aeo`.
3. Front-end default `/api/aeo` just works.

### C) Netlify
1. Create `netlify/functions/aeo.js` that re-exports the handler:
   ```js
   const { analyze } = require("../../api/aeo");
   exports.handler = async (event) => {
     try {
       const url = (event.queryStringParameters || {}).url;
       return { statusCode: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(await analyze(url)) };
     } catch (e) {
       return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
     }
   };
   ```
2. Set `window.AEO_ENDPOINT = "/.netlify/functions/aeo"` in `aeo.html`.

### D) Cloudflare Workers
Workers use `fetch` + `dns` differently; the `analyze()` checks port over, but
the SSRF DNS guard (`dns.lookup`) needs replacing with a Workers-compatible
check. Ask me to adapt it if you go this route.

### E) WordPress / PHP-only host
If your host only runs PHP (no Node), tell me and I'll port `analyze()` to a
single `aeo.php` endpoint — same checks, same JSON shape.

---

## What it checks
HTTPS · title · meta description · `<html lang>` · heading structure ·
readable text volume · **Schema.org JSON-LD** · Open Graph · canonical ·
**robots.txt AI-crawler access** (GPTBot, ClaudeBot, PerplexityBot,
Google-Extended, CCBot…) · **llms.txt** · sitemap.xml · viewport · favicon.
Weighted into a 0–100 score and an A–F grade.

## Safety
- Only `http`/`https`; blocks localhost, `.local`, and private/link-local IPs
  (incl. cloud metadata `169.254.169.254`) — basic SSRF protection.
- 9s timeout, 2 MB cap, max 4 redirects (each re-validated).
- Friendly bot UA: `SantiAEO-Bot/1.0`.
