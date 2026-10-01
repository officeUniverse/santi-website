# Santi Universe website maintenance

When adding or changing a client project/case study (v3):
- Edit or add `content/case-studies/<slug>.json` — the single source for that case study. Put its images in `assets/imgs/projects/<slug>/`.
- Run `python3 scripts/build-site.py` (regenerates every `project-*.html`, `portfolio.html` and the content pages; the nav, footer, quote pop-up and organisation JSON-LD are lifted from `index.html`), then `python3 scripts/sync-case-studies.py` (regenerates the gallery registry `assets/js/case-studies.js`).
- Optional case-study fields: `"faqTitle"` + `"faq": [[question, answer], ...]` (written for other businesses in the same sector — what Santi Universe can do for them, with this project as the example; shown on the page + FAQPage data; only real services and confirmed facts), `"collab": [{name, url, logo, logoTheme}]` for partner agencies, `"hidden": true` to keep a page but drop it from every listing.
- Do not hand-edit generated pages (`project-*.html`, `portfolio.html`, `services.html`, `about.html`, `contact.html`, `aeo.html`, `terms.html`, `privacy.html`, `cookies.html`) — the next build overwrites them. Change `content/case-studies/*.json`, `content/pages/*.html` (JSON meta comment + page body) or the generator instead.
- Menu/footer changes go in `index.html`; rebuild so every page picks them up. Each page gets `aria-current` on its own menu link automatically.
- Bump the cache stamp (`V` in `scripts/build-site.py`, plus the `?v=` links in `index.html`) after any CSS/JS change.
- Google Analytics (GA4 `G-2RPKK1TL21`) uses Consent Mode: the tag sits in `index.html`'s head between the `<!-- Google tag` … `<!-- /Google tag -->` markers (the builder copies it into every page) with all storage denied by default; `assets/v3/site.js` grants `analytics_storage` on Accept. Hotjar (site `2048719`) is loaded by `site.js` only after Accept. Consent key `santi-cookie-consent-v3` (it also appears inside the head tag); bump it whenever a new tracker is added. Do not paste other tracking snippets into page heads; the Cookie and Privacy policies describe this consent-based setup and must stay in step with it.
- `aeo.html` must keep its element IDs (`aeo-form`, `aeo-url`, `aeo-email`, `aeo-phone`, `aeo-submit`, `aeo-status`, `aeo-results`, `aeo-score`, `aeo-grade`, `aeo-score-label`, `aeo-url-line`, `aeo-download`, `aeo-checklist`, `aeo-wa-btn`) — `assets/js/aeo.js` depends on them. `contact.html` keeps `santi-contact-form` and its field IDs for `assets/v3/site.js`.
- The homepage Featured work tiles in `index.html` are placed by hand: add new projects there too (cover = a real mockup, `data-reel` = mockups-first hover images, no logo sheets). A new page also needs adding to `sitemap.xml` and the `cp -a` list in `deploy.sh`.
- The Websites tab runs the local concave case-study image gallery in assets/js/studio-gallery.js. No CodePen iframe. Its registry comes from the sync script above.
- The AI tab contains the local number experiment in assets/css/studio-numbers.css and assets/js/studio-numbers.js. The homepage chat disclosure has been removed.
- Keep names, dates, service scope and results factual; keep the AI-generated-mockup disclaimers (the `note` field); do not present template projects or placeholder imagery as real clients.

Brand (v3): royal `#173B9A`, turquoise `#08BECC`, golden yellow `#FFD147`, soft white `#F4F7F8`. Gold and turquoise are not readable as text on soft white — use gold only as a button fill there, and teal-ink `#03707A` for small turquoise text.

See STUDIO-REFERENCES.md for the user's creative direction and gallery maintenance workflow. The AI art panel is procedural artwork. The homepage has no live chat interface.

Wording preference: Never use the phrase "AI-generated concept mockup" in website copy, captions, alt text or responses. Use "Concept mockup" for captions instead; keep any required provenance explanation in the separate note field.
