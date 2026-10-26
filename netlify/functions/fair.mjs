// Sunny Free Breakfast & Early Christmas Discount Fair 2026 — vendor bookings API
// Route: /api/fair   Storage: Netlify Blobs (store "breakfast-fair-2026")
//
// Netlify environment variables:
//   FAIR_ADMIN_KEY             password for /fair/admin
//   FAIR_PAYSTACK_PUBLIC_KEY   Sunny Charities Paystack public key (pk_live_...)
//   FAIR_PAYSTACK_SECRET_KEY   Sunny Charities Paystack secret key (sk_live_...)
// If the Paystack keys are not set, vendors still register and the team confirms payment by phone.

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/fair" };

const PAYEE = "Sunny Charities";

const PACKS = {
  bronze:   { name: "Bronze",   price: 800,  items: ["A table", "Two chairs"] },
  silver:   { name: "Silver",   price: 2500, items: ["Booth space", "2 branding pull-ups", "1 voice note (SSD)"] },
  gold:     { name: "Gold",     price: 3500, items: ["Booth space", "2 branding pull-ups", "2 voice notes (IM Drive & SSD)"] },
  platinum: { name: "Platinum", price: 5000, items: ["Booth space", "2 branding pull-ups", "3 voice notes (IM Drive, PSF & SSD)"] },
};

// ---- Category caps --------------------------------------------------------
// Default places per category. Edit here, or live from /fair/admin (admin edits override these).
const DEFAULT_CAP = 2;
const CAPS = {
  // c1: 3,   // Bakery & pastries — e.g. half of last year's 6
};

const R = "Returning", N = "New for 2026";
const CATEGORIES = [
  ["Food & Drink", [
    ["Bakery & pastries", "Bread, pies, doughnuts and other baked goods", R],
    ["Snacks & street food", "Ready-to-eat snacks, fried and roasted favourites", R],
    ["Local Ghanaian meals", "Traditional cooked dishes such as kenkey and other local favourites", R],
    ["Healthy fast food", "Fresh, lighter ready-to-eat meals", R],
    ["Juices & natural drinks", "Fresh fruit juices and natural drinks", R],
    ["Specialty drinks (boba, coffee, tea)", "Boba, coffee, tea and other speciality drinks", R],
    ["Groceries & food market", "Everyday groceries and packaged foods", R],
    ["Honey & natural foods", "Honey, nuts and other natural food products", R],
    ["Fresh produce & farm products", "Fruit, vegetables and farm-fresh goods", R],
    ["Poultry & meat", "Chicken, meat and fish suppliers", R],
    ["Cakes & desserts", "Celebration and Christmas cakes, cupcakes, ice cream", N],
    ["Frozen foods & Christmas meats", "Turkey, goat, fish, sausages and other frozen foods", N],
    ["Rice, oils & Christmas staples", "Local rice, palm and vegetable oil, gari and other household staples", N],
    ["Shito, spices & sauces", "Local sauces, shito and seasoning blends", N],
    ["Local drinks (sobolo, asaana, tiger nut)", "Bottled traditional Ghanaian drinks", N],
    ["Non-alcoholic wines & Christmas drinks", "Family-friendly festive drinks", N],
  ]],
  ["Fashion & Accessories", [
    ["Women’s ready-to-wear", "Ready-made women’s clothing", R],
    ["Tailoring & custom made", "Made-to-measure outfits and tailoring services", R],
    ["African print & fabrics", "African print, kente and other fabrics", R],
    ["Jewelry", "Necklaces, earrings, bracelets and other jewelry", R],
    ["Millinery & accessories", "Hats, scarves, belts and hair accessories", R],
    ["Children’s wear", "Clothing for babies, boys and girls", R],
    ["Men’s fashion & traditional wear", "Kaftans, suits, smocks and shirts", N],
    ["Footwear", "Shoes, sandals and sneakers", N],
    ["Bags & leather goods", "Handbags, backpacks, wallets and belts", N],
    ["Wigs & hair extensions", "Wigs, weaves and extensions", N],
    ["Eyewear & watches", "Sunglasses, frames and watches", N],
    ["Baby & maternity", "Baby clothes, baby products and maternity wear", N],
  ]],
  ["Beauty & Wellness", [
    ["Skincare & body care", "Skincare, lotions and body products", R],
    ["Hair care", "Hair-care products and treatments", R],
    ["Health & wellness", "Nutrition, wellness and health products", R],
    ["Perfumes & body mists", "Perfumes, perfume oils and body mists", N],
    ["Natural oils, shea butter & black soap", "Locally made natural skincare and gift sets", N],
    ["Makeup, nails & lashes", "Makeup products and services, nail art, lashes", N],
    ["Men’s grooming", "Beard oils, grooming kits and barbering", N],
  ]],
  ["Home, Gifts & Kids", [
    ["Home décor, craft & fragrance", "Decorative items, crafts, reed diffusers and home scents", R],
    ["Books & stationery", "Books, notebooks and stationery", R],
    ["Kids education & care", "Learning centres, educational products and child-care products", R],
    ["Home appliances & kitchenware", "Blenders, air fryers, pots and dinner sets", N],
    ["Bedding, curtains & soft furnishings", "Bedsheets, curtains, rugs and cushions", N],
    ["Furniture", "Small furniture and interior pieces", N],
    ["Christmas décor, trees & lights", "Christmas trees, lights and decorations", N],
    ["Gift hampers & wrapping", "Ready-made hampers and gift wrapping", N],
    ["Toys & games", "Toys, games and gifts for children", N],
    ["Art, beads & local crafts", "Paintings, beads, baskets and handmade crafts", N],
    ["Plants & flowers", "Bouquets and potted plants", N],
    ["Personalised gifts & printing", "Mugs, T-shirts, photo frames and custom cards", N],
    ["School supplies & January prep", "School bags, lunch boxes and supplies for the new term", N],
  ]],
  ["Tech & Power", [
    ["Phones, gadgets & accessories", "Phones, earbuds, power banks, smart watches and accessories", N],
    ["Solar & power solutions", "Solar lamps, inverters and power banks", N],
  ]],
  ["Services & Lifestyle", [
    ["Community & lifestyle organisations", "Community groups, ministries and lifestyle organisations", R],
    ["Training & professional services", "Skills training, coaching and professional services", R],
    ["Real estate & land", "Property and land companies", N],
    ["Travel, tours & staycations", "Christmas travel, tours and resort or staycation deals", N],
    ["Insurance & financial services", "Savings, insurance and mobile money services", N],
    ["Pharmacy & health screening", "Pharmacies and clinics, with health screening on site", N],
  ]],
].flatMap(([section, list]) => list.map((c) => ({ section, name: c[0], desc: c[1], status: c[2] })))
 .map((c, i) => ({ id: "c" + (i + 1), ...c }));

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// ---- helpers --------------------------------------------------------------
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const store = () => getStore({ name: "breakfast-fair-2026", consistency: "strong" });

