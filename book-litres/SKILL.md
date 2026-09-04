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

If some text is partially unreadable, use the most likely interpretation only when confidence is reasonably high.

If the title or author is uncertain, remember that uncertainty and mention it in the final answer.

If no image is attached but the user already provided the book title and/or author in text, use those values directly.

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
  "isbn": "ISBN or empty string",
  "language": "ru"
}
```

If ISBN is not clearly visible or is unknown, use an empty string:

```json
"isbn": ""
```

Do not use `"N/A"`, `"unknown"`, `"none"` or other placeholder values.

Do not put explanations or Markdown inside the JSON.

---

## Step 3 — Interpret the JavaScript result

If the JavaScript result begins with:

`DEBUG BOOK-LITRES`

show the complete debug output to the user.

Do not summarize away the debug section during testing.

The JavaScript tool may also return:

- the best LitRes match;
- LitRes book URL;
- LitRes reviews URL;
- text from the LitRes book page;
- text from the LitRes reviews page;
- alternative LitRes results;
- search diagnostics.

Use current LitRes information only when it is present in the JavaScript result.

Do not invent:

- LitRes rating;
- number of ratings;
- number of reviews;
- review opinions;
- book URL.

If a value is missing, say that it could not be obtained.

---

## Step 4 — Verify the match

Before presenting the LitRes result, compare the found page with the identified book.

Check, when possible:

- book title;
- author;
- ISBN;
- series or edition information.

If the best LitRes result appears to be a different book, do not treat it as a confirmed match.

If there are several plausible results, mention that and prefer the one with the closest title and author match.

---

## Step 5 — Summarize reviews

If review text was successfully returned:

- summarize recurring positive themes;
- summarize recurring negative themes;
- distinguish reader opinion from factual information;
- do not quote long reviews;
- paraphrase reader comments;
- do not present a single review as the opinion of all readers.

Only mention themes that are actually supported by the returned review text.

---

## Step 6 — Final answer

When the book is successfully found, answer in Russian unless the user requested another language.

Include:

- book title;
- author;
- LitRes URL;
- LitRes rating, if available;
- number of ratings, if available;
- number of reviews, if available;
- short summary of positive reader opinions;
- short summary of negative reader opinions;
- overall impression based on the available reviews.

If the JavaScript tool cannot find the book, do not guess.

During testing, preserve the complete debug output returned by the JavaScript tool.

Never invent information that was not returned by the JavaScript tool.
