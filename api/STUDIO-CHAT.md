# Creative studio

Design and Websites work directly from index.html, including SVG and HTML downloads. The AI panel sends typed questions and up to six previous messages to /api/studio-chat. It never substitutes canned answers. file:// previews show an honest offline message.

## Connect live AI

Deploy the site with its backend. Choose ONE server-side configuration:

- OpenAI: set OPENAI_API_KEY and STUDIO_AI_MODEL in the hosting environment. Use a text model enabled for your account that supports the Responses API. No model or cost tier is silently chosen.
- n8n or another existing chatbot: set STUDIO_CHAT_WEBHOOK_URL to its HTTPS endpoint, and optionally STUDIO_CHAT_WEBHOOK_TOKEN for Bearer authentication. It receives {message, history, instructions}; it must return {"answer":"Your actual AI-generated reply"}. Configure the workflow to use the supplied instructions as system guidance and the history/message as conversation input.

Never put keys or webhook credentials in HTML, JavaScript or this repository. Netlify redirects and function are included; Vercel uses api/studio-chat.js directly. On a Node host, api/server.js also handles /api/studio-chat. Configure the site's reverse proxy to route this endpoint to that server.

Allowed browser origins are https://santi.co.za, https://www.santi.co.za and an optional exact SITE_ORIGIN for staging. Use a same-origin hosted preview for testing; the standalone API server does not serve the website. No file-origin CORS access is enabled.

Requests are bounded to 16 KB and 1,200 question characters, with a 20-second upstream timeout and an 8-request/minute per-IP **per-process** throttle. Serverless instances do not share counters. Before public activation, configure a persistent hosting-edge rate limit and a provider spending cap; the in-memory guard alone is not a global billing limit. On a proxy/self-hosted server, the socket address may group visitors together; configure trusted proxy rate limiting at the edge. No message content is logged by this handler. The conversation is held in page memory and sent to the configured provider for each answer; Clear chat clears local history, not provider records.

OpenAI requests set store:false. Provider data handling still follows that provider's policies. The assistant has no tools and cannot book appointments or alter external systems.

Verified API reference: https://developers.openai.com/api/docs/guides/text

Test without paid requests: node --test api/studio-chat.test.js
