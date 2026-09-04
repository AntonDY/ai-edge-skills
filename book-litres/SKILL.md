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

## Step 3 — Interpret the JavaScript result

The JavaScript result is already compact and structured.

Use only information returned by JavaScript.

Do not invent:

- LitRes URL;
- rating;
- rating count;
- review count;
- review content;
- ISBN.

If `found` is false, say that the book could not be reliably matched on LitRes.

If `found` is true, use the exact `bookUrl` and `reviewsUrl` returned by JavaScript.

Never rewrite, shorten, expand, or reconstruct URLs.

---

## Step 4 — Summarize reviews

If `reviewEvidence` is present:

- summarize recurring positive themes;
- summarize recurring negative themes;
- distinguish reader opinion from factual information;
- paraphrase rather than quote at length;
- do not treat one or two reviews as broad consensus.

If review evidence is missing, say that reviews could not be retrieved.

---

## Step 5 — Final answer

Answer in Russian unless the user requested another language.

Prefer this structure:

**Книга:** Название  
**Автор:** Автор

**ЛитРес:** exact returned URL

**Рейтинг:** value, if available  
**Оценок:** count, if available  
**Отзывов:** count, if available

**Что нравится читателям:**  
Short summary based only on returned review evidence.

**Что критикуют:**  
Short summary based only on returned review evidence.

**Общее впечатление:**  
Short conclusion based only on returned review evidence.

Do not fabricate missing fields.
