---
name: book-litres-v8-proxy-debug
description: Identify a book from an attached cover/photo and diagnose access to the configured LitRes Cloudflare proxy. Use this skill when testing LitRes lookup or proxy connectivity.
---

# Book → LitRes proxy diagnostic v8

## Instructions

If an image is attached, identify the book title and author.

Call the `run_js` tool exactly once.

Use:
- script: `index.html`
- data: a JSON string with exactly these fields:

```json
{
  "title": "book title",
  "author": "author name",
  "isbn": "",
  "language": "ru"
}
```

Do not call web-search or another skill.
Do not retry.

After JavaScript returns, output the complete `result` field verbatim. Do not summarize or interpret it.

The expected result begins with `DEBUG=PROXY_V8`.
