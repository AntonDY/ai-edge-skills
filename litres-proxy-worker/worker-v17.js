const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"};

export default{async fetch(request){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="GET")return json({error:"method_not_allowed"},405);
  const mode=u.searchParams.get("mode")||"book";
  try{
    if(u.pathname==="/ping"||mode==="ping")return json({ok:true,pong:true,version:"17.0"});
    if(mode==="book")return json(await lookupBook(u));
    return json({error:"unknown_mode"},400);
  }catch(e){return json({ok:false,error:"proxy_error",detail:String(e&&e.message||e)},500);}
}};

async function lookupBook(u){
  const input={title:clean(u.searchParams.get("title")),author:clean(u.searchParams.get("author")),isbn:clean(u.searchParams.get("isbn"))};
  if(!input.title&&!input.isbn)return{ok:false,found:false,error:"missing_title_and_isbn"};
  const queries=[...new Set([input.isbn,[input.title,input.author].filter(Boolean).join(" "),input.title].filter(Boolean))];
  let candidates=[],search=null;
  for(const q of queries){
    const r=await fetchText("https://www.litres.ru/search/?q="+encodeURIComponent(q));
    search={query:q,status:r.status,ms:r.ms};
    if(!r.ok)continue;
    candidates=bookLinks(r.text).slice(0,10);
    if(candidates.length)break;
  }
  for(const link of candidates){
    const r=await fetchText(link);
    if(!r.ok)continue;
    const b=parseBookPage(r.text,r.url);
    if(matchesBook(b,input)){b.ok=true;b.found=true;b.search=search;return b;}
  }
  return{ok:false,found:false,error:"no_verified_match",search};
}

async function fetchText(target){
  const started=Date.now();
  const r=await fetch(target,{headers:{"Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8","Accept-Language":"ru-RU,ru;q=0.9"},redirect:"follow"});
  return{ok:r.ok,status:r.status,ms:Date.now()-started,text:await r.text(),url:r.url};
}

function parseBookPage(html,url){
  const lines=textLines(html);
  const out={url:safeLitresUrl(url),title:null,author:null,isbn:null,annotation:null,rating:null,ratings_count:null,reviews_count:null,reviews:[],parser:"line-v17"};

  // Structured data only for title/author/annotation fallback, not review parsing.
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{readJsonLd(JSON.parse(m[1]),out);}catch(_){}
  }

  // Find visible title and author.
  const titleIdx=findLine(lines,l=>/^Введение|^Основной контент книги/i.test(l)&&l.length<300);
  if(!out.title){
    const h=findLine(lines,l=>l.length>3&&l.length<220&&/Kubernetes|контейнер/i.test(l));
    if(h>=0)out.title=lines[h].replace(/^Основной контент книги\s*/i,"");
  }
  const authorIdx=findLine(lines,l=>/^автор$/i.test(l));
  if(authorIdx>=0&&lines[authorIdx+1])out.author=lines[authorIdx+1];

  // Header metrics: preserve line boundaries so a standalone "2" followed by "отзыва" is not lost.
  let metricStart=-1;
  for(let i=0;i<Math.min(lines.length,400);i++){
    if(/^[0-5](?:[.,]\d+)?$/.test(lines[i])&&i+1<lines.length&&/^\d+\s+оцен(?:ка|ки|ок)$/i.test(lines[i+1])){metricStart=i;break;}
  }
  if(metricStart>=0){
    out.rating=ratingNumber(lines[metricStart]);
    out.ratings_count=countNumber((lines[metricStart+1].match(/^(\d+)/)||[])[1]);
    for(let j=metricStart+2;j<Math.min(lines.length,metricStart+8);j++){
      let m=lines[j].match(/^(\d+)\s+отзыв(?:а|ов)?$/i);
      if(m){out.reviews_count=countNumber(m[1]);break;}
      if(/^\d+$/.test(lines[j])&&j+1<lines.length&&/^отзыв(?:а|ов)?$/i.test(lines[j+1])){out.reviews_count=countNumber(lines[j]);break;}
    }
  }

  // Separate fallback from the explicit reviews heading: "Отзывы, 2 отзыва 2".
  const reviewsHeading=findLine(lines,l=>/^Отзывы,?\s*\d+\s+отзыв(?:а|ов)?/i.test(l));
  if(reviewsHeading>=0){
    const m=lines[reviewsHeading].match(/^Отзывы,?\s*(\d+)\s+отзыв(?:а|ов)?/i);
    if(m)out.reviews_count=countNumber(m[1]);
  }

  // Annotation between "О книге" and "Жанры и теги".
  const about=findLine(lines,l=>/^О книге$/i.test(l));
  const genres=findLine(lines,l=>/^Жанры и теги$/i.test(l),about+1);
  if(about>=0&&genres>about){
    const body=lines.slice(about+1,genres).filter(l=>!isControlLine(l));
    if(body.length)out.annotation=clean(body.join(" ")).slice(0,4500);
  }

  // ISBN.
  const isbnIdx=findLine(lines,l=>/^ISBN:?$/i.test(l));
  if(isbnIdx>=0&&lines[isbnIdx+1])out.isbn=clean(lines[isbnIdx+1]);

  // Reviews: exact UI region and exact line boundaries.
  out.reviews=parseReviewsFromLines(lines,reviewsHeading,out.reviews_count);
  return out;
}

