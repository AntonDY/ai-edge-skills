const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request) {
    const u = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const mode = u.searchParams.get("mode") || "search";
    try {
      if (u.pathname === "/ping" || mode === "ping") return json({ ok: true, pong: true, version: "12.0" });
      if (mode === "fetch-test") {
        const r = await fetchText("https://example.com/");
        return json({ ok: r.ok, status: r.status, elapsed_ms: r.ms, length: r.text.length });
      }
      if (mode === "book") return json(await lookupBook(u));
      if (mode === "search") {
        const q = clean(u.searchParams.get("q"));
        if (!q) return json({ error: "missing_q" }, 400);
        return rawHtml(await fetchText("https://www.litres.ru/search/?q=" + encodeURIComponent(q)));
      }
      if (mode === "page") {
        const target = safeLitresUrl(u.searchParams.get("url"));
        if (!target) return json({ error: "host_not_allowed" }, 403);
        return rawHtml(await fetchText(target));
      }
      return json({ error: "unknown_mode" }, 400);
    } catch (e) {
      return json({ ok: false, error: "proxy_error", detail: String(e && e.message || e) }, 500);
    }
  }
};

async function lookupBook(u) {
  const input = {
    title: clean(u.searchParams.get("title")),
    author: clean(u.searchParams.get("author")),
    isbn: clean(u.searchParams.get("isbn"))
  };
  if (!input.title && !input.isbn) return { ok: false, found: false, error: "missing_title_and_isbn" };

  const queries = [...new Set([input.isbn, [input.title, input.author].filter(Boolean).join(" "), input.title].filter(Boolean))];
  const candidates = new Set();
  let search = null;
  for (const q of queries) {
    const r = await fetchText("https://www.litres.ru/search/?q=" + encodeURIComponent(q));
    search = { query: q, status: r.status, ms: r.ms };
    if (!r.ok) continue;
    for (const link of bookLinks(r.text).slice(0, 8)) candidates.add(link);
    if (candidates.size) break;
  }

  let book = null;
  for (const link of [...candidates].slice(0, 8)) {
    const r = await fetchText(link);
    if (!r.ok) continue;
    const parsed = parseBookPage(r.text, r.url);
    if (matchesBook(parsed, input)) { book = parsed; break; }
  }
  if (!book) return { ok: false, found: false, error: "no_verified_match", search };

  if (book.review_page_url && (book.reviews_count == null || book.reviews_count > book.reviews.length)) {
    try {
      const r = await fetchText(book.review_page_url);
      if (r.ok) {
        const extra = parseBookPage(r.text, book.url);
        book.reviews = mergeReviews(book.reviews, extra.reviews);
        if ((!book.reviews_text || book.reviews_text.length < 80) && extra.reviews_text) book.reviews_text = extra.reviews_text;
        book.reviews_source = book.review_page_url;
      }
    } catch (_) { /* Preserve verified book data. */ }
  }

  book.reviews = mergeReviews(book.reviews, []);
  const allDated = book.reviews.length > 0 && book.reviews.every(r => validDate(r.date));
  const complete = book.reviews_count != null && book.reviews.length >= book.reviews_count;
  book.reviews_order = allDated && complete ? "newest" : "unverified";
  if (allDated) book.reviews.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  book.reviews = book.reviews.slice(0, 5).map(r => ({ ...r, text: r.text.slice(0, 2200) }));
  book.reviews_returned = book.reviews.length;
  book.reviews_complete = complete;
  book.ok = true;
  book.found = true;
  book.search = search;
  delete book._metricPriority;
  return book;
}

async function fetchText(target) {
  const started = Date.now();
  const r = await fetch(target, {
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9"
    },
    redirect: "follow"
  });
  return { ok: r.ok, status: r.status, ms: Date.now() - started, text: await r.text(), url: r.url };
}