async function readBookings(s) {
  const r = await s.getWithMetadata("bookings", { type: "json" });
  return r ? { list: r.data.list || [], etag: r.etag } : { list: [], etag: null };
}
async function readSettings(s) {
  return (await s.get("settings", { type: "json" })) || { caps: {}, open: true };
}
function capFor(id, settings) {
  return settings.caps?.[id] ?? CAPS[id] ?? DEFAULT_CAP;
}
const active = (b) => b.status !== "cancelled";

// Read-modify-write with optimistic locking so two vendors can’t take the last place at once.
async function mutate(s, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { list, etag } = await readBookings(s);
    const result = await fn(list);
    if (result.error) return result;
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const w = await s.setJSON("bookings", { list }, opts);
    if (w.modified) return result;
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 200));
  }
  return { error: "The booking system is busy. Please try again in a moment.", status: 503 };
}

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const normPhone = (p) => clean(p, 30).replace(/[^\d+]/g, "");
const newRef = () => "SBF-" + Math.random().toString(36).slice(2, 7).toUpperCase();

function availability(list, settings) {
  const taken = {};
  for (const b of list) if (active(b)) taken[b.category] = (taken[b.category] || 0) + 1;
  return CATEGORIES.map((c) => ({ ...c, cap: capFor(c.id, settings), taken: taken[c.id] || 0 }));
}

function isAdmin(req) {
  const key = process.env.FAIR_ADMIN_KEY;
  return key && req.headers.get("x-admin-key") === key;
}

async function paystackVerify(reference) {
  const r = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + process.env.FAIR_PAYSTACK_SECRET_KEY },
  });
  return r.json();
}

