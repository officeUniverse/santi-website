/* ============================================================
   Santi Universe — AEO (Answer Engine Optimization) analyzer
   ------------------------------------------------------------
   Fetches a public URL server-side and scores how ready it is to be
   read, understood and recommended by AI / answer engines
   (ChatGPT, Gemini, Perplexity, Google AI, etc.).

   Exposes:
     - analyze(targetUrl)  -> Promise<report>   (pure logic, reusable)
     - handler(req, res)   -> Node http handler  (used by server.js and
                              compatible with Vercel/Netlify Node functions)
   ============================================================ */

"use strict";

const dns = require("dns").promises;
const net = require("net");

const USER_AGENT =
  "SantiAEO-Bot/1.0 (+https://santi.co.za/aeo; AI-readiness checker)";
const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 4;

// AI / answer-engine crawler user-agents we care about
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
];

/* ---------- SSRF protection ---------- */

function ipIsPrivate(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local incl. cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("::ffff:")) return ipIsPrivate(lower.replace("::ffff:", ""));
  return false;
}

async function assertHostIsPublic(hostname) {
  // Block obvious local names
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
    throw new Error("That host is not publicly reachable.");
  }
  if (net.isIP(h)) {
    if (ipIsPrivate(h)) throw new Error("That address is not allowed.");
    return;
  }
  let records;
  try {
    records = await dns.lookup(h, { all: true });
  } catch (e) {
    throw new Error("We couldn't resolve that domain. Check the address and try again.");
  }
  if (!records.length) throw new Error("We couldn't resolve that domain.");
  for (const r of records) {
    if (ipIsPrivate(r.address)) throw new Error("That address is not allowed.");
  }
}

/* ---------- safe fetch with manual redirect + SSRF re-check ---------- */

function withTimeout(promise, ms, controller) {
  const t = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(t));
}

async function safeFetch(url, { method = "GET" } = {}) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = new URL(current);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Only http and https URLs are supported.");
    }
    await assertHostIsPublic(u.hostname);

    const controller = new AbortController();
    let res;
    try {
      res = await withTimeout(
        fetch(current, {
          method,
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        }),
        FETCH_TIMEOUT_MS,
        controller
      );
    } catch (e) {
      if (e.name === "AbortError") throw new Error("The site took too long to respond.");
      throw new Error("We couldn't reach that site.");
    }

    // follow redirects manually so we can re-validate each hop
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }

    // read body with a size cap
    let body = "";
    if (method !== "HEAD" && res.body) {
      const reader = res.body.getReader();
      let received = 0;
      const chunks = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          break;
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    return { status: res.status, headers: res.headers, body, finalUrl: current };
  }
  throw new Error("Too many redirects.");
}

/* ---------- tiny HTML helpers (no deps) ---------- */

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCodePoint(parseInt(n, 16)); })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getAttr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) ||
            tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", "i"));
  return m ? m[1] : null;
}
function metaContent(html, key, attr = "name") {
  const re = new RegExp(
    "<meta[^>]*" + attr + '\\s*=\\s*["\']' + key + '["\'][^>]*>',
    "i"
  );
  const m = html.match(re);
  return m ? getAttr(m[0], "content") : null;
}

/* ---------- the check suite ---------- */

function grade(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 55) return "D";
  if (pct >= 40) return "E";
  return "F";
}

