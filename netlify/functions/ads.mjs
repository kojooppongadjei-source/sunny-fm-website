// Self Service Adverts — order API
// Route: /api/ads   Storage: Netlify Blobs (store "self-service-ads")
//
// Flow: the advert page saves the order (details + image) BEFORE payment, opens Paystack with the
// order's reference, then asks this function to verify the payment with Paystack server-side.
// Orders are never lost: if the verify step fails, the order still sits here as "awaiting-payment"
// and can be rechecked from /self-service-advert/admin/.
//
// Netlify environment variables (falls back to the Breakfast Fair ones — same Sunny Charities account):
//   ADS_ADMIN_KEY            password for /self-service-advert/admin/     (fallback FAIR_ADMIN_KEY)
//   ADS_PAYSTACK_PUBLIC_KEY  Paystack public key  pk_live_...              (fallback FAIR_PAYSTACK_PUBLIC_KEY)
//   ADS_PAYSTACK_SECRET_KEY  Paystack secret key  sk_live_...              (fallback FAIR_PAYSTACK_SECRET_KEY)

import { getStore } from "@netlify/blobs";
import { randomInt } from "node:crypto";

export const config = { path: "/api/ads" };

const PRICE_PER_DAY = 20; // GHS
const DURATIONS = [1, 3, 7, 14, 21, 30];
const DEFAULT_PUBLIC_KEY = "pk_live_de0fc9e3b71f670c1d8e9cd4e3be3f125c9ceb8a"; // key the page used before
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const STATUSES = ["awaiting-payment", "paid", "published", "rejected", "refunded"];

const env = (a, b) => process.env[a] || process.env[b] || "";
const ADMIN_KEY = () => env("ADS_ADMIN_KEY", "FAIR_ADMIN_KEY");
const PUBLIC_KEY = () => env("ADS_PAYSTACK_PUBLIC_KEY", "FAIR_PAYSTACK_PUBLIC_KEY") || DEFAULT_PUBLIC_KEY;
const SECRET_KEY = () => env("ADS_PAYSTACK_SECRET_KEY", "FAIR_PAYSTACK_SECRET_KEY");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const store = () => getStore({ name: "self-service-ads", consistency: "strong" });
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const isAdmin = (req) => { const k = ADMIN_KEY(); return !!k && req.headers.get("x-admin-key") === k; };
const orderKey = (ref) => "order/" + ref;
const imageKey = (ref) => "image/" + ref;
const validRef = (r) => /^SUNNYADS\d{9,12}$/.test(r);

async function newRef(s) {
  for (let i = 0; i < 5; i++) {
    const ref = "SUNNYADS" + String(randomInt(100000000, 999999999)) + String(randomInt(0, 100)).padStart(2, "0");
    if (!(await s.get(orderKey(ref)))) return ref;
  }
  throw new Error("Could not create a reference");
}

async function paystackVerify(reference) {
  const r = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + SECRET_KEY() },
  });
  return r.json().catch(() => ({}));
}

