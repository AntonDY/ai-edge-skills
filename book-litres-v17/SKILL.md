---
name: book-litres-v17
description: Identify a book from a photo or title, find its LitRes card, annotation, rating and reader reviews. Use for Russian book research and LitRes reader opinions.
---

# Book → LitRes v17

Always answer in Russian.

1. Identify title and author from the attached cover or user text. Extract ISBN only if visible or explicitly supplied; otherwise use null.
2. Call `run_js` exactly once with script `index.html` and a JSON string containing `title`, `author`, `isbn`, `language`.
3. The JavaScript returns the final formatted answer in `result`.
4. Output the returned `result` verbatim as the substantive answer. Do not alter names, dates, counts, URLs or review text.
5. Do not call another skill and do not retry automatically.
