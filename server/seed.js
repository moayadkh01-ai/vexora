'use strict';
/* ============================================================
   VEXORA — Seed: store catalog + admin bootstrap
   ============================================================ */
const { db, now, q, cfg } = require('./db');
const { hashPassword } = require('./auth');

const CATALOG = [
  /* ---- VEXORA Coin packs (cash) ---- */
  { id: 'pack_5k',   kind: 'pack', name_ar: '٥٬٠٠٠ عملة',  name_en: '5,000 VC',   desc_ar: 'حزمة البداية',            price_vc: 0, usd: 499,  coins: 5000,   bonus: 0,  sort: 10 },
  { id: 'pack_10k',  kind: 'pack', name_ar: '١٠٬٠٠٠ عملة', name_en: '10,000 VC',  desc_ar: 'مكافأة إضافية ‎+10%',      price_vc: 0, usd: 999,  coins: 11000,  bonus: 10, sort: 11 },
  { id: 'pack_25k',  kind: 'pack', name_ar: '٢٥٬٠٠٠ عملة', name_en: '25,000 VC',  desc_ar: 'مكافأة إضافية ‎+20%',      price_vc: 0, usd: 1999, coins: 30000,  bonus: 20, sort: 12 },
  { id: 'pack_60k',  kind: 'pack', name_ar: '٦٠٬٠٠٠ عملة', name_en: '60,000 VC',  desc_ar: 'أفضل قيمة ‎+35%',         price_vc: 0, usd: 4499, coins: 81000,  bonus: 35, sort: 13 },
  { id: 'pack_160k', kind: 'pack', name_ar: '١٦٠٬٠٠٠ عملة', name_en: '160,000 VC', desc_ar: 'مكافأة إضافية ‎+60%',     price_vc: 0, usd: 9999, coins: 256000, bonus: 60, sort: 14 },
  /* ---- VIP (cash) ---- */
  { id: 'vip_silver', kind: 'vip', name_ar: 'عضوية فضية',  name_en: 'Silver VIP', desc_ar: 'مكافأة يومية ×2 وشارة فضية',  price_vc: 0, usd: 499,  vip_tier: 'silver', vip_days: 30, sort: 20 },
  { id: 'vip_gold',   kind: 'vip', name_ar: 'عضوية ذهبية', name_en: 'Gold VIP',   desc_ar: 'مكافأة يومية ×3 واسم ذهبي',  price_vc: 0, usd: 999,  vip_tier: 'gold',   vip_days: 30, sort: 21 },
  { id: 'vip_plat',   kind: 'vip', name_ar: 'عضوية بلاتينية', name_en: 'Platinum VIP', desc_ar: 'مكافأة ×5 وإطار متحرك وأولوية المطابقة', price_vc: 0, usd: 1999, vip_tier: 'plat', vip_days: 30, sort: 22 },
  /* ---- Premium sticks / tools (VC) ---- */
  { id: 'stick_nebula',  kind: 'stick', name_ar: 'عصية السديم',   name_en: 'Nebula Cue',    desc_ar: 'عصية بلمعة بنفسجية متوهجة',      price_vc: 2500, usd: 0, sort: 30 },
  { id: 'stick_aurora',  kind: 'stick', name_ar: 'عصية الشفق',    name_en: 'Aurora Cue',    desc_ar: 'تدرّج سماوي نادر',               price_vc: 4000, usd: 0, sort: 31 },
  { id: 'stick_dragon',  kind: 'stick', name_ar: 'عصية التنين',   name_en: 'Dragon Cue',    desc_ar: 'نقش تنين ذهبي أسطوري',           price_vc: 6000, usd: 0, sort: 32 },
  { id: 'stick_phantom', kind: 'stick', name_ar: 'عصية الشبح',    name_en: 'Phantom Cue',   desc_ar: 'سوداء مطفأة — إصدار محدود',      price_vc: 9000, usd: 0, sort: 33 },
  /* ---- Premium emoji packs (VC) ---- */
  { id: 'vex',       kind: 'emoji', name_ar: 'وجوه فيكسورا الأساسية', name_en: 'VEXORA Starter', desc_ar: 'مجانية للجميع', price_vc: 0, usd: 0, sort: 40, meta: { emojis: ['🎮','🔥','😂','😮','😢','👋'] } },
  { id: 'emo_gold',  kind: 'emoji', name_ar: 'حزمة الذهب',    name_en: 'Gold Pack',    desc_ar: 'ملكات، جواهر وأكواب',            price_vc: 1800, usd: 0, sort: 41, meta: { emojis: ['👑','💎','🏆','🥇','💰','⚡'] } },
  { id: 'emo_neon',  kind: 'emoji', name_ar: 'حزمة النيون',   name_en: 'Neon Pack',    desc_ar: 'وجوه نيون مخصصة لفيكسورا',       price_vc: 2200, usd: 0, sort: 42, meta: { emojis: ['😎','🤖','👾','🚀','🌟','🎯'] } },
  { id: 'emo_kawaii',kind: 'emoji', name_ar: 'حزمة الكاواي',  name_en: 'Kawaii Pack',  desc_ar: 'لطيفة ومرحة',                     price_vc: 2600, usd: 0, sort: 43, meta: { emojis: ['🥰','🐱','🍓','🎈','🎁','🦄'] } },
  /* ---- Table themes & frames (VC) ---- */
  { id: 'theme_cyan',     kind: 'theme', name_ar: 'طاولة سماوية',  name_en: 'Cyan Table',   desc_ar: 'قماش سماوي متوهج لطاولات البلياردو', price_vc: 4000, usd: 0, sort: 50 },
  { id: 'theme_midnight', kind: 'theme', name_ar: 'طاولة منتصف الليل', name_en: 'Midnight Table', desc_ar: 'أزرق ليلي عميق', price_vc: 3200, usd: 0, sort: 51 },
  { id: 'frame_nebula',   kind: 'frame', name_ar: 'إطار السديم',  name_en: 'Nebula Frame', desc_ar: 'إطار صورة شخصية متوهج',            price_vc: 2500, usd: 0, sort: 60 },
  { id: 'frame_king',     kind: 'frame', name_ar: 'إطار الملوك',  name_en: 'King Frame',   desc_ar: 'إطار ذهبي فخم',                     price_vc: 5000, usd: 0, sort: 61 }
];

