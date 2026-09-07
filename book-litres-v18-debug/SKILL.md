---
name: book-litres-v18-debug
description: Diagnostic skill that shows the exact LitRes page text lines around the reviews section as seen by the Cloudflare Worker.
---

# LitRes v18 review debug

1. Identify title and author from the attached cover.
2. Call `run_js` exactly once with script `index.html` and JSON string fields `title`, `author`, `isbn`, `language`.
3. Output the `result` field exactly. Do not summarize or rewrite it.
4. Do not call another skill and do not retry.