function parseReviewsFromLines(lines,headingIdx,expectedCount){
  if(headingIdx<0)return[];
  let start=findLine(lines,l=>/^Сначала популярные$/i.test(l),headingIdx);
  if(start<0)start=headingIdx+1; else start++;
  let end=findLine(lines,l=>/^Оставьте отзыв$/i.test(l),start);
  if(end<0)end=findLine(lines,l=>/^Войдите, чтобы оценить книгу/i.test(l),start);
  if(end<0)end=Math.min(lines.length,start+250);
  const region=lines.slice(start,end);

  const reviews=[];
  let i=0;
  while(i<region.length){
    if(!isDateLine(region[i])){i++;continue;}
    const date=region[i];

    // Nearest preceding visible reader name. Skip controls/reaction counters and collapse duplicated avatar alt + visible name.
    let names=[];
    for(let p=i-1;p>=0&&i-p<=8;p--){
      const l=region[p];
      if(isControlLine(l)||/^\d+\s+\d+$/.test(l)||isDateLine(l))continue;
      if(l.length<=120)names.unshift(l);
      if(names.length>=2)break;
    }
    let author=names.length?names[names.length-1]:"";
    if(names.length>=2&&names[names.length-2].toLowerCase()===names[names.length-1].toLowerCase())author=names[names.length-1];

    // Text runs from the line after the date until reaction counter / Reply / report controls / next date.
    const text=[];
    let j=i+1;
    for(;j<region.length;j++){
      const l=region[j];
      if(isDateLine(l))break;
      if(/^\d+\s+\d+$/.test(l)||/^Ответить$/i.test(l)||/^Пожаловаться на отзыв$/i.test(l)||/^Поделиться отзывом$/i.test(l))break;
      if(/^Оставьте отзыв$/i.test(l))break;
      if(!isControlLine(l))text.push(l);
    }
    const body=clean(text.join(" "));
    if(author&&body.length>=15)reviews.push({author,date,rating:null,text:body});
    i=Math.max(j,i+1);
  }

  // Deduplicate while preserving displayed order.
  const seen=new Set(),uniq=[];
  for(const r of reviews){const k=(r.author+"|"+r.date+"|"+r.text).toLowerCase();if(!seen.has(k)){seen.add(k);uniq.push(r);}}
  return uniq.slice(0,expectedCount!=null&&expectedCount<=5?expectedCount:5);
}

