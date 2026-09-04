---
name: book-litres
description: Identify a book from an attached cover/photo, then find the matching book on LitRes and summarize LitRes ratings and reader reviews.
---

# Book → LitRes reviews

1. Inspect the attached book image and determine title, author, and ISBN if visible. Do not invent unreadable text.

2. Call `run_js` with script `index.html` and JSON data:
   `{"title":"...","author":"...","isbn":"...","language":"ru"}`

3. Use the returned LitRes evidence to report:
   - identified title and author;
   - LitRes URL;
   - rating and counts, if present;
   - a short paraphrased summary of positive and negative reader opinions.

4. If the evidence is insufficient, say so rather than guessing.
