---
name: book-litres-v15-debug
description: Diagnostic skill for LitRes proxy. Use to inspect the exact live Worker version and exact JSON returned for a photographed book.
---

# LitRes v15 debug

1. Identify title and author from the attached book cover.
2. Call `run_js` exactly once with script `index.html` and JSON string fields `title`, `author`, `isbn`, `language`.
3. Output the returned `result` field exactly. Do not summarize, interpret, translate or omit anything.
4. Do not call another skill and do not retry.
