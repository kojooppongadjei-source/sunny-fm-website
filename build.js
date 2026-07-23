// build.js
// Reads markdown content from /content/<collection>/*.md, processes front-matter,
// and generates:
//  1. /content/<collection>/index.json  — list of posts (for the listing page JS)
//  2. /<collection>/<slug>/index.html   — individual post pages
//
// Run automatically by Netlify on each deploy (see netlify.toml build command).

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, 'content');

// Collection config: folder name -> { urlPath, label, fields to expose in index }
const COLLECTIONS = {
  'news': {
    urlPath: 'news',
    label: 'News',
  },
  'lifestyle': {
    urlPath: 'lifestyle',
    label: 'Lifestyle',
  },
  'prayer-testimonies': {
    urlPath: 'prayer-testimonies',
    label: 'Prayer & Testimonies',
  },
 'preaching-teaching': {
    urlPath: 'preaching-teaching',
    label: 'Preaching & Teaching',
  },
  'events': {
    urlPath: 'events',
    label: 'Events',
  },
  'daily-bread': {
    urlPath: 'daily-bread',
    label: 'Sunny Daily Bread',
  },
};

// Read shared header/footer snippets
const HEADER = fs.readFileSync(path.join(ROOT, '_includes', 'site-header.html'), 'utf8');
const FOOTER = fs.readFileSync(path.join(ROOT, '_includes', 'site-footer.html'), 'utf8');
const FOOTER_PLAYER = fs.readFileSync(path.join(ROOT, '_includes', 'footer-player.html'), 'utf8');

const GA_SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-W8W4N24JZK"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-W8W4N24JZK');
</script>`;

const ADSENSE_SNIPPET = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3442619894645176"
     crossorigin="anonymous"></script>`;

const DONATE_SCRIPT = `
<script>
function snOpenDonate(){
  var amount = prompt("Enter donation amount in GHS:", "50");
  if(!amount || isNaN(amount) || Number(amount) <= 0) return;
  var email = prompt("Enter your email for the receipt:");
  if(!email) return;

  function launch(){
    var handler = PaystackPop.setup({
      key: 'pk_live_de0fc9e3b71f670c1d8e9cd4e3be3f125c9ceb8a',
      email: email,
      amount: Math.round(Number(amount) * 100),
      currency: 'GHS',
      ref: 'SUNNYDON' + Math.floor(Math.random() * 1000000000),
      callback: function(response){
        alert('Thank you! Your donation was successful. Reference: ' + response.reference);
      },
      onClose: function(){}
    });
    handler.openIframe();
  }

  // Load Paystack's SDK on demand instead of on every page load —
  // most visitors never click Donate, so this saves ~570KB of JS per pageview.
  if (window.PaystackPop) {
    launch();
  } else {
    var s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = launch;
    s.onerror = function(){ alert('Could not load the payment form. Please check your connection and try again.'); };
    document.head.appendChild(s);
  }
}
</script>`;

