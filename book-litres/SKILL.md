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

The multimodal model should identify the book from the image first,
then use the JavaScript tool to search LitRes.

---

## Step 1 — Identify the book

If an image is attached, inspect it carefully.

Extract, when visible:

- `title` — book title;
- `author` — author name;
- `isbn` — ISBN if clearly visible.

Do not invent unreadable text.

If some text is partially unreadable, use the most likely interpretation
only when confidence is reasonably high.

If the title or author is uncertain, remember that uncertainty and
mention it in the final answer.

If no image is attached but the user already provided the book title
and/or author in text, use those values directly.

---

## Step 2 — Normalize book information

Before calling the JavaScript tool, prepare:

- `title`
- `author`
- `isbn`
- `language`

For unknown or unreadable ISBN, always use an empty string:

`"isbn": ""`

Never use placeholder values such as:

- `"N/A"`
- `"NA"`
- `"unknown"`
- `"none"`
- `"null"`
- `"нет"`
- `"неизвестно"`
- `"-"`

Do not invent an ISBN.

---

## Step 3 — Search LitRes

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