// Checks Paystack and updates the order. Returns the updated order.
async function verifyOrder(s, order) {
  if (!SECRET_KEY()) return { order, message: "Paystack secret key not set — check this payment in the Paystack dashboard." };
  const v = await paystackVerify(order.ref);
  const d = v?.data;
  order.lastCheckedAt = new Date().toISOString();
  if (!v?.status || d?.status !== "success") {
    order.paystackStatus = d?.status || v?.message || "not found";
    await s.setJSON(orderKey(order.ref), order);
    return { order, message: "Paystack has not confirmed this payment (" + order.paystackStatus + ")." };
  }
  const paid = d.amount / 100;
  order.paystackStatus = "success";
  order.payment = {
    amount: paid, currency: d.currency, paidAt: d.paid_at, channel: d.channel,
    cardType: d.authorization?.card_type || null, bank: d.authorization?.bank || null,
    last4: d.authorization?.last4 || null, country: d.authorization?.country_code || null,
    ip: d.ip_address || null, payerEmail: d.customer?.email || null,
  };
  if (d.currency !== "GHS" || paid < order.amount) {
    order.flag = `Paid ${d.currency} ${paid}, expected GHS ${order.amount}.`;
    await s.setJSON(orderKey(order.ref), order);
    return { order, message: order.flag };
  }
  delete order.flag;
  if (order.status === "awaiting-payment") order.status = "paid";
  await s.setJSON(orderKey(order.ref), order);
  return { order };
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const action = url.searchParams.get("action") || "config";

    if (action === "config")
      return json({ paystackKey: PUBLIC_KEY(), pricePerDay: PRICE_PER_DAY, durations: DURATIONS });

    if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);

    if (action === "list") {
      const { blobs } = await s.list({ prefix: "order/" });
      const orders = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
      orders.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return json({ orders, secretKeySet: !!SECRET_KEY() });
    }

    if (action === "image") {
      const ref = clean(url.searchParams.get("ref"), 30);
      if (!validRef(ref)) return json({ error: "Bad reference" }, 400);
      const r = await s.getWithMetadata(imageKey(ref), { type: "arrayBuffer" });
      if (!r) return json({ error: "No image" }, 404);
      return new Response(r.data, {
        headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "private, no-store" },
      });
    }
    return json({ error: "Unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  // ---- 1. advertiser saves their order before paying
  if (body.action === "create") {
    if (clean(body.website)) return json({ ok: true, ref: "SUNNYADS000000000" }); // honeypot

    const days = parseInt(body.duration_days, 10);
    const o = {
      business_name: clean(body.business_name, 120),
      description: clean(body.description, 100),
      link: clean(body.link, 300),
      email: clean(body.email, 120).toLowerCase(),
      advertiser_contact: clean(body.advertiser_contact, 40),
      duration_days: days,
    };
    if (!o.business_name || !o.description || !o.link) return json({ error: "Fill in the business name, description and link." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return json({ error: "Check your email address." }, 400);
    if (o.advertiser_contact.replace(/\D/g, "").length < 9) return json({ error: "Enter a valid phone / WhatsApp number." }, 400);
    if (!DURATIONS.includes(days)) return json({ error: "Choose a duration." }, 400);

    const m = /^data:(image\/(jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ""));
    if (!m) return json({ error: "Attach your advert image (JPG, PNG or WebP)." }, 400);
    const bytes = Buffer.from(m[3], "base64");
    if (bytes.length > MAX_IMAGE_BYTES) return json({ error: "That image is too large. Use one under 3 MB." }, 400);

    const ref = await newRef(s);
    const order = {
      ref, ...o, amount: days * PRICE_PER_DAY, status: "awaiting-payment",
      imageType: m[1], imageBytes: bytes.length, createdAt: new Date().toISOString(),
    };
    await s.set(imageKey(ref), bytes, { metadata: { type: m[1] } });
    await s.setJSON(orderKey(ref), order);
    return json({ ok: true, ref, amount: order.amount, email: order.email });
  }

  // ---- 2. after the Paystack popup succeeds, confirm with Paystack server-side
  if (body.action === "verify") {
    const ref = clean(body.ref, 30);
    if (!validRef(ref)) return json({ error: "Bad reference" }, 400);
    const order = await s.get(orderKey(ref), { type: "json" });
    if (!order) return json({ error: "Order not found." }, 404);
    if (order.status !== "awaiting-payment") return json({ ok: true, status: order.status });
    const { order: o, message } = await verifyOrder(s, order);
    return json({ ok: o.status === "paid", status: o.status, message });
  }

  // ---- admin
  if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);

  if (body.action === "recheck") {
    const ref = clean(body.ref, 30);
    const order = validRef(ref) && (await s.get(orderKey(ref), { type: "json" }));
    if (!order) return json({ error: "Order not found." }, 404);
    const { order: o, message } = await verifyOrder(s, order);
    return json({ ok: true, order: o, message });
  }

  if (body.action === "setStatus") {
    const ref = clean(body.ref, 30);
    if (!STATUSES.includes(body.status)) return json({ error: "Bad status" }, 400);
    const order = validRef(ref) && (await s.get(orderKey(ref), { type: "json" }));
    if (!order) return json({ error: "Order not found." }, 404);
    order.status = body.status;
    if (body.note !== undefined) order.note = clean(body.note, 300);
    order.updatedAt = new Date().toISOString();
    await s.setJSON(orderKey(ref), order);
    return json({ ok: true, order });
  }

  // Clear out abandoned orders (never paid)
  if (body.action === "delete") {
    const ref = clean(body.ref, 30);
    if (!validRef(ref)) return json({ error: "Bad reference" }, 400);
    const order = await s.get(orderKey(ref), { type: "json" });
    if (order && order.status !== "awaiting-payment") return json({ error: "Only unpaid orders can be deleted." }, 400);
    await s.delete(orderKey(ref)); await s.delete(imageKey(ref));
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};
