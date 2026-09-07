# LitRes CORS proxy worker

Google AI Edge Gallery JavaScript Skills run in a webview, so browser CORS rules apply. LitRes/Bing pages do not expose the CORS headers needed by the iOS webview.

This Cloudflare Worker is a deliberately restricted proxy:

- `GET /?mode=search&q=...` fetches `https://www.litres.ru/search/?q=...`
- `GET /?mode=page&url=https://www.litres.ru/...` fetches only `*.litres.ru`
- responses include `Access-Control-Allow-Origin: *`
- arbitrary external hosts are rejected

## Deploy from the Cloudflare dashboard

1. Create a free Cloudflare account.
2. Workers & Pages → Create → Worker.
3. Replace the generated code with `worker.js` from this folder and deploy.
4. Note the resulting URL, for example `https://litres-proxy.USER.workers.dev`.
5. Put that URL into `PROXY_BASE` in `book-litres-v7-proxy/scripts/index.html`.

No Apple Developer account or Mac is required.
