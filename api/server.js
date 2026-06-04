/* Tiny standalone server for the AEO analyzer.
   - Local testing:   node api/server.js   (listens on PORT or 8849)
   - Simple self-host: run behind a reverse proxy at /api/aeo
   For Vercel/Netlify, use api/aeo.js's exported handler instead. */
"use strict";

const http = require("http");
const { handler } = require("./aeo");

const PORT = process.env.PORT || 8849;

http
  .createServer((req, res) => {
    // route everything under /api/aeo (and root) to the handler
    handler(req, res).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
  })
  .listen(PORT, () => {
    console.log("Santi AEO analyzer listening on http://localhost:" + PORT);
  });
