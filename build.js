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

    const bodyHtml = `
      <a href="/${config.urlPath}/" class="back-link">&larr; Back to ${escapeHtml(config.label)}</a>
      <div class="eyebrow">${escapeHtml(config.label)}</div>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">${metaParts.join(' &middot; ')}</div>
      ${tagsHtml}
      ${mediaHtml}
      ${dailyBreadHtml}
      ${eventInfoHtml}
      <div class="post-body">${post.bodyHtml}</div>
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

// Run build for each collection, collecting post URLs for the sitemap
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
];

const allPostUrls = [];
for (const [folder, config] of Object.entries(COLLECTIONS)) {
  const posts = buildCollection(folder, config) || [];
  for (const post of posts) {
    allPostUrls.push({
      loc: `https://sunnygh.com${post.url}`,
      changefreq: 'monthly',
      priority: '0.6',
      lastmod: post.date ? new Date(post.date).toISOString().split('T')[0] : null,
    });
  }
}

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
