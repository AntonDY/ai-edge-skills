export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const mode = url.searchParams.get("mode") || "search";

    try {
      if (url.pathname === "/ping" || mode === "ping") {
        return json({ ok: true, pong: true, version: 11, now: new Date().toISOString() }, 200, cors);
      }

      if (mode === "fetch-test") {
        const started = Date.now();
        const r = await fetch("https://example.com/", { redirect: "follow" });
        const text = await r.text();
        return json({ ok: r.ok, status: r.status, elapsed_ms: Date.now() - started, length: text.length }, 200, cors);
      }

      // v11: do all heavy LitRes work here and return a small JSON object to AI Edge Gallery.
      if (mode === "book") {
        const title = clean(url.searchParams.get("title") || "");
        const author = clean(url.searchParams.get("author") || "");
        const isbn = clean(url.searchParams.get("isbn") || "");
        if (!title && !isbn) return json({ ok: false, error: "missing title/isbn" }, 400, cors);

        const queries = unique([
          isbn,
          [title, author].filter(Boolean).join(" "),
          title
        ].filter(Boolean));

        let searchInfo = null;
        let bookUrl = null;
        for (const q of queries) {
          const s = await fetchText("https://www.litres.ru/search/?q=" + encodeURIComponent(q));
          searchInfo = { query: q, status: s.status, ms: s.ms, length: s.text.length };
          if (!s.ok) continue;
          bookUrl = chooseBookUrl(s.text, title, author);
          if (bookUrl) break;
        }

        if (!bookUrl) {
          return json({ ok: false, found: false, error: "book_not_found", search: searchInfo }, 200, cors);
        }

        const p = await fetchText(bookUrl);
        if (!p.ok) {
          return json({ ok: false, found: true, error: "book_page_fetch_failed", url: bookUrl, upstream_status: p.status, upstream_ms: p.ms }, 200, cors);
        }

        const parsed = parseBookPage(p.text, bookUrl);
        parsed.ok = true;
        parsed.found = true;
        parsed.search = searchInfo;
        parsed.upstream_ms = p.ms;
        return json(parsed, 200, cors);
      }

      // Legacy raw search/page modes kept for diagnostics.
      if (mode === "search") {
        const q = clean(url.searchParams.get("q") || "");
        if (!q) return json({ error: "missing q" }, 400, cors);
        const r = await fetchText("https://www.litres.ru/search/?q=" + encodeURIComponent(q));
        return html(r.text, r.status, cors, r.ms);
      }

      if (mode === "page") {
        const raw = url.searchParams.get("url") || "";
        let target;
        try { target = new URL(raw); } catch { return json({ error: "bad url" }, 400, cors); }
        if (!/(^|\.)litres\.ru$/i.test(target.hostname)) return json({ error: "host not allowed" }, 403, cors);
        const r = await fetchText(target.toString());
        return html(r.text, r.status, cors, r.ms);
      }

      return json({ error: "unknown mode" }, 400, cors);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500, cors);
    }
  }
};

async function fetchText(target) {
  const started = Date.now();
  const r = await fetch(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LitResBookHelper/11.0)",
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5"
    },
    redirect: "follow"
  });
  return { ok: r.ok, status: r.status, ms: Date.now() - started, text: await r.text(), url: r.url };
}

