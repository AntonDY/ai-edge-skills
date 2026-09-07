---
name: book-litres-v10-proxy-ping
description: Identify a book from an attached cover/photo and test connectivity from Google AI Edge Gallery to the configured LitRes Cloudflare Worker. Use this skill for LitRes proxy diagnostics.
---

# Book → LitRes proxy ping v10

If an image is attached, identify the title and author.

Call `run_js` exactly once with:
- script: `index.html`
- data: JSON string with fields `title`, `author`, `isbn`, `language`.

Do not call another skill. Do not retry.

After JavaScript returns, output the exact `result` field only. Do not summarize or interpret it.
