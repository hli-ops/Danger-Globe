// Danger Globe news server. Zero dependencies, Node 18+.
// Serves index.html and a keyless news lookup: GET /api/news?place=&country=
// (reads public Google News RSS; no API key, no account).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const TTL = 20 * 60 * 1000;
const MAX_CACHE = 500;
const RATE = 60; // requests per minute per IP
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FIXTURE = process.env.DG_NEWS_FIXTURE || '';

const cache = new Map();
const inflight = new Map();
const hits = new Map();

function clean(s, n) {
  return String(s || '').replace(/[\u0000-\u001f\u007f"<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}
function dec(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function tag(x, t) {
  const m = x.match(new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>'));
  return m ? dec(m[1]).trim() : '';
}
function parseRSS(xml) {
  const out = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const it of items) {
    let title = tag(it, 'title');
    const link = tag(it, 'link');
    const sm = it.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
    let dom = '', src = '';
    if (sm) {
      src = dec(sm[2]).trim();
      try { dom = new URL(dec(sm[1])).hostname.replace(/^www\./, ''); } catch (e) {}
    }
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    const d = new Date(tag(it, 'pubDate'));
    if (!title || !/^https:\/\//.test(link) || isNaN(d)) continue;
    out.push({ t: title, s: src, d: dom, u: link, p: d.toISOString() });
  }
  return out;
}
async function feed(q) {
  if (FIXTURE) return parseRSS(fs.readFileSync(FIXTURE, 'utf8'));
  const url = 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&q=' + encodeURIComponent(q);
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml,text/xml' }, signal: ctl.signal });
    if (!r.ok) throw new Error('upstream ' + r.status);
    return parseRSS(await r.text());
  } finally { clearTimeout(tm); }
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function lookup(place, country) {
  const base = '"' + place + '"' + (country ? ' ' + country : '') + ' when:30d';
  const hz = base + ' (violence OR attack OR kidnapping OR protest OR crime OR flood OR earthquake OR security)';
  const res = await Promise.allSettled([feed(base), feed(hz)]);
  if (res.every(r => r.status === 'rejected')) throw res[0].reason;
  const seen = new Set(), arts = [];
  for (const r of res) if (r.status === 'fulfilled') for (const a of r.value) {
    const k = norm(a.t);
    if (seen.has(k)) continue;
    seen.add(k); arts.push(a);
  }
  arts.sort((a, b) => b.p.localeCompare(a.p));
  return { place, country, fetched: new Date().toISOString(), articles: arts.slice(0, 80) };
}
function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > RATE;
}
function json(res, code, obj, extra) {
  res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }, extra));
  res.end(JSON.stringify(obj));
}
const HTML = path.join(__dirname, 'index.html');
let htmlGz = null, htmlMt = 0;
function sendHTML(req, res) {
  fs.stat(HTML, (e, st) => {
    if (e) return json(res, 404, { error: 'index.html missing' });
    if (!htmlGz || st.mtimeMs !== htmlMt) { htmlGz = zlib.gzipSync(fs.readFileSync(HTML)); htmlMt = st.mtimeMs; }
    const h = { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-cache' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { h['content-encoding'] = 'gzip'; res.writeHead(200, h); res.end(htmlGz); }
    else { res.writeHead(200, h); res.end(fs.readFileSync(HTML)); }
  });
}

http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, 'http://x'); } catch (e) { return json(res, 400, { error: 'bad url' }); }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
  if (u.pathname === '/' || u.pathname === '/index.html') return sendHTML(req, res);
  if (u.pathname === '/healthz') return json(res, 200, { ok: true });
  if (u.pathname !== '/api/news') return json(res, 404, { error: 'not found' });

  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { error: 'slow down' });
  const place = clean(u.searchParams.get('place'), 80), country = clean(u.searchParams.get('country'), 60);
  if (place.length < 2) return json(res, 400, { error: 'place required' });

  const key = norm(place + '|' + country);
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return json(res, 200, c.v, { 'cache-control': 'public, max-age=300', 'x-cache': 'hit' });
  try {
    let p = inflight.get(key);
    if (!p) { p = lookup(place, country).finally(() => inflight.delete(key)); inflight.set(key, p); }
    const v = await p;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), v });
    json(res, 200, v, { 'cache-control': 'public, max-age=300', 'x-cache': 'miss' });
  } catch (e) {
    json(res, 502, { error: 'news source unavailable' });
  }
}).listen(PORT, () => console.log('Danger Globe on http://localhost:' + PORT));
