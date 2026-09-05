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

## Step 1 — Identify the book

If an image is attached, inspect it carefully.

Extract:

- `title` — book title
- `author` — author name
- `isbn` — ISBN if clearly visible

Do not invent unreadable text.

If ISBN is unknown or not visible, use an empty string:

`"isbn": ""`

Do not use `"N/A"`, `"unknown"`, `"none"` or similar placeholders.

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

Do not call `web-search` or another skill as a fallback.

## Step 3 — Interpret JavaScript result

The JavaScript tool returns plain text.

Use only values returned by JavaScript.

Do not reconstruct or modify URLs.

If the result contains:

`FOUND=YES`

then use the exact returned values.

If the result contains:

`FOUND=NO`

state that the book could not be reliably found on LitRes.

Do not call another skill after `FOUND=NO`.

## Step 4 — Final answer

Answer in Russian unless the user requested another language.

When available, include:

**Книга:** title  
**Автор:** author  
**ЛитРес:** exact BOOK_URL  
**Рейтинг:** RATING  
**Оценок:** RATINGS_COUNT  
**Отзывов:** REVIEWS_COUNT  

Summarize `REVIEW_EVIDENCE` into:

**Что нравится читателям:**  
Short paraphrased summary.

**Что критикуют:**  
Short paraphrased summary.

**Общее впечатление:**  
Short conclusion.

Do not invent missing information.

Never fabricate a URL, rating, review count, or review content.
