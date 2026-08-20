'use strict';
/* ============================================================
   NoirCue — Payment integration architecture
   ─────────────────────────────────────────────────────────────
   One settlement pipeline, two providers:

   1) STRIPE (production cards):
        Requires env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
        Flow: create-order → Stripe Checkout Session → user pays →
              webhook hits /api/pay/webhook/stripe → verify signature →
              settleOrder() (same code path as manual).
        Until keys are configured the API refuses cash orders with a
        clear CONFIG_REQUIRED message (never a silent fake).

   2) MANUAL/DEV provider (default, clearly labelled):
        Orders are created 'pending' and settled through the exact same
        settleOrder() — triggered either by an ADMIN approval
        (/api/admin/orders/:id/approve) or, when PAYMENTS_SIMULATE=1,
        by /api/pay/simulate/:orderId which stands in for the webhook.

   All settlement is idempotent (order status transitions guarded in a
   single SQLite transaction) and audit-logged in wallet_tx/orders.
   ============================================================ */
const crypto = require('crypto');
const { db, tx, now, q, cfg } = require('./db');
const { walletMove, notify } = require('./auth');
const rt = require('./rt');

const orderId = () => 'ord_' + crypto.randomBytes(9).toString('hex');

/* ---------- order creation ---------- */
async function createOrder(user, itemId, provider){
  const item = q.itemById.get(itemId);
  if (!item || !item.active) return { status: 404, err: 'UNKNOWN_ITEM', msg: 'العنصر غير موجود' };
  if (item.price_usd_cents <= 0) return { status: 400, err: 'NOT_CASH_ITEM', msg: 'هذا العنصر يُشترى بعملات نواركيو' };

  if (provider === 'stripe'){
    if (!cfg.PAYMENTS_STRIPE_READY){
      return { status: 501, err: 'CONFIG_REQUIRED',
        msg: 'الدفع بالبطاقة يتطلب إعداد STRIPE_SECRET_KEY و STRIPE_WEBHOOK_SECRET في ملف .env — راجع README' };
    }
  } else if (provider !== 'manual'){
    return { status: 400, err: 'BAD_PROVIDER', msg: 'مزود دفع غير معروف' };
  }

  const id = orderId();
  q.orderIns.run(id, user.id, itemId, item.price_usd_cents, 'pending', provider, null, now());
  const order = q.orderGet.get(id);

  let checkout = null;
  if (provider === 'stripe'){
    try {
      checkout = await stripeCheckoutSession(order, item);
    } catch(e){
      db.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).run(id);
      return { status: 502, err: 'PROVIDER_ERROR', msg: 'تعذر إنشاء جلسة الدفع: ' + e.message };
    }
  }
  return { ok: true, order, checkout };
}

/* ---------- Stripe integration (structure ready; activates with keys) ---------- */
async function stripeCheckoutSession(order, item){
  /* Creates a real Stripe Checkout Session when configured.
     Docs: POST https://api.stripe.com/v1/checkout/sessions */
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'NoirCue — ' + item.name_en,
    'line_items[0][price_data][unit_amount]': String(item.price_usd_cents),
    'line_items[0][quantity]': '1',
    'metadata[order_id]': order.id,
    success_url: cfg.STRIPE_RETURN_URL || '/',
    cancel_url: cfg.STRIPE_RETURN_URL || '/'
  });
  const r = await fetch(cfg.STRIPE_API + '/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await r.json();
  if (!r.ok) throw new Error('stripe: ' + (data.error && data.error.message));
  db.prepare('UPDATE orders SET provider_ref = ? WHERE id = ?').run(data.id, order.id);
  return { url: data.url, session: data.id };
}

function stripeVerifySignature(payloadBuf, sigHeader){
  if (!cfg.STRIPE_WEBHOOK_SECRET) return false;
  const parts = {};
  String(sigHeader || '').split(',').forEach(p => { const [k, v] = p.split('='); if (k && v) parts[k.trim()] = v.trim(); });
  if (!parts.t || !parts.v1) return false;
  const mac = crypto.createHmac('sha256', cfg.STRIPE_WEBHOOK_SECRET).update(parts.t + '.' + payloadBuf.toString()).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(parts.v1)); } catch(e){ return false; }
}

