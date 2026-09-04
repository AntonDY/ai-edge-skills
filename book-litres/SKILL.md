---
name: book-litres
description: Identify a book from an attached cover/photo, find the matching book on LitRes, and summarize LitRes ratings and reader reviews.
---

# Book → LitRes reviews

## Purpose

Use this skill when the user:

- attaches a photo of a book or book cover;
- asks to identify the book;
- asks to find the book on LitRes;
- asks to summarize LitRes reader reviews;
- asks for the LitRes rating or number of reviews.

The multimodal model should identify the book from the image first, then use the JavaScript tool to search LitRes.

---

## Step 1 — Identify the book

If an image is attached, inspect it carefully.

Extract, when visible:

- `title` — book title;
- `author` — author name;
- `isbn` — ISBN if clearly visible.

Do not invent unreadable text.

If ISBN is unknown or not visible, use an empty string:

`"isbn": ""`

Do not use `"N/A"`, `"unknown"`, `"none"` or similar placeholders.

---

## Step 2 — Search LitRes

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

Do not put explanations or Markdown inside the JSON.

---

## Step 3 — Show link diagnostics

During this diagnostic test, output the complete `result` returned by JavaScript.

Do not summarize it.

Do not interpret it.

Do not omit any lines.

The result should begin with:

`DEBUG LINK CONTEXT`

The JavaScript output contains only short text fragments around possible LitRes links.

This diagnostic output is the final answer for the test.
