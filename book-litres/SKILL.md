---
name: book-litres
description: Identify a book from an attached cover/photo and run a raw JavaScript diagnostic search for LitRes.
---

# Book → LitRes raw debug

## Purpose

Use this skill when the user attaches a photo of a book and wants to identify it and search for it on LitRes.

## Step 1 — Identify the book

Inspect the attached image.

Extract:

- `title` — book title
- `author` — author name
- `isbn` — ISBN if clearly visible

If ISBN is unknown or not visible, use an empty string:

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

## Step 3 — Show raw JavaScript result

After calling `run_js`, output the complete `result` returned by the JavaScript tool.

Do not summarize it.

Do not interpret it.

Do not omit any lines.

Do not convert it into a normal book-review answer.

During this diagnostic test, the raw JavaScript output is the final answer.

The result should begin with:

`DEBUG BOOK-LITRES`

If JavaScript returns an error, show the complete error text.
