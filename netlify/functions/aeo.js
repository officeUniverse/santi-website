// Netlify Function wrapper around the shared AEO analyzer (api/aeo.js).
// Reuses the same analyze() logic so there's a single source of truth.
const { analyze } = require("../../api/aeo");

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  try {
    var params = event.queryStringParameters || {};
    var url = params.url;
    if (!url && event.body) {
      try { url = JSON.parse(event.body).url; } catch (e) { /* ignore */ }
    }
    var report = await analyze(url);
    return { statusCode: 200, headers: cors(), body: JSON.stringify(report) };
  } catch (e) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: e.message || "Something went wrong." }) };
  }
};
