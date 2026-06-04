/* ============================================================
   Santi Universe — AEO analyzer (Node / Netlify / local server)
   ------------------------------------------------------------
   Thin environment wrapper around the portable analyzer in
   ./aeo-core.js. Provides a safe (SSRF-guarded, timed, size-capped)
   httpGet via global fetch, plus an HTTP handler.

   The actual checks live in aeo-core.js (the single source of truth,
   shared with the n8n workflow). Edit checks THERE.

   Exposes:  analyze(url) -> Promise<report> ;  handler(req,res)
   ============================================================ */
"use strict";

const dns = require("dns").promises;
const net = require("net");
const core = require("./aeo-core");

const USER_AGENT = "SantiAEO-Bot/1.0 (+https://santi.co.za/aeo; AI-readiness checker)";
const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 4;

/* ---------- SSRF protection ---------- */
function ipIsPrivate(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return ipIsPrivate(lower.replace("::ffff:", ""));
  return false;
}
async function assertHostIsPublic(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("That host is not publicly reachable.");
  if (net.isIP(h)) { if (ipIsPrivate(h)) throw new Error("That address is not allowed."); return; }
  let records;
  try { records = await dns.lookup(h, { all: true }); }
  catch (e) { throw new Error("We couldn't resolve that domain. Check the address and try again."); }
  if (!records.length) throw new Error("We couldn't resolve that domain.");
  for (const r of records) if (ipIsPrivate(r.address)) throw new Error("That address is not allowed.");
}

/* ---------- safe fetch with manual redirect + per-hop SSRF re-check ---------- */
function withTimeout(promise, ms, controller) {
  const t = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(t));
}
async function safeFetch(url) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = new URL(current);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http and https URLs are supported.");
    await assertHostIsPublic(u.hostname);
    const controller = new AbortController();
    let res;
    try {
      res = await withTimeout(
        fetch(current, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "*/*" } }),
        FETCH_TIMEOUT_MS, controller
      );
    } catch (e) {
      if (e.name === "AbortError") throw new Error("The site took too long to respond.");
      throw new Error("We couldn't reach that site.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }
    let body = "";
    if (res.body) {
      const reader = res.body.getReader();
      let received = 0; const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} break; }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    return { status: res.status, body: body, finalUrl: current };
  }
  throw new Error("Too many redirects.");
}

/* ---------- analyze uses the shared core + this environment's httpGet ---------- */
function analyze(targetUrl) {
  return core.analyze(targetUrl, safeFetch);
}

/* ---------- HTTP handler (Node http / Vercel / Netlify compatible) ---------- */
function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(obj));
}
async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  try {
    let target;
    if (req.method === "GET") {
      target = new URL(req.url, "http://localhost").searchParams.get("url");
    } else if (req.method === "POST") {
      const body = await new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); });
      try { target = JSON.parse(body || "{}").url; } catch (_) { target = new URLSearchParams(body).get("url"); }
    } else {
      return sendJson(res, 405, { error: "Method not allowed." });
    }
    return sendJson(res, 200, await analyze(target));
  } catch (e) {
    return sendJson(res, 400, { error: e.message || "Something went wrong." });
  }
}

module.exports = { analyze, handler };
module.exports.default = handler;