function parseBookPage(html, url) {
  const out = {
    url: safeLitresUrl(url), title: null, author: null, isbn: null, annotation: null,
    rating: null, ratings_count: null, reviews_count: null, reviews: [],
    reviews_text: null, reviews_order: "unverified", review_page_url: null,
    _metricPriority: {}
  };

  const ld = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ld) {
    try { readStructured(JSON.parse(m[1]), out, true); } catch (_) {}
  }
  const embedded = [...html.matchAll(/<script\b[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of embedded) {
    try { readStructured(JSON.parse(m[1]), out, false); } catch (_) {}
  }

  const plain = clean(stripTags(html));
  if (!out.title) out.title = extract(plain, [/Основной контент книги\s+(.{3,220}?)\s+(?:Текст|PDF|Аудио|Объем)/i]);
  if (!out.isbn) out.isbn = extract(plain, [/ISBN:\s*([0-9Xx\-]{10,20})/i]);

  if (!out.annotation) {
    const block = extract(html, [/<(?:h2|h3)[^>]*>\s*О книге\s*<\/[^>]+>([\s\S]*?)(?=<(?:h2|h3)\b|Жанры и теги|<\/section>)/i]);
    if (block) out.annotation = clean(stripTags(block)).slice(0, 4500);
  }
  if (!out.annotation) {
    const meta = extract(html, [/<meta\b(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["']([^"']+)["']/i]);
    if (meta && !/купить|скачать|читайте онлайн|интернет-магазин/i.test(meta)) out.annotation = clean(decodeHtml(meta));
  }

  // Highest-priority source: the visible card sequence, e.g. "3,4 9 оценок 2 отзыва".
  const card = visibleCardBlock(plain, out.title);
  const triplet = card.match(/\b([0-5](?:[.,]\d+)?)\s+(\d[\d\s]*)\s+оцен(?:ка|ки|ок)\s+(\d[\d\s]*)\s+отзыв(?:а|ов)?\b/i);
  if (triplet) {
    setMetric(out, "rating", ratingNumber(triplet[1]), 300);
    setMetric(out, "ratings_count", countNumber(triplet[2]), 300);
    setMetric(out, "reviews_count", countNumber(triplet[3]), 300);
  } else {
    setMetric(out, "rating", ratingNumber(extract(card, [/(?:Средний рейтинг|Рейтинг)\s*([0-5](?:[.,]\d+)?)/i, /\b([0-5](?:[.,]\d+)?)\s+\d[\d\s]*\s+оцен/i])), 250);
    setMetric(out, "ratings_count", countNumber(extract(card, [/(\d[\d\s]*)\s+оцен(?:ка|ки|ок)\b/i])), 250);
    setMetric(out, "reviews_count", countNumber(extract(card, [/(\d[\d\s]*)\s+отзыв(?:а|ов)?\b/i])), 250);
  }

  out.review_page_url = findReviewsLink(html, out.url);
  out.reviews_text = visibleReviewsBlock(plain, out.reviews_count);
  out.reviews = mergeReviews(out.reviews, []);
  delete out._metricPriority;
  return out;
}

function visibleCardBlock(plain, title) {
  let start = 0;
  if (title) {
    const i = plain.toLowerCase().indexOf(clean(title).toLowerCase());
    if (i >= 0) start = i;
  }
  let end = plain.indexOf("О книге", start);
  if (end < 0) end = plain.indexOf("Купить", start);
  if (end < 0) end = Math.min(plain.length, start + 5000);
  return plain.slice(start, end);
}

function visibleReviewsBlock(plain, expectedCount) {
  let start = plain.search(/Отзывы,?\s*\d+\s+отзыв(?:а|ов)?/i);
  if (start < 0) start = plain.search(/Отзывы\s*[—:-]?\s*/i);
  if (start < 0) return null;

  let s = plain.slice(start);
  let end = s.search(/\sКнига\s+.{0,260}?—\s*(?:читать|скачать)|\sВозрастное ограничение:|\sДата выхода на Литрес:/i);
  if (end > 0) s = s.slice(0, end);
  s = clean(s)
    .replace(/^Отзывы,?\s*\d+\s+отзыв(?:а|ов)?\s*\d*\s*/i, "")
    .replace(/^Смотреть все отзывы\s*/i, "")
    .replace(/^Оставить отзыв\s*/i, "");
  if (!s || s.length < 30) return null;
  // Keep enough text for up to five reviews, but avoid sending the rest of the page to the model.
  return s.slice(0, expectedCount != null && expectedCount <= 5 ? 12000 : 7000);
}

function setMetric(out, key, value, priority) {
  if (value == null) return;
  const old = out._metricPriority[key] || 0;
  if (out[key] == null || priority > old || (priority === old && out[key] === 0 && value > 0)) {
    out[key] = value;
    out._metricPriority[key] = priority;
  }
}

function readRating(a, out, priority) {
  if (!a || typeof a !== "object") return;
  setMetric(out, "rating", ratingNumber(a.ratingValue ?? a.value), priority);
  setMetric(out, "ratings_count", countNumber(a.ratingCount ?? a.rating_count), priority);
  setMetric(out, "reviews_count", countNumber(a.reviewCount ?? a.review_count), priority);
}

function readStructured(root, out, schema) {
  const seen = new WeakSet();
  let visited = 0;
  function walk(n, depth, context) {
    if (!n || typeof n !== "object" || depth > 35 || ++visited > 30000 || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const x of n) walk(x, depth + 1, context); return; }

    const type = String(n["@type"] || n.type || "").toLowerCase();
    const book = /^(book|product|ebook|audiobook)$/.test(type) || (!schema && (n.bookId || n.book_id || n.artId || n.art_id));
    if (book) {
      if (!out.title) out.title = clean(n.name || n.title);
      if (!out.author) out.author = personName(n.author || n.authors);
      if (!out.isbn) out.isbn = clean(n.isbn);
      if (!out.annotation) out.annotation = description(n.annotation || n.description || n.annotation_html || n.annotationHtml);
      const a = n.aggregateRating || n.rating;
      if (a && typeof a === "object") readRating(a, out, schema ? 80 : 40);
      if (!schema) {
        setMetric(out, "ratings_count", countNumber(n.ratings_count ?? n.rating_count ?? n.ratingsCount ?? n.ratingCount ?? n.marks_count ?? n.marksCount), 45);
        setMetric(out, "reviews_count", countNumber(n.reviews_count ?? n.review_count ?? n.reviewsCount ?? n.reviewCount), 45);
      }
    }

    const reviewContext = /^(review|userreview|bookreview|comment|recense)$/.test(type) || context === "reviews" || n.review_html != null || n.reviewBody != null || n.reviewText != null || n.review_text != null;
    if (reviewContext && !/rating/.test(type)) {
      const body = n.reviewBody || n.review_html || n.reviewHtml || n.reviewText || n.review_text || n.commentText || n.comment_text || n.text || n.content;
      const text = typeof body === "string" ? clean(stripTags(body)) : "";
      if (text.length >= 20) {
        const rr = n.reviewRating && typeof n.reviewRating === "object" ? n.reviewRating.ratingValue : (n.user_mark ?? n.userMark ?? n.mark ?? null);
        out.reviews.push({
          author: personName(n.nickname || n.userName || n.username || n.authorName || n.author),
          date: dateValue(n.datePublished || n.added || n.createdAt || n.created_at || n.date),
          rating: ratingNumber(rr),
          text: text.slice(0, 4000)
        });
      }
    }

    if (!schema && book && !out.annotation) out.annotation = description(n.shortDescription || n.short_description);
    for (const [k, v] of Object.entries(n)) {
      if (v && typeof v === "object") walk(v, depth + 1, /^(reviews|review|comments|recenses)$/.test(k) ? "reviews" : null);
    }
  }
  walk(root, 0, null);
}

function mergeReviews(a, b) {
  const map = new Map();
  for (const r of [...a, ...b]) {
    if (!r || !r.text) continue;
    const key = clean(r.text).toLowerCase();
    if (!map.has(key)) map.set(key, r);
    else {
      const old = map.get(key);
      if (!old.date && r.date) old.date = r.date;
      if (!old.author && r.author) old.author = r.author;
      if (old.rating == null && r.rating != null) old.rating = r.rating;
    }
  }
  return [...map.values()];
}

function bookLinks(html) {
  const s = decodeHtml(html).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  const result = new Set();
  const re = /(?:https?:\/\/www\.litres\.ru)?(\/book\/[^"'<>?\s\\]+\/?)/gi;
  let m;
  while ((m = re.exec(s)) && result.size < 80) {
    const u = safeLitresUrl("https://www.litres.ru" + m[1]);
    if (u) result.add(u);
  }
  return [...result];
}

function matchesBook(book, input) {
  if (input.isbn && book.isbn && digits(input.isbn) === digits(book.isbn)) return true;
  if (!input.title || !book.title) return false;
  const a = words(input.title), b = words(book.title);
  if (!a.length || !b.length) return false;
  const overlap = a.filter(w => b.includes(w)).length / Math.max(a.length, b.length);
  if (overlap < 0.72) return false;
  if (input.author && book.author) {
    const x = words(input.author), y = words(book.author);
    if (x.length && !x.some(w => y.includes(w))) return false;
  }
  return true;
}

function findReviewsLink(html, bookUrl) {
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/Смотреть все отзывы|Все отзывы/i.test(stripTags(m[2]))) continue;
    const href = extract(m[1], [/\bhref=["']([^"']+)["']/i]);
    if (!href) continue;
    const target = safeLitresUrl(href, bookUrl);
    if (target && new URL(target).pathname.startsWith(new URL(bookUrl).pathname)) return target;
  }
  return null;
}

function safeLitresUrl(value, base) {
  try {
    const u = new URL(value, base || "https://www.litres.ru/");
    if (u.protocol !== "https:" || !/(^|\.)litres\.ru$/i.test(u.hostname)) return null;
    u.hash = "";
    return u.toString();
  } catch (_) { return null; }
}

function personName(v) { if (typeof v === "string") return clean(v); if (Array.isArray(v)) return v.map(personName).filter(Boolean).join(", "); return v && typeof v === "object" ? clean(v.name || v.fullName || v.nickname) : ""; }
function description(v) { if (typeof v === "string") return clean(stripTags(v)).slice(0, 4500) || null; if (v && typeof v === "object") return description(v.text || v.html || v.value || v.content); return null; }
function dateValue(v) { if (typeof v !== "string") return null; return validDate(v) ? v : null; }
function validDate(v) { return typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v) && Number.isFinite(Date.parse(v)); }
function ratingNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null; }
function countNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/\s/g, "")); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
function words(v) { return clean(v).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/i).filter(w => w.length > 2); }
function digits(v) { return String(v).replace(/[^0-9X]/gi, ""); }
function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
function decodeHtml(s) { return String(s).replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))); }
function stripTags(s) { return decodeHtml(String(s).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")); }
function extract(s, patterns) { for (const p of patterns) { const m = p.exec(s); if (m) return m[1]; } return null; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
function rawHtml(r) { return new Response(r.text, { status: r.status, headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "X-Proxy-Upstream-Ms": String(r.ms), "X-Proxy-Upstream-Length": String(r.text.length) } }); }
