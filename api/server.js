/* Tiny standalone server for the AEO analyzer.
   - Local testing:   node api/server.js   (listens on PORT or 8849)
   - Simple self-host: run behind a reverse proxy at /api/aeo
   For Vercel/Netlify, use api/aeo.js's exported handler instead. */
"use strict";

const http = require("http");
const { handler } = require("./aeo");
const chatHandler = require("./studio-chat");

const PORT = process.env.PORT || 8849;

http
  .createServer((req, res) => {
    const path = req.url.split("?")[0];
    const route = path === "/api/studio-chat" ? chatHandler : handler;
    route(req, res).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
  })
  .listen(PORT, () => {
    console.log("Santi AEO analyzer listening on http://localhost:" + PORT);
  });
