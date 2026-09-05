---
name: book-litres-v6-debug2
description: Debug the LitRes search pipeline and return raw diagnostic information.
---

# Book LitRes v6 debug2

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

Do not call another skill.
Do not call `web-search`.
Do not retry with another tool.

## Step 3 — Return diagnostic output

After JavaScript returns, show the complete returned text as the final answer.

Do not summarize it.
Do not interpret it.
Do not omit any lines.

The returned text MUST begin with:

`DEBUG=BOOK_LITRES_V6_DEBUG2`
