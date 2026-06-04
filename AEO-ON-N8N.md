# Running the AEO tool on n8n

The AEO tool's analyzer can run entirely on your own n8n (`n8n.santi.co.za`) —
no Netlify function needed. The website stays 100% static and can be hosted
anywhere.

## How updates work (the important bit)
The analyzer logic lives in **one git file: `api/aeo-core.js`**. The n8n
workflow **fetches that file from your deployed site at run time**. So:

> **Edit `api/aeo-core.js` → `git push` → the AEO tool is updated.**
> No re-importing the workflow, no editing logic inside n8n.

(The Code node reads `CORE_URL = https://santi.co.za/api/aeo-core.js`. Change
that constant if you host the file somewhere else.)

## One-time setup in n8n
1. **Import the workflow:** n8n → *Workflows* → *Import from File* →
   `n8n/aeo-workflow.json`. It contains: **Webhook → Run AEO analyzer (Code) → Respond**.
2. **CORS is already set** in the workflow (Webhook "Allowed Origins" = `*`, and
   the Respond node adds the header). Tighten `*` to `https://santi.co.za` once live if you like.
3. **Activate** the workflow (toggle, top-right). The production URL becomes:
   ```
   https://n8n.santi.co.za/webhook/aeo-check
   ```
   …which is exactly what the site calls (`assets/js/aeo.js` → `resolveEndpoint()`).
4. The site sends `GET …/webhook/aeo-check?url=<the-site-to-check>` and expects
   the JSON report back. The Code node returns `{ score, grade, summary, checks[] }`
   (or `{ error }`).

## Requirements / notes
- Needs an n8n where the **Code node** can use `this.helpers.httpRequest` and the
  `new Function(...)` constructor (standard on current self-hosted n8n).
- `api/aeo-core.js` must be **publicly reachable** at `CORE_URL` (it deploys as a
  static file with the site). During the cut-over, deploy the new site first so
  the file is live, then activate the workflow.
- **Fallback (if your n8n blocks `new Function`):** tell me and I'll generate a
  version of the workflow with the analyzer code **embedded** directly in the Code
  node. Updates would then need a quick re-import instead of being automatic.

## Local development
The site auto-targets a **local Node server** when running on `localhost`:
```bash
node api/server.js          # http://localhost:8849/api/aeo
```
So you can develop/test the analyzer locally, then push — and n8n picks up the
same `aeo-core.js`.

## Don't need n8n for it?
`api/aeo.js` + `netlify/functions/aeo.js` still work too (both now use the same
`aeo-core.js`). So you could instead deploy on Netlify/Vercel and the tool runs as
a serverless function at `/api/aeo`. Same logic, your choice.
