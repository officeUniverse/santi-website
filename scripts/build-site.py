"""Build every v3 page except the homepage.

    python3 scripts/build-site.py      # then: python3 scripts/sync-case-studies.py

- content/case-studies/*.json -> project-<slug>.html + portfolio.html (All work)
- content/pages/*.html        -> services, about, contact, aeo, terms, privacy, cookies

Site chrome (nav, footer, quote pop-up, organisation JSON-LD) is lifted from index.html
so it only lives in one place; each page gets aria-current on its own menu link.
Case pages keep a CreativeWork JSON-LD with about.name and <img src="assets/imgs/projects/...">
tags, which is what scripts/sync-case-studies.py reads.

A page fragment starts with a JSON meta comment, then the <main> content:
    <!--meta {"file": "about.html", "title": "...", "description": "...", "crumb": "About"} -->
Optional meta: "current" (menu href to highlight, default = file), "scripts" (extra JS),
"robots", "referrer". The marker <!-- cards:N --> inserts the first N case-study cards.
"""
from html import escape
from pathlib import Path
import json
import re

try:
    from PIL import Image  # image sizes -> width/height attributes (prevents layout shift)
except ImportError:  # still builds without Pillow, just without dimensions
    Image = None

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "case-studies"
PAGES = ROOT / "content" / "pages"
SITE = "https://santi.co.za/"
V = "v=50"  # cache stamp for v3.css / case.css / pages.css / site.js


def t(s):  # text node
    return escape(str(s), quote=False)


def a(s):  # attribute value
    return escape(str(s), quote=True)


def img_path(slug, name):
    return f"assets/imgs/projects/{slug}/{name}"


def dims(path):
    if not Image:
        return ""
    try:
        with Image.open(ROOT / path) as im:
            return f' width="{im.width}" height="{im.height}"'
    except OSError:
        raise SystemExit(f"Missing image: {path}")