async function analyze(targetUrl) {
  // normalise input
  let raw = String(targetUrl || "").trim();
  if (!raw) throw new Error("Please enter a website address.");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let parsed;
  try { parsed = new URL(raw); } catch (e) { throw new Error("That doesn't look like a valid web address."); }

  const main = await safeFetch(parsed.toString());
  if (main.status >= 400) {
    throw new Error("The site returned an error (HTTP " + main.status + ").");
  }
  const html = main.body || "";
  const finalUrl = new URL(main.finalUrl);
  const origin = finalUrl.origin;
  const text = stripTags(html);
  const wordCount = text ? text.split(/\s+/).length : 0;

  // sibling resources
  const robots = await safeFetch(origin + "/robots.txt").catch(() => null);
  const llms = await safeFetch(origin + "/llms.txt").catch(() => null);
  const sitemap = await safeFetch(origin + "/sitemap.xml").catch(() => null);

  const checks = [];
  const add = (id, label, weight, status, detail, fix) =>
    checks.push({ id, label, weight, status, detail, fix });

  // 1. HTTPS
  add("https", "Served over HTTPS", 5,
    finalUrl.protocol === "https:" ? "pass" : "fail",
    finalUrl.protocol === "https:" ? "Your site uses a secure connection." : "Your site is not served over HTTPS.",
    "Install an SSL certificate and force HTTPS — AI crawlers and users both expect it.");

  // 2. Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : "";
  add("title", "Descriptive page title", 8,
    title && title.length >= 10 && title.length <= 70 ? "pass" : title ? "warn" : "fail",
    title ? 'Title: "' + title.slice(0, 80) + '" (' + title.length + " chars)" : "No <title> tag found.",
    "Give every page a unique, descriptive 10–70 character title — it's the first thing AI uses to summarise you.");

  // 3. Meta description
  const desc = decodeEntities(metaContent(html, "description") || "");
  add("description", "Meta description", 8,
    desc && desc.length >= 50 && desc.length <= 170 ? "pass" : desc ? "warn" : "fail",
    desc ? "Description present (" + desc.length + " chars)." : "No meta description found.",
    "Add a 50–160 character meta description summarising the page in plain language.");

  // 4. html lang
  const htmlTag = (html.match(/<html[^>]*>/i) || [""])[0];
  const lang = getAttr(htmlTag, "lang");
  add("lang", "Language declared", 4,
    lang ? "pass" : "fail",
    lang ? 'Language set to "' + lang + '".' : "No lang attribute on <html>.",
    'Add lang to your <html> tag (e.g. <html lang="en">) so AI knows the content language.');

  // 5. H1 / headings
  const h1s = html.match(/<h1[\s\S]*?<\/h1>/gi) || [];
  const anyHeading = /<h[2-3][\s>]/i.test(html);
  add("headings", "Clear heading structure", 8,
    h1s.length === 1 && anyHeading ? "pass" : h1s.length >= 1 ? "warn" : "fail",
    h1s.length + " <h1> tag(s) found" + (anyHeading ? " with sub-headings." : " and no sub-headings."),
    "Use exactly one <h1> and a logical H2/H3 outline — AI relies on headings to understand structure.");

  // 6. Readable text content
  add("content", "Substantial readable text", 10,
    wordCount >= 300 ? "pass" : wordCount >= 100 ? "warn" : "fail",
    "About " + wordCount + " words of text in the page HTML.",
    "AI reads text, not pictures or JS-only content. Aim for 300+ words of real, server-rendered copy.");

  // 7. Structured data (JSON-LD)
  const jsonLd = (html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []);
  let schemaTypes = [];
  for (const block of jsonLd) {
    const inner = block.replace(/<[^>]+>/g, "");
    const t = inner.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    schemaTypes.push(...t.map((x) => x.replace(/.*"([^"]+)"$/, "$1")));
  }
  add("schema", "Structured data (Schema.org)", 12,
    jsonLd.length ? "pass" : "fail",
    jsonLd.length ? jsonLd.length + " JSON-LD block(s): " + (schemaTypes.join(", ") || "present") + "." : "No JSON-LD structured data found.",
    "Add Schema.org JSON-LD (Organization, WebSite, Product, FAQ, Article…). It's the single biggest lever for being understood and cited by AI.");

  // 8. Open Graph
  const ogTitle = metaContent(html, "og:title", "property") || metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description", "property") || metaContent(html, "og:description");
  add("opengraph", "Social / Open Graph tags", 6,
    ogTitle && ogDesc ? "pass" : ogTitle || ogDesc ? "warn" : "fail",
    ogTitle || ogDesc ? "Some Open Graph tags present." : "No Open Graph tags found.",
    "Add og:title, og:description and og:image so AI and social platforms render rich, accurate previews.");

  // 9. Canonical
  const hasCanonical = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
  add("canonical", "Canonical URL", 4,
    hasCanonical ? "pass" : "warn",
    hasCanonical ? "Canonical link present." : "No canonical link found.",
    "Add a <link rel=\"canonical\"> so AI knows the primary version of each page and avoids duplicates.");

  // 10. robots.txt + AI crawler access
  let robotsStatus = "warn";
  let robotsDetail = "No robots.txt found (AI crawlers are allowed by default).";
  let blocked = [];
  if (robots && robots.status < 400 && robots.body) {
    const body = robots.body;
    // crude block detection: a UA group disallowing /
    for (const bot of AI_CRAWLERS) {
      const re = new RegExp("user-agent:\\s*" + bot + "[\\s\\S]*?(?=user-agent:|$)", "i");
      const grp = body.match(re);
      if (grp && /disallow:\s*\/\s*(\n|$)/i.test(grp[0])) blocked.push(bot);
    }
    if (/user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(body)) blocked.push("* (all)");
    robotsStatus = blocked.length ? "fail" : "pass";
    robotsDetail = blocked.length
      ? "robots.txt blocks: " + blocked.join(", ") + "."
      : "robots.txt found and AI crawlers are not blocked.";
  }
  add("robots", "AI crawlers allowed (robots.txt)", 12, robotsStatus, robotsDetail,
    "Make sure robots.txt doesn't Disallow AI agents like GPTBot, ClaudeBot, PerplexityBot or Google-Extended — unless you intend to.");

  // 11. llms.txt
  add("llms", "llms.txt present", 10,
    llms && llms.status < 400 && llms.body && /\S/.test(llms.body) ? "pass" : "fail",
    llms && llms.status < 400 ? "Found /llms.txt." : "No /llms.txt found.",
    "Add an llms.txt — a concise, AI-focused map of your most important pages and what your business does. This is core AEO.");

  // 12. sitemap.xml
  add("sitemap", "XML sitemap", 6,
    sitemap && sitemap.status < 400 && /<urlset|<sitemapindex/i.test(sitemap.body || "") ? "pass" : "warn",
    sitemap && sitemap.status < 400 ? "Found /sitemap.xml." : "No /sitemap.xml found.",
    "Publish an XML sitemap so crawlers can discover every page.");

  // 13. Viewport / mobile
  const viewport = metaContent(html, "viewport");
  add("viewport", "Mobile-friendly viewport", 3,
    viewport ? "pass" : "warn",
    viewport ? "Viewport meta present." : "No viewport meta tag.",
    "Add a responsive viewport meta tag for mobile rendering.");

  // 14. Favicon
  const hasIcon = /<link[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i.test(html);
  add("favicon", "Favicon", 2,
    hasIcon ? "pass" : "warn",
    hasIcon ? "Favicon declared." : "No favicon link found.",
    "Add a favicon for a polished, trustworthy presentation.");

  // score
  const totalW = checks.reduce((s, c) => s + c.weight, 0);
  const factor = (s) => (s === "pass" ? 1 : s === "warn" ? 0.5 : 0);
  const gained = checks.reduce((s, c) => s + c.weight * factor(c.status), 0);
  const pct = Math.round((gained / totalW) * 100);

  return {
    url: finalUrl.toString(),
    fetchedAt: new Date().toISOString(),
    score: pct,
    grade: grade(pct),
    summary: {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      total: checks.length,
    },
    checks,
  };
}

/* ---------- HTTP handler (Node http / Vercel / Netlify compatible) ---------- */

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  try {
    let target;
    if (req.method === "GET") {
      const u = new URL(req.url, "http://localhost");
      target = u.searchParams.get("url");
    } else if (req.method === "POST") {
      const body = await new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => resolve(d));
      });
      try { target = JSON.parse(body || "{}").url; } catch (_) {
        target = new URLSearchParams(body).get("url");
      }
    } else {
      return sendJson(res, 405, { error: "Method not allowed." });
    }
    const report = await analyze(target);
    return sendJson(res, 200, report);
  } catch (e) {
    return sendJson(res, 400, { error: e.message || "Something went wrong." });
  }
}

module.exports = { analyze, handler };

// Vercel/Netlify default export compatibility
module.exports.default = handler;
