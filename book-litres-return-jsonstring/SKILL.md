---
name: book-litres-return-jsonstring
description: Minimal JavaScript return-format diagnostic for Google AI Edge Gallery.
---

# JavaScript return-format test

Call the `run_js` tool.

Use:

- script: `index.html`
- data: a JSON string

Use this exact JSON:

```json
{
  "test": "return-format"
}
```

After the JavaScript tool returns, show the returned value as the final answer.

Do not call any other skill.

Do not use web-search.

Do not retry.

Do not summarize.

Do not interpret.

The expected marker for this test is:

`TEST-JSONSTRING-ABCDE`
