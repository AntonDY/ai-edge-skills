---
name: book-litres
description: Identify a book from an attached cover/photo and run a minimal JavaScript diagnostic for LitRes search.
---

# Book → LitRes mini debug

## Step 1 — Identify the book

Inspect the attached image.

Extract:

- `title` — book title
- `author` — author name
- `isbn` — ISBN if clearly visible

If ISBN is unknown, use an empty string:

`"isbn": ""`

Do not use `"N/A"`, `"unknown"`, `"none"` or similar placeholders.

## Step 2 — Call JavaScript

Call the `run_js` tool.

Use:

- script: `index.html`
- data: a JSON string

The JSON must have exactly these fields:

```json
{
  "title": "book title",
  "author": "author name",
  "isbn": "",
  "language": "ru"
}
```

## Step 3 — Show JavaScript result

After calling `run_js`, return the JavaScript `result` as the final answer.

Do not summarize it.
Do not interpret it.
Do not replace it with your own wording.

The result is intentionally very short and should begin with:

`DEBUG_OK`

If JavaScript returns `DEBUG_FAIL`, show that exact result.
