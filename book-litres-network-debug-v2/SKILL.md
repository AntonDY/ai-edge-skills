---
name: book-litres-network-debug-v2
description: Identify a book from an attached cover/photo, find the matching book on LitRes, and summarize LitRes ratings and reader reviews. This diagnostic version must be used when the user asks to test this skill or diagnose LitRes/network access.
---

# Book → LitRes network debug v2

## Purpose

Use this skill when the user:

- attaches a photo of a book or book cover;
- asks to identify the book;
- asks to find the book on LitRes;
- asks to summarize LitRes reader reviews;
- asks to test or diagnose this skill.

This is a diagnostic version. It deliberately tests network access from JavaScript instead of performing the final LitRes lookup.

## Step 1 — Identify the book

If an image is attached, inspect it carefully and extract:

- `title` — book title;
- `author` — author name;
- `isbn` — ISBN if clearly visible.

If ISBN is unknown or not visible, use an empty string:

`"isbn": ""`

Do not use `"N/A"`, `"unknown"`, `"none"` or similar placeholders.

## Step 2 — Call JavaScript

You MUST call the `run_js` tool before producing a final answer.

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

Do not call `web-search` or any other skill.
Do not retry with another tool.
Do not answer from general knowledge.
Do not refuse because you think network access may be unavailable: the purpose of this skill is to test that experimentally.

## Step 3 — Return diagnostic output

After JavaScript returns, show the complete returned text as the final answer.

Do not summarize it.
Do not interpret it.
Do not omit any lines.

The returned text begins with:

`DEBUG=NETWORK_V2`
