export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    const mode = url.searchParams.get("mode") || "search";

    try {
      if (mode === "search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return json({ error: "missing q" }, 400, cors);

        const target = "https://www.litres.ru/search/?q=" + encodeURIComponent(q);
        const r = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml"
          },
          redirect: "follow"
        });
        const text = await r.text();
        return new Response(text, {
          status: r.status,
          headers: { ...cors, "Content-Type": "text/html; charset=utf-8" }
        });
      }

      if (mode === "page") {
        const raw = url.searchParams.get("url") || "";
        let target;
        try { target = new URL(raw); } catch { return json({ error: "bad url" }, 400, cors); }

        if (!/(^|\.)litres\.ru$/i.test(target.hostname)) {
          return json({ error: "host not allowed" }, 403, cors);
        }

        const r = await fetch(target.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml"
          },
          redirect: "follow"
        });
        const text = await r.text();
        return new Response(text, {
          status: r.status,
          headers: { ...cors, "Content-Type": "text/html; charset=utf-8" }
        });
      }

      return json({ error: "unknown mode" }, 400, cors);
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500, cors);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