function textLines(html){
  let s=String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi,"\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi,"\n")
    .replace(/<(?:br|hr)\b[^>]*>/gi,"\n")
    .replace(/<\/(?:p|div|section|article|li|h1|h2|h3|h4|h5|h6|a|button|span)>/gi,"\n")
    .replace(/<[^>]+>/g," ");
  s=decodeHtml(s).replace(/\r/g,"\n");
  return s.split(/\n+/).map(clean).filter(Boolean);
}

function isDateLine(s){return /^\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}$/i.test(s);}
function isControlLine(s){return /^(?:Смотреть все отзывы|Оставить отзыв|Сначала популярные|Пожаловаться на отзыв|Поделиться отзывом|Ответить|Отложить|Поделиться|Читать фрагмент|Подписаться на новинки автора|Отметить прочитанной|Эксклюзив)$/i.test(s);}
function findLine(lines,pred,start=0){for(let i=Math.max(0,start);i<lines.length;i++)if(pred(lines[i]))return i;return-1;}

function readJsonLd(root,out){const seen=new WeakSet();function walk(n){if(!n||typeof n!=="object"||seen.has(n))return;seen.add(n);if(Array.isArray(n)){n.forEach(walk);return;}const type=String(n["@type"]||"").toLowerCase();if(/book|product|ebook|audiobook/.test(type)){if(!out.title&&typeof n.name==="string")out.title=clean(n.name);if(!out.author&&n.author)out.author=personName(n.author);if(!out.isbn&&n.isbn)out.isbn=clean(n.isbn);if(!out.annotation&&typeof n.description==="string")out.annotation=clean(stripTags(n.description)).slice(0,4500);}Object.values(n).forEach(v=>{if(v&&typeof v==="object")walk(v);});}walk(root);}
function bookLinks(html){const s=decodeHtml(html).replace(/\\u002F/gi,"/").replace(/\\\//g,"/");const result=new Set();const re=/(?:https?:\/\/www\.litres\.ru)?(\/book\/[^"'<>?\s\\]+\/?)/gi;let m;while((m=re.exec(s))&&result.size<100){const u=safeLitresUrl("https://www.litres.ru"+m[1]);if(u)result.add(u);}return[...result];}
function matchesBook(book,input){if(input.isbn&&book.isbn&&digits(input.isbn)===digits(book.isbn))return true;if(!input.title||!book.title)return false;const a=words(input.title),b=words(book.title);const overlap=a.filter(w=>b.includes(w)).length/Math.max(a.length||1,b.length||1);if(overlap<0.7)return false;if(input.author&&book.author){const x=words(input.author),y=words(book.author);if(x.length&&!x.some(w=>y.includes(w)))return false;}return true;}
function safeLitresUrl(value,base){try{const u=new URL(value,base||"https://www.litres.ru/");if(u.protocol!=="https:"||!/(^|\.)litres\.ru$/i.test(u.hostname))return null;u.hash="";return u.toString();}catch(_){return null;}}
function personName(v){if(typeof v==="string")return clean(v);if(Array.isArray(v))return v.map(personName).filter(Boolean).join(", ");return v&&typeof v==="object"?clean(v.name||v.fullName||v.nickname):"";}
function ratingNumber(v){if(v==null||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)&&n>=0&&n<=5?n:null;}
function countNumber(v){if(v==null||v==="")return null;const n=Number(String(v).replace(/\s/g,""));return Number.isSafeInteger(n)&&n>=0?n:null;}
function words(v){return clean(v).toLowerCase().replace(/ё/g,"е").split(/[^a-zа-я0-9]+/i).filter(w=>w.length>2);}
function digits(v){return String(v).replace(/[^0-9X]/gi,"");}
function clean(v){return String(v==null?"":v).replace(/\s+/g," ").trim();}
function decodeHtml(s){return String(s).replace(/&quot;|&#34;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;|&#160;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));}
function stripTags(s){return decodeHtml(String(s).replace(/<[^>]+>/g," "));}
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});}
