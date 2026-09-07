---
name: book-litres-v7-proxy
description: Identify a book from an attached cover/photo, find the matching book on LitRes through a CORS proxy, and summarize LitRes ratings and reader reviews.
---

# Book → LitRes via proxy

## Instructions

1. Identify the book from the attached image. Extract `title`, `author`, and `isbn` if visible.
2. If ISBN is unknown, use an empty string. Never use `N/A` or similar placeholders.
3. Call the `run_js` tool using `index.html` with a JSON string containing exactly:

```json
{
  "title": "book title",
  "author": "author name",
  "isbn": "",
  "language": "ru"
}
```

4. Use only the data returned by JavaScript. Do not invent a LitRes URL, rating, counts, or review opinions.
5. If JavaScript returns an error about `PROXY_BASE`, report that the proxy URL has not yet been configured.
6. Do not call another skill or web-search as a fallback.