/* ---------- THE single settlement path ---------- */
function settleOrder(orderIdRaw, providerRef){
  const run = tx(() => {
    const order = q.orderGet.get(orderIdRaw);
    if (!order) return { status: 404, err: 'UNKNOWN_ORDER' };
    if (order.status === 'paid') return { ok: true, already: true, order };   // idempotent — webhook replays are safe
    if (order.status !== 'pending') return { status: 409, err: 'NOT_PENDING', order };

    const item = q.itemById.get(order.item_id);
    if (!item) return { status: 404, err: 'UNKNOWN_ITEM' };
    const user = q.userById.get(order.user_id);
    if (!user) return { status: 404, err: 'UNKNOWN_USER' };

    q.orderSetPaid.run('paid', now(), providerRef || null, order.id);

    if (item.kind === 'pack' && item.coins > 0){
      walletMove(user.id, item.coins, 'شراء حزمة ' + item.name_ar + (item.bonus_pct ? ' (+' + item.bonus_pct + '%)' : ''), 'order:' + order.id);
    }
    if (item.kind === 'vip'){
      const until = Math.max(now(), user.vip_until) + item.vip_days * 86400e3;
      db.prepare('UPDATE users SET vip = ?, vip_until = ? WHERE id = ?').run(item.vip_tier, until, user.id);
    }
    if (['stick', 'emoji', 'theme', 'frame'].includes(item.kind)){
      q.invIns.run(user.id, item.id, now());
    }

    notify(user.id, 'purchase', 'تمت عملية الشراء ✓', item.name_ar + ' — شكرًا لدعمك نواركيو.');
    rt.emit(user.id, 'wallet:update', { reason: 'purchase', item: item.id });
    return { ok: true, order: q.orderGet.get(order.id) };
  });
  return run();
}

/* dev simulator — only when PAYMENTS_SIMULATE=1; mirrors the webhook exactly */
function simulateSettle(user, orderIdRaw){
  if (!cfg.PAYMENTS_SIMULATE) return { status: 403, err: 'SIM_DISABLED', msg: 'وضع المحاكاة معطل على هذا الخادم' };
  const order = q.orderGet.get(orderIdRaw);
  if (!order) return { status: 404, err: 'UNKNOWN_ORDER' };
  if (order.user_id !== user.id) return { status: 403, err: 'NOT_YOURS' };
  if (order.provider === 'stripe' && order.provider_ref) return { status: 400, err: 'USE_WEBHOOK' };
  const r = settleOrder(orderIdRaw, 'sim_' + crypto.randomBytes(4).toString('hex'));
  if (r.ok) notify(user.id, 'payment', 'دفعة تجريبية (وضع التطوير)', 'تمت تسوية الطلب عبر مسار التسوية الرسمي نفسه.');
  return r;
}

/* ---------- purchases with NoirCue Coins ---------- */
function buyWithCoins(user, itemId){
  const item = q.itemById.get(itemId);
  if (!item || !item.active) return { status: 404, err: 'UNKNOWN_ITEM', msg: 'العنصر غير موجود' };
  if (item.price_vc <= 0) return { status: 400, err: 'NOT_VC_ITEM', msg: 'هذا العنصر لا يُشترى بالعملات' };
  if (['stick', 'emoji', 'theme', 'frame'].includes(item.kind)){
    if (q.invHas.get(user.id, itemId)) return { status: 409, err: 'ALREADY_OWNED', msg: 'تملك هذا العنصر بالفعل' };
  }
  const run = tx(() => {
    walletMove(user.id, -item.price_vc, 'شراء ' + item.name_ar, 'item:' + item.id);
    if (['stick', 'emoji', 'theme', 'frame'].includes(item.kind)) q.invIns.run(user.id, item.id, now());
    if (item.kind === 'pack' && item.coins > 0) walletMove(user.id, item.coins, 'حزمة ' + item.name_ar, 'item:' + item.id);
    if (item.kind === 'vip'){
      const until = Math.max(now(), user.vip_until) + item.vip_days * 86400e3;
      db.prepare('UPDATE users SET vip = ?, vip_until = ? WHERE id = ?').run(item.vip_tier, until, user.id);
    }
  });
  try { run(); } catch(e){
    if (e.message === 'INSUFFICIENT_FUNDS') return { status: 402, err: 'INSUFFICIENT_FUNDS', msg: 'رصيدك لا يكفي — اشحن محفظتك أولًا' };
    throw e;
  }
  notify(user.id, 'purchase', 'تم الشراء بعملات نواركيو', item.name_ar);
  rt.emit(user.id, 'wallet:update', { reason: 'purchase', item: item.id });
  return { ok: true };
}

function equip(user, itemId){
  const item = q.itemById.get(itemId);
  if (!item) return { status: 404, err: 'UNKNOWN_ITEM' };
  if (!q.invHas.get(user.id, itemId)) return { status: 403, err: 'NOT_OWNED', msg: 'لا تملك هذا العنصر' };
  const slot = { stick: 'stick', theme: 'theme', frame: 'frame' }[item.kind];
  if (!slot) return { status: 400, err: 'NOT_EQUIPPABLE' };
  const eq = JSON.parse(user.equipped || '{}');
  eq[slot] = eq[slot] === itemId ? null : itemId;      // toggle
  db.prepare('UPDATE users SET equipped = ? WHERE id = ?').run(JSON.stringify(eq), user.id);
  return { ok: true, equipped: eq };
}

module.exports = { createOrder, settleOrder, simulateSettle, buyWithCoins, equip, stripeVerifySignature };
