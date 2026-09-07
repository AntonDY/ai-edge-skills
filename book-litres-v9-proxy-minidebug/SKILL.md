---
name: book-litres-v9-proxy-minidebug
description: Identify a book from an attached cover/photo and run a minimal LitRes proxy connectivity test. Use this skill when testing LitRes lookup or proxy connectivity.
---

# Book → LitRes proxy mini debug v9

If an image is attached, identify the title and author.

Call `run_js` exactly once with:
- script: `index.html`
- data: JSON string with fields `title`, `author`, `isbn`, `language`.

Do not call another skill. Do not retry.

After JavaScript returns, output the exact `result` field only. Do not summarize or interpret it.