def luminance(hexcol):
    h = hexcol.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def between(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


# ---------- chrome lifted from the homepage ----------
home = (ROOT / "index.html").read_text(encoding="utf-8")
GTAG = between(home, "  <!-- Google tag", "  <!-- /Google tag -->") + "  <!-- /Google tag -->\n"  # same tag + consent defaults on every page
NAV = between(home, "  <!-- navigation -->", '  <main id="main">')
FOOTER = between(home, "  <!-- footer -->", "  <!-- quote pop-up -->")
MODAL = between(home, "  <!-- quote pop-up -->", '  <div class="pblur"')


def subpage_links(fragment):  # homepage anchors -> absolute routes on sub-pages
    return fragment.replace('href="#work"', 'href="portfolio.html"').replace('href="#playground"', 'href="index.html#playground"')


NAV, FOOTER = subpage_links(NAV), subpage_links(FOOTER)
ORG = json.loads(between(home, '<script type="application/ld+json">', "</script>")[len('<script type="application/ld+json">'):])


def current(fragment, href):  # highlight this page's menu links
    fragment = fragment.replace(' aria-current="page"', "")
    return fragment.replace(f'<a href="{href}">', f'<a href="{href}" aria-current="page">')


def crumbs(*trail):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": name, "item": url} for i, (name, url) in enumerate((("Home", SITE),) + trail)]}


def head(title, description, canonical, image, og_type, schemas, css=("case.css",), robots=None, referrer=None):
    styles = "\n".join(f'  <link rel="stylesheet" href="assets/v3/{c}?{V}">' for c in css)
    robots = f'\n  <meta name="robots" content="{a(robots)}">' if robots else ""
    robots += f'\n  <meta name="referrer" content="{a(referrer)}">' if referrer else ""
    ld = "\n".join(f'  <script type="application/ld+json">\n{json.dumps(s, ensure_ascii=False, indent=2)}\n  </script>' for s in schemas)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
{GTAG}  <title>{t(title)}</title>
  <meta name="description" content="{a(description)}">{robots}
  <link rel="canonical" href="{a(canonical)}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:site_name" content="Santi Universe">
  <meta property="og:title" content="{a(title)}">
  <meta property="og:description" content="{a(description)}">
  <meta property="og:url" content="{a(canonical)}">
  <meta property="og:image" content="{a(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{a(title)}">
  <meta name="twitter:description" content="{a(description)}">
  <meta name="twitter:image" content="{a(image)}">
  <meta name="theme-color" content="#0d2466">
  <link rel="icon" href="favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="96x96" href="assets/imgs/logo/favicon-96.png">
  <link rel="apple-touch-icon" href="assets/imgs/logo/apple-touch-icon.png">
  <link rel="manifest" href="site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Space+Mono:wght@400;700&display=swap">
  <link rel="stylesheet" href="assets/v3/v3.css?{V}">
{styles}
{ld}
</head>
"""


def tail(href, scripts=()):
    extra = "".join(f'\n  <script src="{a(src)}"></script>' for src in scripts)
    return f"""{current(FOOTER, href)}{MODAL}  <div class="pblur" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>

  <script src="assets/v3/universe.js?v=4"></script>
  <script src="assets/v3/site.js?{V}"></script>{extra}
</body>
</html>
"""


def figure(slug, im, eager=False):
    src = img_path(slug, im["src"])
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    cap = f'<figcaption class="cap">{t(im["caption"])}</figcaption>' if im.get("caption") else ""
    return f'<figure><img src="{a(src)}" alt="{a(im["alt"])}"{dims(src)} {load} decoding="async">{cap}</figure>'


def board(slug, b):
    layout, imgs = b["layout"], b["images"]
    if layout == "browser":
        im = imgs[0]
        src = img_path(slug, im["src"])
        return (f'<div class="board board--browser"><div class="browser"><div class="browser__bar" aria-hidden="true">'
                f'<i></i><i></i><i></i><span>{t(b.get("url", ""))}</span></div>'
                f'<img src="{a(src)}" alt="{a(im["alt"])}"{dims(src)} loading="lazy" decoding="async"></div>'
                f'<p class="cap">{t(im.get("caption", ""))}</p></div>')
    cols = {"one": 1, "two": 2, "three": 3}.get(layout) or (3 if len(imgs) % 3 == 0 else 2)
    return f'<div class="board" style="--cols:{cols}">' + "".join(figure(slug, im) for im in imgs) + "</div>"


def chapter(slug, n, ch):
    body = "".join(f"<p>{t(p)}</p>" for p in ch.get("text", []))
    if ch.get("quote"):
        q = ch["quote"]
        body += f'<blockquote class="case-quote"><p>“{t(q["text"])}”</p><cite>{t(q["cite"])}</cite></blockquote>'
    if ch.get("swatches"):
        body += '<ul class="swatches">' + "".join(
            f'<li><span class="chip" style="background:{a(hx)}"></span><span>{t(nm)}</span><code>{t(hx)}</code></li>'
            for nm, hx in ch["swatches"]) + "</ul>"
    if ch.get("note"):
        body += f'<p class="case-note">{t(ch["note"])}</p>'
    if ch.get("links"):
        body += '<p class="case-links">' + "".join(
            f'<a class="btn btn--dark" href="{a(u)}" target="_blank" rel="noopener">{t(lbl)} <span class="arr" aria-hidden="true">↗</span></a>'
            for lbl, u in ch["links"]) + "</p>"
    heading = "<br>".join(t(h) for h in ch["heading"])
    brd = board(slug, ch["board"]) if ch.get("board") else ""
    return f"""
      <section class="chapter">
        <div class="chapter__text">
          <div><span class="eyebrow">{n:02d} / {t(ch["label"])}</span><h2 class="chapter__heading">{heading}</h2></div>
          <div class="chapter__body">{body}</div>
        </div>
        {brd}
      </section>"""


def reel_attr(p):
    return "|".join(img_path(p["slug"], f) for f in p.get("reel", []))


STUDIO = {"@type": "Organization", "name": "Santi Universe", "url": "https://santi.co.za"}


def partners(p):  # "collab": [{"name", "url"?, "logo"?}] -> agencies we did the work with
    return p.get("collab", [])


def collab_html(p):
    if not partners(p):
        return ""
    items = []
    for c in partners(p):
        logo = c.get("logo")
        partner_class = "collab__partner" + (" collab__partner--dark" if c.get("logoTheme") == "dark" else "")
        inner = (f'<img src="{a(logo)}" alt="{a(c["name"])}"{dims(logo)}>' if logo and (ROOT / logo).is_file()
                 else f'<span>{t(c["name"])}</span>')
        items.append(f'<a class="{partner_class}" href="{a(c["url"])}" target="_blank" rel="noopener">{inner}</a>'
                     if c.get("url") else f'<span class="{partner_class}">{inner}</span>')
    return f'<p class="collab"><span class="collab__label">In collaboration with</span>{"".join(items)}</p>'


def render_project(p, nxt):
    slug, url = p["slug"], f"{SITE}project-{p['slug']}.html"
    hero_src = img_path(slug, p["hero"]["src"])
    work = {"@context": "https://schema.org", "@type": "CreativeWork", "name": p["schemaName"], "url": url,
            "image": SITE + hero_src, "description": p["description"], "genre": p["genre"],
            "creator": [STUDIO] + [{"@type": "Organization", "name": c["name"], **({"url": c["url"]} if c.get("url") else {})} for c in partners(p)]
                       if partners(p) else STUDIO,
            "about": {"@type": "Organization", "name": p["org"], **({"url": p["orgUrl"]} if p.get("orgUrl") else {})}}
    if p.get("dateCreated"):
        work["dateCreated"] = p["dateCreated"]
    trail = crumbs(("Work", SITE + "portfolio.html"), (p["title"], url))

    dark = luminance(p["tint"]) < .35
    tint_ink = "rgba(255,255,255,.74)" if dark else "rgba(14,27,61,.72)"
    meta = "".join(
        f'<div><dt>{t(m[0])}</dt><dd>' + (f'<a href="{a(m[2])}" target="_blank" rel="noopener">{t(m[1])} ↗</a>' if len(m) > 2 else t(m[1])) + "</dd></div>"
        for m in p["meta"])
    sub = f'<span class="case-title__sub">{t(p["titleSub"])}</span>' if p.get("titleSub") else ""
    intro = f'<p class="case-intro">{t(p["intro"])}</p>' if p.get("intro") else ""
    chapters = "".join(chapter(slug, i + 1, ch) for i, ch in enumerate(p["chapters"]))
    outcomes = ""
    if p.get("outcomes"):
        outcomes = '\n      <section class="outcomes" aria-label="Outcomes">' + "".join(
            f'<div class="outcome"><strong>{t(big)}</strong><span>{t(lbl)}</span></div>' for big, lbl in p["outcomes"]) + "</section>"
    next_src = img_path(nxt["slug"], nxt["cover"])
    faq, schemas = "", [work, trail]
    if p.get("faq"):  # niche project Q&As, shown and as FAQPage data AI search can quote
        faq = f"""
      <section class="faq case-faq" aria-labelledby="faq-title">
        <div class="section-head"><div><span class="eyebrow">FAQ</span><h2 class="h2" id="faq-title">{t(p.get("faqTitle", "Questions from businesses like this"))}</h2></div></div>
        <div class="faq__list">""" + "".join(
            f'\n          <details class="faq__item"><summary>{t(q)}</summary><div class="faq__a"><p>{t(ans)}</p></div></details>'
            for q, ans in p["faq"]) + """
        </div>
      </section>"""
        schemas.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in p["faq"]]})

    return head(p["metaTitle"], p["description"], url, SITE + hero_src, "article", schemas,
                robots="noindex, follow" if p.get("hidden") else None) + f"""<body class="page-case">
  <a class="skip-link" href="#main">Skip to content</a>

{current(NAV, "portfolio.html")}  <main id="main">
    <article class="case" style="--tint:{p['tint']}; --tint-ink:{tint_ink}">
      <header class="case-hero">
        <a class="back" href="portfolio.html" data-back><span aria-hidden="true">←</span> Back</a>
        <div class="case-hero__head">
          <span class="eyebrow">{t(p["category"])}</span>
          <h1 class="case-title">{t(p["title"])}{sub}</h1>
          <p class="case-tagline">{"<br>".join(t(x) for x in p["tagline"])}</p>
          {intro}
{("          " + collab_html(p)) if partners(p) else ""}
        </div>
        <dl class="case-meta">{meta}</dl>
        <figure class="case-hero__media">
          <img src="{a(hero_src)}" alt="{a(p['hero']['alt'])}"{dims(hero_src)} fetchpriority="high" decoding="async">
          <figcaption class="cap">{t(p["hero"].get("caption", ""))}</figcaption>
        </figure>
      </header>
{chapters}{outcomes}{faq}

      <a class="next-project" href="project-{nxt['slug']}.html">
        <div><span class="eyebrow">Next project</span><strong>{t(nxt["title"])}</strong><span class="next-project__sub">{t(nxt["cardSub"])}</span></div>
        <img src="{a(next_src)}" alt=""{dims(next_src)} loading="lazy" decoding="async">
        <span class="next-project__go" aria-hidden="true">→</span>
      </a>
    </article>

    <section class="case-cta" aria-labelledby="cta-title">
      <span class="eyebrow">Your project</span>
      <h2 id="cta-title">Want work like this<span class="star" aria-hidden="true">°</span></h2>
      <span class="foot">Tell us about it in four quick steps</span>
      <div class="case-cta__actions"><a class="btn btn--accent" href="contact.html" data-quote>Get a quote <span class="arr" aria-hidden="true">→</span></a><a class="btn btn--ghost" href="portfolio.html">More work</a></div>
    </section>
  </main>

""" + tail("portfolio.html")


def cards_html(projects):
    cards = ""
    for p in projects:
        cover = img_path(p["slug"], p["cover"])
        pills = "".join(f'<span class="pill">{t(x)}</span>' for x in p["pills"])
        collab_line = (f'<span class="card__collab">with {t(" & ".join(c["name"] for c in partners(p)))}</span>'
                       if partners(p) else "")
        cards += f"""
        <a class="card" href="project-{p['slug']}.html" data-project="project-{p['slug']}.html" data-tags="{a(' '.join(p['tags']))}" data-keep-scroll data-reel="{a(reel_attr(p))}">
          <div class="tile__media"><img src="{a(cover)}" alt="{a(p['hero']['alt'] if p['hero']['src'] == p['cover'] else p['title'] + ' — ' + p['category'])}"{dims(cover)} loading="lazy" decoding="async"></div>
          <div class="card__info"><div><strong>{t(p['title'])}</strong><span>{t(p['cardSub'])}</span>{collab_line}</div><div class="pills">{pills}</div></div>
        </a>"""
    return cards


def render_index(projects):
    cards = cards_html(projects)
    title = "Work — Brand Identity, Websites & AI | Santi Universe"
    desc = "Selected brand identity and website projects by Santi Universe, from luxury eco-tourism to construction, forestry, hospitality and international nonprofits."
    trail = crumbs(("Work", SITE + "portfolio.html"))
    return head(title, desc, SITE + "portfolio.html", SITE + "assets/imgs/og-image.png", "website", [trail]) + f"""<body class="page-case">
  <a class="skip-link" href="#main">Skip to content</a>

{current(NAV, "portfolio.html")}  <main id="main">
    <header class="index-head">
      <span class="eyebrow">Selected work</span>
      <h1>All work <sup>({len(projects):02d})</sup></h1>
      <p>Brand identities and websites for businesses in South Africa and beyond. Click a project for the full story.</p>
      <div class="filters" role="group" aria-label="Filter projects">
        <button type="button" data-filter="all" aria-pressed="true">All</button>
        <button type="button" data-filter="branding" aria-pressed="false">Brand identity</button>
        <button type="button" data-filter="web" aria-pressed="false">Websites</button>
        <button type="button" data-filter="wordpress" aria-pressed="false">WordPress plugins</button>
      </div>
    </header>
    <div class="cards">{cards}
    </div>

    <section class="case-cta" aria-labelledby="cta-title">
      <span class="eyebrow">Your project</span>
      <h2 id="cta-title">Your brand could be next<span class="star" aria-hidden="true">°</span></h2>
      <span class="foot">Tell us about it in four quick steps</span>
      <div class="case-cta__actions"><a class="btn btn--accent" href="contact.html" data-quote>Get a quote <span class="arr" aria-hidden="true">→</span></a></div>
    </section>
  </main>

""" + tail("portfolio.html")


def render_page(src, projects):
    raw = src.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->\s*", raw, re.S)
    if not m:
        raise SystemExit(f"{src.name}: missing <!--meta {{...}} --> header")
    meta, body = json.loads(m.group(1)), raw[m.end():]
    body = re.sub(r"<!-- cards:(\d+) -->", lambda c: cards_html(projects[:int(c.group(1))]), body)
    f = meta["file"]
    url = SITE + f
    schemas = [ORG] + ([crumbs((meta["crumb"], url))] if meta.get("crumb") else [])
    if meta.get("faq"):  # visible <details class="faq__item"> Q&As -> FAQPage data AI search can quote
        qa = re.findall(r'<details class="faq__item[^"]*">\s*<summary>(.*?)</summary>\s*<div class="faq__a">(.*?)</div>', body, re.S)
        plain = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h)).strip().replace("&amp;", "&")
        schemas.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": plain(q), "acceptedAnswer": {"@type": "Answer", "text": plain(a)}} for q, a in qa]})
    here = meta.get("current", f)
    return head(meta["title"], meta["description"], url, SITE + "assets/imgs/og-image.png", "website", schemas,
                css=("case.css", "pages.css"), robots=meta.get("robots"),
                referrer=meta.get("referrer")) + f"""<body class="page-sub">
  <a class="skip-link" href="#main">Skip to content</a>

{current(NAV, here)}  <main id="main">
{body.rstrip()}
  </main>

""" + tail(here, meta.get("scripts", ()))


def main():
    projects = sorted((json.loads(f.read_text(encoding="utf-8")) for f in CONTENT.glob("*.json")), key=lambda p: p["order"])
    if not projects:
        raise SystemExit("No case studies in content/case-studies/")
    # "hidden": true keeps a project's page (noindex) but drops it from All work, cards,
    # "Next project" links and the gallery registry. Delete the flag to bring it back.
    shown = [p for p in projects if not p.get("hidden")]
    for p in projects:
        chain = shown if p in shown else [p] + shown
        nxt = chain[(chain.index(p) + 1) % len(chain)]
        (ROOT / f"project-{p['slug']}.html").write_text(render_project(p, nxt), encoding="utf-8")
    (ROOT / "portfolio.html").write_text(render_index(shown), encoding="utf-8")
    pages = sorted(PAGES.glob("*.html"))
    for src in pages:
        html = render_page(src, shown)
        name = re.search(r'"file"\s*:\s*"([^"]+)"', src.read_text(encoding="utf-8")).group(1)
        (ROOT / name).write_text(html, encoding="utf-8")
    print(f"Built {len(projects)} case studies ({len(projects) - len(shown)} hidden) + portfolio.html + {len(pages)} pages")


if __name__ == "__main__":
    main()
