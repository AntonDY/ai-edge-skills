const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"};
export default{async fetch(request){const u=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});if(request.method!=="GET")return json({error:"method_not_allowed"},405);const mode=u.searchParams.get("mode")||"book";try{if(u.pathname==="/ping"||mode==="ping")return json({ok:true,pong:true,version:"16.0"});if(mode==="book")return json(await lookupBook(u));return json({error:"unknown_mode"},400);}catch(e){return json({ok:false,error:"proxy_error",detail:String(e&&e.message||e)},500);}}};

async function lookupBook(u){
  const input={title:clean(u.searchParams.get("title")),author:clean(u.searchParams.get("author")),isbn:clean(u.searchParams.get("isbn"))};
  if(!input.title&&!input.isbn)return{ok:false,found:false,error:"missing_title_and_isbn"};
  const queries=[...new Set([input.isbn,[input.title,input.author].filter(Boolean).join(" "),input.title].filter(Boolean))];
  let search=null, candidates=[];
  for(const q of queries){const r=await fetchText("https://www.litres.ru/search/?q="+encodeURIComponent(q));search={query:q,status:r.status,ms:r.ms};if(!r.ok)continue;candidates=bookLinks(r.text).slice(0,10);if(candidates.length)break;}
  for(const link of candidates){const r=await fetchText(link);if(!r.ok)continue;const b=parseBookPage(r.text,r.url);if(matchesBook(b,input)){b.ok=true;b.found=true;b.search=search;return b;}}
  return{ok:false,found:false,error:"no_verified_match",search};
}

async function fetchText(target){const started=Date.now();const r=await fetch(target,{headers:{"Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8","Accept-Language":"ru-RU,ru;q=0.9"},redirect:"follow"});return{ok:r.ok,status:r.status,ms:Date.now()-started,text:await r.text(),url:r.url};}

function parseBookPage(html,url){
  const out={url:safeLitresUrl(url),title:null,author:null,isbn:null,annotation:null,rating:null,ratings_count:null,reviews_count:null,reviews:[]};
  // JSON-LD/embedded data are reliable for title/annotation/rating, but LitRes exposes the two counters reversed in structured data on this card.
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{readStructured(JSON.parse(m[1]),out,true);}catch(_){}}
  for(const m of html.matchAll(/<script\b[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)){try{readStructured(JSON.parse(m[1]),out,false);}catch(_){}}

  const plain=clean(stripTags(html));
  if(!out.title)out.title=extract(plain,[/Основной контент книги\s+(.{3,220}?)\s+(?:Текст|PDF|Аудио|Объем)/i]);
  if(!out.author)out.author=extract(plain,[/автор\s+([A-ZА-ЯЁ][^\d]{2,100}?)\s+(?:PDF|EPUB|[0-5](?:[.,]\d+)?)/i]);
  if(!out.isbn)out.isbn=extract(plain,[/ISBN:\s*([0-9Xx\-]{10,20})/i]);
  if(!out.annotation){const a=extract(plain,[/О книге\s+([\s\S]{20,5000}?)\s+Жанры и теги/i]);if(a)out.annotation=clean(a);}

  // Prefer visible text when present.
  const rm=plain.match(/\b([0-5](?:[.,]\d+)?)\s+(\d+)\s+оцен(?:ка|ки|ок)\s+(\d+)\s+отзыв(?:а|ов)?\b/i);
  if(rm){out.rating=ratingNumber(rm[1]);out.ratings_count=countNumber(rm[2]);out.reviews_count=countNumber(rm[3]);}

  // Robust broad review section extraction (same approach that worked in v12), then deterministic splitting.
  const section=visibleReviewsBlock(plain);
  if(section)out.reviews=parseBroadReviews(section,out.reviews_count);
  return out;
}

function readStructured(root,out,schema){
  const seen=new WeakSet();
  function walk(n,context){if(!n||typeof n!=="object"||seen.has(n))return;seen.add(n);if(Array.isArray(n)){n.forEach(x=>walk(x,context));return;}
    const type=String(n["@type"]||n.type||"").toLowerCase();
    const book=/book|product|ebook|audiobook/.test(type)||(!schema&&(n.bookId||n.book_id||n.artId||n.art_id));
    if(book){if(!out.title)out.title=clean(n.name||n.title);if(!out.author)out.author=personName(n.author||n.authors);if(!out.isbn)out.isbn=clean(n.isbn);if(!out.annotation)out.annotation=description(n.annotation||n.description||n.annotation_html||n.annotationHtml);const a=n.aggregateRating||n.rating;if(a&&typeof a==="object"){
      if(out.rating==null)out.rating=ratingNumber(a.ratingValue??a.value);
      // LitRes structured values are opposite to the visible UI for this title; map accordingly.
      const rc=countNumber(a.ratingCount??a.rating_count);const wc=countNumber(a.reviewCount??a.review_count);
      if(out.ratings_count==null&&wc!=null)out.ratings_count=wc;
      if(out.reviews_count==null&&rc!=null)out.reviews_count=rc;
    }}
    for(const [k,v] of Object.entries(n))if(v&&typeof v==="object")walk(v,/^(reviews|review|comments|recenses)$/i.test(k)?"reviews":context);
  }
  walk(root,null);
}