function chooseBookUrl(htmlText, title, author) {
  const decoded = decodeHtml(htmlText.replace(/\\u002F/g, "/"));
  const re = /(?:https?:\/\/www\.litres\.ru)?(\/book\/[^"'<>?\\\s]+\/?)/gi;
  const seen = new Set();
  const candidates = [];
  let m;
  while ((m = re.exec(decoded)) && candidates.length < 80) {
    let path = m[1].replace(/\\\//g, "/");
    if (!path.startsWith("/book/")) continue;
    const full = "https://www.litres.ru" + path;
    if (seen.has(full)) continue;
    seen.add(full);
    const slug = normalize(path);
    let score = 0;
    for (const w of words(title)) if (w.length >= 4 && slug.includes(w)) score += 3;
    for (const w of words(author)) if (w.length >= 4 && slug.includes(w)) score += 2;
    candidates.push({ url: full, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].url : null;
}

function parseBookPage(text, url) {
  const result = { url, title: null, author: null, isbn: null, rating: null, ratings_count: null, reviews_count: null, reviews: [] };

  // JSON-LD is the cleanest source when present.
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(text))) {
    try {
      const data = JSON.parse(decodeHtml(m[1]).trim());
      walkJson(data, result);
    } catch (_) {}
  }

  // Also inspect Next/embedded JSON because LitRes may keep review data there.
  const nextRe = /<script[^>]+(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = nextRe.exec(text))) {
    try { walkJson(JSON.parse(decodeHtml(m[1]).trim()), result); } catch (_) {}
  }

  const plain = clean(stripTags(text));
  if (!result.title) result.title = firstMatch(plain, [/Основной контент книги\s+(.{3,180}?)\s+(?:автор|PDF|EPUB)/i]);
  if (!result.isbn) result.isbn = firstMatch(plain, [/ISBN[:\s]+([0-9Xx\-]{10,20})/i]);
  if (result.rating == null) {
    const x = firstMatch(plain, [/(?:Средний рейтинг|Рейтинг)\s*([0-5](?:[.,]\d+)?)/i]);
    if (x) result.rating = Number(x.replace(",", "."));
  }
  if (result.reviews_count == null) {
    const x = firstMatch(plain, [/(\d+)\s+отзыв(?:а|ов)?/i]);
    if (x) result.reviews_count = Number(x);
  }

  // Deduplicate and keep the response small enough for the on-device model.
  const seen = new Set();
  result.reviews = result.reviews.filter(r => {
    const key = clean(r.text || "").slice(0, 180).toLowerCase();
    if (!key || key.length < 20 || seen.has(key)) return false;
    seen.add(key);
    r.text = clean(r.text).slice(0, 1800);
    return true;
  }).slice(0, 8);

  return result;
}

function walkJson(node, out) {
  if (!node) return;
  if (Array.isArray(node)) { for (const x of node) walkJson(x, out); return; }
  if (typeof node !== "object") return;

  const type = String(node["@type"] || node.type || "").toLowerCase();
  if (/book|product/.test(type)) {
    if (!out.title && typeof node.name === "string") out.title = clean(node.name);
    if (!out.isbn && node.isbn) out.isbn = clean(String(node.isbn));
    const a = node.author;
    if (!out.author && a) out.author = clean(typeof a === "string" ? a : (Array.isArray(a) ? a.map(x => x && (x.name || x)).join(", ") : (a.name || "")));
  }

  const ar = node.aggregateRating || node.rating;
  if (ar && typeof ar === "object") {
    if (out.rating == null && ar.ratingValue != null) out.rating = numberOrNull(ar.ratingValue);
    if (out.ratings_count == null && ar.ratingCount != null) out.ratings_count = numberOrNull(ar.ratingCount);
    if (out.reviews_count == null && ar.reviewCount != null) out.reviews_count = numberOrNull(ar.reviewCount);
  }

  if (/review|comment/.test(type) || (node.reviewBody && (node.author || node.datePublished))) {
    const body = node.reviewBody || node.text || node.content || node.comment;
    if (typeof body === "string" && body.length >= 20) {
      const author = node.author && (typeof node.author === "string" ? node.author : node.author.name);
      const rr = node.reviewRating && (node.reviewRating.ratingValue || node.reviewRating.value);
      out.reviews.push({ author: clean(author || ""), date: clean(node.datePublished || node.date || ""), rating: numberOrNull(rr), text: clean(body) });
    }
  }

  // Common non-JSON-LD field names used by application state.
  if (!out.title && typeof node.title === "string" && node.title.length < 250 && (node.book || node.bookId || node.book_id)) out.title = clean(node.title);
  if (out.rating == null && node.rating != null && typeof node.rating !== "object") {
    const n = numberOrNull(node.rating); if (n != null && n >= 0 && n <= 5) out.rating = n;
  }
  const body = node.reviewText || node.review_text || node.commentText || node.comment_text;
  if (typeof body === "string" && body.length >= 20) out.reviews.push({ author: clean(node.userName || node.username || node.authorName || ""), date: clean(node.date || node.createdAt || ""), rating: numberOrNull(node.rating), text: clean(body) });

  for (const v of Object.values(node)) if (v && typeof v === "object") walkJson(v, out);
}

function words(s) { return normalize(s).split(/[^a-zа-яё0-9]+/i).filter(Boolean); }
function normalize(s) { return clean(String(s || "")).toLowerCase().replace(/ё/g, "е"); }
function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
function stripTags(s) { return decodeHtml(String(s).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")); }
function decodeHtml(s) { return String(s).replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " "); }
function firstMatch(s, arr) { for (const r of arr) { const m = r.exec(s); if (m) return clean(m[1]); } return null; }
function numberOrNull(v) { const n = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
function unique(a) { return [...new Set(a)]; }
function json(obj, status, headers) { return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } }); }
function html(text, status, headers, ms) { return new Response(text, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "X-Proxy-Upstream-Ms": String(ms), "X-Proxy-Upstream-Length": String(text.length) } }); }
