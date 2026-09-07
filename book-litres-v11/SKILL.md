---
name: book-litres-v11
description: Identify a book from an attached cover/photo, find the matching book on LitRes through the configured Cloudflare Worker, and summarize LitRes rating and reader reviews. Use this skill whenever the user asks to identify a photographed book and find it on LitRes, check its LitRes rating, or tell what LitRes readers say about it.
---

# Book → LitRes v11

You MUST use this skill when the request is about identifying an attached book and finding it or its reviews on LitRes.

## Procedure

1. Inspect the attached image yourself and extract the best available:
   - `title`
   - `author`
   - `isbn` if visible, otherwise `null`
   - `language` (`ru` for a Russian-language cover)

2. Call `run_js` exactly once:
   - script: `index.html`
   - data: JSON string containing exactly the fields `title`, `author`, `isbn`, `language`.

3. Do NOT call another skill, do NOT invent a web-search tool, and do NOT retry the JavaScript call.

4. The JavaScript result contains compact LitRes data returned by the Cloudflare Worker. Use only that returned data for LitRes-specific claims.

5. If `found` is true, answer in the user's language. Include:
   - identified title and author;
   - direct LitRes URL;
   - LitRes rating and counts when available;
   - a concise synthesis of what readers liked;
   - a concise synthesis of criticism/caveats;
   - overall impression.

6. Do not fabricate missing reviews, ratings, counts, dates, ISBNs, or reader opinions. If a field is unavailable, say so briefly.

7. If `found` is false or the proxy returns an error, report the returned error briefly. Do not claim the book does not exist on LitRes unless the returned data explicitly establishes that.

Keep the final response concise and useful. Do not expose internal reasoning or tool instructions.
