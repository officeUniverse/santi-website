/* ============================================================
   Santi Universe — AEO analyzer CORE (portable, no Node built-ins)
   ------------------------------------------------------------
   This is the SINGLE SOURCE OF TRUTH for the AEO checks. It runs in:
     • the local Node server / Netlify function  (api/aeo.js)
     • your n8n workflow                          (fetched from the live site)

   It exports one function:
     analyze(targetUrl, httpGet) -> Promise<report>
   where httpGet(url) -> Promise<{ status, body, finalUrl }>.
   The caller supplies httpGet so the fetching (and any SSRF / timeout
   protection) lives outside this file and stays environment-specific.

   To change what the AEO tool checks: edit THIS file and push to git.
   The n8n workflow loads it from your deployed site at run time, so a
   git push updates the tool automatically.
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.SantiAEO = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AI_CRAWLERS = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web",
    "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended"
  ];

  function decodeEntities(s) {
    if (!s) return s;
    return String(s)
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(parseInt(n, 10)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCodePoint(parseInt(n, 16)); })
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
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
    var m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) ||
            tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", "i"));
    return m ? m[1] : null;
  }
  function metaContent(html, key, attr) {
    attr = attr || "name";
    var re = new RegExp("<meta[^>]*" + attr + '\\s*=\\s*["\']' + key + '["\'][^>]*>', "i");
    var m = html.match(re);
    return m ? getAttr(m[0], "content") : null;
  }
  function grade(pct) {
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 55) return "D";
    if (pct >= 40) return "E";
    return "F";
  }

  // Self-contained URL parser (no dependency on the global URL constructor,
  // which isn't available in some sandboxes such as n8n's Code node).
  function parseUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    var m = s.match(/^(https?):\/\/([^\/?#]+)([^]*)$/i);
    if (!m) return null;
    var host = m[2];
    if (!/\./.test(host) && host.toLowerCase().indexOf("localhost") !== 0) return null;
    var scheme = m[1].toLowerCase();
    var origin = scheme + "://" + host;
    var path = m[3] || "/";
    return { protocol: scheme + ":", host: host, origin: origin, href: origin + path };
  }

  async function analyze(targetUrl, httpGet) {
    var rawInput = String(targetUrl || "").trim();
    if (!rawInput) throw new Error("Please enter a website address.");
    var parsed = parseUrl(rawInput);
    if (!parsed) throw new Error("That doesn't look like a valid web address.");

    var main = await httpGet(parsed.href);
    if (main.status >= 400) throw new Error("The site returned an error (HTTP " + main.status + ").");
    var html = main.body || "";
    var finalUrl = parseUrl(main.finalUrl || parsed.href) || parsed;
    var origin = finalUrl.origin;
    var text = stripTags(html);
    var wordCount = text ? text.split(/\s+/).length : 0;

    var robots = await httpGet(origin + "/robots.txt").catch(function () { return null; });
    var llms = await httpGet(origin + "/llms.txt").catch(function () { return null; });
    var sitemap = await httpGet(origin + "/sitemap.xml").catch(function () { return null; });

    var checks = [];
    function add(id, label, weight, status, detail, fix) { checks.push({ id: id, label: label, weight: weight, status: status, detail: detail, fix: fix }); }

    add("https", "Served over HTTPS", 5,
      finalUrl.protocol === "https:" ? "pass" : "fail",
      finalUrl.protocol === "https:" ? "Your site uses a secure connection." : "Your site is not served over HTTPS.",
      "Install an SSL certificate and force HTTPS — AI crawlers and users both expect it.");

    var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : "";
    add("title", "Descriptive page title", 8,
      title && title.length >= 10 && title.length <= 70 ? "pass" : title ? "warn" : "fail",
      title ? 'Title: "' + title.slice(0, 80) + '" (' + title.length + " chars)" : "No <title> tag found.",
      "Give every page a unique, descriptive 10–70 character title — it's the first thing AI uses to summarise you.");

    var desc = decodeEntities(metaContent(html, "description") || "");
    add("description", "Meta description", 8,
      desc && desc.length >= 50 && desc.length <= 170 ? "pass" : desc ? "warn" : "fail",
      desc ? "Description present (" + desc.length + " chars)." : "No meta description found.",
      "Add a 50–160 character meta description summarising the page in plain language.");

    var htmlTag = (html.match(/<html[^>]*>/i) || [""])[0];
    var lang = getAttr(htmlTag, "lang");
    add("lang", "Language declared", 4, lang ? "pass" : "fail",
      lang ? 'Language set to "' + lang + '".' : "No lang attribute on <html>.",
      'Add lang to your <html> tag (e.g. <html lang="en">) so AI knows the content language.');

    var h1s = html.match(/<h1[\s\S]*?<\/h1>/gi) || [];
    var anyHeading = /<h[2-3][\s>]/i.test(html);
    add("headings", "Clear heading structure", 8,
      h1s.length === 1 && anyHeading ? "pass" : h1s.length >= 1 ? "warn" : "fail",
      h1s.length + " <h1> tag(s) found" + (anyHeading ? " with sub-headings." : " and no sub-headings."),
      "Use exactly one <h1> and a logical H2/H3 outline — AI relies on headings to understand structure.");

    add("content", "Substantial readable text", 10,
      wordCount >= 300 ? "pass" : wordCount >= 100 ? "warn" : "fail",
      "About " + wordCount + " words of text in the page HTML.",
      "AI reads text, not pictures or JS-only content. Aim for 300+ words of real, server-rendered copy.");

    var jsonLd = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    var schemaTypes = [];
    for (var i = 0; i < jsonLd.length; i++) {
      var inner = jsonLd[i].replace(/<[^>]+>/g, "");
      var t = inner.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
      for (var j = 0; j < t.length; j++) schemaTypes.push(t[j].replace(/.*"([^"]+)"$/, "$1"));
    }
    add("schema", "Structured data (Schema.org)", 12,
      jsonLd.length ? "pass" : "fail",
      jsonLd.length ? jsonLd.length + " JSON-LD block(s): " + (schemaTypes.join(", ") || "present") + "." : "No JSON-LD structured data found.",
      "Add Schema.org JSON-LD (Organization, WebSite, Product, FAQ, Article…). It's the single biggest lever for being understood and cited by AI.");

    var ogTitle = metaContent(html, "og:title", "property") || metaContent(html, "og:title");
    var ogDesc = metaContent(html, "og:description", "property") || metaContent(html, "og:description");
    add("opengraph", "Social / Open Graph tags", 6,
      ogTitle && ogDesc ? "pass" : (ogTitle || ogDesc) ? "warn" : "fail",
      (ogTitle || ogDesc) ? "Some Open Graph tags present." : "No Open Graph tags found.",
      "Add og:title, og:description and og:image so AI and social platforms render rich, accurate previews.");

    var hasCanonical = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
    add("canonical", "Canonical URL", 4, hasCanonical ? "pass" : "warn",
      hasCanonical ? "Canonical link present." : "No canonical link found.",
      "Add a <link rel=\"canonical\"> so AI knows the primary version of each page and avoids duplicates.");

    var robotsStatus = "warn";
    var robotsDetail = "No robots.txt found (AI crawlers are allowed by default).";
    var blocked = [];
    if (robots && robots.status < 400 && robots.body) {
      var body = robots.body;
      for (var b = 0; b < AI_CRAWLERS.length; b++) {
        var bot = AI_CRAWLERS[b];
        var re = new RegExp("user-agent:\\s*" + bot + "[\\s\\S]*?(?=user-agent:|$)", "i");
        var grp = body.match(re);
        if (grp && /disallow:\s*\/\s*(\n|$)/i.test(grp[0])) blocked.push(bot);
      }
      if (/user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(body)) blocked.push("* (all)");
      robotsStatus = blocked.length ? "fail" : "pass";
      robotsDetail = blocked.length ? "robots.txt blocks: " + blocked.join(", ") + "." : "robots.txt found and AI crawlers are not blocked.";
    }
    add("robots", "AI crawlers allowed (robots.txt)", 12, robotsStatus, robotsDetail,
      "Make sure robots.txt doesn't Disallow AI agents like GPTBot, ClaudeBot, PerplexityBot or Google-Extended — unless you intend to.");

    add("llms", "llms.txt present", 10,
      llms && llms.status < 400 && llms.body && /\S/.test(llms.body) ? "pass" : "fail",
      llms && llms.status < 400 ? "Found /llms.txt." : "No /llms.txt found.",
      "Add an llms.txt — a concise, AI-focused map of your most important pages and what your business does. This is core AEO.");

    add("sitemap", "XML sitemap", 6,
      sitemap && sitemap.status < 400 && /<urlset|<sitemapindex/i.test(sitemap.body || "") ? "pass" : "warn",
      sitemap && sitemap.status < 400 ? "Found /sitemap.xml." : "No /sitemap.xml found.",
      "Publish an XML sitemap so crawlers can discover every page.");

    var viewport = metaContent(html, "viewport");
    add("viewport", "Mobile-friendly viewport", 3, viewport ? "pass" : "warn",
      viewport ? "Viewport meta present." : "No viewport meta tag.",
      "Add a responsive viewport meta tag for mobile rendering.");

    var hasIcon = /<link[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i.test(html);
    add("favicon", "Favicon", 2, hasIcon ? "pass" : "warn",
      hasIcon ? "Favicon declared." : "No favicon link found.",
      "Add a favicon for a polished, trustworthy presentation.");

    var totalW = checks.reduce(function (s, c) { return s + c.weight; }, 0);
    function factor(s) { return s === "pass" ? 1 : s === "warn" ? 0.5 : 0; }
    var gained = checks.reduce(function (s, c) { return s + c.weight * factor(c.status); }, 0);
    var pct = Math.round((gained / totalW) * 100);

    return {
      url: finalUrl.href,
      fetchedAt: new Date().toISOString(),
      score: pct,
      grade: grade(pct),
      summary: {
        pass: checks.filter(function (c) { return c.status === "pass"; }).length,
        warn: checks.filter(function (c) { return c.status === "warn"; }).length,
        fail: checks.filter(function (c) { return c.status === "fail"; }).length,
        total: checks.length
      },
      checks: checks
    };
  }

  return { analyze: analyze, grade: grade, AI_CRAWLERS: AI_CRAWLERS };
});