function visibleReviewsBlock(plain){let start=plain.search(/Отзывы,?\s*\d+\s+отзыв(?:а|ов)?/i);if(start<0)start=plain.search(/Отзывы\s*[—:-]?\s*/i);if(start<0)return null;let s=plain.slice(start);let end=s.search(/\sОставьте отзыв\s+Войдите,|\sВозрастное ограничение:|\sДата выхода на Литрес:/i);if(end>0)s=s.slice(0,end);s=s.replace(/^Отзывы,?\s*\d+\s+отзыв(?:а|ов)?\s*\d*\s*/i,"").replace(/^Смотреть все отзывы\s*/i,"").replace(/^Оставить отзыв\s*/i,"").replace(/^Сначала популярные\s*/i,"");return clean(s);}

function parseBroadReviews(section,expected){
  const dates=[...section.matchAll(/(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4})/gi)];
  const out=[];
  for(let i=0;i<dates.length;i++){
    const d=dates[i];const prevEnd=i===0?0:dates[i-1].index+dates[i-1][0].length;
    const before=section.slice(prevEnd,d.index);
    let author=before;
    const marker=Math.max(before.lastIndexOf("Поделиться отзывом"),before.lastIndexOf("Ответить"));
    if(marker>=0)author=before.slice(marker+(before.includes("Поделиться отзывом",marker)?"Поделиться отзывом".length:"Ответить".length));
    author=clean(author.replace(/^\d+\s+\d+\s*/,"").replace(/Пожаловаться на отзыв/g," ").replace(/Поделиться отзывом/g," "));
    const toks=author.split(/\s+/).filter(Boolean);author=toks.slice(-4).join(" ");

    let afterStart=d.index+d[0].length;let afterEnd=i+1<dates.length?dates[i+1].index:section.length;let chunk=section.slice(afterStart,afterEnd);
    const reaction=chunk.search(/\s+\d+\s+\d+\s+Ответить\b/i);if(reaction>=0)chunk=chunk.slice(0,reaction);
    chunk=clean(chunk.replace(/Пожаловаться на отзыв[\s\S]*$/i,""));
    if(author&&chunk.length>=15)out.push({author,date:d[1],rating:null,text:chunk});
  }
  const uniq=[];const seen=new Set();for(const r of out){const k=(r.author+"|"+r.date+"|"+r.text).toLowerCase();if(!seen.has(k)){seen.add(k);uniq.push(r);}}
  return uniq.slice(0,expected!=null&&expected<=5?expected:5);
}

function bookLinks(html){const s=decodeHtml(html).replace(/\\u002F/gi,"/").replace(/\\\//g,"/");const result=new Set();const re=/(?:https?:\/\/www\.litres\.ru)?(\/book\/[^"'<>?\s\\]+\/?)/gi;let m;while((m=re.exec(s))&&result.size<100){const u=safeLitresUrl("https://www.litres.ru"+m[1]);if(u)result.add(u);}return[...result];}
function matchesBook(book,input){if(input.isbn&&book.isbn&&digits(input.isbn)===digits(book.isbn))return true;if(!input.title||!book.title)return false;const a=words(input.title),b=words(book.title);const overlap=a.filter(w=>b.includes(w)).length/Math.max(a.length||1,b.length||1);if(overlap<0.7)return false;if(input.author&&book.author){const x=words(input.author),y=words(book.author);if(x.length&&!x.some(w=>y.includes(w)))return false;}return true;}
function safeLitresUrl(value,base){try{const u=new URL(value,base||"https://www.litres.ru/");if(u.protocol!=="https:"||!/(^|\.)litres\.ru$/i.test(u.hostname))return null;u.hash="";return u.toString();}catch(_){return null;}}
function personName(v){if(typeof v==="string")return clean(v);if(Array.isArray(v))return v.map(personName).filter(Boolean).join(", ");return v&&typeof v==="object"?clean(v.name||v.fullName||v.nickname):"";}
function description(v){if(typeof v==="string")return clean(stripTags(v)).slice(0,4500)||null;if(v&&typeof v==="object")return description(v.text||v.html||v.value||v.content);return null;}
function ratingNumber(v){if(v==null||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)&&n>=0&&n<=5?n:null;}
function countNumber(v){if(v==null||v==="")return null;const n=Number(String(v).replace(/\s/g,""));return Number.isSafeInteger(n)&&n>=0?n:null;}
function words(v){return clean(v).toLowerCase().replace(/ё/g,"е").split(/[^a-zа-я0-9]+/i).filter(w=>w.length>2);}
function digits(v){return String(v).replace(/[^0-9X]/gi,"");}
function clean(v){return String(v==null?"":v).replace(/\s+/g," ").trim();}
function decodeHtml(s){return String(s).replace(/&quot;|&#34;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;|&#160;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));}
function stripTags(s){return decodeHtml(String(s).replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," "));}
function extract(s,patterns){for(const p of patterns){const m=p.exec(s);if(m)return m[1];}return null;}
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});}
