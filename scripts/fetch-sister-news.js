// Fetches the latest headlines from our sister station, Spirit 88.3 FM (spiritgh.com),
// and saves them to content/sister/spirit-news.json for build.js to render.
// Runs before build.js on every Netlify deploy. Never fails the build: if spiritgh.com
// can't be reached, the last committed snapshot is kept.
const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://spiritgh.com/news.html';
const OUT = path.join(__dirname, '..', 'content', 'sister', 'spirit-news.json');

function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'sunnygh-build' }, timeout: 10000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function parse(html) {
  const items = [];
  const re = /<a class="news-card" href="([^"]+)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && items.length < 6) {
    const block = m[2];
    const img = (block.match(/<img[^>]*src="([^"]+)"/) || [])[1];
    const tag = strip((block.match(/<span class="news-tag">([\s\S]*?)<\/span>/) || [])[1]);
    const title = strip((block.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]);
    const meta = strip((block.match(/<div class="news-meta">([\s\S]*?)<\/div>/) || [])[1]);
    if (!title) continue;
    items.push({
      url: new URL(m[1], SOURCE).href,
      image: img ? new URL(img, SOURCE).href : '',
      tag: decode(tag),
      title: decode(title),
      date: decode(meta.split('·')[0].trim()),
    });
  }
  return items;
}

get(SOURCE)
  .then(html => {
    const items = parse(html);
    if (!items.length) throw new Error('no news cards found');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
    console.log(`Sister news: saved ${items.length} Spirit 88.3 FM headline(s).`);
  })
  .catch(err => {
    console.warn(`Sister news: could not refresh from spiritgh.com (${err.message}); keeping last snapshot.`);
  });
