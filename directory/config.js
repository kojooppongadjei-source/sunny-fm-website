/* Sunny Business Directory — shared config.
   Fill in the two Supabase values from: Supabase dashboard → Project Settings → API. */
window.SUNNY_DIR = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
  PAGE_SIZE: 20,
  LOGO_BUCKET: 'directory-logos',
  CATEGORIES: [
    'Agriculture, Fishing & Mining',
    'Automobile & Motorcycle',
    'Bars & Restaurants',
    'Building, Construction & Engineering',
    'Business Services',
    'Churches & Ministries',
    'Computers & Internet',
    'Education, Employment & Research',
    'Entertainment',
    'Events & Weddings',
    'Financial & Legal',
    'Health & Beauty',
    'Home & Garden',
    'Hotels & Guest Houses',
    'Manufacturing & Wholesale',
    'Media & Communication',
    'Public & Social Services',
    'Shops',
    'Sports & Leisure',
    'Tourism',
    'Transportation'
  ],
  REGIONS: [
    'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern',
    'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
    'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'
  ]
};

/* Small helpers shared by all directory pages */
window.SD = {
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  waNumber(n) {
    let d = String(n || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '233' + d.slice(1);
    if (d.length === 9) d = '233' + d;
    return d;
  },
  safeUrl(u) {
    if (!u) return '';
    let v = String(u).trim();
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { const x = new URL(v); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
  },
  initials(name) {
    const w = String(name || '').replace(/[^A-Za-z0-9 &]/g, ' ').split(/\s+/).filter(x => x && x !== '&');
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  },
  tint(name) {
    const tints = ['#E6F0FD', '#FFF3D6', '#E3F5EE', '#F1E9FB', '#FDE8E4', '#E4F4F8'];
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return tints[h % tints.length];
  },
  slugify(s) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
};
