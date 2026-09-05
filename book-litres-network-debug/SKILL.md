---
name: book-litres-network-debug
description: Test which external hosts are reachable from Google AI Edge Gallery JavaScript Skills on iOS.
---

# Network debug for JavaScript Skills

Call the `run_js` tool.

Use:

- script: `index.html`
- data: a JSON string

Use this exact JSON:

```json
{
  "test": "network"
}
```

Do not call any other skill.
Do not call `web-search`.
Do not retry.

After JavaScript returns, show the complete returned text as the final answer.

Do not summarize it.
Do not interpret it.
Do not omit any lines.

The returned text begins with:

`DEBUG=NETWORK`
