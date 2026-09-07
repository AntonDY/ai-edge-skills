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
      if (u.pathname === "/ping" || mode === "ping") return json({ ok: true, pong: true, version: "14.0" });
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
  let candidateUrls = [];
  let search = null;
  for (const q of queries) {
    const r = await fetchText("https://www.litres.ru/search/?q=" + encodeURIComponent(q));
    search = { query: q, status: r.status, ms: r.ms };
    if (!r.ok) continue;
    candidateUrls = bookLinks(r.text).slice(0, 10);
    if (candidateUrls.length) break;
  }

  for (const url of candidateUrls) {
    const r = await fetchText(url);
    if (!r.ok) continue;
    const book = parseBookPage(r.text, r.url);
    if (!matchesBook(book, input)) continue;
    book.ok = true;
    book.found = true;
    book.search = search;
    return book;
  }

  return { ok: false, found: false, error: "no_verified_match", search };
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
  const plain = clean(stripTags(html));
  const out = {
    url: safeLitresUrl(url), title: null, author: null, isbn: null,
    annotation: null, rating: null, ratings_count: null, reviews_count: null,
    reviews: []
  };

  // Title and author from visible page first.
  out.title = extract(plain, [/#\s*([^#]{3,220}?)\s+автор/i, /Основной контент книги\s+(.{3,220}?)\s+(?:Текст|PDF|Аудио|Объем)/i]);
  out.author = extract(plain, [/автор\s+([A-ZА-ЯЁ][^\d#]{2,100}?)\s+(?:PDF|EPUB|3[.,]\d|[0-5](?:[.,]\d+)?\s+\d+\s+оцен)/i]);
  out.isbn = extract(plain, [/ISBN:\s*([0-9Xx\-]{10,20})/i]);

  // Annotation from the exact visible section between "О книге" and "Жанры и теги".
  const ann = extract(plain, [/О книге\s+([\s\S]{20,5000}?)\s+Жанры и теги/i]);
  if (ann) out.annotation = clean(ann);

  // LitRes renders these as: rating, then "N оценок", then a separate number and "отзыва/отзывов".
  // Parse them independently; never infer one from the other.
  const ratingIndex = plain.search(/\b[0-5](?:[.,]\d+)?\s+\d+\s+оцен(?:ка|ки|ок)\b/i);
  const metricsBlock = ratingIndex >= 0 ? plain.slice(ratingIndex, ratingIndex + 500) : plain.slice(0, 8000);
  out.rating = ratingNumber(extract(metricsBlock, [/\b([0-5](?:[.,]\d+)?)\s+\d+\s+оцен(?:ка|ки|ок)\b/i]));
  out.ratings_count = countNumber(extract(metricsBlock, [/(\d+)\s+оцен(?:ка|ки|ок)\b/i]));
  out.reviews_count = countNumber(extract(metricsBlock, [/(\d+)\s+отзыв(?:а|ов)?\b/i]));

  // Parse the visible reviews section using stable UI markers from the LitRes page.
  const section = extract(plain, [/Отзывы,?\s*\d+\s+отзыв(?:а|ов)?\s+\d+\s+Смотреть все отзывы\s+Оставить отзыв\s+Сначала популярные\s+([\s\S]*?)\s+Оставьте отзыв\s+Войдите,/i]);
  if (section) out.reviews = parseReviews(section);

  return out;
}

function parseReviews(section) {
  // Every review block ends with "<likes> <dislikes> Ответить".
  const blocks = section.split(/\s+\d+\s+\d+\s+Ответить\s+/i);
  const reviews = [];
  const datePattern = /(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4})/i;

  for (let raw of blocks) {
    raw = clean(raw)
      .replace(/^(?:Пожаловаться на отзыв\s+Поделиться отзывом\s+)*/i, "")
      .replace(/(?:Пожаловаться на отзыв\s+Поделиться отзывом\s*)+$/i, "")
      .trim();
    if (!raw) continue;

    const dm = datePattern.exec(raw);
    if (!dm) continue;
    const before = clean(raw.slice(0, dm.index));
    let after = clean(raw.slice(dm.index + dm[0].length));

    // If the previous UI tail leaked into this block, keep only the last author-like segment.
    const author = cleanupAuthor(before);
    after = after.replace(/^(?:Пожаловаться на отзыв\s+Поделиться отзывом\s+)*/i, "").trim();
    if (!author || after.length < 15) continue;

    reviews.push({ author, date: dm[1], rating: null, text: after });
  }

  // Deduplicate exact duplicates while preserving page order.
  const seen = new Set();
  return reviews.filter(r => {
    const k = (r.author + "|" + r.date + "|" + r.text).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 5);
}

function cleanupAuthor(s) {
  s = clean(s)
    .replace(/Пожаловаться на отзыв\s+Поделиться отзывом/gi, " ")
    .replace(/Ответить/gi, " ")
    .replace(/^\d+\s+\d+\s+/, "")
    .trim();
  // The avatar alt text may duplicate the displayed name: "Имя Имя".
  const words = s.split(/\s+/);
  for (let half = 1; half <= Math.floor(words.length / 2); half++) {
    const a = words.slice(words.length - 2 * half, words.length - half).join(" ");
    const b = words.slice(words.length - half).join(" ");
    if (a && a.toLowerCase() === b.toLowerCase()) return b;
  }
  // Usually the real visible name is the final short segment before the date.
  return words.slice(-4).join(" ").trim();
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
  const a = tokenWords(input.title), b = tokenWords(book.title);
  const overlap = a.filter(w => b.includes(w)).length / Math.max(a.length || 1, b.length || 1);
  if (overlap < 0.7) return false;
  if (input.author && book.author) {
    const x = tokenWords(input.author), y = tokenWords(book.author);
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

function ratingNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null; }
function countNumber(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/\s/g, "")); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
function tokenWords(v) { return clean(v).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/i).filter(w => w.length > 2); }
function digits(v) { return String(v).replace(/[^0-9X]/gi, ""); }
function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
function decodeHtml(s) { return String(s).replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))); }
function stripTags(s) { return decodeHtml(String(s).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")); }
function extract(s, patterns) { for (const p of patterns) { const m = p.exec(s); if (m) return m[1]; } return null; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
