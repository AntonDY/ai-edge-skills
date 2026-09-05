---
name: book-litres
description: Identify a book from an attached cover/photo and debug the LitRes search pipeline.
---

# Book → LitRes search debug

## Step 1 — Identify the book

Inspect the attached image and extract:

- `title`
- `author`
- `isbn`

If ISBN is not visible, use an empty string:

`"isbn": ""`

Do not use placeholder values such as `"N/A"`.

## Step 2 — Call JavaScript

Call the `run_js` tool.

Use:

- script: `index.html`
- data: a JSON string

The JSON must have exactly:

```json
{
  "title": "book title",
  "author": "author name",
  "isbn": "",
  "language": "ru"
}
```

## Step 3 — Return diagnostic output

After JavaScript returns, show the complete returned text as the final answer.

Do not summarize it.
Do not interpret it.
Do not call any other skill.
Do not call `web-search`.

The returned text begins with:

`DEBUG=BOOK_LITRES_V6`