// ---- handler --------------------------------------------------------------
export default async (req) => {
  const s = store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      const [{ list }, settings] = await Promise.all([readBookings(s), readSettings(s)]);
      return json({
        open: settings.open !== false,
        payee: PAYEE,
        paystackKey: process.env.FAIR_PAYSTACK_PUBLIC_KEY && process.env.FAIR_PAYSTACK_SECRET_KEY
          ? process.env.FAIR_PAYSTACK_PUBLIC_KEY : null,
        packs: PACKS,
        categories: availability(list, settings),
      });
    }

    if (action === "list") {
      if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);
      const [{ list }, settings] = await Promise.all([readBookings(s), readSettings(s)]);
      return json({ open: settings.open !== false, packs: PACKS, categories: availability(list, settings), bookings: list });
    }
    return json({ error: "Unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  // ---- vendor registration
  if (body.action === "register") {
    const settings = await readSettings(s);
    if (settings.open === false) return json({ error: "Vendor registration is closed. Call 0545 22 33 24." }, 403);
    if (clean(body.website)) return json({ ok: true, ref: newRef() }); // honeypot

    const b = {
      business: clean(body.business, 120),
      contact: clean(body.contact, 100),
      phone: normPhone(body.phone),
      whatsapp: normPhone(body.whatsapp),
      email: clean(body.email, 120).toLowerCase(),
      category: clean(body.category, 5),
      pack: clean(body.pack, 10),
      products: clean(body.products, 500),
      returning: !!body.returning,
    };
    if (!b.business || !b.contact) return json({ error: "Enter your business name and contact person." }, 400);
    if (b.phone.replace(/\D/g, "").length < 9) return json({ error: "Enter a valid phone number." }, 400);
    if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return json({ error: "Check the email address." }, 400);
    if (!CAT_BY_ID[b.category]) return json({ error: "Choose a category." }, 400);
    if (!PACKS[b.pack]) return json({ error: "Choose a vendor pack." }, 400);

    const result = await mutate(s, (list) => {
      const dup = list.find((x) => active(x) && x.phone === b.phone && x.category === b.category);
      if (dup) return { error: `This phone number already holds a place in this category (ref ${dup.ref}).`, status: 409 };
      const taken = list.filter((x) => active(x) && x.category === b.category).length;
      if (taken >= capFor(b.category, settings))
        return { error: `${CAT_BY_ID[b.category].name} is fully booked. Choose another category or call 0545 22 33 24.`, status: 409 };
      const booking = {
        ...b, ref: newRef(), amount: PACKS[b.pack].price, status: "pending",
        createdAt: new Date().toISOString(), payments: [],
      };
      list.push(booking);
      return { booking };
    });
    if (result.error) return json({ error: result.error }, result.status || 400);
    const { ref, amount, pack, category } = result.booking;
    return json({ ok: true, ref, amount, pack: PACKS[pack].name, category: CAT_BY_ID[category].name });
  }

  // ---- confirm Paystack payment to Sunny Charities
  if (body.action === "verify") {
    if (!process.env.FAIR_PAYSTACK_SECRET_KEY) return json({ error: "Online payment is not set up." }, 400);
    const ref = clean(body.ref, 20), reference = clean(body.reference, 100);
    const v = await paystackVerify(reference);
    const d = v?.data;
    if (!v?.status || d?.status !== "success") return json({ error: "Payment not confirmed by Paystack yet." }, 402);
    if (d.currency !== "GHS" || d.metadata?.booking_ref !== ref)
      return json({ error: "This payment does not match the booking." }, 400);

    const result = await mutate(s, (list) => {
      const bk = list.find((x) => x.ref === ref);
      if (!bk) return { error: "Booking not found.", status: 404 };
      if (!bk.payments.some((p) => p.reference === reference))
        bk.payments.push({ reference, amount: d.amount / 100, paidAt: d.paid_at, channel: d.channel });
      const paid = bk.payments.reduce((n, p) => n + p.amount, 0);
      if (bk.status !== "cancelled") bk.status = paid >= bk.amount ? "paid" : "part-paid";
      return { booking: bk };
    });
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json({ ok: true, status: result.booking.status });
  }

  // ---- admin
  if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);

  if (body.action === "setStatus") {
    const allowed = ["pending", "part-paid", "paid", "cancelled"];
    if (!allowed.includes(body.status)) return json({ error: "Bad status" }, 400);
    const settings = await readSettings(s);
    const result = await mutate(s, (list) => {
      const bk = list.find((x) => x.ref === body.ref);
      if (!bk) return { error: "Booking not found.", status: 404 };
      if (bk.status === "cancelled" && body.status !== "cancelled") {
        const taken = list.filter((x) => active(x) && x.category === bk.category).length;
        if (taken >= capFor(bk.category, settings)) return { error: "That category is now full — raise its cap first.", status: 409 };
      }
      bk.status = body.status;
      if (body.note !== undefined) bk.note = clean(body.note, 300);
      bk.updatedAt = new Date().toISOString();
      return { booking: bk };
    });
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json({ ok: true });
  }

  if (body.action === "settings") {
    const settings = await readSettings(s);
    if (body.caps && typeof body.caps === "object") {
      for (const [id, n] of Object.entries(body.caps)) {
        if (!CAT_BY_ID[id]) continue;
        const v = Math.max(0, Math.min(99, parseInt(n, 10)));
        if (!Number.isNaN(v)) settings.caps[id] = v;
      }
    }
    if (typeof body.open === "boolean") settings.open = body.open;
    await s.setJSON("settings", settings);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};