function slugFromFilename(filename) {
  // 2026-06-15-my-post-title.md -> my-post-title  (keep date prefix off the URL)
  const base = filename.replace(/\.md$/, '');
  const match = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return match ? match[1] : base;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSentences(text) {
  if (!text) return [];
  const ABBR = /\b(Dr|Mr|Mrs|Ms|Rev|Pastor|Bishop|Prof|St|Jr|Sr|vs|etc|e\.g|i\.e|No|vol|Rd|Ave)\.(\s)/gi;
  const placeholder = text.replace(ABBR, (m, word, space) => `${word}\u0000${space}`);
  const matches = placeholder.match(/[^.!?]+[.!?]+(\s+|$)/g);
  const restore = s => s.replace(/\u0000/g, '.');
  return matches ? matches.map(s => restore(s.trim())).filter(Boolean) : (text.trim() ? [text.trim()] : []);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageShell({ title, description, bodyHtml, ogImage, jsonLd, wide }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${GA_SNIPPET}
${ADSENSE_SNIPPET}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Sunny 88.7 FM</title>
<meta name="description" content="${escapeHtml(description)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;line-height:1.7;}
:root{--gold:#C8920A;--gold-dark:#a8760a;--cream:#FAF7F0;--muted:#888;--border:#e8e4dc;}
.wrap{max-width:760px;margin:0 auto;padding:32px 5% 64px;}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:10px;}
.post-title{font-size:clamp(26px,4vw,40px);font-weight:800;line-height:1.2;margin-bottom:10px;}
.post-meta{font-size:13px;color:var(--muted);margin-bottom:24px;}
.post-image{width:100%;border-radius:14px;margin-bottom:24px;display:block;}
.post-body{font-size:16px;color:#333;}
.post-body p{margin-bottom:16px;}
.post-body h1,.post-body h2,.post-body h3{margin:28px 0 12px;font-weight:800;line-height:1.3;}
.post-body ul,.post-body ol{margin:0 0 16px 24px;}
.post-body li{margin-bottom:6px;}
.post-body a{color:var(--gold-dark);}
.post-body blockquote{border-left:3px solid var(--gold);padding-left:16px;color:#555;margin:20px 0;font-style:italic;}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--gold-dark);text-decoration:none;font-weight:600;margin-bottom:24px;}
.back-link:hover{text-decoration:underline;}
.tag{display:inline-block;background:#fff0e0;color:var(--gold-dark);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.06em;margin-right:6px;}
.video-embed{position:relative;width:100%;padding-bottom:56.25%;border-radius:14px;overflow:hidden;margin-bottom:24px;background:#000;}
.video-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}

/* List page styles */
.list-hero{background:var(--gold);padding:2.5rem 1.5rem;text-align:center;border-radius:16px;margin-bottom:1.5rem;position:relative;overflow:hidden;}
.list-hero::before{content:'';position:absolute;top:-60px;right:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.07);}
.list-hero::after{content:'';position:absolute;bottom:-50px;left:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.05);}
.list-hero h1{font-size:clamp(26px,4vw,38px);font-weight:800;color:#fff;margin-bottom:8px;position:relative;}
.list-hero p{font-size:15px;color:rgba(255,255,255,.85);max-width:480px;margin:0 auto;position:relative;}
.post-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
.post-card{border:1px solid var(--border);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;transition:box-shadow .2s,transform .2s;display:block;background:#fff;}
.post-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-2px);}
.post-card-img{width:100%;height:160px;object-fit:cover;object-position:center 8%;background:var(--cream);}
.post-card-body{padding:16px;}
.post-card-date{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
.post-card-title{font-size:16px;font-weight:700;margin-bottom:6px;line-height:1.35;}
.post-card-summary{font-size:13px;color:#666;line-height:1.6;}
.empty-state{color:var(--muted);font-size:14px;text-align:center;padding:40px 0;}
.wrap-wide{max-width:1240px;}
@media(max-width:600px){.wrap{padding:20px 5% 48px;}}
</style>
</head>
<body>
${HEADER}
<div class="wrap${wide ? ' wrap-wide' : ''}">
${bodyHtml}
</div>
${FOOTER}
${FOOTER_PLAYER}
${DONATE_SCRIPT}
</body>
</html>`;
}

function buildCollection(collectionFolder, config) {
  const srcDir = path.join(CONTENT_DIR, collectionFolder);
  if (!fs.existsSync(srcDir)) {
    console.log(`No content folder for ${collectionFolder}, skipping.`);
    return;
  }

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md'));
  const posts = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = slugFromFilename(file);
    const bodyHtml = marked.parse(content || '');

    const post = {
      slug,
      title: data.title || 'Untitled',
      date: data.date || null,
      dateFormatted: formatDate(data.date),
      summary: data.summary || '',
      image: data.image || null,
      image_position: data.image_position || null,
      url: `/${config.urlPath}/${slug}/`,
      // Collection-specific extra fields
      tags: data.tags || [],
      category: data.category || null,
      entry_type: data.entry_type || null,
      submitted_by: data.submitted_by || null,
      preacher: data.preacher || null,
      preacher_bio: data.preacher_bio || null,
      series: data.series || null,
      youtube_id: data.youtube_id || null,
      audio_url: data.audio_url || null,
      // Event-specific fields
      event_date: data.event_date || null,
      event_date_formatted: formatDate(data.event_date),
      event_time: data.event_time || null,
      location: data.location || null,
      tag: data.tag || null,
      past: data.past || false,
      price: data.price || null,
      price_currency: data.price_currency || null,
      // Daily Bread-specific fields
      scripture_ref: data.scripture_ref || null,
      scripture_text: data.scripture_text || null,
      prayer: data.prayer || null,
    };

    posts.push({ ...post, bodyHtml, raw: data });
  }

  // Sort newest first
  posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Write JSON index (for the listing page to fetch client-side, if needed)
  const indexJsonPath = path.join(srcDir, 'index.json');
  fs.writeFileSync(
    indexJsonPath,
    JSON.stringify(posts.map(({ bodyHtml, raw, ...rest }) => rest), null, 2)
  );

  // Generate individual post pages
  const outDir = path.join(ROOT, config.urlPath);
  for (const post of posts) {
    const postDir = path.join(outDir, post.slug);
    fs.mkdirSync(postDir, { recursive: true });

    let mediaHtml = '';
    if (post.youtube_id) {
      mediaHtml += `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${escapeHtml(post.youtube_id)}" title="${escapeHtml(post.title)}" allowfullscreen></iframe></div>`;
    }
    if (post.audio_url) {
      if (post.audio_url.includes('mixcloud.com')) {
        const mixPath = post.audio_url.replace('https://www.mixcloud.com', '').replace(/\/$/, '') + '/';
        const mixEmbed = `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mixPath)}`;
        mediaHtml += `<div style="margin-bottom:24px;"><iframe width="100%" height="120" src="${mixEmbed}" frameborder="0" allowfullscreen allow="autoplay"></iframe></div>`;
      } else {
        mediaHtml += `<audio controls style="width:100%;margin-bottom:24px;"><source src="${escapeHtml(post.audio_url)}"></audio>`;
      }
    }
    if (post.image && !post.youtube_id) {
      mediaHtml += `<img class="post-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">`;
    }

    // Some entries (esp. Preaching & Teaching) only have a one-line body in the CMS
    // ("How to be Street Smart") with the real substance sitting unused in `summary`.
    // When the raw body is too thin to stand as a page on its own, promote the
    // summary into the visible body instead of leaving the page almost empty.
    const rawBodyWordCount = (post.bodyHtml || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    let effectiveBodyHtml = post.bodyHtml;
    if (rawBodyWordCount < 25 && post.summary) {
      const shortLine = (post.bodyHtml || '').replace(/<\/?p>/g, '').trim();
      effectiveBodyHtml = (shortLine ? `<p style="font-weight:700;color:var(--gold-dark);">${shortLine}</p>` : '')
        + `<p>${escapeHtml(post.summary)}</p>`;
      if (post.preacher) {
        effectiveBodyHtml += `<p>This teaching is part of Sunny 88.7 FM's Preaching &amp; Teaching lineup${post.series ? `, part of the <em>${escapeHtml(post.series)}</em> series` : ''}. Tune in to Sunny 88.7 FM or stream live at <a href="/listen-live/">sunnygh.com/listen-live</a> to catch more from ${escapeHtml(post.preacher)} and our other daily preachers.</p>`;
      }
    }

    let metaParts = [];
    if (post.dateFormatted) metaParts.push(post.dateFormatted);
    if (post.preacher) metaParts.push(`Preacher: ${escapeHtml(post.preacher)}`);
    if (post.submitted_by) metaParts.push(`Submitted by: ${escapeHtml(post.submitted_by)}`);
    if (post.series) metaParts.push(`Series: ${escapeHtml(post.series)}`);

    let tagsHtml = '';
    const allTags = [
      ...(post.tags || []),
      ...(post.category ? [post.category] : []),
      ...(post.entry_type ? [post.entry_type] : []),
    ];
    if (allTags.length) {
      tagsHtml = `<div style="margin-bottom:16px;">${allTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }

    const dailyBreadHtml = config.urlPath === 'daily-bread' && (post.scripture_text || post.scripture_ref) ? `
      <div style="background:linear-gradient(135deg,#1a1200 0%,#0A0E1A 100%);border-radius:14px;padding:32px 28px;margin-bottom:28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#D4AF37;font-weight:700;margin-bottom:14px;">📖 Today's Scripture</div>
        ${post.scripture_text ? `<div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic;line-height:1.7;color:#fff;margin-bottom:10px;">"${escapeHtml(post.scripture_text)}"</div>` : ''}
        ${post.scripture_ref ? `<div style="font-size:14px;color:#D4AF37;font-weight:700;">— ${escapeHtml(post.scripture_ref)}</div>` : ''}
      </div>
    ` : '';

    const dailyBreadPrayerHtml = config.urlPath === 'daily-bread' && post.prayer ? `
      <div style="background:var(--cream);border-left:4px solid var(--gold-dark);border-radius:8px;padding:24px 26px;margin:28px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:10px;">🙏 Prayer</div>
        <div style="font-size:15px;line-height:1.8;color:var(--dark);">${escapeHtml(post.prayer)}</div>
      </div>
    ` : '';

    const dailyBreadShareHtml = config.urlPath === 'daily-bread' ? `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:28px 0;">
        <a href="https://wa.me/?text=${encodeURIComponent((post.scripture_text ? '"' + post.scripture_text + '" — ' + (post.scripture_ref || '') + '\n\n' : '') + post.title + '\n\nhttps://sunnygh.com' + post.url)}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">💬 Share with a Friend</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://sunnygh.com' + post.url)}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#1877f2;color:#fff;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Share on Facebook</a>
      </div>
    ` : '';

    const eventInfoHtml = config.urlPath === 'events' ? `
      <div style="background:var(--cream);border-radius:12px;padding:20px 24px;margin-bottom:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
        ${post.event_date_formatted ? `<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">📅 Date</div><div style="font-size:15px;font-weight:700;">${escapeHtml(post.event_date_formatted)}</div></div>` : ''}
        ${post.event_time ? `<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">🕐 Time</div><div style="font-size:15px;font-weight:700;">${escapeHtml(post.event_time)}</div></div>` : ''}
        ${post.location ? `<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">📍 Location</div><div style="font-size:15px;font-weight:700;">${escapeHtml(post.location)}</div></div>` : ''}
        ${post.tag ? `<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">🏷️ Type</div><div style="font-size:15px;font-weight:700;">${escapeHtml(post.tag)}</div></div>` : ''}
      </div>
      <a href="https://wa.me/233545223324?text=${encodeURIComponent('Hi, I would like to register for ' + post.title)}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:24px;">💬 Register via WhatsApp</a>
    ` : '';

    const preacherBioHtml = post.preacher_bio ? `
      <div style="background:var(--cream);border-radius:12px;padding:20px 24px;margin:24px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:8px;">About ${escapeHtml(post.preacher || 'the Preacher')}</div>
        <div style="font-size:14px;line-height:1.75;color:#444;">${escapeHtml(post.preacher_bio)}</div>
      </div>
    ` : '';

    const ttsSourceHtml = [dailyBreadHtml, effectiveBodyHtml, preacherBioHtml, dailyBreadPrayerHtml].filter(Boolean).join(' ');
    const ttsSentences = splitIntoSentences(htmlToPlainText(ttsSourceHtml));
    const ttsSentencesJson = JSON.stringify(ttsSentences).replace(/</g, '\\u003c');

    const ttsPlayerHtml = ttsSentences.length ? `
      <div style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin:20px 0 28px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <button id="tts-play-btn" onclick="ttsToggle()" aria-label="Listen to the article" style="width:44px;height:44px;border-radius:50%;background:var(--gold);border:none;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">&#9654;</button>
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:700;">Listen to the article now</div>
            <div style="font-size:12px;color:var(--muted);">Text-to-speech, powered by your browser</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <button onclick="ttsSkip(-1)" aria-label="Back 10 seconds" style="background:none;border:none;cursor:pointer;font-size:12px;color:#333;font-weight:700;">&#8630;10</button>
            <button onclick="ttsCycleSpeed()" id="tts-speed-btn" style="border:1px solid var(--border);border-radius:20px;padding:4px 10px;background:none;font-size:12px;font-weight:700;cursor:pointer;">1.0x</button>
            <button onclick="ttsSkip(1)" aria-label="Forward 10 seconds" style="background:none;border:none;cursor:pointer;font-size:12px;color:#333;font-weight:700;">10&#8631;</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:12px;">
          <input type="range" id="tts-progress" min="0" max="100" value="0" oninput="ttsSeek(this.value)" style="flex:1;">
          <span style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;">&#128266;</span>
            <input type="range" id="tts-volume" min="0" max="1" step="0.1" value="1" style="width:70px;">
          </span>
        </div>
      </div>
      <script>
      (function(){
        var ttsSentences = ${ttsSentencesJson};
        var ttsIdx = 0, ttsRate = 1, ttsPlaying = false;
        function ttsUpdateProgress(){
          var bar = document.getElementById('tts-progress');
          if (bar) bar.value = ttsSentences.length ? Math.round((ttsIdx / ttsSentences.length) * 100) : 0;
        }
        function ttsUpdateBtn(){
          var btn = document.getElementById('tts-play-btn');
          if (btn) btn.innerHTML = ttsPlaying ? '&#10074;&#10074;' : '&#9654;';
        }
        function ttsSpeakFrom(i){
          if (!('speechSynthesis' in window)) return;
          window.speechSynthesis.cancel();
          if (i >= ttsSentences.length || i < 0){ ttsIdx = 0; ttsPlaying = false; ttsUpdateBtn(); ttsUpdateProgress(); return; }
          ttsIdx = i;
          ttsUpdateProgress();
          var volEl = document.getElementById('tts-volume');
          var utter = new SpeechSynthesisUtterance(ttsSentences[i]);
          utter.rate = ttsRate;
          utter.volume = volEl ? parseFloat(volEl.value) : 1;
          utter.onend = function(){ if (ttsPlaying) ttsSpeakFrom(i + 1); };
          window.speechSynthesis.speak(utter);
        }
        window.ttsToggle = function(){
          if (!('speechSynthesis' in window)){ alert('Text-to-speech is not supported in this browser.'); return; }
          if (ttsPlaying){ window.speechSynthesis.cancel(); ttsPlaying = false; ttsUpdateBtn(); }
          else { ttsPlaying = true; ttsUpdateBtn(); ttsSpeakFrom(ttsIdx); }
        };
        window.ttsSkip = function(dir){
          var next = Math.min(ttsSentences.length - 1, Math.max(0, ttsIdx + dir * 2));
          if (ttsPlaying) ttsSpeakFrom(next); else { ttsIdx = next; ttsUpdateProgress(); }
        };
        window.ttsCycleSpeed = function(){
          var speeds = [1, 1.25, 1.5, 2, 0.75];
          ttsRate = speeds[(speeds.indexOf(ttsRate) + 1) % speeds.length];
          document.getElementById('tts-speed-btn').textContent = ttsRate + 'x';
          if (ttsPlaying) ttsSpeakFrom(ttsIdx);
        };
        window.ttsSeek = function(pct){
          var idx = Math.min(ttsSentences.length - 1, Math.max(0, Math.round((pct / 100) * ttsSentences.length)));
          if (ttsPlaying) ttsSpeakFrom(idx); else ttsIdx = idx;
        };
        document.addEventListener('visibilitychange', function(){
          if (document.hidden && ttsPlaying){ window.speechSynthesis.cancel(); ttsPlaying = false; ttsUpdateBtn(); }
        });
      })();
      </script>
    ` : '';

    const bodyHtml = `
      <a href="/${config.urlPath}/" class="back-link">&larr; Back to ${escapeHtml(config.label)}</a>
      <div class="eyebrow">${escapeHtml(config.label)}</div>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">${metaParts.join(' &middot; ')}</div>
      ${tagsHtml}
      ${mediaHtml}
      ${ttsPlayerHtml}
      ${dailyBreadHtml}
      ${eventInfoHtml}
      <div class="post-body">${effectiveBodyHtml}</div>
      ${preacherBioHtml}
      ${dailyBreadPrayerHtml}
      ${dailyBreadShareHtml}
    `;
    

    let eventJsonLd = null;
    if (config.urlPath === 'events' && post.event_date) {
      eventJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: post.title,
        startDate: post.event_date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: post.location || 'Ghana',
          address: post.location || 'Ghana',
        },
        image: post.image ? [`https://sunnygh.com${post.image}`] : undefined,
        description: post.summary || post.title,
        organizer: {
          '@type': 'Organization',
          name: 'Sunny 88.7 FM',
          url: 'https://sunnygh.com',
        },
        offers: post.price ? {
          '@type': 'Offer',
          price: String(post.price).replace(/[^0-9.]/g, ''),
          priceCurrency: post.price_currency || 'GHS',
          availability: 'https://schema.org/InStock',
          url: `https://sunnygh.com/${config.urlPath}/${post.slug}/`,
        } : undefined,
      };
    }

    const html = pageShell({
      title: post.title,
      description: post.summary || post.title,
      bodyHtml,
      ogImage: post.image,
      jsonLd: eventJsonLd,
    });

    fs.writeFileSync(path.join(postDir, 'index.html'), html);
  }

  // Generate the listing page
  let cardsHtml;
  if (posts.length === 0) {
    cardsHtml = `<div class="empty-state">No posts yet — check back soon!</div>`;
  } else {
    cardsHtml = `<div class="post-grid">` + posts.map(post => {
      const img = post.image
        ? `<img class="post-card-img" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}"${post.image_position ? ` style="object-position:${escapeHtml(post.image_position)};"` : ''}>`
        : config.urlPath === 'daily-bread'
          ? `<div class="post-card-img" style="display:flex;align-items:center;justify-content:center;font-size:32px;background:linear-gradient(135deg,#1a1200,#0A0E1A);">📖</div>`
          : `<div class="post-card-img" style="display:flex;align-items:center;justify-content:center;font-size:32px;">${config.urlPath === 'preaching-teaching' ? '📖' : config.urlPath === 'prayer-testimonies' ? '🙏' : config.urlPath === 'lifestyle' ? '✨' : '📰'}</div>`;
      const cardSummary = config.urlPath === 'daily-bread' && post.scripture_ref
        ? `<span style="color:var(--gold-dark);font-weight:700;">${escapeHtml(post.scripture_ref)}</span> — ${escapeHtml(post.summary)}`
        : escapeHtml(post.summary);
      return `
        <a href="${post.url}" class="post-card">
          ${img}
          <div class="post-card-body">
            <div class="post-card-date">${post.dateFormatted}</div>
            <div class="post-card-title">${escapeHtml(post.title)}</div>
            <div class="post-card-summary">${cardSummary}</div>
          </div>
        </a>
      `;
    }).join('') + `</div>`;
  }

  const testimonyForm = config.urlPath === 'prayer-testimonies' ? `
    <div style="background:var(--cream);border-radius:16px;padding:2rem 1.5rem;margin-top:2rem;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-dark);font-weight:700;margin-bottom:8px;">Share With Us</div>
      <h2 style="font-size:clamp(20px,3vw,28px);font-weight:800;margin-bottom:8px;">Share Your Testimony</h2>
      <p style="font-size:14px;color:#555;margin-bottom:24px;">Has God done something amazing in your life? We'd love to hear it — and share it to encourage others.</p>
      <form name="testimony-submission" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/prayer-testimonies/?submitted=true" style="display:grid;gap:14px;">
        <input type="hidden" name="form-name" value="testimony-submission">
        <p style="display:none;"><label>Don't fill this out: <input name="bot-field"></label></p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px;">Your Name *</label>
            <input type="text" name="name" required placeholder="Full name" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px;">Phone / WhatsApp</label>
            <input type="tel" name="phone" placeholder="e.g. 054 522 3324" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;">
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px;">Your Testimony *</label>
          <textarea name="testimony" required rows="6" placeholder="Tell us what God has done in your life..." style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;resize:vertical;"></textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px;">May we share this on air or online?</label>
          <select name="permission" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:#fff;">
            <option value="yes-both">Yes — on air and online</option>
            <option value="yes-online">Online only</option>
            <option value="yes-onair">On air only</option>
            <option value="no">No — just for your team</option>
          </select>
        </div>
        <button type="submit" style="background:var(--gold);color:#fff;border:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;width:fit-content;">🙏 Submit My Testimony</button>
      </form>
    </div>
  ` : '';

  const listBody = `
    <div class="list-hero">
      <h1>${getCollectionEmoji(config.urlPath)} ${escapeHtml(config.label)}</h1>
      <p>${getCollectionTagline(config.urlPath)}</p>
    </div>
    ${cardsHtml}
    ${testimonyForm}
  `;

  const listHtml = pageShell({
    title: config.label,
    description: getCollectionTagline(config.urlPath),
    bodyHtml: listBody,
    wide: true,
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), listHtml);

  console.log(`Built ${posts.length} post(s) for ${config.label}`);
  return posts;
}

function getCollectionEmoji(urlPath) {
  switch (urlPath) {
    case 'news': return '📰';
    case 'lifestyle': return '✨';
    case 'prayer-testimonies': return '🙏';
    case 'preaching-teaching': return '📖';
    case 'events': return '📅';
    default: return '';
  }
}

function getCollectionTagline(urlPath) {
  switch (urlPath) {
    case 'news': return 'The latest news and announcements from Sunny 88.7 FM and our community.';
    case 'lifestyle': return "Faith is not just for Sundays. It's how we love, parent, eat, work, and live.";
    case 'prayer-testimonies': return "You don't have to carry it alone. Bring your needs to God with us — and be encouraged by what He has already done.";
    case 'preaching-teaching': return 'Catch up on sermons and teachings from our roster of pastors and ministers.';
    case 'events': return 'Crusades, conferences, and community programs from Sunny 88.7 FM.';
    default: return '';
  }
}

// ── LEGAL PAGES (Privacy Policy / Terms) ──
// Required for Google AdSense approval and general compliance.
function buildLegalPages() {
  const lastUpdated = formatDate(new Date().toISOString());

  const privacyBody = `
    <div class="eyebrow">Legal</div>
    <h1 class="post-title">Privacy Policy</h1>
    <div class="post-meta">Last updated: ${lastUpdated}</div>
    <div class="post-body">
      <p>This Privacy Policy explains how Sunny 88.7 FM ("Sunny FM", "we", "us", "our"), operated by Sky Broadcasting Ltd., collects, uses, and protects information when you visit sunnygh.com (the "Site") or use our streaming, TV, and related services.</p>

      <h2>Information We Collect</h2>
      <p>We collect information in the following ways:</p>
      <ul>
        <li><strong>Automatically collected data:</strong> When you visit the Site, we use Google Analytics to collect standard usage data such as pages visited, time on site, device and browser type, and approximate location, to help us understand how the Site is used.</li>
        <li><strong>Cookies and similar technologies:</strong> We and our partners (including Google) use cookies and similar technologies to operate the Site, remember preferences, and serve relevant advertising.</li>
        <li><strong>Information you provide directly:</strong> If you submit a prayer request or testimony, register for an event, contact us, or make a donation, we collect the information you choose to provide, such as your name, phone number, email address, and message content.</li>
        <li><strong>Payment information:</strong> Donations and certain payments are processed by Paystack. We do not store your card details — these are handled directly by Paystack under its own privacy and security policies.</li>
      </ul>

      <h2>Advertising and Google AdSense</h2>
      <p>Sunny FM uses Google AdSense to display advertising on the Site. Google, as a third-party vendor, uses cookies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads based on your visit to our Site and/or other sites on the internet.</p>
      <p>You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ads Settings</a>. Visitors from the EEA, UK, and Switzerland are shown a consent management prompt allowing them to accept or decline non-essential cookies and personalized advertising before any such data is collected.</p>

      <h2>How We Use Information</h2>
      <ul>
        <li>To operate, maintain, and improve the Site and our broadcasts</li>
        <li>To respond to prayer requests, testimonies, event registrations, and enquiries</li>
        <li>To process donations and advertising bookings</li>
        <li>To understand Site usage through aggregated analytics</li>
        <li>To display relevant advertising through Google AdSense</li>
      </ul>

      <h2>Sharing of Information</h2>
      <p>We do not sell your personal information. We may share information with service providers who help us operate the Site (such as Google, for analytics and advertising, and Paystack, for payment processing), or when required by law.</p>

      <h2>Your Choices</h2>
      <p>You can control cookies through your browser settings, and manage ad personalization through <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ads Settings</a>. If you are in the EEA, UK, or Switzerland, you can update your consent choices at any time via the consent prompt on the Site.</p>

      <h2>Children's Privacy</h2>
      <p>The Site is intended for a general audience and is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

      <h2>Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date.</p>

      <h2>Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:info@sunnygh.com">info@sunnygh.com</a> or call 054 522 3324. Our address is 45 Hilla Limann Avenue, North Ridge, Accra, Ghana.</p>
    </div>
  `;

  const termsBody = `
    <div class="eyebrow">Legal</div>
    <h1 class="post-title">Terms of Use</h1>
    <div class="post-meta">Last updated: ${lastUpdated}</div>
    <div class="post-body">
      <p>Welcome to sunnygh.com, operated by Sunny 88.7 FM (Sky Broadcasting Ltd.). By accessing or using this Site, you agree to these Terms of Use.</p>

      <h2>Use of the Site</h2>
      <p>You may use the Site for lawful, personal, non-commercial purposes, including listening to our livestream, watching Sunny TV, reading content, and engaging with our community features (prayer requests, testimonies, event registration).</p>

      <h2>Content</h2>
      <p>All content on this Site — including articles, images, logos, audio, and video — is owned by or licensed to Sunny 88.7 FM and is protected by copyright. You may not reproduce, redistribute, or use our content for commercial purposes without written permission.</p>

      <h2>User Submissions</h2>
      <p>If you submit a testimony, prayer request, or other content to us, you grant Sunny FM permission to use, edit, and share it (on air and/or online) according to the sharing preference you select at submission.</p>

      <h2>Donations and Payments</h2>
      <p>Donations and advertising payments made through the Site are processed securely via Paystack. All donations are voluntary and non-refundable unless otherwise agreed in writing.</p>

      <h2>Third-Party Links and Advertising</h2>
      <p>The Site may display advertising, including through Google AdSense, and may link to third-party websites. We are not responsible for the content or practices of third-party sites.</p>

      <h2>Disclaimer</h2>
      <p>The Site and its content are provided "as is" without warranties of any kind. We do our best to keep information accurate and up to date but cannot guarantee it is error-free.</p>

      <h2>Changes</h2>
      <p>We may update these Terms from time to time. Continued use of the Site after changes constitutes acceptance of the updated Terms.</p>

      <h2>Contact Us</h2>
      <p>Questions about these Terms can be sent to <a href="mailto:info@sunnygh.com">info@sunnygh.com</a> or 054 522 3324.</p>
    </div>
  `;

  const pages = [
    { slug: 'privacy-policy', title: 'Privacy Policy', description: "Sunny 88.7 FM's Privacy Policy — how we collect, use, and protect your information.", body: privacyBody },
    { slug: 'terms', title: 'Terms of Use', description: "Sunny 88.7 FM's Terms of Use for sunnygh.com.", body: termsBody },
  ];

  for (const page of pages) {
    const html = pageShell({
      title: page.title,
      description: page.description,
      bodyHtml: page.body,
    });
    const outDir = path.join(ROOT, page.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  }
  console.log('Built legal pages: privacy-policy, terms');
}
buildLegalPages();

function buildSelfServiceAdvertPage() {
  const body = `
    <div class="eyebrow">Self Service</div>
    <h1 class="post-title">Self Service Advert</h1>
    <div class="post-body">
      <p>Promote your business or event on sunnygh.com with a self service advert. Upload your ad, pay online, and we'll place it in our homepage advertising spot after confirming your payment.</p>

      <h2>Benefits</h2>
      <ul>
        <li><strong>Affordable.</strong> Starting from GH₵20 per day.</li>
        <li><strong>Flexible.</strong> Advertise from 1 to 30 days.</li>
        <li><strong>Simple.</strong> A website is optional — your customers can reach you by phone, WhatsApp, or Instagram.</li>
        <li><strong>Convenient.</strong> Pay online with any mobile money wallet or card via Paystack.</li>
      </ul>

      <p>Once you submit and pay, our team reviews and places your advert on the homepage within 24 hours. If you have questions, email <a href="mailto:info@sunnygh.com">info@sunnygh.com</a>.</p>
    </div>

    <form id="ssa-form" name="self-service-ad" method="POST" action="/self-service-advert/thank-you/" enctype="multipart/form-data" data-netlify="true" netlify-honeypot="bot-field" style="margin-top:32px;border:1px solid var(--border);border-radius:14px;padding:24px;">
      <input type="hidden" name="form-name" value="self-service-ad">
      <p style="display:none;"><label>Don't fill this out: <input name="bot-field"></label></p>
      <input type="hidden" name="payment_reference" id="ssa-payment-reference">
      <input type="hidden" name="amount_paid" id="ssa-amount-paid">

      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Business / advert name</label>
        <input type="text" name="business_name" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Ad image</label>
        <input type="file" name="image_upload" accept="image/*" required style="width:100%;font-size:14px;">
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Short description (shown on your ad card)</label>
        <textarea name="description" required maxlength="100" rows="2" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;"></textarea>
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Link (website, WhatsApp link, or Instagram — required)</label>
        <input type="text" name="link" required placeholder="https://wa.me/233..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div>
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Your email (for receipt)</label>
          <input type="email" name="email" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Your phone / WhatsApp</label>
          <input type="text" name="advertiser_contact" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Duration</label>
        <select name="duration_days" id="ssa-duration" onchange="ssaCalcPrice()" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7" selected>7 days</option>
          <option value="14">14 days</option>
          <option value="21">21 days</option>
          <option value="30">30 days</option>
        </select>
      </div>

      <div style="display:flex;align-items:baseline;justify-content:space-between;padding:14px 16px;background:var(--cream);border-radius:8px;margin-bottom:20px;">
        <span style="font-size:13px;color:var(--muted);">Total (GH₵20/day)</span>
        <span id="ssa-price" style="font-size:22px;font-weight:800;">GH₵140</span>
      </div>

      <button type="button" id="ssa-submit-btn" onclick="ssaSubmit(event)" style="width:100%;background:var(--gold-dark);color:#fff;border:none;padding:14px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">Pay GH₵140 &amp; submit advert</button>
      <p style="font-size:12px;color:var(--muted);margin-top:10px;text-align:center;">You'll be asked to pay securely via Paystack before your advert is submitted for review.</p>
    </form>

    <script>
    function ssaCalcPrice(){
      var days = parseInt(document.getElementById('ssa-duration').value, 10);
      var price = days * 20;
      document.getElementById('ssa-price').textContent = 'GH₵' + price;
      document.getElementById('ssa-submit-btn').textContent = 'Pay GH₵' + price + ' & submit advert';
      return price;
    }
    ssaCalcPrice();

    function ssaSubmit(e){
      e.preventDefault();
      var form = document.getElementById('ssa-form');
      var required = ['business_name','email','advertiser_contact','description','link','image_upload'];
      for (var i = 0; i < required.length; i++){
        var el = form.elements[required[i]];
        if (!el || !el.value){
          alert('Please fill in all fields before continuing.');
          return;
        }
      }
      var price = ssaCalcPrice();
      var email = form.elements['email'].value;
      var btn = document.getElementById('ssa-submit-btn');

      function launch(){
        var handler = PaystackPop.setup({
          key: 'pk_live_de0fc9e3b71f670c1d8e9cd4e3be3f125c9ceb8a',
          email: email,
          amount: price * 100,
          currency: 'GHS',
          ref: 'SUNNYADS' + Math.floor(Math.random() * 1000000000),
          callback: function(response){
            form.elements['payment_reference'].value = response.reference;
            form.elements['amount_paid'].value = price;
            btn.textContent = 'Submitting…';
            btn.disabled = true;
            form.submit();
          },
          onClose: function(){}
        });
        handler.openIframe();
      }

      if (window.PaystackPop){
        launch();
      } else {
        var s = document.createElement('script');
        s.src = 'https://js.paystack.co/v1/inline.js';
        s.onload = launch;
        s.onerror = function(){ alert('Could not load the payment form. Please check your connection and try again.'); };
        document.head.appendChild(s);
      }
    }
    </script>
  `;

  const html = pageShell({
    title: 'Self Service Advert',
    description: "Promote your business on sunnygh.com — upload your own advert, pay online, and we'll place it on the homepage.",
    bodyHtml: body,
  });
  fs.mkdirSync(path.join(ROOT, 'self-service-advert'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'self-service-advert', 'index.html'), html);

  const thankYouBody = `
    <div class="eyebrow">Self Service</div>
    <h1 class="post-title">Thanks — we've got your advert</h1>
    <div class="post-body">
      <p>Your payment and advert details have been submitted. Our team will verify your payment and place your advert on the homepage within 24 hours.</p>
      <p>If you have any questions, email <a href="mailto:info@sunnygh.com">info@sunnygh.com</a> or call 054 522 3324.</p>
      <p><a href="/" class="back-link">&larr; Back to sunnygh.com</a></p>
    </div>
  `;
  const thankYouHtml = pageShell({
    title: 'Advert submitted',
    description: 'Your self service advert submission was received.',
    bodyHtml: thankYouBody,
  });
  fs.mkdirSync(path.join(ROOT, 'self-service-advert', 'thank-you'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'self-service-advert', 'thank-you', 'index.html'), thankYouHtml);

  console.log('Built self-service-advert page and thank-you page');
}
buildSelfServiceAdvertPage();


// The homepage previously showed "Loading news..." / "Loading events..." placeholders
// that only filled in via client-side JS after fetching /content/*/index.json.
// That meant crawlers (including AdSense's review) could see an near-empty homepage.
// This renders the first batch of cards directly into index.html at build time;
// the existing client-side JS still runs afterward to keep them fresh.
function renderNewsCardHtml(p) {
  const img = p.image
    ? `<img class="news-card-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title || '')}">`
    : `<div class="news-card-img-placeholder">📰</div>`;
  const tags = [].concat(p.tags || [], p.category ? [p.category] : []);
  const cat = tags.length ? tags[0] : 'News';
  return `<a href="${p.url}" class="news-card">${img}<div class="news-card-body"><div class="news-card-cat">${escapeHtml(cat)}</div><div class="news-card-title">${escapeHtml(p.title || '')}</div><div class="news-card-date">${p.dateFormatted || ''}</div></div></a>`;
}

function renderEventCardHtml(p) {
  const img = p.image
    ? `<img class="event-card-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title || '')}">`
    : `<div class="event-card-img-placeholder">📅</div>`;
  const date = p.event_date_formatted || '';
  const loc = p.location ? '📍 ' + escapeHtml(p.location) : '';
  return `<a href="${p.url}" class="event-card">${img}<div class="event-card-body"><div class="event-card-title">${escapeHtml(p.title || '')}</div><div class="event-card-meta">${[date, loc].filter(Boolean).join(' · ')}</div><div class="event-card-btn">Register Now →</div></div></a>`;
}

function injectHomepageCards(collectionsPosts) {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  const newsPosts = (collectionsPosts['news'] || []).slice(0, 6);
  const newsHtml = newsPosts.length
    ? newsPosts.map(renderNewsCardHtml).join('')
    : `<div style="color:var(--muted);font-size:13px;padding:20px 0;">No news yet.</div>`;
  html = html.replace(
    /(<div class="scroll-row" id="news-row">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*\n\s*<!-- PREACHING)/,
    (match, open, close) => `${open}${newsHtml}${close}`
  );

  const upcomingEvents = (collectionsPosts['events'] || []).filter(p => !p.past).slice(0, 6);
  const eventsHtml = upcomingEvents.length
    ? upcomingEvents.map(renderEventCardHtml).join('')
    : `<div style="color:var(--muted);font-size:13px;padding:20px 0;">No upcoming events right now.</div>`;
  html = html.replace(
    /(<div class="scroll-row" id="events-row">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*\n\s*<!-- ADVERTISE PROMO BANNER)/,
    (match, open, close) => `${open}${eventsHtml}${close}`
  );

  fs.writeFileSync(indexPath, html);
  console.log(`Injected ${newsPosts.length} news card(s) and ${upcomingEvents.length} event card(s) into homepage.`);
}

// ── LINK HOMEPAGE PREACHING & TEACHING CARDS ──
// These cards are hand-maintained on the homepage (photo + name + schedule) and were
// plain <div>s with no link at all — clicking them did nothing. This wires each card
// to its matching post in the Preaching & Teaching collection by preacher name, so
// they actually navigate somewhere; falls back to the section listing page if no
// confident match is found.
function normalizeNameWords(name) {
  const titles = new Set(['bishop', 'rev', 'reverend', 'pastor', 'dr', 'prophet', 'apostle', 'rev.', 'dr.', 'na', 'international', 'n.a.', 'n.a']);
  return (name || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !titles.has(w));
}

function findPreachingUrl(collectionsPosts, cardName) {
  const posts = collectionsPosts['preaching-teaching'] || [];
  const cardWords = normalizeNameWords(cardName);
  let best = null;
  let bestScore = 0;
  for (const post of posts) {
    if (!post.preacher) continue;
    const postWords = normalizeNameWords(post.preacher);
    const score = cardWords.filter(w => postWords.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = post;
    }
  }
  return best && bestScore > 0 ? best.url : '/preaching-teaching/';
}

function linkHomepagePreachingCards(collectionsPosts) {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  html = html.replace(
    /<div class="preach-card">([\s\S]*?)<div class="preach-card-name">([^<]+)<\/div>([\s\S]*?)<\/div>\s*<\/div>/g,
    (match, before, name, after) => {
      const url = findPreachingUrl(collectionsPosts, name);
      return `<a href="${url}" class="preach-card" style="text-decoration:none;color:inherit;display:block;">${before}<div class="preach-card-name">${name}</div>${after}</div></a>`;
    }
  );

  fs.writeFileSync(indexPath, html);
  console.log('Linked homepage Preaching & Teaching cards to their post pages.');
}

// ── SELF SERVICE ADS ──
// Reads content/self-service-ads/*.md (added manually via CMS after Kojo verifies
// payment on a submission) and returns the ones currently within their paid window.
function getActiveSelfServiceAds() {
  const dir = path.join(CONTENT_DIR, 'self-service-ads');
  if (!fs.existsSync(dir)) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ads = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { data } = matter(raw);
    if (!data.start_date || !data.business_name) continue;

    const start = new Date(data.start_date);
    start.setHours(0, 0, 0, 0);
    const durationDays = Number(data.duration_days) || 7;
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays);

    if (today >= start && today < end) {
      ads.push({
        business_name: data.business_name,
        image: data.image || null,
        description: data.description || '',
        link: data.link || '#',
      });
    }
  }
  return ads;
}

function renderSelfServiceAdCard(ad) {
  const img = ad.image
    ? `<img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.business_name)}" style="width:100%;height:120px;object-fit:cover;display:block;">`
    : `<div style="width:100%;height:120px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;">📢</div>`;
  return `
    <a href="${escapeHtml(ad.link)}" target="_blank" rel="noopener sponsored" style="display:block;text-decoration:none;color:inherit;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--white);">
      ${img}
      <div style="background:var(--navy,#16222E);color:#fff;padding:10px 12px;">
        <div style="font-size:12px;font-weight:700;margin-bottom:2px;">${escapeHtml(ad.business_name)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.75);">${escapeHtml(ad.description)}</div>
      </div>
    </a>
  `;
}

function injectSelfServiceAdsBox() {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const ads = getActiveSelfServiceAds();

  let boxHtml;
  if (ads.length === 0) {
    boxHtml = `
      <div class="section" id="self-service-ads-box">
        <div class="section-inner" style="max-width:480px;">
          <div style="border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:10px;">Self Service Adverts</div>
            <div style="font-size:14px;color:var(--muted);margin-bottom:14px;">Promote your business here from as little as GH₵20/day.</div>
            <a href="/self-service-advert/" style="display:inline-block;background:var(--gold-dark,#C4652C);color:#fff;font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">Upload Your Advert</a>
          </div>
        </div>
      </div>
    `;
  } else {
    const cardsHtml = ads.slice(0, 6).map(renderSelfServiceAdCard).join('');
    boxHtml = `
      <div class="section" id="self-service-ads-box">
        <div class="section-inner">
          <div class="section-hdr">
            <div class="section-title">Self Service Adverts</div>
            <a href="/self-service-advert/" class="section-see-all">Advertise here →</a>
          </div>
          <div class="scroll-row">${cardsHtml}</div>
        </div>
      </div>
    `;
  }

  if (html.includes('id="self-service-ads-box"')) {
    html = html.replace(
      /<div class="section" id="self-service-ads-box">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\n\s*(?=<!--)/,
      boxHtml.trim() + '\n\n'
    );
  } else {
    html = html.replace(
      /(<!-- ADVERTISE PROMO BANNER -->)/,
      boxHtml.trim() + '\n\n$1'
    );
  }

  fs.writeFileSync(indexPath, html);
  console.log(`Injected Self Service Ads box (${ads.length} active ad(s)).`);
}


const STATIC_PAGES = [
  { loc: 'https://sunnygh.com/', changefreq: 'daily', priority: '1.0' },
  { loc: 'https://sunnygh.com/listen-live/', changefreq: 'daily', priority: '0.9' },
  { loc: 'https://sunnygh.com/watch-tv/', changefreq: 'daily', priority: '0.9' },
  { loc: 'https://sunnygh.com/news/', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://sunnygh.com/events/', changefreq: 'weekly', priority: '0.8' },
  { loc: 'https://sunnygh.com/lifestyle/', changefreq: 'weekly', priority: '0.7' },
  { loc: 'https://sunnygh.com/preaching-teaching/', changefreq: 'weekly', priority: '0.7' },
  { loc: 'https://sunnygh.com/music-videos/', changefreq: 'weekly', priority: '0.7' },
  { loc: 'https://sunnygh.com/prayer-testimonies/', changefreq: 'weekly', priority: '0.6' },
  { loc: 'https://sunnygh.com/advertise/', changefreq: 'monthly', priority: '0.5' },
  { loc: 'https://sunnygh.com/self-service-advert/', changefreq: 'monthly', priority: '0.5' },
  { loc: 'https://sunnygh.com/privacy-policy/', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://sunnygh.com/terms/', changefreq: 'yearly', priority: '0.3' },
];

const allPostUrls = [];
const collectionsPosts = {};
for (const [folder, config] of Object.entries(COLLECTIONS)) {
  const posts = buildCollection(folder, config) || [];
  collectionsPosts[folder] = posts;
  for (const post of posts) {
    allPostUrls.push({
      loc: `https://sunnygh.com${post.url}`,
      changefreq: 'monthly',
      priority: '0.6',
      lastmod: post.date ? new Date(post.date).toISOString().split('T')[0] : null,
    });
  }
}

injectHomepageCards(collectionsPosts);
linkHomepagePreachingCards(collectionsPosts);
injectSelfServiceAdsBox();

// Generate sitemap.xml: static pages + every individual post
const sitemapEntries = [...STATIC_PAGES, ...allPostUrls];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map(e => `
  <url>
    <loc>${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}

</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml);
console.log(`Sitemap generated with ${sitemapEntries.length} URLs.`);

console.log('Build complete.');
