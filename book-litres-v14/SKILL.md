---
name: book-litres-v14
description: Identify a book from a photo or title, find its LitRes card, annotation, rating and reader reviews. Use for Russian book research and LitRes reader opinions.
---

# Book → LitRes v14

Always answer in Russian.

1. Identify the title and author from the cover or user text. Extract ISBN only if visible or explicitly supplied; otherwise use null.
2. Call `run_js` exactly once with script `index.html` and a JSON string containing `title`, `author`, `isbn`, `language`.
3. The JavaScript returns a fully formatted final answer in the `result` field.
4. Reproduce the `result` field verbatim as the substantive answer. Do not alter names, dates, counts or review text.
5. Do not call another skill and do not retry automatically.