function seed(){
  const insItem = db.prepare(`INSERT OR REPLACE INTO items
    (id,kind,name_ar,name_en,desc_ar,price_vc,price_usd_cents,coins,bonus_pct,vip_tier,vip_days,meta,premium,active,sort)
    VALUES (@id,@kind,@name_ar,@name_en,@desc_ar,@price_vc,@usd,@coins,@bonus,@vip_tier,@vip_days,@meta,1,1,@sort)`);
  const run = db.transaction(() => {
    for (const c of CATALOG){
      insItem.run({
        id: c.id, kind: c.kind, name_ar: c.name_ar, name_en: c.name_en, desc_ar: c.desc_ar,
        price_vc: c.price_vc, usd: c.usd, coins: c.coins || 0, bonus: c.bonus || 0,
        vip_tier: c.vip_tier || null, vip_days: c.vip_days || 0,
        meta: JSON.stringify(c.meta || {}), sort: c.sort
      });
    }
    /* admin bootstrap */
    if (!q.userByEmail.get(cfg.ADMIN_EMAIL)){
      db.prepare(`INSERT INTO users (username,email,pass,role,coins,created_at,last_seen)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(cfg.ADMIN_USER, cfg.ADMIN_EMAIL, hashPassword(cfg.ADMIN_PASS), 'admin', 100000, now(), now());
      console.log('[seed] admin account ready →', cfg.ADMIN_EMAIL);
    }
    /* public chat rooms (غرف السواليف) — idempotent */
    const insRoom = db.prepare('INSERT INTO gchat_rooms (id,name,emoji,sort) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji');
    insRoom.run(1, 'ديوانية فيكسورا', '🛋️', 1);
    insRoom.run(2, 'السوالف العامة', '💬', 2);
    insRoom.run(3, 'ساحة التحدي', '⚔️', 3);
    insRoom.run(4, 'استراحة الألعاب', '☕', 4);
    insRoom.run(5, 'سالفة البلياردو والطاولة', '🎱', 5);
    insRoom.run(6, 'سالفة الشطرنج والذكاء', '♞', 6);
    insRoom.run(7, 'البطولات والجوائز', '🏆', 7);
    insRoom.run(8, 'الترحيب بالأعضاء الجدد', '👋', 8);
    insRoom.run(9, 'الاقتراحات والدعم', '🛠️', 9);
    insRoom.run(10, 'دردشة حرة', '🌍', 10);
  });
  run();
}

module.exports = { seed, CATALOG };
