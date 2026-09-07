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
    const mode = u.searchParams.get("mode") || "book";
    try {
      if (u.pathname === "/ping" || mode === "ping") return json({ ok: true, pong: true, version: "13.0" });
      if (mode === "book") return json(await lookupBook(u));
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
    for (const link of bookLinks(r.text).slice(0, 10)) candidates.add(link);
    if (candidates.size) break;
  }

  let book = null;
  for (const link of [...candidates].slice(0, 10)) {
    const r = await fetchText(link);
    if (!r.ok) continue;
    const parsed = parseBookPage(r.text, r.url);
    if (matchesBook(parsed, input)) {
      parsed.fetch_ms = r.ms;
      book = parsed;
      break;
    }
  }
  if (!book) return { ok: false, found: false, error: "no_verified_match", search };

  // If the main card did not expose all review texts, try the canonical reviews page derived from the already verified card URL.
  if (book.reviews_count != null && book.reviews_count > book.reviews.length) {
    const reviewsUrl = canonicalReviewsUrl(book.url);
    if (reviewsUrl) {
      try {
        const r = await fetchText(reviewsUrl);
        if (r.ok) {
          const p = parseBookPage(r.text, book.url);
          book.reviews = mergeReviews(book.reviews, p.reviews);
          book.reviews_source = reviewsUrl;
        }
      } catch (_) {}
    }
  }

  // Sort by actual date when available. Keep at most 5, and all when published count <= 5.
  book.reviews = mergeReviews(book.reviews, []);
  if (book.reviews.every(r => r.date_iso)) book.reviews.sort((a, b) => b.date_iso.localeCompare(a.date_iso));
  book.reviews = book.reviews.slice(0, 5);
  book.reviews_returned = book.reviews.length;
  book.reviews_complete = book.reviews_count != null && book.reviews.length >= book.reviews_count;
  book.ok = true;
  book.found = true;
  book.search = search;
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

function parseBookPage(html, verifiedUrl) {
  const out = {
    url: safeLitresUrl(verifiedUrl), title: null, author: null, isbn: null,
    annotation: null, rating: null, ratings_count: null, reviews_count: null,
    reviews: []
  };

  // Metadata/annotation from JSON-LD.
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { readJsonLd(JSON.parse(m[1]), out); } catch (_) {}
  }

  const plain = clean(stripTags(html));
  if (!out.title) out.title = extract(plain, [/Основной контент книги\s+(.{3,220}?)\s+(?:Текст|PDF|Аудио|Объем)/i]);
  if (!out.isbn) out.isbn = extract(plain, [/ISBN:\s*([0-9Xx\-]{10,20})/i]);
  if (!out.annotation) {
    const block = extract(html, [/<(?:h2|h3)[^>]*>\s*О книге\s*<\/[^>]+>([\s\S]*?)(?=<(?:h2|h3)\b|Жанры и теги|<\/section>)/i]);
    if (block) out.annotation = clean(stripTags(block)).slice(0, 4500);
  }

  // Visible card is authoritative for these three separate values.
  const card = visibleCardBlock(plain, out.title);
  const triple = card.match(/\b([0-5](?:[.,]\d+)?)\s+(\d[\d\s]*)\s+оцен(?:ка|ки|ок)\s+(\d[\d\s]*)\s+отзыв(?:а|ов)?\b/i);
  if (triple) {
    out.rating = ratingNumber(triple[1]);
    out.ratings_count = countNumber(triple[2]);
    out.reviews_count = countNumber(triple[3]);
  } else {
    const r = extract(card, [/(?:Средний рейтинг|Рейтинг)\s*([0-5](?:[.,]\d+)?)/i, /\b([0-5](?:[.,]\d+)?)\s+\d[\d\s]*\s+оцен/i]);
    const rc = extract(card, [/(\d[\d\s]*)\s+оцен(?:ка|ки|ок)\b/i]);
    const wc = extract(card, [/(\d[\d\s]*)\s+отзыв(?:а|ов)?\b/i]);
    if (r != null) out.rating = ratingNumber(r);
    if (rc != null) out.ratings_count = countNumber(rc);
    if (wc != null) out.reviews_count = countNumber(wc);
  }

  // Parse reader name/date/text deterministically from the visible reviews section.
  const reviewSection = visibleReviewsSection(plain);
  if (reviewSection) out.reviews = parseVisibleReviews(reviewSection, out.reviews_count);
  return out;
}

function readJsonLd(root, out) {
  const seen = new WeakSet();
  function walk(n) {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const type = String(n["@type"] || "").toLowerCase();
    if (/book|product|ebook|audiobook/.test(type)) {
      if (!out.title && typeof n.name === "string") out.title = clean(n.name);
      if (!out.author && n.author) out.author = personName(n.author);
      if (!out.isbn && n.isbn) out.isbn = clean(n.isbn);
      if (!out.annotation && typeof n.description === "string") out.annotation = clean(stripTags(n.description)).slice(0, 4500);
    }
    Object.values(n).forEach(v => { if (v && typeof v === "object") walk(v); });
  }
  walk(root);
}

function visibleCardBlock(plain, title) {
  let start = 0;
  if (title) {
    const i = plain.toLowerCase().indexOf(clean(title).toLowerCase());
    if (i >= 0) start = i;
  }
  let end = plain.indexOf("О книге", start);
  if (end < 0) end = Math.min(plain.length, start + 5000);
  return plain.slice(start, end);
}

function visibleReviewsSection(plain) {
  let start = plain.search(/Отзывы,?\s*\d+\s+отзыв(?:а|ов)?/i);
  if (start < 0) start = plain.search(/Комментарии,?\s*\d+\s+отзыв(?:а|ов)?/i);
  if (start < 0) return null;
  let s = plain.slice(start);
  let end = s.search(/\sВозрастное ограничение:|\sДата выхода на Литрес:|\s##?\s*Другие книги автора/i);
  if (end > 0) s = s.slice(0, end);
  s = s.replace(/^(?:Отзывы|Комментарии),?\s*\d+\s+отзыв(?:а|ов)?\s*\d*\s*/i, "")
       .replace(/^Смотреть все отзывы\s*/i, "")
       .replace(/^Оставить отзыв\s*/i, "")
       .replace(/^Оставьте отзыв\s*/i, "");
  return clean(s);
}

function parseVisibleReviews(section, expectedCount) {
  if (!section) return [];
  const dateRe = /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/gi;
  const dates = [...section.matchAll(dateRe)];
  if (!dates.length) return [];

  const reviews = [];
  let currentAuthor = cleanupAuthor(section.slice(0, dates[0].index));

  for (let i = 0; i < dates.length; i++) {
    const dm = dates[i];
    const dateText = dm[0];
    const dateIso = ruDateToIso(dm[1], dm[2], dm[3]);
    const bodyStart = dm.index + dm[0].length;
    const next = dates[i + 1];
    let chunk = section.slice(bodyStart, next ? next.index : section.length).trim();
    let nextAuthor = "";

    if (next) {
      // LitRes places reaction counters (e.g. "3 0") between a review and the next reader name.
      const split = chunk.match(/^([\s\S]*?)\s+(\d+)\s+(\d+)\s+([^\d]{1,160})$/);
      if (split) {
        chunk = split[1].trim();
        nextAuthor = cleanupAuthor(split[4]);
      } else {
        // Fallback: capture the short text immediately before the next date as the next reader name.
        const tail = chunk.match(/^([\s\S]*?)\s+(?:\d+\s+\d+\s+)?([A-Za-zА-Яа-яЁё_.@\-][A-Za-zА-Яа-яЁё0-9_.@\-]*(?:\s+[A-Za-zА-Яа-яЁё_.@\-][A-Za-zА-Яа-яЁё0-9_.@\-]*){0,3})$/);
        if (tail) {
          chunk = tail[1].replace(/\s+\d+\s+\d+\s*$/, "").trim();
          nextAuthor = cleanupAuthor(tail[2]);
        }
      }
    } else {
      chunk = chunk.replace(/\s+\d+\s+\d+\s*(?:Оставьте? отзыв|Войдите.*)?$/i, "").trim();
    }

    const text = clean(chunk);
    if (currentAuthor && text.length >= 15) {
      reviews.push({ author: currentAuthor, date: dateText, date_iso: dateIso, rating: null, text });
    }
    if (nextAuthor) currentAuthor = nextAuthor;
  }

  // Deduplicate and cap only after parsing all visible items.
  const map = new Map();
  for (const r of reviews) {
    const key = r.author.toLowerCase() + "|" + r.date + "|" + r.text.toLowerCase();
    if (!map.has(key)) map.set(key, r);
  }
  const result = [...map.values()];
  return result.slice(0, expectedCount != null && expectedCount <= 5 ? expectedCount : 5);
}

function cleanupAuthor(v) {
  let s = clean(v)
    .replace(/^(?:Смотреть все отзывы|Оставить отзыв|Оставьте отзыв)\s*/i, "")
    .replace(/^\d+\s+\d+\s+/, "")
    .replace(/\s+\d+\s+\d+$/, "");
  if (!s) return "";
  // Remove an immediately duplicated author label caused by avatar alt text.
  const parts = s.split(/\s+/);
  if (parts.length % 2 === 0) {
    const half = parts.length / 2;
    if (parts.slice(0, half).join(" ").toLowerCase() === parts.slice(half).join(" ").toLowerCase()) s = parts.slice(0, half).join(" ");
  }
  return s.slice(-160).trim();
}

function ruDateToIso(day, monthName, year) {
  const months = { января:1, февраля:2, марта:3, апреля:4, мая:5, июня:6, июля:7, августа:8, сентября:9, октября:10, ноября:11, декабря:12 };
  const m = months[String(monthName).toLowerCase()];
  if (!m) return null;
  return String(year).padStart(4,"0") + "-" + String(m).padStart(2,"0") + "-" + String(day).padStart(2,"0");
}

function mergeReviews(a, b) {
  const map = new Map();
  for (const r of [...a, ...b]) {
    if (!r || !r.text) continue;
    const key = clean(r.author).toLowerCase() + "|" + clean(r.date).toLowerCase() + "|" + clean(r.text).toLowerCase();
    if (!map.has(key)) map.set(key, r);
  }
  return [...map.values()];
}

function canonicalReviewsUrl(bookUrl) {
  try {
    const u = new URL(bookUrl);
    let p = u.pathname.replace(/\/+$/, "");
    if (!p.startsWith("/book/")) return null;
    u.pathname = p + "/reviews/";
    u.search = ""; u.hash = "";
    return u.toString();
  } catch (_) { return null; }
}

function bookLinks(html) {
  const s = decodeHtml(html).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  const result = new Set();
  const re = /(?:https?:\/\/www\.litres\.ru)?(\/book\/[^"'<>?\s\\]+\/?)/gi;
  let m;
  while ((m = re.exec(s)) && result.size < 100) {
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

function safeLitresUrl(value, base) {
  try {
    const u = new URL(value, base || "https://www.litres.ru/");
    if (u.protocol !== "https:" || !/(^|\.)litres\.ru$/i.test(u.hostname)) return null;
    u.hash = "";
    return u.toString();
  } catch (_) { return null; }
}

function personName(v) {
  if (typeof v === "string") return clean(v);
  if (Array.isArray(v)) return v.map(personName).filter(Boolean).join(", ");
  return v && typeof v === "object" ? clean(v.name || v.fullName || v.nickname) : "";
}
function ratingNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null; }
function countNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/\s/g, "")); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
function words(v) { return clean(v).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/i).filter(w => w.length > 2); }
function digits(v) { return String(v).replace(/[^0-9X]/gi, ""); }
function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
function decodeHtml(s) { return String(s).replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))); }
function stripTags(s) { return decodeHtml(String(s).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")); }
function extract(s, patterns) { for (const p of patterns) { const m = p.exec(s); if (m) return m[1]; } return null; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
