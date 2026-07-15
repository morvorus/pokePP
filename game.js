/* ================================================================
   PokePP — เกมจับมอนสเตอร์สไตล์ PokeMeow + แผนที่สไตล์ PokeRogue
   ปาบอล (ไม่พิมพ์ชื่อ) · ระดับความหายาก · โปเกมอนรายตัว (nature/เพศ/IV)
   ================================================================ */
'use strict';
import { MONSTERS } from './monsters-data.js';
import { clamp, TYPE_CHART, typeEffect, movePP, UB_LEGENDARY_IDS, tierOf, isoWeekNumber, catchChance, statsForBase, rarityFromRoll, damageCore, runMigrations } from './logic.js';

// cloud.js (classic script) รันก่อนโมดูลนี้และตั้ง window.Cloud ไว้ — ผูกเป็น const ให้อ้าง Cloud ในสโคปโมดูลได้
const Cloud = window.Cloud;

// ---------- config ----------
const SAVE_KEY = 'pokepp_save_v2';
// เวอร์ชันสคีมาเซฟ + ไมเกรชันเป็นขั้น (สำหรับการเปลี่ยนโครงสร้างในอนาคต — ฟิลด์ใหม่ deepMergeDefaults จัดการให้อยู่แล้ว)
const SAVE_VERSION = 3;
const SAVE_MIGRATIONS = {
  // v2→v3: ล้างคูลดาวน์ลีคเมก้าที่หมดอายุ กันอ็อบเจกต์บวมขึ้นเรื่อยๆ
  3: (s) => {
    const cd = s.megaLeague && s.megaLeague.cooldowns;
    if (cd) { const now = Date.now(); for (const k of Object.keys(cd)) { if ((cd[k] || 0) <= now) delete cd[k]; } }
  },
};
// ใช้ jsDelivr CDN (เสถียร/เร็วกว่า raw.githubusercontent มาก โดยเฉพาะในไทย)
const SP_BASE = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon';
const SP = {
  anim5: id => `${SP_BASE}/versions/generation-v/black-white/animated/${id}.gif`,       // Gen1-5 เล็ก+ขยับ+เร็ว
  anim5s: id => `${SP_BASE}/versions/generation-v/black-white/animated/shiny/${id}.gif`,
  gif:   id => `${SP_BASE}/other/showdown/${id}.gif`,
  shiny: id => `${SP_BASE}/other/showdown/shiny/${id}.gif`,
  art:   id => `${SP_BASE}/other/official-artwork/${id}.png`,
  artS:  id => `${SP_BASE}/other/official-artwork/shiny/${id}.png`,   // ภาพนิ่งสี shiny
  png:   id => `${SP_BASE}/${id}.png`,
  pngS:  id => `${SP_BASE}/shiny/${id}.png`,                          // png สี shiny
  // ===== ภาพด้านหลัง (สำหรับโปเกมอนฝั่งเรา หันหลังให้ผู้เล่นแบบเกมจริง) =====
  backGif:  id => `${SP_BASE}/other/showdown/back/${id}.gif`,
  backGifS: id => `${SP_BASE}/other/showdown/back/shiny/${id}.gif`,
  backAnim: id => `${SP_BASE}/versions/generation-v/black-white/animated/back/${id}.gif`,
  backAnimS:id => `${SP_BASE}/versions/generation-v/black-white/animated/back/shiny/${id}.gif`,
  back:  id => `${SP_BASE}/back/${id}.png`,
  backS: id => `${SP_BASE}/back/shiny/${id}.png`,
};
// ลำดับภาพด้านหลัง — showdown back (ขยับ) → gen5 back (ขยับ) → png back (นิ่ง)
function backSpriteImg(id, shiny, cls) {
  const chain = shiny
    ? [SP.backGifS(id), (id <= 649 ? SP.backAnimS(id) : null), SP.backS(id), SP.pngS(id)]
    : [SP.backGif(id), (id <= 649 ? SP.backAnim(id) : null), SP.back(id), SP.png(id)];
  const list = chain.filter(Boolean);
  return `<img class="${cls || ''}" loading="lazy" src="${list[0]}" data-fb="${list.slice(1).join('|')}" onerror="__sf(this)" alt="">`;
}
// ลำดับรูปที่จะลอง — เอา "showdown" (สไปรต์ขยับแบบ PokeMeow) เป็นหลัก
// ถ้าไม่มี ค่อยลอง gen5 ขยับ (ตัวเก่า) แล้วค่อยภาพนิ่ง (artwork)
function spriteChain(id, shiny) {
  const anim = shiny
    ? [SP.shiny(id), (id <= 649 ? SP.anim5s(id) : null), SP.artS(id), SP.pngS(id)]   // fallback = สี shiny
    : [SP.gif(id), (id <= 649 ? SP.anim5(id) : null), SP.art(id), SP.png(id)];
  return anim.filter(Boolean);
}
// ตัว fallback: เมื่อรูปโหลดไม่ได้ ไล่ไปรูปถัดไปในลิสต์ (ผูก window ให้ inline onerror ใช้ได้ด้วย)
function __sf(img) {
  const fb = (img.dataset.fb || '').split('|').filter(Boolean);
  if (fb.length) { img.dataset.fb = fb.slice(1).join('|'); img.src = fb[0]; }
}
window.__sf = __sf;
// watchdog กลาง: ถ้ารูปค้าง (เน็ตช้า/CDN cold ไม่ยิง error) บังคับสลับ fallback หลัง 4 วิ กันจอว่างค้าง
(function () {
  const seen = new WeakSet();
  setInterval(() => {
    document.querySelectorAll('img[data-fb]').forEach(img => {
      if (img.complete && img.naturalWidth > 0) return;   // โหลดสำเร็จแล้ว ข้าม
      if (seen.has(img)) { if (!img.complete || img.naturalWidth === 0) __sf(img); seen.delete(img); }
      else seen.add(img);   // รอบแรกที่เจอ ให้เวลาผ่านไปอีกรอบ (~4s) ก่อนตัดสินใจ
    });
  }, 4000);
})();
// ภาพไอเทม (บอล/เบอร์รี่/charm) จาก PokeAPI — แสดงภาพอย่างเดียว ไม่มี emoji
// ถ้าโหลดพลาด (เน็ตกระตุก/CDN cold) ให้ retry จนขึ้น ไม่สลับเป็นอีโมจิ
const ITEM_BASE = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/';
window.__imgRetry = function (img) {
  const t = (+img.dataset.try || 0) + 1;
  img.dataset.try = t;
  if (t > 15) return;                          // กันลูปไม่รู้จบ (พยายามนานมากแล้ว)
  const delay = Math.min(250 * t, 2500);
  const base = img.dataset.src;
  setTimeout(() => { img.src = base + '?r=' + t; }, delay);   // บังคับ fetch ใหม่
};
function itemIcon(emoji, img, extraCls) {
  if (!img) return `<span class="item-ico ${extraCls || ''}">${emoji}</span>`;
  const url = ITEM_BASE + img + '.png';
  return `<img class="item-ico ${extraCls || ''}" src="${url}" data-src="${url}" data-try="0" onerror="__imgRetry(this)" alt="">`;
}
// โหลดภาพไอเทมทั้งหมดล่วงหน้าตอนเปิดเกม (warm cache ให้ jsDelivr) เพื่อให้ขึ้นทันทีเสมอ
function preloadItems() {
  const names = [
    ...BALL_ORDER.map(k => BALLS[k].img),
    ...BERRY_ORDER.map(k => BERRIES[k].img),
    ...CHARM_ORDER.map(k => CHARMS[k].img),
    ...HELD_ORDER.map(k => HELD_ITEMS[k].img),
    ...Object.values(MEGA_FORMS).flatMap(forms => forms.map(f => f.stone)),
    'rare-candy', 'nugget', 'mega-ring', 'macho-brace', 'shiny-stone', 'comet-shard', 'member-card', 'eon-ticket',
  ].filter(Boolean);
  names.forEach(n => { const i = new Image(); i.src = ITEM_BASE + n + '.png'; });
}
// warm cache ล่วงหน้าให้สไปรต์ตกแต่งเขต+อีเวนต์ (mascots) กันจอว่างตอน jsDelivr cold-cache
function preloadMascots() {
  REGIONS.forEach(r => (r.mascots || []).forEach(id => { const i = new Image(); i.src = SP.gif(id); }));
  RANDOM_EVENTS.forEach(e => (e.mascots || []).forEach(id => { const i = new Image(); i.src = SP.gif(id); }));
}
const SPAWN_MIN = 9000, SPAWN_MAX = 16000;
const FLEE_MS = 45000;
const SHINY_CHANCE = 1 / 8192;   // แบบเกมจริง หายากมาก

// รางวัลเงิน/XP ตามระดับ (ค่าเหรียญอิงตาม PokeMeow)
const TIER_COIN = { common: 10, uncommon: 25, rare: 60, superrare: 200, legendary: 1000 };
const TIER_XP   = { common: 14, uncommon: 26, rare: 55, superrare: 120, legendary: 300 };
const LEGENDARY_CHANCE = 1 / 666;   // สุ่มแยกอิสระแบบ PokeMeow
const TIER_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
const TIER_ORDER = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];

// เลเวลตามระดับความหายาก (แบบ PokeMeow) — ตัวหายาก = เลเวลสูง = ออกยากขึ้น
// เกิดได้ทุกเลเวล ไม่ผูกกับเขต แต่ในแต่ละช่วงเอนไปทางเลเวลต่ำ (เลเวลสูงยิ่งหายาก)
const TIER_LEVEL = {
  common:    [1, 20],
  uncommon:  [12, 38],
  rare:      [28, 58],
  superrare: [50, 80],
  legendary: [70, 100],
};

// อีโมจิธาตุ ใช้ตกแต่งแต่ละตัว
const TYPE_EMOJI = {
  normal: '⭐', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️',
  fighting: '🥊', poison: '☠️', ground: '⛰️', flying: '🕊️', psychic: '🔮', bug: '🐛',
  rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '🧚',
};
const TIER_EMOJI = { common: '⚪', uncommon: '🟢', rare: '🔵', superrare: '🟣', legendary: '🟡' };
function typeBadges(types) {
  return types.map(t => `<span class="badge t-${t}">${TYPE_EMOJI[t] || ''} ${t}</span>`).join('');
}

// น้ำหนักการสุ่มระดับ ตาม "rarityBoost" ของเขต
const TIER_WEIGHTS = {
  0: { common: 56, uncommon: 27, rare: 12, superrare: 4, legendary: 1 },
  1: { common: 42, uncommon: 29, rare: 18, superrare: 8,  legendary: 3 },
  2: { common: 28, uncommon: 27, rare: 23, superrare: 15, legendary: 7 },
};

// ชนิดบอล — บางลูกมีโบนัสตามเงื่อนไข (cond) · ราคาปรับสมดุลใหม่ (ยิมยากขึ้น เงินหมุนเวียนมากขึ้น)
const BALLS = {
  poke:    { name: 'Poké Ball',   emoji: '🔴', img: 'poke-ball',    mult: 1.0, add: 0.00, price: 25,   hint: 'พื้นฐาน' },
  premier: { name: 'Premier Ball',emoji: '⚪', img: 'premier-ball', flatBase: 0.45, flatShiny: 1.0, mult: 1.0, add: 0.00, price: 50000, hint: 'จับ 45% · ✨ Shiny 100%!' },
  great:   { name: 'Great Ball',  emoji: '🔵', img: 'great-ball',   mult: 1.7, add: 0.03, price: 90,   hint: '×1.7' },
  luxury:  { name: 'Luxury Ball', emoji: '🟤', img: 'luxury-ball',  mult: 1.9, add: 0.00, price: 240,  hint: '×1.9 +มิตรภาพ', friendBonus: 15 },
  ultra:   { name: 'Ultra Ball',  emoji: '🟡', img: 'ultra-ball',   mult: 2.6, add: 0.09, price: 240,  hint: '×2.6' },
  net:     { name: 'Net Ball',    emoji: '🕸️', img: 'net-ball',     mult: 1.0, add: 0.00, price: 150,  hint: '×3.3 ธาตุน้ำ/แมลง',
            cond: ctx => ctx.mon.types.some(t => t === 'water' || t === 'bug') ? { mult: 3.3 } : {} },
  dusk:    { name: 'Dusk Ball',   emoji: '🌑', img: 'dusk-ball',    mult: 1.0, add: 0.00, price: 150,  hint: '×3.3 กลางคืน/ถ้ำ',
            cond: ctx => (ctx.time === 'night' || ctx.region.id === 'cave') ? { mult: 3.3 } : {} },
  quick:   { name: 'Quick Ball',  emoji: '⚡', img: 'quick-ball',   mult: 1.0, add: 0.00, price: 180,  hint: '×4 ลูกแรก',
            cond: ctx => ctx.throws === 0 ? { mult: 4.0 } : {} },
  timer:   { name: 'Timer Ball',  emoji: '⏱️', img: 'timer-ball',   mult: 1.0, add: 0.00, price: 220,  hint: 'ยิ่งขว้างหลายรอบยิ่งแรง',
            cond: ctx => ({ mult: clamp(1.0 + ctx.throws * 0.6, 1.0, 4.5) }) },
  repeat:  { name: 'Repeat Ball', emoji: '🔁', img: 'repeat-ball',  mult: 1.0, add: 0.00, price: 170,  hint: '×2.6 ตัวที่เคยจับแล้ว',
            cond: ctx => ctx.alreadyCaught ? { mult: 2.6 } : { mult: 0.9 } },
  heavy:   { name: 'Heavy Ball',  emoji: '⚙️', img: 'heavy-ball',   mult: 1.0, add: 0.00, price: 300,  hint: '×2.4 กับ Rare/Super Rare',
            cond: ctx => (ctx.mon._tier === 'rare' || ctx.mon._tier === 'superrare') ? { mult: 2.4 } : { mult: 0.8 } },
  beast:   { name: 'Beast Ball',  emoji: '🟣', img: 'beast-ball',   mult: 1.0, add: 0.00, price: 1500, hint: '×4 กับ Legendary เท่านั้น',
            cond: ctx => ctx.mon._tier === 'legendary' ? { mult: 4.0 } : { mult: 0.2 } },
  master:  { name: 'Master Ball', emoji: '🟣', img: 'master-ball',  mult: 999, add: 1, price: 100000, hint: '100%' },
};
const BALL_ORDER = ['poke', 'premier', 'great', 'luxury', 'ultra', 'net', 'dusk', 'quick', 'timer', 'repeat', 'heavy', 'beast', 'master'];
// บอลที่ขายในร้าน (ที่เหลือ net/dusk/quick/timer/repeat/heavy/beast/luxury หาได้จากกล่องสุ่ม/ตียิม/บอส/หอคอย)
const SHOP_BALL_ORDER = ['poke', 'great', 'ultra', 'premier', 'master'];   // เรียงตามราคา (25/90/240/50k/100k)
const OFF_SHOP_BALLS = ['net', 'dusk', 'quick', 'timer', 'repeat', 'heavy', 'luxury', 'beast'];   // ดรอปจากกล่อง/ยิม/บอส/หอคอย
function grantRandomBall() {   // สุ่มบอลนอกร้าน 1 ชนิด (beast หายากกว่า) จำนวน 1-3 · คืนข้อความ
  const k = Math.random() < 0.1 ? 'beast' : pick(OFF_SHOP_BALLS.filter(b => b !== 'beast'));
  const n = k === 'beast' ? 1 : rand(1, 3);
  state.balls[k] = (state.balls[k] || 0) + n;
  return `${BALLS[k].emoji} ${BALLS[k].name} ×${n}`;
}

// สภาพอากาศ (สุ่มต่อเขต) + กลางวัน/กลางคืน + อีเวนต์
// dotImmune = ธาตุที่ไม่โดนดาเมจจากสภาพอากาศตอนจบเทิร์น (แบบพายุทราย/หิมะในเกมจริง — 1/16 ของ HP สูงสุด)
const WEATHERS = {
  clear: { name: 'แจ่มใส', emoji: '☀️', boost: [] },
  rain:  { name: 'ฝนตก', emoji: '🌧️', boost: ['water', 'electric'] },
  snow:  { name: 'หิมะโปรย', emoji: '🌨️', boost: ['ice'], dotImmune: ['ice'] },
  sand:  { name: 'พายุทราย', emoji: '🏜️', boost: ['rock', 'ground', 'steel'], dotImmune: ['rock', 'ground', 'steel'] },
  fog:   { name: 'หมอกหนา', emoji: '🌫️', boost: ['ghost', 'dark', 'poison'] },
};
const NIGHT_BOOST = ['dark', 'ghost', 'psychic', 'fairy'];
const DAY_BOOST = ['normal', 'grass', 'bug', 'flying', 'fire'];
const WEATHER_MS = 7 * 60000;   // อากาศเปลี่ยนทุก ~7 นาที

// ===== อีเวนต์สุ่มตามฤดูกาล (World Events) =====
// โผล่มาเองแบบสุ่มระหว่างเล่น มีธีม/เอฟเฟกต์ต่างกัน ตกแต่งด้วยสไปรต์จริง
const RANDOM_EVENTS = [
  { id: 'halloween', name: 'คืนปล่อยผี', emoji: '🎃', types: ['ghost', 'dark', 'poison'],
    shinyMult: 2.5, coinMult: 1.3, legMult: 2, mascots: [92, 302, 197, 94],
    tint: 'linear-gradient(180deg, rgba(60,20,80,.5), rgba(20,5,30,.65))', desc: 'ผีและเงามืดออกอาละวาด' },
  { id: 'newyear', name: 'เทศกาลปีใหม่', emoji: '🎆', types: ['fire', 'fairy', 'normal'],
    shinyMult: 1.8, coinMult: 1.6, legMult: 1.5, mascots: [39, 700, 133, 143],
    tint: 'linear-gradient(180deg, rgba(80,20,40,.4), rgba(30,5,20,.55))', desc: 'พลุสว่างไสวทั่วแผ่นดิน' },
  { id: 'summer', name: 'เทศกาลซัมเมอร์', emoji: '🏖️', types: ['fire', 'water', 'grass'],
    shinyMult: 1.5, coinMult: 1.2, legMult: 1.2, mascots: [7, 4, 1, 130],
    tint: 'linear-gradient(180deg, rgba(255,190,60,.3), rgba(255,140,20,.25))', desc: 'แดดจัด โปเกมอนคึกคักผิดปกติ' },
  { id: 'valentine', name: 'วันแห่งความรัก', emoji: '💗', types: ['fairy', 'normal', 'psychic'],
    shinyMult: 1.8, coinMult: 1.3, legMult: 1, mascots: [35, 113, 196, 700],
    tint: 'linear-gradient(180deg, rgba(255,90,150,.3), rgba(150,20,70,.4))', desc: 'มิตรภาพและความรักลอยฟุ้ง' },
  { id: 'fullmoon', name: 'คืนพระจันทร์เต็มดวง', emoji: '🌕', types: ['dark', 'psychic', 'ghost', 'fairy'],
    shinyMult: 3, coinMult: 1, legMult: 3, mascots: [302, 127, 197, 94],
    tint: 'linear-gradient(180deg, rgba(20,30,70,.55), rgba(5,8,25,.7))', desc: 'แสงจันทร์ปลุกพลังลึกลับ · Shiny พุ่ง!' },
  { id: 'legendhunt', name: 'ล่าตำนาน', emoji: '👑', types: [],
    shinyMult: 1.3, coinMult: 1.4, legMult: 6, mascots: [144, 145, 146, 150],
    tint: 'linear-gradient(180deg, rgba(255,203,5,.25), rgba(120,90,0,.35))', desc: 'สัญญาณพลังเลเจนดารีแผ่กระจาย!' },
  { id: 'goldrush', name: 'ตื่นทอง', emoji: '💰', types: ['ground', 'rock', 'steel'],
    shinyMult: 1.2, coinMult: 2.5, legMult: 1, mascots: [113, 81, 95, 74],
    tint: 'linear-gradient(180deg, rgba(255,203,5,.3), rgba(150,110,10,.4))', desc: 'เหรียญกระจายเกลื่อนทุกที่' },
  { id: 'bugswarm', name: 'ฝูงแมลงบุก', emoji: '🐛', types: ['bug', 'grass', 'poison'],
    shinyMult: 1.5, coinMult: 1.1, legMult: 1, mascots: [12, 127, 214, 48],
    tint: 'linear-gradient(180deg, rgba(140,180,40,.35), rgba(60,90,10,.45))', desc: 'ฝูงแมลงอพยพครั้งใหญ่' },
  { id: 'stormsurge', name: 'พายุคลื่นยักษ์', emoji: '🌊', types: ['water', 'electric', 'ice'],
    shinyMult: 1.6, coinMult: 1.3, legMult: 1.3, mascots: [130, 131, 9, 116],
    tint: 'linear-gradient(180deg, rgba(20,80,140,.4), rgba(5,30,60,.55))', desc: 'คลื่นลมแรง โปเกมอนน้ำหนีขึ้นฝั่ง' },
];
const EVENT_MS_MIN = 8 * 60000, EVENT_MS_MAX = 18 * 60000;   // อีเวนต์อยู่ 8-18 นาที
const EVENT_CHECK_MS = 3 * 60000;                              // เช็คทุก 3 นาทีว่าจะสุ่มเกิดไหม
const EVENT_CHANCE = 0.22;                                     // 22% ต่อการเช็คแต่ละครั้ง

// เบอร์รี่ (แบบ PokeMeow — ใช้ก่อนล่าเพื่อเพิ่ม "โอกาสเจอ" โปเกมอนหายากในการสปอว์นถัดไป ไม่ช่วยเรื่องจับ)
const BERRIES = {
  razz:   { name: 'Razz Berry',  emoji: '🍓', img: 'razz-berry',   luck: 1, spawns: 1, price: 60,  desc: '+โอกาสเจอตัวหายาก 1 ครั้งถัดไป' },
  golden: { name: 'Golden Razz', emoji: '🥭', img: 'nanab-berry',  luck: 2, spawns: 3, price: 220, desc: '+โอกาสเจอตัวหายากมากขึ้น 3 ครั้งถัดไป' },
};
const BERRY_ORDER = ['razz', 'golden'];

// Charm — ไอเทมบูสต์ (ซื้อเก็บ แล้วกดใช้ บูสต์ 30 นาที) แบบ PokeMeow
const CHARM_MS = 30 * 60000;
const CHARMS = {
  catch: { name: 'Catch Charm', emoji: '🧲', img: 'oval-charm', mult: 1.5, price: 1200, desc: 'โอกาสจับ ×1.5' },
  xp:    { name: 'XP Charm',    emoji: '📿', img: 'lucky-egg',      mult: 2,   price: 5000, desc: 'XP ที่ได้ ×2 · 30 นาที' },
};
const CHARM_ORDER = ['xp'];   // Catch Charm ย้ายไปเป็นพาสซีฟถาวร (เหมือน Shiny Charm) เหลือแค่ XP Charm ที่เป็นแบบเวลา

// Shiny Charm — ไอเทมติดตัวถาวรแบบพาสซีฟ (แบบเกมจริง/PokeMeow) สะสมได้สูงสุด 5 ชิ้น เพิ่มโอกาส Shiny ทีละเล็กน้อย
const SHINY_CHARM_MAX = 5, SHINY_CHARM_PRICE = 4500, SHINY_CHARM_PER = 0.02;   // +2%/ชิ้น ทบต้น (แบบเกมจริง เพิ่มน้อยแต่ถาวร)
function shinyCharmMultiplier() { return Math.pow(1 + SHINY_CHARM_PER, Math.min(state.shinyCharms || 0, SHINY_CHARM_MAX)); }
// Catch Charm — พาสซีฟถาวรเหมือน Shiny Charm สะสมได้สูงสุด 5 ชิ้น เพิ่มโอกาสจับถาวร (ไม่ใช่จับเวลา)
const CATCH_CHARM_MAX = 5, CATCH_CHARM_PRICE = 2500, CATCH_CHARM_PER = 0.03;   // +3%/ชิ้น ทบต้น สูงสุด 5 อัน (แลกด้วยเหรียญเช็คอิน)
function catchCharmMultiplier() { return Math.pow(1 + CATCH_CHARM_PER, Math.min(state.catchCharms || 0, CATCH_CHARM_MAX)); }
function buyCatchCharm() {
  if ((state.catchCharms || 0) >= CATCH_CHARM_MAX) { toast('มี Catch Charm ครบ 5 ชิ้นแล้ว', ''); return; }
  if (!spend(CATCH_CHARM_PRICE)) return;
  state.catchCharms = (state.catchCharms || 0) + 1;
  toast(`🧲 Catch Charm ${state.catchCharms}/${CATCH_CHARM_MAX} (ติดตัวถาวร เพิ่มโอกาสจับ)`, 'good');
  playSfx('rare'); postBuy();
}
function buyShinyCharm() {
  if ((state.shinyCharms || 0) >= SHINY_CHARM_MAX) { toast('มี Shiny Charm ครบ 5 ชิ้นแล้ว', ''); return; }
  if (!spend(SHINY_CHARM_PRICE)) return;
  state.shinyCharms = (state.shinyCharms || 0) + 1;
  toast(`🔮 Shiny Charm ${state.shinyCharms}/${SHINY_CHARM_MAX} (ติดตัวถาวร)`, 'good');
  postBuy();
}

// Held Items — สวมให้โปเกมอนในทีมเพื่อบูสต์ตอนต่อสู้ (แบบ PokeMeow "Battle items")
const HELD_ITEMS = {
  'life-orb':     { name: 'Life Orb',     emoji: '🔮', img: 'life-orb',     price: 2000, desc: 'ดาเมจที่ทำ +30%' },
  'choice-band':  { name: 'Choice Band',  emoji: '💪', img: 'choice-band',  price: 1800, desc: 'ATK +50%' },
  'choice-specs': { name: 'Choice Specs', emoji: '👓', img: 'choice-specs', price: 1800, desc: 'Sp.ATK +50%' },
  'assault-vest': { name: 'Assault Vest', emoji: '🦺', img: 'assault-vest', price: 1500, desc: 'Sp.DEF +50%' },
  'expert-belt':  { name: 'Expert Belt',  emoji: '🥋', img: 'expert-belt',  price: 1500, desc: 'ดาเมจธาตุได้เปรียบ +20%' },
  'leftovers':    { name: 'Leftovers',    emoji: '🍖', img: 'leftovers',    price: 1600, desc: 'ฟื้น HP 1/16 ทุกเทิร์น' },
  'focus-sash':   { name: 'Focus Sash',   emoji: '🎗️', img: 'focus-sash',   price: 1200, desc: 'รอดท่าสังหารครั้งแรก (ต้อง HP เต็ม)' },
  'scope-lens':   { name: 'Scope Lens',   emoji: '🔍', img: 'scope-lens',   price: 1700, desc: 'โอกาสคริติคอล ×4 (~25%)' },
  'quick-claw':   { name: 'Quick Claw',   emoji: '🍀', img: 'quick-claw',   price: 1400, desc: '20% โอกาสได้โจมตีก่อนแม้ช้ากว่า' },
  'sitrus-berry': { name: 'Sitrus Berry', emoji: '🫐', img: 'sitrus-berry', price: 900,  desc: 'ฟื้น HP 25% อัตโนมัติเมื่อ HP ต่ำกว่าครึ่ง (ใช้ได้ครั้งเดียว/แมตช์)' },
  'kings-rock':   { name: "King's Rock",  emoji: '👑', img: 'kings-rock',   price: 1300, desc: '10% โอกาสทำให้ศัตรูสะดุ้ง (เสียเทิร์นถัดไป) เมื่อโจมตีโดน' },
  'bright-powder':{ name: 'Bright Powder',emoji: '✨', img: 'bright-powder',price: 1300, desc: 'ท่าศัตรูที่ใช้ใส่ตัวนี้ ความแม่นยำ -10%' },
  'wide-lens':    { name: 'Wide Lens',    emoji: '🔎', img: 'wide-lens',    price: 1300, desc: 'ความแม่นยำท่าของตัวเอง +10%' },
  'shell-bell':   { name: 'Shell Bell',   emoji: '🐚', img: 'shell-bell',   price: 1400, desc: 'ฟื้น HP 1/8 ของดาเมจที่ทำได้ทุกครั้งที่โจมตีโดน' },
  'rocky-helmet': { name: 'Rocky Helmet', emoji: '🪨', img: 'rocky-helmet', price: 1400, desc: 'ศัตรูที่โจมตีโดนตัวนี้ โดนสะท้อน 1/6 ของ HP สูงสุดตัวเอง' },
};
const HELD_ORDER = Object.keys(HELD_ITEMS);

// ===== Mega Evolution — ข้อมูลจริงจาก PokeAPI (สเตตัส/ธาตุ/spriteId ของร่างเมก้าจริง) =====
// key ของ MEGA_FORMS = id สายพันธุ์ปกติ, ค่าคือ array (บางตัวมี X/Y สองร่าง)
const MEGA_FORMS = {
  3:   [{ key: 'venusaur-mega',   spriteId: 10033, stone: 'venusaurite',    name: 'Mega Venusaur',   types: ['grass', 'poison'],   stats: { hp: 80, atk: 100, def: 123, spatk: 122, spdef: 120, spd: 80 } }],
  6:   [{ key: 'charizard-mega-x', spriteId: 10034, stone: 'charizardite-x', name: 'Mega Charizard X', types: ['fire', 'dragon'],   stats: { hp: 78, atk: 130, def: 111, spatk: 130, spdef: 85, spd: 100 } },
        { key: 'charizard-mega-y', spriteId: 10035, stone: 'charizardite-y', name: 'Mega Charizard Y', types: ['fire', 'flying'],   stats: { hp: 78, atk: 104, def: 78, spatk: 159, spdef: 115, spd: 100 } }],
  9:   [{ key: 'blastoise-mega',  spriteId: 10036, stone: 'blastoisinite',  name: 'Mega Blastoise',  types: ['water'],             stats: { hp: 79, atk: 103, def: 120, spatk: 135, spdef: 115, spd: 78 } }],
  65:  [{ key: 'alakazam-mega',   spriteId: 10037, stone: 'alakazite',      name: 'Mega Alakazam',   types: ['psychic'],           stats: { hp: 55, atk: 50, def: 65, spatk: 175, spdef: 105, spd: 150 } }],
  94:  [{ key: 'gengar-mega',     spriteId: 10038, stone: 'gengarite',      name: 'Mega Gengar',     types: ['ghost', 'poison'],   stats: { hp: 60, atk: 65, def: 80, spatk: 170, spdef: 95, spd: 130 } }],
  115: [{ key: 'kangaskhan-mega', spriteId: 10039, stone: 'kangaskhanite',  name: 'Mega Kangaskhan', types: ['normal'],            stats: { hp: 105, atk: 125, def: 100, spatk: 60, spdef: 100, spd: 100 } }],
  130: [{ key: 'gyarados-mega',   spriteId: 10041, stone: 'gyaradosite',    name: 'Mega Gyarados',   types: ['water', 'dark'],     stats: { hp: 95, atk: 155, def: 109, spatk: 70, spdef: 130, spd: 81 } }],
  142: [{ key: 'aerodactyl-mega', spriteId: 10042, stone: 'aerodactylite',  name: 'Mega Aerodactyl',  types: ['rock', 'flying'],    stats: { hp: 80, atk: 135, def: 85, spatk: 70, spdef: 95, spd: 150 } }],
  150: [{ key: 'mewtwo-mega-x',  spriteId: 10043, stone: 'mewtwonite-x',   name: 'Mega Mewtwo X',   types: ['psychic', 'fighting'], stats: { hp: 106, atk: 190, def: 100, spatk: 154, spdef: 100, spd: 130 } },
        { key: 'mewtwo-mega-y',  spriteId: 10044, stone: 'mewtwonite-y',   name: 'Mega Mewtwo Y',   types: ['psychic'],           stats: { hp: 106, atk: 150, def: 70, spatk: 194, spdef: 120, spd: 140 } }],
  181: [{ key: 'ampharos-mega',  spriteId: 10045, stone: 'ampharosite',    name: 'Mega Ampharos',   types: ['electric', 'dragon'], stats: { hp: 90, atk: 95, def: 105, spatk: 165, spdef: 110, spd: 45 } }],
  212: [{ key: 'scizor-mega',    spriteId: 10046, stone: 'scizorite',      name: 'Mega Scizor',     types: ['bug', 'steel'],      stats: { hp: 70, atk: 150, def: 140, spatk: 65, spdef: 100, spd: 75 } }],
  214: [{ key: 'heracross-mega', spriteId: 10047, stone: 'heracronite',    name: 'Mega Heracross',  types: ['bug', 'fighting'],   stats: { hp: 80, atk: 185, def: 115, spatk: 40, spdef: 105, spd: 75 } }],
  229: [{ key: 'houndoom-mega',  spriteId: 10048, stone: 'houndoominite',  name: 'Mega Houndoom',   types: ['dark', 'fire'],      stats: { hp: 75, atk: 90, def: 90, spatk: 140, spdef: 90, spd: 115 } }],
  248: [{ key: 'tyranitar-mega', spriteId: 10049, stone: 'tyranitarite',   name: 'Mega Tyranitar',  types: ['rock', 'dark'],      stats: { hp: 100, atk: 164, def: 150, spatk: 95, spdef: 120, spd: 71 } }],
  257: [{ key: 'blaziken-mega',  spriteId: 10050, stone: 'blazikenite',    name: 'Mega Blaziken',   types: ['fire', 'fighting'],  stats: { hp: 80, atk: 160, def: 80, spatk: 130, spdef: 80, spd: 100 } }],
  282: [{ key: 'gardevoir-mega', spriteId: 10051, stone: 'gardevoirite',   name: 'Mega Gardevoir',  types: ['psychic', 'fairy'],  stats: { hp: 68, atk: 85, def: 65, spatk: 165, spdef: 135, spd: 100 } }],
  303: [{ key: 'mawile-mega',    spriteId: 10052, stone: 'mawilite',       name: 'Mega Mawile',     types: ['steel', 'fairy'],    stats: { hp: 50, atk: 105, def: 125, spatk: 55, spdef: 95, spd: 50 } }],
  306: [{ key: 'aggron-mega',    spriteId: 10053, stone: 'aggronite',      name: 'Mega Aggron',     types: ['steel'],             stats: { hp: 70, atk: 140, def: 230, spatk: 60, spdef: 80, spd: 50 } }],
  308: [{ key: 'medicham-mega',  spriteId: 10054, stone: 'medichamite',    name: 'Mega Medicham',   types: ['fighting', 'psychic'], stats: { hp: 60, atk: 100, def: 85, spatk: 80, spdef: 85, spd: 100 } }],
  310: [{ key: 'manectric-mega', spriteId: 10055, stone: 'manectite',      name: 'Mega Manectric',  types: ['electric'],          stats: { hp: 70, atk: 75, def: 80, spatk: 135, spdef: 80, spd: 135 } }],
  354: [{ key: 'banette-mega',   spriteId: 10056, stone: 'banettite',      name: 'Mega Banette',    types: ['ghost'],             stats: { hp: 64, atk: 165, def: 75, spatk: 93, spdef: 83, spd: 75 } }],
  359: [{ key: 'absol-mega',     spriteId: 10057, stone: 'absolite',       name: 'Mega Absol',      types: ['dark'],              stats: { hp: 65, atk: 150, def: 60, spatk: 115, spdef: 60, spd: 115 } }],
  373: [{ key: 'salamence-mega', spriteId: 10089, stone: 'salamencite',    name: 'Mega Salamence',  types: ['dragon', 'flying'],  stats: { hp: 95, atk: 145, def: 130, spatk: 120, spdef: 90, spd: 120 } }],
  376: [{ key: 'metagross-mega', spriteId: 10076, stone: 'metagrossite',   name: 'Mega Metagross',  types: ['steel', 'psychic'],  stats: { hp: 80, atk: 145, def: 150, spatk: 105, spdef: 110, spd: 110 } }],
  384: [{ key: 'rayquaza-mega',  spriteId: 10079, stone: 'red-orb',        name: 'Mega Rayquaza',   types: ['dragon', 'flying'],  stats: { hp: 105, atk: 180, def: 100, spatk: 180, spdef: 100, spd: 115 } }],
  445: [{ key: 'garchomp-mega',  spriteId: 10058, stone: 'garchompite',    name: 'Mega Garchomp',   types: ['dragon', 'ground'],  stats: { hp: 108, atk: 170, def: 115, spatk: 120, spdef: 95, spd: 92 } }],
  448: [{ key: 'lucario-mega',   spriteId: 10059, stone: 'lucarionite',    name: 'Mega Lucario',    types: ['fighting', 'steel'], stats: { hp: 70, atk: 145, def: 88, spatk: 140, spdef: 70, spd: 112 } }],
  460: [{ key: 'abomasnow-mega', spriteId: 10060, stone: 'abomasite',      name: 'Mega Abomasnow',  types: ['grass', 'ice'],      stats: { hp: 90, atk: 132, def: 105, spatk: 132, spdef: 105, spd: 30 } }],
};
// ราคาหินเมก้าในร้าน (แพงมาก — ต้องซื้อ/แลกเองทั้งหมด ไม่มีทางได้ฟรี ให้การวิวัฒนาการเมก้ารู้สึกคุ้มค่า)
const MEGA_STONE_PRICE = 7000;
const MEGA_RING_PRICE = 15000;   // (เดิม) — ปัจจุบันแลกด้วยเหรียญเช็คอินแทน
const MEGA_RING_CHECKIN = 150, DYNAMAX_BAND_CHECKIN = 300;   // ราคาแลกด้วยเหรียญเช็คอิน

// ===== Gigantamax — สายพันธุ์ที่มีร่าง G-Max จริง (spriteId จาก PokeAPI) =====
const GMAX_FORMS = {
  6: { key: 'charizard-gmax', spriteId: 10196, name: 'G-Max Charizard' },
  12: { key: 'butterfree-gmax', spriteId: 10198, name: 'G-Max Butterfree' },
  25: { key: 'pikachu-gmax', spriteId: 10199, name: 'G-Max Pikachu' },
  52: { key: 'meowth-gmax', spriteId: 10200, name: 'G-Max Meowth' },
  68: { key: 'machamp-gmax', spriteId: 10201, name: 'G-Max Machamp' },
  94: { key: 'gengar-gmax', spriteId: 10202, name: 'G-Max Gengar' },
  99: { key: 'kingler-gmax', spriteId: 10203, name: 'G-Max Kingler' },
  131: { key: 'lapras-gmax', spriteId: 10204, name: 'G-Max Lapras' },
  133: { key: 'eevee-gmax', spriteId: 10205, name: 'G-Max Eevee' },
  143: { key: 'snorlax-gmax', spriteId: 10206, name: 'G-Max Snorlax' },
  569: { key: 'garbodor-gmax', spriteId: 10207, name: 'G-Max Garbodor' },
  809: { key: 'melmetal-gmax', spriteId: 10208, name: 'G-Max Melmetal' },
  823: { key: 'corviknight-gmax', spriteId: 10212, name: 'G-Max Corviknight' },
  826: { key: 'orbeetle-gmax', spriteId: 10213, name: 'G-Max Orbeetle' },
  834: { key: 'drednaw-gmax', spriteId: 10214, name: 'G-Max Drednaw' },
  839: { key: 'coalossal-gmax', spriteId: 10215, name: 'G-Max Coalossal' },
  849: { key: 'toxtricity-gmax', spriteId: 10219, name: 'G-Max Toxtricity' },
  851: { key: 'centiskorch-gmax', spriteId: 10220, name: 'G-Max Centiskorch' },
  858: { key: 'hatterene-gmax', spriteId: 10221, name: 'G-Max Hatterene' },
  892: { key: 'urshifu-gmax', spriteId: 10226, name: 'G-Max Urshifu' },
};
const DYNAMAX_TURNS = 3;          // ไดนาแม็กซ์อยู่ได้กี่เทิร์น
const DYNAMAX_HP_MULT = 2;        // HP ระหว่างไดนาแม็กซ์ ×2
const DYNAMAX_DMG_MULT = 1.3;     // ดาเมจโบนัสระหว่างไดนาแม็กซ์
const MAX_ENERGY_PRICE = 1300;   // แพงขึ้น — ต้องซื้อเองทั้งหมด ไม่มีทางได้ฟรีจากยิม/หอคอย
const DYNAMAX_BAND_PRICE = 12000;   // กำไลไดนาแม็กซ์ — ปลดล็อกครั้งเดียว จำเป็นก่อนไดนาแม็กซ์ได้ทุกตัว
const GMAX_STONE_PRICE = 6000;      // หินปลุกพลัง G-Max เฉพาะสายพันธุ์ — ต้องแนบให้ตรงตัวถึงจะได้ร่าง G-Max จริง (ไม่งั้นได้แค่ไดนาแม็กซ์ธรรมดา)

// ยิม/เทรนเนอร์ — สู้ทีมหลายตัว ปลดล็อกทีละด่าน (แบบเดินสายยิม PokeMeow)
// ยากขึ้นจริง: ทีมใหญ่ขึ้น + เลือกศัตรูจากระดับหายาก (ไม่ใช่สุ่มธรรมดา) + เอซตัวสุดท้ายแรงพิเศษ + ถือไอเทมสู้
const GYMS = [
  { id: 'g1', name: 'ยิมหญ้า',       emoji: '🌿', type: 'grass',    lvl: 20, count: 3, tierBias: ['uncommon', 'rare'],            reward: 600,  items: [['great', 3], ['candy', 1]] },
  { id: 'g2', name: 'ยิมน้ำ',        emoji: '💧', type: 'water',    lvl: 30, count: 3, tierBias: ['uncommon', 'rare'],            reward: 900,  items: [['ultra', 2], ['candy', 1]] },
  { id: 'g3', name: 'ยิมไฟ',         emoji: '🔥', type: 'fire',     lvl: 40, count: 4, tierBias: ['rare', 'superrare'],           reward: 1400, items: [['ultra', 3], ['razz', 3]] },
  { id: 'g4', name: 'ยิมไฟฟ้า',      emoji: '⚡', type: 'electric', lvl: 50, count: 4, tierBias: ['rare', 'superrare'],           reward: 2200, items: [['timer', 3], ['candy', 2]] },
  { id: 'g5', name: 'ยิมพิษ',        emoji: '☠️', type: 'poison',   lvl: 60, count: 4, tierBias: ['superrare'],                   reward: 3200, items: [['heavy', 2], ['golden', 2]] },
  { id: 'g6', name: 'ยิมหิน',        emoji: '🪨', type: 'rock',     lvl: 70, count: 5, tierBias: ['superrare'],                   reward: 4600, items: [['heavy', 3], ['candy', 3]] },
  { id: 'g7', name: 'ยิมจิต',        emoji: '🔮', type: 'psychic',  lvl: 80, count: 5, tierBias: ['superrare', 'legendary'],      reward: 6500, items: [['beast', 1], ['golden', 3]] },
  { id: 'g8', name: 'ยิมมังกร',      emoji: '🐉', type: 'dragon',   lvl: 90, count: 5, tierBias: ['superrare', 'legendary'],      reward: 9000, items: [['beast', 2], ['candy', 4]] },
  { id: 'champ', name: 'แชมป์เปี้ยน', emoji: '👑', type: null,      lvl: 100, count: 6, tierBias: ['legendary'],                  reward: 16000, items: [['master', 1], ['beast', 2]] },
];

// BP Shop — ของหายาก/ราคาแพงที่แลกได้เฉพาะด้วย Battle Points (ได้จากชนะยิม/บอสเท่านั้น)
const BP_SHOP = [
  { id: 'bp_ultra5', name: 'Ultra Ball ×5', emoji: '🟡', img: 'ultra-ball', cost: 40, act: () => { state.balls.ultra = (state.balls.ultra || 0) + 5; return '🟡 +5 Ultra Ball'; } },
  { id: 'bp_master', name: 'Master Ball', emoji: '🟣', img: 'master-ball', cost: 180, limit: 3, act: () => { state.balls.master = (state.balls.master || 0) + 1; return '🟣 +1 Master Ball'; } },
  { id: 'bp_shinycharm', name: 'Shiny Charm', emoji: '🔮', img: 'shiny-charm', cost: 260, act: () => { if ((state.shinyCharms || 0) >= SHINY_CHARM_MAX) return null; state.shinyCharms = (state.shinyCharms || 0) + 1; return `Shiny Charm ${state.shinyCharms}/${SHINY_CHARM_MAX} (ติดตัวถาวร)`; } },
  { id: 'bp_goldegg', name: 'ไข่ทอง', emoji: '🥚', cost: 150, act: () => { state.eggs.push({ kind: 'gold', progressStart: state.totalCaught }); return '🥚 +1 ไข่ทอง'; } },
  { id: 'bp_candy5', name: 'Rare Candy ×5', emoji: '🍬', img: 'rare-candy', cost: 60, act: () => { state.candies = (state.candies || 0) + 5; return '🍬 +5 Rare Candy'; } },
  { id: 'bp_lifeorb', name: 'Life Orb', emoji: '🔮', img: 'life-orb', cost: 100, limit: 2, act: () => { state.heldInv['life-orb'] = (state.heldInv['life-orb'] || 0) + 1; return '🔮 +1 Life Orb'; } },
];

// ค่าคงที่กลไกเสริม
const AMULET_MAX = 10, AMULET_PRICE = 1200;     // Amulet Coin: +5%/ชิ้น สูงสุด +50%
const STREAK_MILESTONE = 10;                     // ทุก 10 สตรีค = กล่องสุ่ม 1 กล่อง
const FRIEND_MAX = 100;
// Catchbot: จับอัตโนมัติตอนออฟไลน์ (ไม่นับสตรีค/เควส)
const catchbotRate = c => 3 + (c.pkLvl || 0) * 2;        // จับ/ชั่วโมง
const catchbotHours = c => 2 + (c.durLvl || 0);          // ชั่วโมงสูงสุดต่อรอบ
const catchbotCoins = c => 8 + (c.profLvl || 0) * 4;     // เหรียญ/ตัว
const catchbotUpCost = lvl => (lvl + 1) * 600;           // ค่าอัปเกรดต่อระดับ
// กล่องสุ่ม (Lockbox) — ตารางรางวัลถ่วงน้ำหนัก
// กล่องสุ่ม — เงิน/บอล(ไม่มีมาสเตอร์)/ผลไม้/แรร์แคนดี้ พบบ่อย · ไข่หายากสุด (ไข่ทองยากสุด)
const LOCKBOX_REWARDS = [
  { w: 32, act: () => { const n = rand(200, 1000); state.coins += n; return `${n} เหรียญ`; } },              // เงิน 200-1000
  { w: 22, act: () => { const n = rand(3, 8); state.balls.great = (state.balls.great || 0) + n; return `${n} Great Ball`; } },
  { w: 15, act: () => { const n = rand(1, 3); state.balls.ultra = (state.balls.ultra || 0) + n; return `${n} Ultra Ball`; } },
  { w: 14, act: () => grantRandomBall() },   // บอลพิเศษนอกร้าน (net/dusk/quick/timer/repeat/heavy/luxury/beast)
  { w: 12, act: () => { const n = rand(1, 3); const k = pick(BERRY_ORDER); state.berries[k] = (state.berries[k] || 0) + n; return `${n} ${BERRIES[k].name}`; } },   // ผลไม้
  { w: 12, act: () => { const n = rand(1, 3); state.candies = (state.candies || 0) + n; return `${n} Rare Candy`; } },
  { w: 4,  act: () => { state.eggs.push({ kind: 'mystery', progressStart: state.totalCaught }); return `🥚 ${EGG_KINDS.mystery.name}`; } },
  { w: 2,  act: () => { state.eggs.push({ kind: 'rare', progressStart: state.totalCaught }); return `🥚 ${EGG_KINDS.rare.name}`; } },
  { w: 1,  act: () => { state.eggs.push({ kind: 'gold', progressStart: state.totalCaught }); return `🥚✨ ${EGG_KINDS.gold.name}`; } },   // ไข่ทองหายากสุด
];
const CATCH_LOCKBOX_CHANCE = 0.05;   // 5% ได้กล่องสุ่มตอนจับสำเร็จ

const EGG_PRICE = 450, STONE_PRICE = 600, EGG_HATCH_CATCHES = 15;

// ไข่หลายชนิด — ฟักแล้วสุ่มจาก pool ต่างกัน + โอกาส shiny ต่างกัน
const EGG_KINDS = {
  mystery: { name: 'ไข่ปริศนา', catches: 15, price: 450, shinyMul: 3, tiers: null },
  rare:    { name: 'ไข่หายาก', catches: 22, price: 1200, shinyMul: 4, tiers: ['rare', 'superrare'] },
  gold:    { name: 'ไข่ทอง',   catches: 30, price: 3000, shinyMul: 8, tiers: ['superrare', 'legendary'] },
};

// ตารางธาตุแพ้ทาง (TYPE_CHART) + typeEffect ย้ายไป logic.js แล้ว (import ด้านบน)

// พูลท่าโจมตีต่อธาตุ (หลายท่าต่อธาตุ — สุ่มเลือกแบบ deterministic ต่อสปีชีส์ เพื่อให้แต่ละตัวมีมูฟต่างกัน ไม่ใช่ท่าเดียวซ้ำทั้งธาตุ)
const TYPE_MOVES = {
  normal: [{ name: 'Body Slam', pow: 60, acc: 100 }, { name: 'Hyper Voice', pow: 90, acc: 100 }, { name: 'Double-Edge', pow: 100, acc: 100 }, { name: 'Extreme Speed', pow: 80, acc: 100, priority: 2 }, { name: 'Giga Impact', pow: 110, acc: 90 }, { name: 'Slam', pow: 65, acc: 75 }],
  fire: [{ name: 'Flamethrower', pow: 90, acc: 100 }, { name: 'Fire Blast', pow: 100, acc: 85 }, { name: 'Flame Charge', pow: 70, acc: 100 }, { name: 'Fire Punch', pow: 75, acc: 100 }, { name: 'Overheat', pow: 110, acc: 90 }, { name: 'Flare Blitz', pow: 100, acc: 100 }],
  water: [{ name: 'Surf', pow: 90, acc: 100 }, { name: 'Hydro Pump', pow: 100, acc: 80 }, { name: 'Scald', pow: 80, acc: 100 }, { name: 'Aqua Tail', pow: 75, acc: 90 }, { name: 'Waterfall', pow: 80, acc: 100 }, { name: 'Origin Pulse', pow: 110, acc: 100 }],
  electric: [{ name: 'Thunderbolt', pow: 90, acc: 100 }, { name: 'Thunder', pow: 100, acc: 70 }, { name: 'Wild Charge', pow: 90, acc: 100 }, { name: 'Discharge', pow: 80, acc: 100 }, { name: 'Volt Tackle', pow: 100, acc: 100 }, { name: 'Spark', pow: 65, acc: 100 }],
  grass: [{ name: 'Energy Ball', pow: 85, acc: 100 }, { name: 'Solar Beam', pow: 100, acc: 100 }, { name: 'Giga Drain', pow: 75, acc: 100 }, { name: 'Leaf Blade', pow: 90, acc: 100 }, { name: 'Petal Blizzard', pow: 90, acc: 100 }, { name: 'Power Whip', pow: 100, acc: 85 }],
  ice: [{ name: 'Ice Beam', pow: 90, acc: 100 }, { name: 'Blizzard', pow: 100, acc: 70 }, { name: 'Ice Punch', pow: 75, acc: 100 }, { name: 'Icicle Crash', pow: 85, acc: 90 }, { name: 'Ice Shard', pow: 40, acc: 100 }, { name: 'Avalanche', pow: 80, acc: 100 }],
  fighting: [{ name: 'Close Combat', pow: 100, acc: 100 }, { name: 'Focus Blast', pow: 100, acc: 70 }, { name: 'Brick Break', pow: 75, acc: 100 }, { name: 'Cross Chop', pow: 90, acc: 80 }, { name: 'Dynamic Punch', pow: 100, acc: 50 }, { name: 'Superpower', pow: 100, acc: 100 }],
  poison: [{ name: 'Sludge Bomb', pow: 90, acc: 100 }, { name: 'Gunk Shot', pow: 100, acc: 80 }, { name: 'Poison Jab', pow: 75, acc: 100 }, { name: 'Sludge Wave', pow: 85, acc: 100 }, { name: 'Cross Poison', pow: 65, acc: 100 }, { name: 'Poison Fang', pow: 50, acc: 100 }],
  ground: [{ name: 'Earthquake', pow: 100, acc: 100 }, { name: 'Earth Power', pow: 90, acc: 100 }, { name: 'Bulldoze', pow: 60, acc: 100 }, { name: 'Dig', pow: 80, acc: 100 }, { name: 'Mud Bomb', pow: 65, acc: 85 }, { name: 'Drill Run', pow: 80, acc: 95 }],
  flying: [{ name: 'Air Slash', pow: 75, acc: 95 }, { name: 'Hurricane', pow: 100, acc: 70 }, { name: 'Brave Bird', pow: 120, acc: 100 }, { name: 'Aerial Ace', pow: 60, acc: 100 }, { name: 'Sky Attack', pow: 105, acc: 90 }, { name: 'Wing Attack', pow: 60, acc: 100 }],
  psychic: [{ name: 'Psychic', pow: 90, acc: 100 }, { name: 'Psyshock', pow: 80, acc: 100 }, { name: 'Zen Headbutt', pow: 80, acc: 90 }, { name: 'Future Sight', pow: 100, acc: 100 }, { name: 'Psycho Cut', pow: 70, acc: 100 }, { name: 'Confusion', pow: 50, acc: 100 }],
  bug: [{ name: 'Bug Buzz', pow: 90, acc: 100 }, { name: 'X-Scissor', pow: 80, acc: 100 }, { name: 'Megahorn', pow: 120, acc: 85 }, { name: 'Signal Beam', pow: 75, acc: 100 }, { name: 'Pin Missile', pow: 65, acc: 95 }, { name: 'Leech Life', pow: 80, acc: 100 }],
  rock: [{ name: 'Rock Slide', pow: 75, acc: 90 }, { name: 'Stone Edge', pow: 100, acc: 80 }, { name: 'Rock Tomb', pow: 60, acc: 95 }, { name: 'Power Gem', pow: 80, acc: 100 }, { name: 'Rock Blast', pow: 65, acc: 90 }, { name: 'Ancient Power', pow: 60, acc: 100 }],
  ghost: [{ name: 'Shadow Ball', pow: 80, acc: 100 }, { name: 'Shadow Claw', pow: 70, acc: 100 }, { name: 'Phantom Force', pow: 90, acc: 100 }, { name: 'Shadow Punch', pow: 60, acc: 100 }, { name: 'Astonish', pow: 55, acc: 100 }, { name: 'Hex', pow: 65, acc: 100 }],
  dragon: [{ name: 'Dragon Pulse', pow: 85, acc: 100 }, { name: 'Dragon Claw', pow: 80, acc: 100 }, { name: 'Outrage', pow: 120, acc: 100 }, { name: 'Draco Meteor', pow: 110, acc: 90 }, { name: 'Dragon Breath', pow: 60, acc: 100 }, { name: 'Dual Chop', pow: 70, acc: 90 }],
  dark: [{ name: 'Dark Pulse', pow: 80, acc: 100 }, { name: 'Crunch', pow: 80, acc: 100 }, { name: 'Foul Play', pow: 95, acc: 100 }, { name: 'Night Slash', pow: 70, acc: 100 }, { name: 'Sucker Punch', pow: 70, acc: 100, priority: 1 }, { name: 'Payback', pow: 60, acc: 100 }],
  steel: [{ name: 'Iron Head', pow: 80, acc: 100 }, { name: 'Flash Cannon', pow: 90, acc: 100 }, { name: 'Meteor Mash', pow: 90, acc: 90 }, { name: 'Steel Wing', pow: 65, acc: 90 }, { name: 'Iron Tail', pow: 75, acc: 75 }, { name: 'Gyro Ball', pow: 80, acc: 100 }],
  fairy: [{ name: 'Moonblast', pow: 95, acc: 100 }, { name: 'Dazzling Gleam', pow: 80, acc: 100 }, { name: 'Play Rough', pow: 90, acc: 90 }, { name: 'Draining Kiss', pow: 60, acc: 100 }, { name: 'Fairy Wind', pow: 40, acc: 100 }, { name: 'Disarming Voice', pow: 40, acc: 100 }],
};
function hashIdx(seedStr, len) {   // hash คงที่ (ไม่สุ่มใหม่ทุกครั้ง) เพื่อให้ moveset ของแต่ละตัวเดิมเสมอ
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return h % len;
}
function getMoves(id) {
  const m = MON_BY_ID[id];
  const moves = [];
  m.types.forEach((t, ti) => {
    const pool = TYPE_MOVES[t];
    const count = m.types.length === 1 ? Math.min(3, pool.length) : (ti === 0 ? 2 : 1);
    const base = hashIdx(`${id}-${t}`, pool.length);
    for (let i = 0; i < count; i++) {
      const mv = pool[(base + i) % pool.length];
      moves.push({ type: t, name: mv.name, pow: mv.pow, acc: mv.acc, priority: mv.priority || 0 });
    }
  });
  moves.push({ type: 'normal', name: 'Quick Attack', pow: 40, acc: 100, priority: 1 });   // ท่าติดตัว — priority โจมตีก่อนเสมอ
  const seen = new Set();
  return moves.filter(mv => { if (seen.has(mv.name)) return false; seen.add(mv.name); return true; }).slice(0, 4);
}
// movePP ย้ายไป logic.js แล้ว (import ด้านบน)
const STRUGGLE_MOVE = { type: 'normal', name: 'ดิ้นรน', pow: 50, acc: 100, priority: 0, struggle: true };
function rollHit(move, atkHeld, defHeld, defAbility) {   // เช็คว่าท่านี้แม่นเป้าไหม (คิดไอเทม Wide Lens/Bright Powder + Sand Veil ด้วยถ้ามี)
  let acc = move.acc == null ? 100 : move.acc;
  if (atkHeld === 'wide-lens') acc += 10;
  if (defHeld === 'bright-powder') acc -= 10;
  if (defAbility && defAbility.name === 'Sand Veil' && getWeather(state.region) === 'sand') acc -= 15;
  return Math.random() * 100 < acc;
}

// รายการความสำเร็จ (Achievements)
const ACHIEVEMENTS = [
  { id: 'first', ico: '🎯', name: 'ก้าวแรก', desc: 'จับโปเกมอนตัวแรก', reward: 50, goal: s => s.totalCaught >= 1, prog: s => [s.totalCaught, 1] },
  { id: 'catch25', ico: '📦', name: 'นักสะสม', desc: 'จับรวม 25 ตัว', reward: 120, goal: s => s.totalCaught >= 25, prog: s => [s.totalCaught, 25] },
  { id: 'catch100', ico: '🏅', name: 'ปรมาจารย์จับ', desc: 'จับรวม 100 ตัว', reward: 400, goal: s => s.totalCaught >= 100, prog: s => [s.totalCaught, 100] },
  { id: 'dex15', ico: '📖', name: 'เริ่มเต็มเล่ม', desc: 'จับครบ 15 ชนิด', reward: 150, goal: s => speciesOwnedCount() >= 15, prog: s => [speciesOwnedCount(), 15] },
  { id: 'dex50', ico: '📚', name: 'ครึ่งทางเดกซ์', desc: 'จับครบ 50 ชนิด', reward: 500, goal: s => speciesOwnedCount() >= 50, prog: s => [speciesOwnedCount(), 50] },
  { id: 'shiny', ico: '✨', name: 'แวววาว!', desc: 'จับ Shiny ตัวแรก', reward: 300, goal: s => s.caught.some(c => c.shiny), prog: s => [s.caught.filter(c => c.shiny).length, 1] },
  { id: 'evolve', ico: '🔀', name: 'วิวัฒนาการ', desc: 'ทำให้ Buddy วิวัฒนาการ', reward: 120, goal: s => s._evolved, prog: s => [s._evolved ? 1 : 0, 1] },
  { id: 'legend', ico: '👑', name: 'ในตำนาน', desc: 'จับโปเกมอน Legendary', reward: 600, goal: s => s.caught.some(c => c.tier === 'legendary'), prog: s => [s.caught.filter(c => c.tier === 'legendary').length, 1] },
  { id: 'perfect', ico: '💯', name: 'สมบูรณ์แบบ', desc: 'จับตัวที่ IV 100%', reward: 800, goal: s => s.caught.some(c => ivPercent(c) === 100), prog: s => [Math.max(0, ...s.caught.map(ivPercent), 0), 100] },
  { id: 'boss1', ico: '🏆', name: 'ผู้พิชิตเขต', desc: 'ชนะบอสประจำเขตครั้งแรก', reward: 300, goal: s => Object.keys(s.badges || {}).length >= 1, prog: s => [Object.keys(s.badges || {}).length, 1] },
  { id: 'allregion', ico: '🗺️', name: 'นักเดินทาง', desc: 'ปลดล็อกครบทุกเขต', reward: 700, goal: s => REGIONS.every(r => !r.unlock || s.unlocked[r.id]), prog: s => [REGIONS.filter(r => !r.unlock || s.unlocked[r.id]).length, REGIONS.length] },
  { id: 'firstevent', ico: '🎉', name: 'ผู้มาเยือนตามฤดู', desc: 'เจออีเวนต์สุ่มตามฤดูกาลครั้งแรก', reward: 200, goal: s => (s.eventHistory || []).length >= 1, prog: s => [(s.eventHistory || []).length, 1] },
  { id: 'eventmaster', ico: '🌟', name: 'นักล่าอีเวนต์', desc: 'เจออีเวนต์สุ่มครบ 5 ครั้ง', reward: 900, goal: s => (s.eventHistory || []).length >= 5, prog: s => [(s.eventHistory || []).length, 5] },
  { id: 'firstmega', ico: '💎', name: 'พลังเมก้า', desc: 'เมก้าอีโวลูชันครั้งแรก', reward: 500, goal: s => !!s._megaEvolved, prog: s => [s._megaEvolved ? 1 : 0, 1] },
  { id: 'firstdynamax', ico: '💥', name: 'ยักษ์ปรากฏ', desc: 'ไดนาแม็กซ์ครั้งแรก', reward: 500, goal: s => !!s._dynamaxed, prog: s => [s._dynamaxed ? 1 : 0, 1] },
  { id: 'tower10', ico: '🗼', name: 'นักไต่หอคอย', desc: 'ขึ้นหอคอยถึงชั้น 10', reward: 400, goal: s => (s.tower && s.tower.bestFloor || 0) >= 10, prog: s => [(s.tower && s.tower.bestFloor) || 0, 10] },
  { id: 'tower25', ico: '🏯', name: 'ผู้พิชิตหอคอย', desc: 'ขึ้นหอคอยถึงชั้น 25', reward: 1500, goal: s => (s.tower && s.tower.bestFloor || 0) >= 25, prog: s => [(s.tower && s.tower.bestFloor) || 0, 25] },
  { id: 'tower50', ico: '👑', name: 'ราชาหอคอย', desc: 'ขึ้นหอคอยถึงชั้น 50', reward: 5000, goal: s => (s.tower && s.tower.bestFloor || 0) >= 50, prog: s => [(s.tower && s.tower.bestFloor) || 0, 50] },
  { id: 'firstcrit', ico: '🎯', name: 'จุดอ่อน!', desc: 'โจมตีติดคริติคอลครั้งแรก', reward: 150, goal: s => !!s._critHit, prog: s => [s._critHit ? 1 : 0, 1] },
  { id: 'firstpriority', ico: '⚡', name: 'ไวเป็นสายฟ้า', desc: 'ใช้ท่า Priority แซงคิวสำเร็จครั้งแรก', reward: 150, goal: s => !!s._usedPriority, prog: s => [s._usedPriority ? 1 : 0, 1] },
  { id: 'firstweatherhit', ico: '🌦️', name: 'พลังธรรมชาติ', desc: 'โจมตีด้วยท่าที่สภาพอากาศช่วยบูสต์ครั้งแรก', reward: 150, goal: s => !!s._weatherHit, prog: s => [s._weatherHit ? 1 : 0, 1] },
  { id: 'firstquickclaw', ico: '🍀', name: 'โชคเข้าข้าง', desc: 'Quick Claw แซงคิวโจมตีก่อนสำเร็จครั้งแรก', reward: 200, goal: s => !!s._quickClawSaved, prog: s => [s._quickClawSaved ? 1 : 0, 1] },
  { id: 'firstgmax', ico: '💥', name: 'ยักษ์ตัวจริง', desc: 'ไดนาแม็กซ์เป็นร่าง G-Max จริงครั้งแรก', reward: 600, goal: s => !!s._gmaxed, prog: s => [s._gmaxed ? 1 : 0, 1] },
  { id: 'gotmegaring', ico: '💍', name: 'พร้อมเมก้า', desc: 'ปลดล็อกกำไลเมก้า', reward: 300, goal: s => !!s.hasMegaRing, prog: s => [s.hasMegaRing ? 1 : 0, 1] },
  { id: 'gotdynamaxband', ico: '⌚', name: 'พร้อมไดนาแม็กซ์', desc: 'ปลดล็อกกำไลไดนาแม็กซ์', reward: 300, goal: s => !!s.hasDynamaxBand, prog: s => [s.hasDynamaxBand ? 1 : 0, 1] },
  { id: 'firstribbon', ico: '🎀', name: 'นักประกวดมือใหม่', desc: 'ชนะที่ 1 คอนเทสต์ครั้งแรก', reward: 250, goal: s => !!s._contestWon, prog: s => [s._contestWon ? 1 : 0, 1] },
  { id: 'allribbons', ico: '🏵️', name: 'จอมประกวด', desc: 'ชนะที่ 1 ครบทั้ง 5 หมวดคอนเทสต์', reward: 1000,
    goal: s => CONTEST_CATEGORIES.every(c => ((s.contest && s.contest.ribbons && s.contest.ribbons[c.id]) || 0) > 0),
    prog: s => [CONTEST_CATEGORIES.filter(c => ((s.contest && s.contest.ribbons && s.contest.ribbons[c.id]) || 0) > 0).length, CONTEST_CATEGORIES.length] },
  { id: 'firstrival', ico: '🔥', name: 'เอาชนะคู่แข่ง', desc: 'ชนะคู่แข่งประจำตัวครั้งแรก', reward: 300, goal: s => !!s._rivalWon, prog: s => [s._rivalWon ? 1 : 0, 1] },
  { id: 'rival10', ico: '🥇', name: 'จอมยุทธ์คู่แข่ง', desc: 'ชนะคู่แข่งประจำตัวรวม 10 ครั้ง', reward: 1500, goal: s => ((s.rival && s.rival.wins) || 0) >= 10, prog: s => [(s.rival && s.rival.wins) || 0, 10] },
  { id: 'firstmerchant', ico: '🧳', name: 'นักช้อปเร่ร่อน', desc: 'ซื้อของจากพ่อค้าเร่ครั้งแรก', reward: 150, goal: s => !!s._merchantBought, prog: s => [s._merchantBought ? 1 : 0, 1] },
  { id: 'firstharvest', ico: '🌾', name: 'ชาวไร่มือใหม่', desc: 'เก็บเกี่ยวไร่เบอร์รี่ครั้งแรก', reward: 150, goal: s => !!s._farmHarvested, prog: s => [s._farmHarvested ? 1 : 0, 1] },
  { id: 'firstroute', ico: '🧭', name: 'นักเดินทางสายสู้', desc: 'ชนะเทรนเนอร์ประจำเส้นทางครั้งแรก', reward: 150, goal: s => (s.routeWins || 0) >= 1, prog: s => [s.routeWins || 0, 1] },
  { id: 'route20', ico: '🛤️', name: 'เจ้าถนน', desc: 'ชนะเทรนเนอร์เส้นทางรวม 20 ครั้ง', reward: 800, goal: s => (s.routeWins || 0) >= 20, prog: s => [s.routeWins || 0, 20] },
  { id: 'firstghost', ico: '👤', name: 'ดวลออนไลน์', desc: 'ชนะทีมผู้เล่นคนอื่น (Ghost) ครั้งแรก', reward: 300, goal: s => (s.ghostWins || 0) >= 1, prog: s => [s.ghostWins || 0, 1] },
  { id: 'ghost15', ico: '⚔️', name: 'นักล่าผู้เล่น', desc: 'ชนะ Ghost Battle รวม 15 ครั้ง', reward: 1500, goal: s => (s.ghostWins || 0) >= 15, prog: s => [s.ghostWins || 0, 15] },
  { id: 'combo10', ico: '🔥', name: 'ล่าต่อเนื่อง', desc: 'ทำคอมโบจับตัวเดิมถึง ×10', reward: 300, goal: s => (s.bestCombo || 0) >= 10, prog: s => [s.bestCombo || 0, 10] },
  { id: 'combo30', ico: '💥', name: 'เจ้าแห่งคอมโบ', desc: 'ทำคอมโบจับตัวเดิมถึง ×30', reward: 1200, goal: s => (s.bestCombo || 0) >= 30, prog: s => [s.bestCombo || 0, 30] },
  { id: 'firsttrade', ico: '🔄', name: 'มิตรภาพแลกเปลี่ยน', desc: 'เทรดโปเกมอนกับผู้เล่นอื่นสำเร็จครั้งแรก', reward: 300, goal: s => !!s._traded, prog: s => [s._traded ? 1 : 0, 1] },
  { id: 'hardcorestart', ico: '💀', name: 'ก้าวสู่ Hardcore', desc: 'เปิดโหมด Hardcore ครั้งแรก', reward: 200, goal: s => !!s._hardcoreEverOn, prog: s => [s._hardcoreEverOn ? 1 : 0, 1] },
  { id: 'hardcoredex20', ico: '💀', name: 'นักผจญภัยสายฮาร์ดคอร์', desc: 'จับครบ 20 ชนิดระหว่างเปิดโหมด Hardcore', reward: 500,
    goal: s => !!(s.settings && s.settings.hardcoreMode) && speciesOwnedCount() >= 20,
    prog: s => [(s.settings && s.settings.hardcoreMode) ? speciesOwnedCount() : 0, 20] },
  { id: 'hardcoredex50', ico: '☠️', name: 'ผู้รอดชีวิต', desc: 'จับครบ 50 ชนิดระหว่างเปิดโหมด Hardcore', reward: 1500,
    goal: s => !!(s.settings && s.settings.hardcoreMode) && speciesOwnedCount() >= 50,
    prog: s => [(s.settings && s.settings.hardcoreMode) ? speciesOwnedCount() : 0, 50] },
  { id: 'raidfirst', ico: '👹', name: 'นักล่า Raid มือใหม่', desc: 'ร่วมโจมตี Raid บอสรายสัปดาห์ครั้งแรก', reward: 200, goal: s => (s.raidTotalDamage || 0) >= 1, prog: s => [Math.min(s.raidTotalDamage || 0, 1), 1] },
  { id: 'raiddmg20k', ico: '👹', name: 'นักล่า Raid', desc: 'ทำความเสียหายสะสมให้ Raid บอสรวม 20,000', reward: 800, goal: s => (s.raidTotalDamage || 0) >= 20000, prog: s => [s.raidTotalDamage || 0, 20000] },
  { id: 'raidkill', ico: '🔥', name: 'มือฆ่า Raid บอส', desc: 'ฆ่า Raid บอสได้เองในการโจมตีครั้งเดียว (หายากมาก)', reward: 2000, goal: s => !!s._raidBossKilled, prog: s => [s._raidBossKilled ? 1 : 0, 1] },
  { id: 'goldendedenne', ico: '🏆', name: 'ตัวทองในตำนาน', desc: 'ได้ Golden Dedenne จากการ Swap NPC (โอกาส 1/100000)', reward: 5000, goal: s => !!s._gotGolden, prog: s => [s._gotGolden ? 1 : 0, 1] },
];

// รางวัลจบเดกซ์ (กดรับเองเมื่อถึงเกณฑ์)
const DEX_REWARDS = [
  { id: 'd25', need: 25, coins: 250, ball: ['great', 5] },
  { id: 'd50', need: 50, coins: 500, ball: ['ultra', 3] },
  { id: 'd100', need: 100, coins: 1000, ball: ['ultra', 6] },
  { id: 'd250', need: 250, coins: 2500, ball: ['ultra', 12] },
  { id: 'd500', need: 500, coins: 6000, ball: ['master', 1] },
  { id: 'd1025', need: 1025, coins: 25000, ball: ['master', 3] },
];

// ---------- natures ----------
const NATURES = [
  { name: 'Hardy', up: null, down: null }, { name: 'Lonely', up: 'atk', down: 'def' },
  { name: 'Brave', up: 'atk', down: 'spd' }, { name: 'Adamant', up: 'atk', down: 'spatk' },
  { name: 'Naughty', up: 'atk', down: 'spdef' }, { name: 'Bold', up: 'def', down: 'atk' },
  { name: 'Docile', up: null, down: null }, { name: 'Relaxed', up: 'def', down: 'spd' },
  { name: 'Impish', up: 'def', down: 'spatk' }, { name: 'Lax', up: 'def', down: 'spdef' },
  { name: 'Timid', up: 'spd', down: 'atk' }, { name: 'Hasty', up: 'spd', down: 'def' },
  { name: 'Serious', up: null, down: null }, { name: 'Jolly', up: 'spd', down: 'spatk' },
  { name: 'Naive', up: 'spd', down: 'spdef' }, { name: 'Modest', up: 'spatk', down: 'atk' },
  { name: 'Mild', up: 'spatk', down: 'def' }, { name: 'Quiet', up: 'spatk', down: 'spd' },
  { name: 'Bashful', up: null, down: null }, { name: 'Rash', up: 'spatk', down: 'spdef' },
  { name: 'Calm', up: 'spdef', down: 'atk' }, { name: 'Gentle', up: 'spdef', down: 'def' },
  { name: 'Sassy', up: 'spdef', down: 'spd' }, { name: 'Careful', up: 'spdef', down: 'spatk' },
  { name: 'Quirky', up: null, down: null },
];
const STAT_LABEL = { hp: 'HP', atk: 'ATK', def: 'DEF', spatk: 'Sp.ATK', spdef: 'Sp.DEF', spd: 'SPD' };
// โปเกมอนไร้เพศ (ประมาณ): แม่เหล็ก/บอล/ดิทโต้/เลเจนดารี
const GENDERLESS = new Set([81, 82, 100, 101, 120, 121, 132, 137, 144, 145, 146, 150, 151]);

// ---------- regions ----------
// bgImg = ภาพพื้นหลังจริงจาก Wikimedia Commons (ตรวจสอบแล้วว่าโหลดได้จริง) ใช้ทับ bg (gradient เดิม เป็น fallback ถ้าภาพโหลดไม่ขึ้น)
const REGIONS = [
  { id: 'plains', name: 'ทุ่งหญ้าเริ่มต้น', emoji: '🌾', types: ['normal', 'grass', 'bug', 'flying'],
    lvl: [2, 14], boost: 0, mascots: [25, 133, 10, 16],
    bg: 'linear-gradient(180deg,#8fd0f0 0%,#87ceeb 42%,#7ec850 42%,#4a9e3f 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Meadow_%28145585419%29.jpeg/1280px-Meadow_%28145585419%29.jpeg',
    desc: 'เขตมือใหม่ ปลอดภัย โปเกมอนธรรมดา' },
  { id: 'forest', name: 'ป่าลึกครึ้ม', emoji: '🌲', types: ['bug', 'grass', 'poison', 'flying'],
    lvl: [6, 22], boost: 0, mascots: [1, 12, 48, 43],
    bg: 'linear-gradient(180deg,#3b6b2e 0%,#1f3d15 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Dense_forest_canopy_quinault_rainforest_c_bubar_march_05_2015_%2822655664738%29.jpg/1280px-Dense_forest_canopy_quinault_rainforest_c_bubar_march_05_2015_%2822655664738%29.jpg',
    desc: 'ต้นไม้หนาทึบ เต็มไปด้วยแมลง' },
  { id: 'sea', name: 'ชายฝั่งทะเล', emoji: '🌊', types: ['water', 'ice', 'flying'],
    lvl: [8, 26], boost: 0, mascots: [7, 120, 116, 129],
    bg: 'linear-gradient(180deg,#7ec8f0 0%,#2b8fc9 45%,#12557f 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Ocean_coastline_waves_water.jpg',
    desc: 'คลื่นซัดสาด โปเกมอนน้ำชุกชุม' },
  { id: 'cave', name: 'ถ้ำมืดใต้ดิน', emoji: '🪨', types: ['rock', 'ground', 'steel', 'dark', 'poison'],
    lvl: [12, 32], boost: 1, mascots: [95, 41, 50, 74],
    bg: 'linear-gradient(180deg,#3a3a4a 0%,#161620 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Coxs_cave_Cheddar_Gorge.jpg',
    desc: 'อับแสง ระวังโปเกมอนหิน/ดิน', unlock: 8 },
  { id: 'volcano', name: 'ปล่องภูเขาไฟ', emoji: '🌋', types: ['fire', 'rock', 'ground'],
    lvl: [18, 40], boost: 1, mascots: [4, 58, 104, 37],
    bg: 'linear-gradient(180deg,#7a2b1a 0%,#3a0f08 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/K%C4%ABlauea_-_Volcano_eruption_%28night%29.jpg/1280px-K%C4%ABlauea_-_Volcano_eruption_%28night%29.jpg',
    desc: 'ร้อนระอุ โปเกมอนไฟดุร้าย', unlock: 12 },
  { id: 'power', name: 'โรงไฟฟ้าร้าง', emoji: '⚡', types: ['electric', 'steel', 'poison'],
    lvl: [15, 36], boost: 1, mascots: [25, 81, 100, 125],
    bg: 'linear-gradient(180deg,#4a4620 0%,#26240e 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Moran_Plant_Burlington_VT.jpg/1280px-Moran_Plant_Burlington_VT.jpg',
    desc: 'กระแสไฟฟ้ารั่ว เต็มไปด้วยพลัง', unlock: 15 },
  { id: 'desert', name: 'ทะเลทรายไร้ขอบเขต', emoji: '🏜️', types: ['ground', 'rock', 'fire', 'dark'],
    lvl: [20, 42], boost: 1, mascots: [27, 328, 331, 322],
    bg: 'linear-gradient(180deg,#e8c780 0%,#c99a4e 55%,#8a5f2a 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/A_sand_dune_in_the_Maranjab_Desert_of_Iran-_Photographer_Mostafa_Meraji_08.jpg/1280px-A_sand_dune_in_the_Maranjab_Desert_of_Iran-_Photographer_Mostafa_Meraji_08.jpg',
    desc: 'ทรายร้อนสุดลูกหูลูกตา พายุทรายบ่อยครั้ง', unlock: 18 },
  { id: 'swamp', name: 'หนองบึงมืดครึ้ม', emoji: '🐊', types: ['poison', 'grass', 'water', 'bug'],
    lvl: [24, 46], boost: 1, mascots: [453, 537, 45, 168],
    bg: 'linear-gradient(180deg,#4a5a3a 0%,#2a3a20 55%,#1a2412 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Bald_cypress_trees_in_swamp_-_DPLA_-_2daefd690acacd0bb424bb623a49095b.jpg/1280px-Bald_cypress_trees_in_swamp_-_DPLA_-_2daefd690acacd0bb424bb623a49095b.jpg',
    desc: 'น้ำขุ่นครึ้ม กลิ่นพิษโชยมา ระวังตัวที่ซ่อนอยู่ใต้น้ำ', unlock: 22 },
  { id: 'snow', name: 'ยอดเขาหิมะ', emoji: '❄️', types: ['ice', 'water', 'flying', 'rock'],
    lvl: [22, 44], boost: 2, mascots: [144, 131, 361, 215],
    bg: 'linear-gradient(180deg,#dbeeff 0%,#9dc3e6 55%,#6f96c4 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg/1280px-Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg',
    desc: 'หนาวเหน็บ ตัวหายากซ่อนอยู่', unlock: 25 },
  { id: 'deepsea', name: 'ใต้ทะเลลึก', emoji: '🐠', types: ['water', 'ice', 'dark', 'poison'],
    lvl: [28, 52], boost: 2, mascots: [369, 211, 319, 366],
    bg: 'linear-gradient(180deg,#0a3a5a 0%,#052540 55%,#01101f 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Kleine_Bonaire-Underwater_life%28js%29.jpg/1280px-Kleine_Bonaire-Underwater_life%28js%29.jpg',
    desc: 'มืดมิดลึกลง แสงแดดส่องไม่ถึง โปเกมอนน้ำลึกหายากรอคอยอยู่', unlock: 32 },
  { id: 'mystic', name: 'ดินแดนลึกลับ', emoji: '🔮', types: ['psychic', 'ghost', 'dragon', 'fairy', 'dark'],
    lvl: [30, 60], boost: 2, mascots: [94, 150, 148, 359],
    bg: 'linear-gradient(180deg,#432a70 0%,#180830 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/A_Colorful_Aurora_Paints_the_Night_Sky_%28153463%29.jpg/1280px-A_Colorful_Aurora_Paints_the_Night_Sky_%28153463%29.jpg',
    desc: 'พลังลึกลับ โอกาสเจอเลเจนดารีสูง', unlock: 40 },
  { id: 'ruins', name: 'ซากปรักหักพังโบราณ', emoji: '🗿', types: ['ghost', 'rock', 'steel', 'psychic'],
    lvl: [45, 78], boost: 2, mascots: [622, 563, 437, 344],
    bg: 'linear-gradient(180deg,#5a4a30 0%,#3a2f1c 55%,#221a10 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Angkor_Wat_Ta_Prohm_Temple_doorway_overgrown_with_tree_roots.jpg/1280px-Angkor_Wat_Ta_Prohm_Temple_doorway_overgrown_with_tree_roots.jpg',
    desc: 'อารยธรรมเก่าแก่ที่ถูกลืม พลังลึกลับสิงสู่ซากปรักหักพัง', unlock: 50 },
  { id: 'sky', name: 'เกาะลอยฟ้า', emoji: '🌤️', types: ['flying', 'dragon', 'fairy', 'electric'],
    lvl: [40, 75], boost: 2, mascots: [333, 334, 176, 227],
    bg: 'linear-gradient(180deg,#aee0ff 0%,#7cc4f0 45%,#fff6d8 100%)',
    bgImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Sea_of_clouds_2023.jpg/1280px-Sea_of_clouds_2023.jpg',
    desc: 'เหนือทะเลเมฆ ลมแรง โปเกมอนบินหายากรออยู่', unlock: 55 },
  { id: 'dragon', name: 'ถ้ำรังมังกร', emoji: '🐉', types: ['dragon', 'flying', 'fire', 'ground'],
    lvl: [55, 90], boost: 2, mascots: [147, 149, 373, 445],
    bg: 'linear-gradient(180deg,#3a1a2e 0%,#5a1f1a 50%,#1a0a10 100%)',
    desc: 'รังของมังกรโบราณ ไอร้อนและพลังมังกรแผ่กระจาย', unlock: 62 },
  { id: 'crystal', name: 'ถ้ำคริสตัล', emoji: '💠', types: ['ice', 'rock', 'steel', 'fairy', 'psychic'],
    lvl: [58, 92], boost: 2, mascots: [615, 703, 476, 208],
    bg: 'linear-gradient(180deg,#1e3a5a 0%,#2a5a7a 45%,#0f1e33 100%)',
    desc: 'ผลึกเรืองแสงระยิบระยับ สะท้อนพลังลึกลับ', unlock: 70 },
  { id: 'void', name: 'รอยแยกมิติ', emoji: '🌌', types: ['dark', 'ghost', 'dragon', 'psychic'],
    lvl: [65, 100], boost: 3, mascots: [491, 487, 384, 249],
    bg: 'linear-gradient(180deg,#1a0a2e 0%,#2a1050 45%,#05030f 100%)',
    desc: 'ขอบสุดของโลก มิติบิดเบี้ยว โอกาสเจอเทพสูงสุด', unlock: 80 },
];
// ตำแหน่งบนแผนที่โลก (% ของกล่องแผนที่) + ธีมภูมิประเทศ (ตกแต่งเฉพาะจุดให้ตรงชื่อเขต) — สร้างขึ้นเอง ไม่อิงของจริง
const WORLD_POS = {
  plains:  { x: 24, y: 58 }, forest:  { x: 35, y: 71 }, sea:     { x: 10, y: 42 },
  cave:    { x: 45, y: 54 }, volcano: { x: 55, y: 69 }, power:   { x: 31, y: 43 },
  desert:  { x: 47, y: 85 }, swamp:   { x: 17, y: 80 }, snow:    { x: 61, y: 27 },
  deepsea: { x: 86, y: 60 }, mystic:  { x: 72, y: 47 }, ruins:   { x: 53, y: 39 },
  sky:     { x: 41, y: 13 }, dragon:  { x: 76, y: 79 }, crystal: { x: 89, y: 37 },
  void:    { x: 93, y: 13 },
};
REGIONS.forEach(r => { const p = WORLD_POS[r.id]; if (p) { r.wx = p.x; r.wy = p.y; } });
const REGION_BY_ID = {};
REGIONS.forEach(r => { REGION_BY_ID[r.id] = r; });
// รวมภาพพื้นหลังจริง (bgImg) กับ gradient เดิม (bg) เป็น CSS background เดียว
// ถ้าภาพโหลดไม่ขึ้น browser จะข้ามเลเยอร์นั้นไปเฉยๆ เหลือ gradient ให้เห็นเสมอ ไม่มีทางว่างเปล่า
function regionBgCss(r) {
  if (!r.bgImg) return r.bg;
  return `linear-gradient(180deg, rgba(10,12,26,.1), rgba(10,12,26,.28)), url('${r.bgImg}') center/cover no-repeat, ${r.bg}`;
}
// ===== ฉากพื้นหลังการต่อสู้แบบเกมจริง (Pokémon Showdown battle backgrounds) — โหลดได้จริง ตรวจแล้ว =====
const SHOWDOWN_FX = 'https://play.pokemonshowdown.com/fx/';
const REGION_BATTLE_BG = {
  plains: 'bg-meadow.png', forest: 'bg-forest.png', sea: 'bg-beach.png', cave: 'bg-dampcave.png',
  volcano: 'bg-volcanocave.png', power: 'bg-city.png', desert: 'bg-desert.png', swamp: 'bg-river.png',
  snow: 'bg-mountain.png', deepsea: 'bg-deepsea.png', mystic: 'bg-earthycave.png', ruins: 'bg-earthycave.png',
  sky: 'bg-mountain.png', dragon: 'bg-volcanocave.png', crystal: 'bg-icecave.png', void: 'bg-space.jpg',
};
// พื้นหลังฉากล่า/สู้ — ใช้ battle background เกมจริงถ้ามีแมป (ล่างมืดนิดให้ตัวเด่น) ไม่งั้น fallback ภาพเขตเดิม
function sceneBgCss(r) {
  const bg = REGION_BATTLE_BG[r.id];
  if (!bg) return regionBgCss(r);
  return `linear-gradient(180deg, rgba(10,12,26,.05) 40%, rgba(10,12,26,.35) 100%), url('${SHOWDOWN_FX}${bg}') center/cover no-repeat, ${r.bg}`;
}

// ================================================================
//  data prep
// ================================================================
const MON_BY_ID = {};
MONSTERS.forEach(m => {
  MON_BY_ID[m.id] = m;
  const s = m.stats;
  m._bst = s.hp + s.atk + s.def + s.spatk + s.spdef + s.spd;
});
// tierOf + UB_LEGENDARY_IDS ย้ายไป logic.js แล้ว (import ด้านบน)
MONSTERS.forEach(m => { m._tier = tierOf(m); });
// เจนของโปเกมอนจาก national dex id
function genOf(id) {
  if (id <= 151) return 1; if (id <= 251) return 2; if (id <= 386) return 3;
  if (id <= 493) return 4; if (id <= 649) return 5; if (id <= 721) return 6;
  if (id <= 809) return 7; if (id <= 905) return 8; return 9;
}
// เทพทั้งหมดจัดกลุ่มตามเจน + น้ำหนักโอกาสออก (เจน 1 ง่ายสุด → เจน 9 ยากสุด)
const ALL_LEGENDARY = MONSTERS.filter(m => m._tier === 'legendary');
const LEGENDARY_BY_GEN = {};
for (let g = 1; g <= 9; g++) LEGENDARY_BY_GEN[g] = ALL_LEGENDARY.filter(m => genOf(m.id) === g);
const GEN_LEG_WEIGHT = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1 };
function pickLegendaryGenWeighted() {
  const gens = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(g => LEGENDARY_BY_GEN[g].length);
  if (!gens.length) return pick(ALL_LEGENDARY.length ? ALL_LEGENDARY : MONSTERS);
  const total = gens.reduce((s, g) => s + GEN_LEG_WEIGHT[g], 0);
  let r = Math.random() * total, gen = gens[0];
  for (const g of gens) { if ((r -= GEN_LEG_WEIGHT[g]) < 0) { gen = g; break; } }
  return pick(LEGENDARY_BY_GEN[gen]);
}
const ALL_TYPES = [...new Set(MONSTERS.flatMap(m => m.types))].sort();

// pool สำหรับตกปลา (ธาตุน้ำ/น้ำแข็ง)
const FISH_POOL = MONSTERS.filter(m => m.types.includes('water') || m.types.includes('ice'));
const FISH_POOL_BY_TIER = {};
TIER_ORDER.forEach(t => { FISH_POOL_BY_TIER[t] = FISH_POOL.filter(m => m._tier === t); });

// pool ต่อเขต แยกตามระดับ
REGIONS.forEach(r => {
  r._pool = MONSTERS.filter(m => m.types.some(t => r.types.includes(t)));
  r._byTier = {};
  TIER_ORDER.forEach(t => { r._byTier[t] = r._pool.filter(m => m._tier === t); });
});

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
// clamp ย้ายไป logic.js แล้ว (import ด้านบน)
const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
let _uidc = 0;
const genUid = () => Date.now().toString(36) + (_uidc++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

function spriteImg(id, shiny, cls) {
  const chain = spriteChain(id, shiny);
  const first = chain[0], fb = chain.slice(1).join('|');
  return `<img class="${cls || ''}" loading="lazy" src="${first}" data-fb="${fb}" onerror="__sf(this)" alt="">`;
}
// ===== รูปเทรนเนอร์ (Pokémon Showdown) — ภาพเต็มตัวสำหรับหน้า VS + หัวศัตรู มี emoji สำรองถ้าโหลดไม่ได้ =====
const TRAINER_SP_BASE = 'https://play.pokemonshowdown.com/sprites/trainers/';
const TRAINER_SPRITES = {   // ยิม/แชมป์ — ผูกผู้นำยิมจริงตามธาตุ
  g1: 'gardenia', g2: 'misty', g3: 'blaine', g4: 'volkner',
  g5: 'koga', g6: 'brock', g7: 'sabrina', g8: 'clair', champ: 'cynthia',
  rival: 'silver-gen2', player: 'red-gen1',
};
// สไปรต์ "บอส/ผู้ร้าย" หมุนตามเขต ให้แต่ละเขตเจอเทรนเนอร์บอสต่างหน้า
const BOSS_TRAINER_POOL = ['giovanni', 'archie-gen6', 'maxie-gen6', 'cyrus', 'ghetsis', 'guzma', 'lusamine', 'steven', 'wallace', 'alder', 'leon', 'blue', 'lance', 'red-gen1'];
function bossTrainerFor(regionId) {
  let h = 0; const s = String(regionId || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BOSS_TRAINER_POOL[h % BOSS_TRAINER_POOL.length];
}
// คืนภาพเทรนเนอร์เต็มตัว (ถ้าโหลดไม่ได้ ซ่อนภาพแล้วปล่อยให้ emoji ข้างๆ ทำหน้าที่แทน)
function trainerImg(name, cls) {
  if (!name) return '';
  const url = TRAINER_SP_BASE + name + '.png';
  return `<img class="trainer-sprite ${cls || ''}" loading="lazy" src="${url}" onerror="this.classList.add('ts-hide')" alt="">`;
}
// หา key เทรนเนอร์ของฝั่งศัตรูจาก battleState (ยิม/คู่แข่ง/บอสเขต)
function foeTrainerName(b) {
  if (!b) return null;
  if (b.isRaid) return null;   // Raid บอสเป็นสัตว์ป่าเทพ ไม่ใช่เทรนเนอร์ — ไม่ต้องมีสไปรต์คน
  if (b.isRival) return TRAINER_SPRITES.rival;
  if (b.gym && b.gym.sprite) return b.gym.sprite;   // เทรนเนอร์เส้นทางมีสไปรต์เฉพาะตัว
  if (b.mode === 'trainer' && b.gym) return TRAINER_SPRITES[b.gym.id] || 'blackbelt';
  if (b.isBoss && b.bossData && b.bossData.region) return bossTrainerFor(b.bossData.region.id);
  return null;
}
function weightedTier(boost) {
  const w = TIER_WEIGHTS[boost] || TIER_WEIGHTS[0];
  const total = TIER_ORDER.reduce((s, t) => s + w[t], 0);
  let r = Math.random() * total;
  for (const t of TIER_ORDER) { if ((r -= w[t]) < 0) return t; }
  return 'common';
}

// ================================================================
//  STATE
// ================================================================
let state;
function newSave() {
  return {
    coins: 80,
    balls: { poke: 25, great: 5, ultra: 0, master: 0 },
    berries: { razz: 3, golden: 0 },
    berryBoost: { luck: 0, spawnsLeft: 0 },   // เบอร์รี่ที่ใช้ค้างไว้ (บูสต์โอกาสเจอตัวหายากของสปอว์นถัดไป)
    farm: [{ berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }],   // ไร่เบอร์รี่ 3 แปลง
    charms: { catch: 0, xp: 0 },                 // charm ที่มีในคลัง (ใช้ครั้งละ 30 นาที)
    activeBoosts: { catch: 0, xp: 0 },           // เวลาหมดอายุของบูสต์ (timestamp)
    shinyCharms: 0,       // Shiny Charm ติดตัวถาวร (0-5 ชิ้น)
    stones: 0,
    candies: 0,          // Rare Candy (เลเวลอัพทันที)
    fishTokens: 0,       // เหรียญตกปลา
    fishReadyAt: 0,      // คูลดาวน์ตกปลา (timestamp)
    safariTickets: 0,    // ตั๋ว Safari
    safari: { left: 0 }, // จำนวน spawn บูสต์ที่เหลือใน Safari
    contest: { readyAt: 0, ribbons: {} },   // คูลดาวน์คอนเทสต์ + ริบบิ้นที่ได้ {categoryId: count}
    amulets: 0,          // Amulet Coin (+5%/ชิ้น สูงสุด 10)
    streaks: { common: 0, uncommon: 0, rare: 0, superrare: 0, legendary: 0 },  // สตรีคจับต่อเนื่องรายระดับ
    bestStreaks: {},     // สตรีคสูงสุดที่เคยทำ
    lockboxes: 0,        // กล่องสุ่ม
    catchbot: { pkLvl: 0, durLvl: 0, profLvl: 0, active: false, startedAt: 0 },
    heldInv: {},         // คลัง Held Item ที่ยังไม่ได้สวม {key:count}
    megaStoneInv: {},    // คลังหินเมก้าที่ยังไม่ได้แนบ {stoneKey:count}
    hasMegaRing: false,  // กำไลเมก้า — ปลดล็อกครั้งเดียว จำเป็นก่อนเมก้าอีโวลูชันได้
    gmaxStoneInv: {},    // คลังหินปลุกพลัง G-Max ที่ยังไม่ได้แนบ {speciesKey:count}
    hasDynamaxBand: false, // กำไลไดนาแม็กซ์ — ปลดล็อกครั้งเดียว จำเป็นก่อนไดนาแม็กซ์ได้
    maxEnergy: 0,        // พลังงานไดนาแม็กซ์ (ใช้ครั้งละ 1 ในการต่อสู้)
    gymsBeaten: {},      // {gymId:true} ยิมที่ชนะแล้ว
    battlePoints: 0,     // BP จากชนะยิม/บอส ใช้แลกของใน BP Shop
    bpBought: {},        // {itemId: count} จำนวนที่แลกไปแล้ว (ใช้กันของ limited)
    tower: { floor: 1, bestFloor: 0 },   // หอคอยไต่ระดับ — แพ้แล้วรีเซ็ตกลับชั้น 1, สถิติสูงสุดเก็บถาวร
    gymReadyAt: 0,         // คูลดาวน์ท้ายิม (กันสแปมกด)
    bossReadyAt: 0,        // คูลดาวน์ท้าบอส
    shopQty: {},          // {ballKey: qty} จำนวนบอลที่เลือกซื้อล่าสุดในร้าน (ต่อชนิด)
    selBall: 'poke',
    region: 'plains',
    unlocked: { plains: true },
    weather: {},         // {regionId:{type,until}}
    worldEvent: null,    // { id, until } อีเวนต์สุ่มตามฤดูกาลที่กำลังทำงาน
    nextEventCheck: 0,   // timestamp เช็คอีเวนต์สุ่มครั้งถัดไป
    merchant: null,       // { until, stock:[{id,bought}] } พ่อค้าเร่ที่กำลังอยู่ (ถ้ามี)
    rival: { readyAt: 0, wins: 0, losses: 0 },   // คู่แข่งประจำตัว — สถิติชนะ/แพ้ + คูลดาวน์ท้าครั้งถัดไป
    eventHistory: [],    // ['id', ...] อีเวนต์ที่เคยเจอ (5 ล่าสุด)
    dexRewards: {},      // {rewardId:true} รับรางวัลจบเดกซ์แล้ว
    badges: {},          // {regionId:true} ชนะบอสแล้ว
    caught: [],          // รายตัว: {uid,id,level,xp,tier,shiny,nature,gender,iv{},locked}
    seen: {},            // {id:true}
    party: [],           // [uid,...] ทีมสูงสุด 6 ตัว (party[0] = หัวหน้า/Buddy)
    buddyUid: null,      // เก็บไว้เผื่อ save เก่า (ใช้ party แทน)
    teamPresets: [null, null, null],   // ชุดทีมสำรอง 3 ช่อง {name, uids:[...]}
    eggs: [],
    quests: [], questDate: '',
    achievements: {},    // {achId:true} รับรางวัลแล้ว
    settings: { sound: true, music: false, spawnSpeed: 'normal',
      rareAlerts: true, eventAlerts: true, mascotDeco: true, reduceMotion: false, confirmRelease: true, fastBattle: false, hardcoreMode: false },
    hardcoreDeaths: 0,   // จำนวนตัวที่ถูกปล่อยถาวรจากโหมด Hardcore (สถิติ ไม่รีเซ็ตแม้ปิดโหมด)
    trainerXp: 0,
    streak: 0, lastLogin: '',
    lastSeen: Date.now(), playSec: 0,
    tutorialDone: false,
    _evolved: false,
    totalCaught: 0,
    createdAt: Date.now(),
  };
}
// merge แบบ deep ทุก object ที่ซ้อนกัน (ไม่ใช่แค่ settings) — กันเซฟเก่าที่มี object บางฟิลด์แต่ field ย่อยไม่ครบ
// (เช่น tower เก่ามีแค่ {floor} ไม่มี bestFloor) ทำให้โค้ดที่ access ลึกๆ พังแบบ Cannot read properties of undefined
// อาเรย์ไม่ deep-merge (แทนที่ทั้งก้อนด้วยของเซฟเก่าตรงๆ เพราะ merge รายสมาชิกไม่มีความหมาย)
function deepMergeDefaults(fresh, obj) {
  const out = Array.isArray(fresh) ? fresh.slice() : Object.assign({}, fresh);
  for (const k in obj) {
    const freshVal = fresh[k], objVal = obj[k];
    const bothPlainObjects = objVal && typeof objVal === 'object' && !Array.isArray(objVal)
      && freshVal && typeof freshVal === 'object' && !Array.isArray(freshVal);
    if (bothPlainObjects) out[k] = deepMergeDefaults(freshVal, objVal);
    else if (objVal !== undefined) out[k] = objVal;
  }
  return out;
}
function mergeSave(obj) {
  return deepMergeDefaults(newSave(), obj || {});
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { state = mergeSave(JSON.parse(raw)); runMigrations(state, SAVE_VERSION, SAVE_MIGRATIONS); migrateSave(); return; }
  } catch (e) { console.warn('load failed', e); }
  state = newSave(); state._v = SAVE_VERSION;
}
function migrateSave() {
  if (!Array.isArray(state.party)) state.party = [];
  if (state.buddyUid && !state.party.length) state.party = [state.buddyUid];
  // ตัด uid ในทีมที่ไม่มีตัวจริงแล้ว
  state.party = state.party.filter(u => state.caught.some(c => c.uid === u)).slice(0, 6);
  state.buddyUid = state.party[0] || null;
}
function save() {
  if (state) state.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  cloudSyncDebounced();
}
let _cloudTimer = null;
function cloudSyncDebounced() {
  if (!(window.Cloud && Cloud.loggedIn())) return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(() => {
    Cloud.push(state).then(() => updateCloudStatus()).catch(() => {});
    // อัปเดตกระดานจัดอันดับอัตโนมัติถ้าตั้งชื่อไว้แล้ว (เงียบๆ ล้มเหลวไม่เป็นไร เช่นยังไม่มีตาราง)
    if (state.playerName && typeof myLbScore === 'function') Cloud.submitScore(myLbScore()).catch(() => {});
  }, 4000);
}

// ================================================================
//  toast / log / rare alert
// ================================================================
let _audioCtx = null;
function playSfx(type) {
  if (!state || !state.settings || !state.settings.sound) return;
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx, now = ctx.currentTime;
    const notes = type === 'rare' ? [523, 659, 784, 1047] : type === 'fail' ? [200, 150] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.15, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.12);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.13);
    });
  } catch (e) {}
}
// ---------- background music (WebAudio, generative) ----------
const MUSIC_SCALE = [0, 2, 4, 7, 9];   // เพนทาโทนิกเมเจอร์
const REGION_MUSIC = {
  plains:  { root: 60, tempo: 520, wave: 'triangle' },
  forest:  { root: 57, tempo: 600, wave: 'sine' },
  sea:     { root: 62, tempo: 560, wave: 'sine' },
  cave:    { root: 48, tempo: 700, wave: 'triangle' },
  volcano: { root: 53, tempo: 470, wave: 'sawtooth' },
  power:   { root: 64, tempo: 430, wave: 'square' },
  desert:  { root: 58, tempo: 500, wave: 'sawtooth' },
  swamp:   { root: 50, tempo: 640, wave: 'triangle' },
  snow:    { root: 67, tempo: 640, wave: 'sine' },
  deepsea: { root: 45, tempo: 680, wave: 'sine' },
  mystic:  { root: 55, tempo: 580, wave: 'triangle' },
  ruins:   { root: 52, tempo: 600, wave: 'triangle' },
  sky:     { root: 69, tempo: 460, wave: 'sine' },
  dragon:  { root: 47, tempo: 490, wave: 'sawtooth' },
  crystal: { root: 71, tempo: 600, wave: 'sine' },
  void:    { root: 43, tempo: 720, wave: 'square' },
};
let musicTimer = null, musicStep = 0;
function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function playTone(freq, wave, dur, vol) {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx, now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + dur + 0.02);
  } catch (e) {}
}
function musicTick() {
  if (!state.settings.music) { musicTimer = null; return; }
  const c = REGION_MUSIC[state.region] || REGION_MUSIC.plains;
  const oct = (musicStep % 8 < 4) ? 0 : 12;
  const note = c.root + oct + MUSIC_SCALE[Math.floor(Math.random() * MUSIC_SCALE.length)];
  playTone(midiFreq(note), c.wave, 0.35, 0.05);
  if (musicStep % 4 === 0) playTone(midiFreq(c.root - 12), 'sine', 0.6, 0.045);   // เบส
  musicStep++;
  musicTimer = setTimeout(musicTick, c.tempo);
}
function startMusic() { if (musicTimer || !state.settings.music) return; musicStep = 0; musicTick(); }
function stopMusic() { clearTimeout(musicTimer); musicTimer = null; }

const TOAST_MAX = 3;   // กันข้อความท่วมจอตอนกดรัวๆ — เก็บแค่ล่าสุด 3 อัน เก่ากว่านั้นตัดทิ้งทันที
function toast(msg, kind) {
  const box = $('#toasts');
  while (box.children.length >= TOAST_MAX) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function logMsg(msg, kind) {
  const box = $('#log');
  const el = document.createElement('div');
  el.className = 'log-item log-in ' + (kind || '');
  el.innerHTML = msg;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  // แจ้งเตือนกิจกรรมหายเองอัตโนมัติ (ข่าวสำคัญอยู่นานกว่าเล็กน้อย) กันสะสมรกหน้าจอ
  const life = kind === 'big' ? 5500 : 3500;
  el._fade = setTimeout(() => { el.classList.add('log-out'); setTimeout(() => el.remove(), 450); }, life);
}
function showRareAlert(mon, tier, shiny) {
  if (!state.settings.rareAlerts) return;
  const el = $('#rareAlert');
  const label = shiny ? '✨ SHINY!' : '⭐ ' + TIER_LABEL[tier];
  el.className = 'rare-alert' + (shiny ? ' shiny' : '');
  el.innerHTML = `<div class="ra-tier">${label}</div>พบ <b>${mon.name}</b> ในป่า!`;
  playSfx('rare');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 6000);
}
function hideRareAlert() { $('#rareAlert').classList.add('hidden'); }
// เอฟเฟคเต็มจอตอนเจอ legendary/shiny — แสงวาบ + รัศมี + ประกายวิ่ง (ข้ามถ้าเปิดลดแอนิเมชัน)
let _fxTimer = null;
function playSpawnFx(kind) {
  if (state.settings && state.settings.reduceMotion) return;
  const ov = $('#fxOverlay'); if (!ov) return;
  const isShiny = kind === 'shiny';
  const rayColor = isShiny ? 'conic-gradient(from 0deg,#ff5d6c,#ffcb05,#47d16c,#3d7dca,#a06bff,#ff5d6c)' : 'conic-gradient(from 0deg,rgba(255,203,5,.9),rgba(255,240,180,.2),rgba(255,203,5,.9),rgba(255,240,180,.2),rgba(255,203,5,.9))';
  const icon = isShiny ? '✨' : '👑';
  const sparkles = Array.from({ length: 14 }, (_, i) =>
    `<span class="fx-spark" style="--a:${(360 / 14) * i}deg;--d:${.15 + (i % 5) * .06}s">${isShiny ? '✨' : '⭐'}</span>`).join('');
  ov.className = 'fx-overlay ' + (isShiny ? 'fx-shiny' : 'fx-legend');
  ov.innerHTML = `<div class="fx-rays" style="background:${rayColor}"></div>
    <div class="fx-flash"></div>
    <div class="fx-icon">${icon}</div>
    <div class="fx-sparks">${sparkles}</div>`;
  clearTimeout(_fxTimer);
  _fxTimer = setTimeout(() => { ov.className = 'fx-overlay hidden'; ov.innerHTML = ''; }, 1600);
}
function applyReduceMotion() {
  document.getElementById('app').classList.toggle('reduce-motion', !!state.settings.reduceMotion);
}
function confirmAction(msg) {
  return state.settings.confirmRelease === false ? true : confirm(msg);
}

// ================================================================
//  individual pokemon helpers
// ================================================================
function rollGender(id) {
  const gr = MON_BY_ID[id].genderRate;   // gender_rate จาก PokeAPI (จำนวน 1/8 ที่เป็นตัวเมีย, -1 = ไร้เพศ)
  if (gr != null) {
    if (gr < 0) return 'none';
    return Math.random() * 8 < gr ? 'F' : 'M';
  }
  if (GENDERLESS.has(id) || MON_BY_ID[id].rarity === 'legendary') return 'none';
  return Math.random() < 0.5 ? 'M' : 'F';
}
function genderIcon(g) { return g === 'M' ? '♂️' : g === 'F' ? '♀️' : '⚧'; }
// คลาสไล่ศักดิ์ความหายาก — ใช้ร่วมกันทุกจุดที่โชว์การ์ดโปเกมอน (คลัง/ทีม/ต่อสู้) ให้สายตาจับหายากได้ทันที
function tierClass(tier, shiny, golden) { return golden ? 'tier-golden' : shiny ? 'tier-shiny' : (tier && tier !== 'common' ? 'tier-' + tier : ''); }
// การ์ด empty state มาตรฐาน — ใช้แทนข้อความเปล่าๆ ตรงจุดที่หน้าว่างจริง (ไม่ใช่ error) ให้ดูตั้งใจแทนดูเหมือนบั๊ก
function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="es-ico">${icon}</div><div class="es-title">${title}</div>${sub ? `<div class="es-sub">${sub}</div>` : ''}</div>`;
}
function makeIndividual(id, level, tier, shiny) {
  const iv = {}; ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd'].forEach(k => iv[k] = rand(0, 31));
  return { uid: genUid(), id, level, xp: 0, tier, shiny: !!shiny,
    nature: pick(NATURES).name, gender: rollGender(id), iv, ts: Date.now() };
}
function ivPercent(ind) {
  const sum = Object.values(ind.iv).reduce((a, b) => a + b, 0);
  return Math.round((sum / 186) * 100);
}
function calcStats(ind, baseOverride) {
  const b = baseOverride || MON_BY_ID[ind.id].stats, iv = ind.iv, L = ind.level;
  const nat = NATURES.find(n => n.name === ind.nature) || NATURES[0];
  const s = key => {
    let v = Math.floor((2 * b[key] + iv[key]) * L / 100) + 5;
    if (nat.up === key) v = Math.floor(v * 1.1);
    if (nat.down === key) v = Math.floor(v * 0.9);
    return v;
  };
  return {
    hp: Math.floor((2 * b.hp + iv.hp) * L / 100) + L + 10,
    atk: s('atk'), def: s('def'), spatk: s('spatk'), spdef: s('spdef'), spd: s('spd'),
  };
}
function speciesCount(id) { return state.caught.filter(c => c.id === id).length; }
function indByUid(uid) { return state.caught.find(c => c.uid === uid) || null; }
function boostActive(type) { return (state.activeBoosts && state.activeBoosts[type] || 0) > Date.now(); }
// ---------- Mega Evolution / Gigantamax helpers ----------
function megaFormsFor(id) { return MEGA_FORMS[id] || null; }
function gmaxFormFor(id) { return GMAX_FORMS[id] || null; }
function attuneStone(uid, stoneKey) {
  const ind = indByUid(uid); if (!ind) return;
  const forms = megaFormsFor(ind.id) || [];
  const form = forms.find(f => f.stone === stoneKey); if (!form) return;
  if ((state.megaStoneInv[stoneKey] || 0) <= 0) { toast('❌ ไม่มีหินนี้', 'bad'); return; }
  if (ind.megaKey) { const prev = forms.find(f => f.key === ind.megaKey); if (prev) state.megaStoneInv[prev.stone] = (state.megaStoneInv[prev.stone] || 0) + 1; }
  state.megaStoneInv[stoneKey]--;
  ind.megaKey = form.key;
  save(); toast(`💎 แนบ ${form.stone} ให้ ${MON_BY_ID[ind.id].name} แล้ว`, 'good');
}
function detachStone(uid) {
  const ind = indByUid(uid); if (!ind || !ind.megaKey) return;
  const forms = megaFormsFor(ind.id) || [];
  const form = forms.find(f => f.key === ind.megaKey);
  if (form) state.megaStoneInv[form.stone] = (state.megaStoneInv[form.stone] || 0) + 1;
  ind.megaKey = null;
  save(); toast('ถอดหินเมก้าแล้ว', '');
}
function buyMegaStone(stone, price) {
  if (!spend(price)) return;
  state.megaStoneInv[stone] = (state.megaStoneInv[stone] || 0) + 1;
  save(); toast(`💎 ซื้อ ${stone} แล้ว — แนบได้ในหน้าโปเกมอน`, 'good');
}
// มอบหินเมก้าให้ 1 ชิ้น (รางวัลจากลีคเมก้า) — คืนชื่อหิน
function grantMegaStone(stone) {
  state.megaStoneInv = state.megaStoneInv || {};
  state.megaStoneInv[stone] = (state.megaStoneInv[stone] || 0) + 1;
  return stone;
}
// ---------- หินปลุกพลัง G-Max เฉพาะสายพันธุ์ (mirror ของระบบหินเมก้า) ----------
function attuneGmaxStone(uid) {
  const ind = indByUid(uid); if (!ind) return;
  const form = gmaxFormFor(ind.id); if (!form) return;
  if ((state.gmaxStoneInv[form.key] || 0) <= 0) { toast('❌ ไม่มีหินนี้', 'bad'); return; }
  state.gmaxStoneInv[form.key]--;
  ind.gmaxKey = form.key;
  save(); toast(`⚡ แนบหินปลุกพลัง G-Max ให้ ${MON_BY_ID[ind.id].name} แล้ว`, 'good');
}
function detachGmaxStone(uid) {
  const ind = indByUid(uid); if (!ind || !ind.gmaxKey) return;
  state.gmaxStoneInv[ind.gmaxKey] = (state.gmaxStoneInv[ind.gmaxKey] || 0) + 1;
  ind.gmaxKey = null;
  save(); toast('ถอดหินปลุกพลัง G-Max แล้ว', '');
}
function buyGmaxStone(key, price) {
  if (!spend(price)) return;
  state.gmaxStoneInv[key] = (state.gmaxStoneInv[key] || 0) + 1;
  save(); toast(`⚡ ซื้อหินปลุกพลัง G-Max แล้ว — แนบได้ในหน้าโปเกมอน`, 'good');
}
function renderBoostStrip() {
  const el = $('#boostStrip'); if (!el) return;
  const active = CHARM_ORDER.filter(k => boostActive(k));
  let html = active.map(k => {
    const left = Math.ceil((state.activeBoosts[k] - Date.now()) / 60000);
    return `<span class="boost-chip">${CHARMS[k].emoji} ${CHARMS[k].name} ${left}น.</span>`;
  }).join('');
  const cc = state.catchCombo;
  if (cc && cc.count >= 2) html += `<span class="boost-chip combo-chip">🔥 คอมโบ ${MON_BY_ID[cc.id].name} ×${cc.count}</span>`;
  el.innerHTML = html;
}
function activateCharm(type) {
  if ((state.charms[type] || 0) <= 0) { toast('❌ ไม่มี ' + CHARMS[type].name, 'bad'); return; }
  state.charms[type]--;
  const now = Date.now();
  const base = boostActive(type) ? state.activeBoosts[type] : now;   // ต่อเวลาถ้ายัง active
  state.activeBoosts[type] = base + CHARM_MS;
  save(); renderTopbar(); renderBoostStrip();
  toast(`${CHARMS[type].emoji} เปิด <b>${CHARMS[type].name}</b> 30 นาที!`, 'good');
}
function getBuddy() { return state.party && state.party.length ? indByUid(state.party[0]) : null; }
function inParty(uid) { return state.party.includes(uid); }
function partyMembers() { return state.party.map(indByUid).filter(Boolean); }
function addToParty(uid) {
  if (inParty(uid)) { toast('อยู่ในทีมแล้ว', ''); return; }
  if (state.party.length >= 6) { toast('❌ ทีมเต็ม 6 ตัวแล้ว', 'bad'); return; }
  state.party.push(uid); state.buddyUid = state.party[0];
  save(); renderTopbar();
  toast(`➕ เพิ่ม <b>${MON_BY_ID[indByUid(uid).id].name}</b> เข้าทีม`, 'good');
}
function removeFromParty(uid) {
  state.party = state.party.filter(u => u !== uid);
  state.buddyUid = state.party[0] || null;
  save(); renderTopbar();
  toast('➖ เอาออกจากทีมแล้ว', '');
}

// ================================================================
//  TOP BAR
// ================================================================
function renderTopbar() {
  $('#coins').textContent = state.coins;
  const ft = $('#fishTokens'); if (ft) ft.textContent = state.fishTokens || 0;
  const b = getBuddy();
  if (b) {
    const m = MON_BY_ID[b.id];
    const img = $('#buddyImg');
    const ch = spriteChain(b.id, b.shiny);
    img.dataset.fb = ch.slice(1).join('|');
    img.onerror = function () { __sf(this); };
    img.src = ch[0];
    $('#buddyName').textContent = (b.shiny ? '✨' : '') + m.name;
    $('#buddyLv').textContent = 'Lv.' + b.level;
    const need = xpForLevel(b.level);
    $('#buddyXp').style.width = clamp((b.xp / need) * 100, 0, 100) + '%';
  } else {
    $('#buddyName').textContent = 'ยังไม่มี Buddy';
    $('#buddyLv').textContent = ''; $('#buddyImg').removeAttribute('src'); $('#buddyXp').style.width = '0%';
  }
}

// ================================================================
//  BUDDY / XP / EVOLUTION
// ================================================================
function xpForLevel(level) { return 30 + level * 22; }
function setBuddy(uid) {
  state.party = state.party.filter(u => u !== uid);
  state.party.unshift(uid);
  if (state.party.length > 6) state.party = state.party.slice(0, 6);
  state.buddyUid = uid;
  save(); renderTopbar();
  toast(`⭐ ตั้ง <b>${MON_BY_ID[indByUid(uid).id].name}</b> เป็นหัวหน้าทีม`, 'good');
}
function gainXp(amount) {
  const b = getBuddy(); if (!b) return;
  const buddyAmt = Math.round(amount * (1 + (b.friend || 0) / 500));   // มิตรภาพสูง = XP มากขึ้น (สูงสุด +20%)
  b.xp += buddyAmt; let leveled = false;
  while (b.xp >= xpForLevel(b.level) && b.level < 100) { b.xp -= xpForLevel(b.level); b.level++; leveled = true; }
  if (leveled) { toast(`⬆️ <b>${MON_BY_ID[b.id].name}</b> ขึ้น Lv.${b.level}`, 'good'); tryEvolveByLevel(b); }
  // EXP Share: แบ่ง XP ครึ่งนึงให้สมาชิกทีมคนอื่น
  if (state.hasExpShare) {
    const share = Math.round(amount * 0.5);
    partyMembers().forEach(ind => { if (ind.uid !== b.uid) gainXpTo(ind, share); });
  }
  renderTopbar();
}
function tryEvolveByLevel(b) {
  const m = MON_BY_ID[b.id];
  if (m.evolvesTo && m.evolveLevel && !m.evolveItem && b.level >= m.evolveLevel) doEvolve(b, m.evolvesTo);
}
function doEvolve(ind, toId) {
  const fromName = MON_BY_ID[ind.id].name;
  ind.id = toId; state.seen[toId] = true;
  state._evolved = true;
  checkAchievements(); bumpQuest('evolvePokemon');
  save(); renderTopbar();
  const toName = MON_BY_ID[toId].name;
  toast(`✨ <b>${fromName}</b> วิวัฒนาการเป็น <b>${toName}</b>!`, 'good');
  logMsg(`✨ ${fromName} → <b>${toName}</b>`, 'big');
}

// ================================================================
//  SPAWN
// ================================================================
let currentSpawn = null;   // { mon, tier, shiny, level, throws, deadline }
let spawnTimer = null, countdownTimer = null, despawnTimer = null;

function region() { return REGION_BY_ID[state.region] || REGIONS[0]; }

function spawnInterval() {
  const s = (state.settings && state.settings.spawnSpeed) || 'normal';
  const mul = s === 'fast' ? 0.5 : s === 'slow' ? 1.7 : 1;
  return rand(Math.round(SPAWN_MIN * mul), Math.round(SPAWN_MAX * mul));
}
function scheduleSpawn(delay) {
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(doSpawn, delay != null ? delay : spawnInterval());
}
function levelFor(tier) {
  const [lo, hi] = TIER_LEVEL[tier] || TIER_LEVEL.common;
  // เอนไปทางเลเวลต่ำมากขึ้น: โปเกมอนเลเวลสูงเจอยากขึ้นชัดเจน (pow สูง = ยิ่งเอนต่ำ)
  return Math.round(lo + (hi - lo) * Math.pow(Math.random(), 5));
}
// ---------- world: time / weather / event ----------
function timeOfDay() { const h = new Date().getHours(); return (h >= 6 && h < 18) ? 'day' : 'night'; }
function isEventActive() { const d = new Date().getDay(); return d === 0 || d === 6; }   // เสาร์-อาทิตย์
function getWeather(regionId) {
  const w = state.weather[regionId];
  if (w && w.until > Date.now()) return w.type;
  // สุ่มอากาศใหม่ ให้เข้ากับธีมเขต
  const r = REGION_BY_ID[regionId];
  let pool = ['clear', 'clear', 'rain', 'fog'];
  if (r.types.includes('ice')) pool = ['snow', 'snow', 'clear', 'fog'];
  else if (r.types.includes('fire') || r.types.includes('ground')) pool = ['sand', 'clear', 'clear'];
  else if (r.types.includes('water')) pool = ['rain', 'rain', 'clear', 'fog'];
  const type = pick(pool);
  state.weather[regionId] = { type, until: Date.now() + WEATHER_MS };
  return type;
}
// ---------- อีเวนต์สุ่มตามฤดูกาล (World Events) ----------
function currentWorldEvent() {
  const we = state.worldEvent;
  if (!we) return null;
  if (we.until <= Date.now()) { state.worldEvent = null; renderRegionBanner(); return null; }
  return RANDOM_EVENTS.find(e => e.id === we.id) || null;
}
// ===== อีเวนต์ประจำสัปดาห์ — หมุนอัตโนมัติแบบ deterministic ตามเลขสัปดาห์ ทุกคนเห็นตรงกัน =====
const WEEKLY_SHINY_MULT = 1, WEEKLY_COIN_MULT = 1.2, WEEKLY_LEG_MULT = 1.4;   // อีเวนต์สัปดาห์ให้โบนัสเหรียญ/เลเจนดารี — ไม่ดันโอกาส Shiny (คง Shiny ให้หายากคุ้มการหา)
// isoWeekNumber ย้ายไป logic.js แล้ว (import ด้านบน)
function weeklyEventKey() { const n = new Date(); return `${n.getUTCFullYear()}-W${isoWeekNumber(n)}`; }
function weeklyEvent() {
  const n = new Date();
  const idx = (isoWeekNumber(n) + n.getUTCFullYear()) % RANDOM_EVENTS.length;
  return RANDOM_EVENTS[idx];
}
function weeklyEventDaysLeft() {
  const n = new Date();
  const day = n.getUTCDay() || 7;   // 1=จันทร์..7=อาทิตย์ (ISO)
  return 8 - day;                    // เหลือกี่วันจนถึงจันทร์หน้า
}
function checkWeeklyEvent() {   // แจ้งเตือนครั้งแรกของสัปดาห์ใหม่
  const key = weeklyEventKey();
  if (state.weeklyEventSeen === key) return;
  state.weeklyEventSeen = key;
  const wk = weeklyEvent();
  logMsg(`📅 อีเวนต์ประจำสัปดาห์: ${wk.emoji} <b>${wk.name}</b> — ${wk.desc} (เหรียญ ×${WEEKLY_COIN_MULT} · เจอเลเจนดารี ×${WEEKLY_LEG_MULT} · ธาตุ ${wk.types.length ? wk.types.join('/') : 'ทุกธาตุ'} ออกบ่อยขึ้น ทั้งสัปดาห์)`, 'big');
  save();
}
function tryTriggerRandomEvent() {
  const now = Date.now();
  if (currentWorldEvent()) return;                     // มีอีเวนต์ทำงานอยู่แล้ว
  if (now < (state.nextEventCheck || 0)) return;
  state.nextEventCheck = now + EVENT_CHECK_MS;
  if (Math.random() < EVENT_CHANCE) activateRandomEvent();
  save();
}
function activateRandomEvent(forceId) {
  const ev = forceId ? RANDOM_EVENTS.find(e => e.id === forceId) : pick(RANDOM_EVENTS);
  if (!ev) return;
  const dur = rand(EVENT_MS_MIN, EVENT_MS_MAX);
  state.worldEvent = { id: ev.id, until: Date.now() + dur };
  state.eventHistory = [ev.id, ...(state.eventHistory || [])].slice(0, 8);
  save(); renderRegionBanner();
  if (state.settings.eventAlerts) {
    showEventBanner(ev, Math.round(dur / 60000));
    playSfx('rare');
  }
  logMsg(`${ev.emoji} <b>อีเวนต์เริ่ม: ${ev.name}</b> — ${ev.desc} (${Math.round(dur / 60000)} นาที)`, 'big');
  checkAchievements();
}
function showEventBanner(ev, minutes) {
  const el = $('#rareAlert');
  el.className = 'rare-alert event-alert';
  el.innerHTML = `<div class="ra-tier">${ev.emoji} อีเวนต์สุ่ม!</div><b>${ev.name}</b><br><span style="font-size:11px;opacity:.85">${ev.desc} · ${minutes} นาที</span>`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 7000);
  el.classList.remove('hidden');
}
function spawnBoostTypes() {
  const set = new Set();
  (WEATHERS[getWeather(state.region)].boost).forEach(t => set.add(t));
  (timeOfDay() === 'night' ? NIGHT_BOOST : DAY_BOOST).forEach(t => set.add(t));
  const we = currentWorldEvent();
  if (we) we.types.forEach(t => set.add(t));
  return set;
}
// ===== Catch Combo (ล่า Shiny แบบ Let's Go) — จับตัวเดิมต่อเนื่องดันโอกาส shiny ของสายพันธุ์นั้น =====
function updateCatchCombo(monId, wasShiny) {
  const c = state.catchCombo;
  if (c && c.id === monId) c.count++;
  else state.catchCombo = { id: monId, count: 1 };
  const cc = state.catchCombo;
  if (cc.count > (state.bestCombo || 0)) state.bestCombo = cc.count;   // สถิติคอมโบสูงสุด (ใช้กับความสำเร็จ)
  if (cc.count === 5 || cc.count === 10 || cc.count === 20 || cc.count === 30) {
    toast(`🔥 คอมโบ ${MON_BY_ID[monId].name} ×${cc.count}! โอกาส Shiny เพิ่มขึ้น`, 'good');
  }
}
// ตัวคูณ shiny จากคอมโบ (มีผลเฉพาะสายพันธุ์ที่กำลังคอมโบอยู่)
function comboShinyBoost(monId) {
  const c = state.catchCombo;
  if (!c || c.id !== monId || !c.count) return 1;
  const n = c.count;
  // ปรับให้ Shiny ยังหายากคุ้มการหา — คอมโบเป็นรางวัลของคนตั้งใจล่าตัวเดิมจริงๆ (ต้อง 30 ตัวถึงได้ ×5)
  if (n >= 30) return 5;
  if (n >= 20) return 3.5;
  if (n >= 10) return 2.2;
  if (n >= 5) return 1.5;
  return 1 + n * 0.08;
}
function shinyMultiplier() {
  let m = 1;
  if (isEventActive()) m *= 2;         // อีเวนต์สุดสัปดาห์ shiny ×2
  if (timeOfDay() === 'night') m *= 1.3;
  m *= shinyCharmMultiplier();         // Shiny Charm ติดตัวถาวร (+2%/ชิ้น สูงสุด 5 ชิ้น)
  const we = currentWorldEvent();
  if (we) m *= we.shinyMult;           // อีเวนต์สุ่มตามฤดูกาล
  m *= WEEKLY_SHINY_MULT;              // อีเวนต์ประจำสัปดาห์ (ถาวรทั้งสัปดาห์)
  return m;
}
// ชั้น2 แบบ PokeMeow: Common 40% · Uncommon 30% · Rare 27% · Super Rare 3% (legendary แยกอิสระ)
// luck สูง (เขต boost/อีเวนต์) ดันโอกาสตัวหายากขึ้น
function rollRarity(luck) { return rarityFromRoll(luck, Math.random() * 100); }   // logic บริสุทธิ์อยู่ที่ rarityFromRoll ใน logic.js
function pickFromRegion(r, tier) {
  // ลดระดับถ้าเขตนี้ไม่มีตัว tier นั้น
  let ti = TIER_ORDER.indexOf(tier);
  while (ti >= 0 && !(r._byTier[TIER_ORDER[ti]] || []).length) ti--;
  let pool = ti >= 0 ? r._byTier[TIER_ORDER[ti]] : null;
  if (!pool || !pool.length) pool = r._pool.length ? r._pool : MONSTERS;
  // เอนไปตามอากาศ/เวลา: 55% พยายามเลือกตัวธาตุที่ถูกบูสต์
  const boostTypes = spawnBoostTypes();
  if (boostTypes.size && Math.random() < 0.55) {
    const sub = pool.filter(m => m.types.some(t => boostTypes.has(t)));
    if (sub.length) return pick(sub);
  }
  return pick(pool);
}
// กินโบนัสเบอร์รี่ที่ใช้ค้างไว้ 1 หน่วย (ใช้ต่อ 1 สปอว์น) คืนค่าโบนัส luck ของสปอว์นนี้
function consumeBerryLuck() {
  const bb = state.berryBoost;
  if (!bb || bb.spawnsLeft <= 0) return 0;
  const luck = bb.luck;
  bb.spawnsLeft--;
  if (bb.spawnsLeft <= 0) { bb.luck = 0; bb.spawnsLeft = 0; }
  return luck;
}
function doSpawn() {
  clearTimeout(spawnTimer);   // กัน spawn ซ้อน
  // Safari Zone: spawn บูสต์ตัวหายากมาก จำกัดจำนวนครั้ง
  if (state.safari && state.safari.left > 0) {
    state.safari.left--;
    const legChance = LEGENDARY_CHANCE * 8;   // เจอเลเจนดารีง่ายขึ้นมากใน Safari
    let mon;
    if (Math.random() < legChance) mon = pick(MONSTERS.filter(m => m._tier === 'legendary'));
    else { let t = rollRarity(3); const pool = MONSTERS.filter(m => m._tier === t); mon = pick(pool.length ? pool : MONSTERS); }
    const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier() * 2;
    beginSpawn(mon, shiny, false);
    renderRegionBanner();
    if (state.safari.left <= 0) { toast('🎫 หมดเวลา Safari แล้ว', ''); }
    return;
  }
  const r = region();
  const we = currentWorldEvent();
  const berryLuck = consumeBerryLuck();   // เบอร์รี่: เพิ่มโอกาสเจอตัวหายากสำหรับสปอว์นนี้ (ไม่ใช่โอกาสจับ)
  // อัตราความหายากเท่ากันทุกแมพ (ไม่มีโบนัสประจำเขต) — แต่ละแมพต่างกันแค่ "ธาตุ" ที่ออก (r._pool กรองตามธาตุเขต)
  const luck = (isEventActive() ? 1 : 0) + (we ? 1 : 0) + berryLuck;
  let mon;
  // ชั้น1: เจอเทพเท่ากันทุกแมพ 1/666 (มีอีเวนต์ = 1/500) แล้วสุ่มว่าเป็นเทพเจนไหน (เจน 9 ยากสุด)
  const inEvent = isEventActive() || !!we;
  const legChance = inEvent ? 1 / 500 : 1 / 666;
  if (Math.random() < legChance) {
    mon = pickLegendaryGenWeighted();
  } else {
    mon = pickFromRegion(r, rollRarity(luck));
    // อีเวนต์ประจำสัปดาห์: ดันให้เจอธาตุที่ featured บ่อยขึ้น (คงระดับความหายากเดิม)
    const wk = weeklyEvent();
    if (wk && wk.types.length && Math.random() < 0.35) {
      const featured = r._pool.filter(m => m._tier === mon._tier && m.types.some(t => wk.types.includes(t)));
      if (featured.length) mon = pick(featured);
    }
  }
  // ชั้น shiny: overlay สุ่มแยกอิสระ (ซ้อนตัวที่สุ่มได้) + โบนัสคอมโบล่า shiny
  const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier() * comboShinyBoost(mon.id);
  beginSpawn(mon, shiny, false);
  maybeSpawnRouteTrainer();
}
// ===== เทรนเนอร์ประจำเส้นทาง — สุ่มเจอระหว่างเดินป่า (โผล่เป็นแบนเนอร์ที่หน้าล่า) =====
const ROUTE_TRAINERS = [
  { name: 'เด็กหนุ่ม', sprite: 'youngster', emoji: '🧒', count: 2, mult: 0.9 },
  { name: 'สาวน้อย', sprite: 'lass', emoji: '👧', count: 2, mult: 0.9 },
  { name: 'นักเดินเขา', sprite: 'hiker', emoji: '🧗', count: 2, mult: 1.0 },
  { name: 'จอมพลัง', sprite: 'blackbelt', emoji: '🥋', count: 2, mult: 1.05 },
  { name: 'นักว่ายน้ำ', sprite: 'swimmer-gen4', emoji: '🏊', count: 2, mult: 1.0 },
  { name: 'นักวิทยาศาสตร์', sprite: 'scientist', emoji: '🔬', count: 3, mult: 1.0 },
  { name: 'จอมพลังจิต', sprite: 'psychic', emoji: '🔮', count: 2, mult: 1.1 },
  { name: 'ทหารผ่านศึก', sprite: 'veteran', emoji: '🎖️', count: 3, mult: 1.2 },
];
let currentRouteTrainer = null;   // { cls, deadline } — ชั่วคราว ไม่เซฟลงเครื่อง
const ROUTE_TRAINER_CHANCE = 0.12;
const ROUTE_TRAINER_MS = 60000;
function maybeSpawnRouteTrainer() {
  if (currentRouteTrainer) return;
  if (!partyMembers().length) return;
  if (state.safari && state.safari.left > 0) return;
  if (Math.random() > ROUTE_TRAINER_CHANCE) return;
  const cls = pick(ROUTE_TRAINERS);
  currentRouteTrainer = { cls, deadline: Date.now() + ROUTE_TRAINER_MS };
  renderRouteTrainer();
  playSfx();
  logMsg(`${cls.emoji} <b>${cls.name}</b> อยากท้าดวล!`, '');
}
function renderRouteTrainer() {
  const el = $('#routeTrainer'); if (!el) return;
  if (!currentRouteTrainer || currentRouteTrainer.deadline < Date.now()) {
    currentRouteTrainer = null; el.classList.add('hidden'); el.innerHTML = ''; return;
  }
  const cls = currentRouteTrainer.cls;
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="rt-portrait">${trainerImg(cls.sprite, 'rt-tr')}<span class="rt-emoji">${cls.emoji}</span></div>
    <div class="rt-info"><div class="rt-name">${cls.emoji} ${cls.name} ท้าดวล!</div><div class="rt-sub">ทีม ${cls.count} ตัว · ชนะได้เหรียญ + XP</div></div>
    <div class="rt-btns"><button class="rt-fight" id="rtFight">สู้!</button><button class="rt-skip" id="rtSkip">ข้าม</button></div>`;
  $('#rtFight').onclick = startRouteTrainerBattle;
  $('#rtSkip').onclick = () => { currentRouteTrainer = null; renderRouteTrainer(); };
}
function startRouteTrainerBattle() {
  if (!currentRouteTrainer) return;
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const cls = currentRouteTrainer.cls;
  const r = region();
  const baseLvl = clamp(Math.round((r.lvl[0] + r.lvl[1]) / 2), 3, 100);
  const pool = (r._pool && r._pool.length) ? r._pool : MONSTERS;
  const queue = [];
  for (let i = 0; i < cls.count; i++) {
    const isAce = i === cls.count - 1;
    const mon = pick(pool);
    const lv = clamp(baseLvl + rand(-2, 2) + (isAce ? 3 : 0), 2, 100);
    queue.push(makeFoeDef(mon, lv, cls.mult * (isAce ? 1.1 : 1), isAce));
  }
  const team = buildBattleTeam(members);
  const reward = 120 + baseLvl * 6;
  const routeGym = { id: 'route', name: cls.name, emoji: cls.emoji, sprite: cls.sprite, reward, items: Math.random() < 0.4 ? [['great', 1]] : [] };
  battleState = {
    mode: 'trainer', isBoss: false, isRoute: true, gym: routeGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `${cls.emoji} ${cls.name} ท้าดวล! ทีม ${cls.count} ตัว!`,
  };
  currentRouteTrainer = null; renderRouteTrainer();
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
// สร้าง spawn จริง (ใช้ร่วมกันทั้งเดินป่าปกติและตกปลา)
function beginSpawn(mon, shiny, fromFishing) {
  const level = levelFor(mon._tier);
  const maxHp = wildMaxHp(mon, level);
  currentSpawn = { mon, tier: mon._tier, shiny, level, throws: 0, deadline: Date.now() + FLEE_MS,
    maxHp, hp: maxHp, fishing: !!fromFishing };
  state.seen[mon.id] = true;
  renderSpawn();
  // แจ้งเตือน (ป๊อปอัพ) เฉพาะ superrare ขึ้นไป + shiny · เอฟเฟคเต็มจอเฉพาะ legendary/shiny (ตื่นเต้นสุด)
  if (shiny || mon._tier === 'superrare' || mon._tier === 'legendary') {
    showRareAlert(mon, mon._tier, shiny);
    logMsg(`${shiny ? '✨' : '⭐'} ${fromFishing ? '🎣 ' : ''}พบ <b>${mon.name}</b> (${shiny ? 'Shiny' : TIER_LABEL[mon._tier]}) Lv.${level}!`, 'big');
    if (shiny || mon._tier === 'legendary') playSpawnFx(shiny ? 'shiny' : 'legend');
  } else if (fromFishing) {
    logMsg(`🎣 เกี่ยว <b>${mon.name}</b> Lv.${level} ขึ้นมาได้!`, '');
  }
  clearTimeout(despawnTimer);
  despawnTimer = setTimeout(fleeSpawn, FLEE_MS);
}
// ===== ระบบตกปลา (แบบ PokeMeow) =====
const FISH_CD = 8000;   // คูลดาวน์ 8 วินาที
function fish() {
  const now = Date.now();
  if (now < (state.fishReadyAt || 0)) {
    toast(`🎣 รอเบ็ดพร้อมอีก ${Math.ceil((state.fishReadyAt - now) / 1000)} วิ`, 'bad'); return;
  }
  state.fishReadyAt = now + FISH_CD;
  const roll = Math.random();
  if (roll < 0.60) {
    // เกี่ยวโปเกมอนน้ำ/น้ำแข็งขึ้นมา
    clearTimeout(spawnTimer);
    const luck = isEventActive() ? 1 : 0;
    let tier = rollRarity(luck);
    let ti = TIER_ORDER.indexOf(tier);
    while (ti >= 0 && !FISH_POOL_BY_TIER[TIER_ORDER[ti]].length) ti--;
    const pool = ti >= 0 ? FISH_POOL_BY_TIER[TIER_ORDER[ti]] : FISH_POOL;
    const mon = pick(pool.length ? pool : MONSTERS);
    const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier() * comboShinyBoost(mon.id);
    beginSpawn(mon, shiny, true);
    toast('🎣 มีบางอย่างกินเบ็ด!', 'good');
  } else if (roll < 0.90) {
    // ได้เหรียญตกปลา + เหรียญ
    const tok = rand(1, 3), coins = rand(10, 40);
    state.fishTokens = (state.fishTokens || 0) + tok; state.coins += coins;
    toast(`🎣 ได้ 🪙${coins} + 🎟️${tok} เหรียญตกปลา`, 'good');
    logMsg(`🎣 ตกปลาได้ 🪙${coins} + 🎟️${tok} เหรียญตกปลา`, '');
  } else {
    toast('🎣 ไม่มีอะไรกินเบ็ด...', '');
  }
  save(); renderTopbar(); updateFishBtn();
}
const SAFARI_SPAWNS = 8;
function enterSafari() {
  if (state.safari && state.safari.left > 0) { toast('🎫 อยู่ใน Safari อยู่แล้ว', ''); return; }
  if ((state.safariTickets || 0) <= 0) { toast('❌ ไม่มีตั๋ว Safari (ซื้อที่ร้าน)', 'bad'); return; }
  state.safariTickets--;
  state.safari = { left: SAFARI_SPAWNS };
  toast(`🎫 เข้า Safari Zone! ${SAFARI_SPAWNS} ตัวถัดไปหายากสุดๆ`, 'good');
  logMsg(`🎫 เข้า Safari Zone (${SAFARI_SPAWNS} ตัว) — ลุ้นตัวหายาก/เลเจนดารี!`, 'big');
  clearSpawn(); scheduleSpawn(1200); renderTopbar();
}
function updateFishBtn() {
  const btn = $('#fishBtn'); if (!btn) return;
  const left = Math.ceil(((state.fishReadyAt || 0) - Date.now()) / 1000);
  if (left > 0) { btn.disabled = true; btn.textContent = `🎣 รอ ${left} วิ`; }
  else { btn.disabled = false; btn.textContent = '🎣 ตกปลา'; }
}
// ===== คอนเทสต์ (Pokémon Contest) — ส่ง Buddy ประกวด 5 หมวด ให้ IV/นิสัย/ธาตุมีประโยชน์นอกสนามสู้ =====
const CONTEST_CD = 90000;   // คูลดาวน์ 90 วินาทีต่อครั้ง
const CONTEST_CATEGORIES = [
  { id: 'cool',   name: 'เท่ห์ (Cool)',   emoji: '🕶️', types: ['fire', 'dragon', 'dark'],       natureStat: 'atk' },
  { id: 'beauty', name: 'สวย (Beauty)',   emoji: '💧', types: ['water', 'ice', 'fairy'],        natureStat: 'spatk' },
  { id: 'cute',   name: 'น่ารัก (Cute)',  emoji: '🎀', types: ['normal', 'fairy', 'electric'],  natureStat: 'spd' },
  { id: 'smart',  name: 'ฉลาด (Smart)',   emoji: '🧠', types: ['psychic', 'ghost', 'dark'],     natureStat: 'spdef' },
  { id: 'tough',  name: 'แกร่ง (Tough)',  emoji: '💪', types: ['fighting', 'rock', 'ground'],   natureStat: 'def' },
];
const CONTEST_RANK_COIN = { 1: 800, 2: 400, 3: 200, 4: 80 };
function contestScore(ind, cat) {
  const m = MON_BY_ID[ind.id];
  let score = ivPercent(ind);                                              // 0-100 พื้นฐานจาก IV
  if (m.types.some(t => cat.types.includes(t))) score += 25;                // ธาตุตรงหมวด
  const nat = NATURES.find(n => n.name === ind.nature);
  if (nat && nat.up === cat.natureStat) score += 15;                        // นิสัยเสริมสเตตัสที่หมวดนี้ชอบ
  if (ind.shiny) score += 10;
  score += Math.min(20, ind.level / 5);                                    // เลเวลช่วยเล็กน้อย
  score += Math.random() * 15;                                             // ฟอร์มวันนี้ (สุ่มเล็กน้อยให้มีลุ้น)
  return Math.round(score);
}
function contestRivalScore() { return Math.round(30 + trainerLevel() * 1.2 + Math.random() * 40); }
function enterContest(uid, catId) {
  const now = Date.now();
  state.contest = state.contest || { readyAt: 0, ribbons: {} };
  if (now < (state.contest.readyAt || 0)) { toast(`🎀 รอคอนเทสต์พร้อมอีก ${Math.ceil((state.contest.readyAt - now) / 1000)} วิ`, 'bad'); return; }
  const ind = indByUid(uid); if (!ind) return;
  const cat = CONTEST_CATEGORIES.find(c => c.id === catId); if (!cat) return;
  state.contest.readyAt = now + CONTEST_CD;
  const myScore = contestScore(ind, cat);
  const rivals = [contestRivalScore(), contestRivalScore(), contestRivalScore()];
  const rank = [myScore, ...rivals].sort((a, b) => b - a).indexOf(myScore) + 1;
  const coins = CONTEST_RANK_COIN[rank] || 80;
  state.coins += coins;
  let extra = '';
  if (rank === 1) {
    state.contest.ribbons[cat.id] = (state.contest.ribbons[cat.id] || 0) + 1;
    state.candies = (state.candies || 0) + 1;
    state._contestWon = true;
    extra = ' + 🎀 ริบบิ้น + 🍬×1';
  }
  const rankLabel = ['🥇 ที่ 1', '🥈 ที่ 2', '🥉 ที่ 3', '🍃 ที่ 4'][rank - 1];
  const name = ind.nick || MON_BY_ID[ind.id].name;
  toast(`${cat.emoji} ${name} ได้ ${rankLabel}! คะแนน ${myScore} (คู่แข่ง ${rivals.join('/')}) +${coins}🪙${extra}`, rank === 1 ? 'good' : '');
  logMsg(`${cat.emoji} คอนเทสต์ ${cat.name}: ${name} ได้ ${rankLabel} (${myScore} คะแนน)${extra}`, rank === 1 ? 'big' : '');
  if (rank === 1) playSfx('rare');
  checkAchievements(); bumpQuest('contestEnter');
  save(); renderTopbar(); renderContest();
}
function renderContest() {
  const list = $('#contestList'), entrantBox = $('#contestEntrant');
  if (!list || !entrantBox) return;
  state.contest = state.contest || { readyAt: 0, ribbons: {} };
  const buddy = getBuddy();
  if (!buddy) {
    entrantBox.innerHTML = '';
    list.innerHTML = `<div class="quest"><div class="quest-name">ยังไม่มี Buddy — ตั้ง Buddy ก่อนเพื่อส่งเข้าประกวด</div></div>`;
    return;
  }
  const bm = MON_BY_ID[buddy.id];
  entrantBox.innerHTML = `<div class="egg-item" style="margin-bottom:10px">
    ${spriteImg(buddy.id, buddy.shiny)}
    <div class="eb"><div class="si-name">${buddy.shiny ? '✨' : ''}${buddy.nick || bm.name} ส่งเข้าประกวด</div>
    <div class="si-desc">IV ${ivPercent(buddy)}% · นิสัย ${buddy.nature} · Lv.${buddy.level}${buddy.shiny ? ' · Shiny' : ''}</div></div></div>`;
  const cd = Math.max(0, Math.ceil(((state.contest.readyAt || 0) - Date.now()) / 1000));
  list.innerHTML = CONTEST_CATEGORIES.map(cat => {
    const ribbons = state.contest.ribbons[cat.id] || 0;
    const typeMatch = bm.types.some(t => cat.types.includes(t));
    return `<div class="quest">
      <div class="quest-top"><div class="quest-name">${cat.emoji} ${cat.name}${typeMatch ? ' <span style="color:var(--good)">(ธาตุตรง!)</span>' : ''}</div>
      <div class="quest-reward">${ribbons ? `🎀×${ribbons}` : ''}</div></div>
      <div class="quest-foot"><span>รางวัลที่ 1: +${CONTEST_RANK_COIN[1]}🪙 + 🎀 + 🍬</span>
        <button class="claim-btn" data-contest="${cat.id}" ${cd > 0 ? 'disabled' : ''}>${cd > 0 ? `รอ ${cd}วิ` : 'ประกวด'}</button>
      </div></div>`;
  }).join('');
  list.querySelectorAll('[data-contest]').forEach(b => b.onclick = () => enterContest(buddy.uid, b.dataset.contest));
}
function updateContestCd() {   // อัปเดตนับถอยหลังปุ่มคอนเทสต์ทุกวินาที โดยไม่ต้อง re-render ทั้งก้อน
  const list = $('#contestList'); if (!list || currentView !== 'quest') return;
  const cd = Math.max(0, Math.ceil(((state.contest && state.contest.readyAt || 0) - Date.now()) / 1000));
  list.querySelectorAll('[data-contest]').forEach(btn => {
    btn.disabled = cd > 0;
    btn.textContent = cd > 0 ? `รอ ${cd}วิ` : 'ประกวด';
  });
}
// ===== ไร่เบอร์รี่ — ปลูกเบอร์รี่ที่มี รอเวลาจริง แล้วเก็บเกี่ยวได้มากกว่าที่ปลูก =====
const FARM_GROW_MS = { razz: 10 * 60000, golden: 25 * 60000 };   // ราซ 10 นาที, โกลเด้น 25 นาที
const FARM_YIELD = { razz: 4, golden: 3 };   // ปลูก 1 ได้กลับมากกว่าที่ปลูก
function plantBerry(plotIdx, kind) {
  state.farm = state.farm || [{ berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }];
  const plot = state.farm[plotIdx]; if (!plot || plot.berry) { toast('❌ แปลงนี้มีของปลูกอยู่แล้ว', 'bad'); return; }
  if ((state.berries[kind] || 0) <= 0) { toast('❌ ไม่มีเบอร์รี่นี้ในคลัง', 'bad'); return; }
  state.berries[kind]--;
  state.farm[plotIdx] = { berry: kind, readyAt: Date.now() + FARM_GROW_MS[kind] };
  save(); toast(`🌱 ปลูก ${BERRIES[kind].name} แล้ว — รอเก็บเกี่ยว`, 'good'); renderFarm(); renderBerryBar();
}
function harvestPlot(plotIdx) {
  const plot = state.farm && state.farm[plotIdx]; if (!plot || !plot.berry) return;
  if (Date.now() < plot.readyAt) { toast('⏳ ยังไม่พร้อมเก็บเกี่ยว', 'bad'); return; }
  const kind = plot.berry, yieldN = FARM_YIELD[kind];
  state.berries[kind] = (state.berries[kind] || 0) + yieldN;
  state.farm[plotIdx] = { berry: null, readyAt: 0 };
  bumpQuest('farmHarvest');
  state._farmHarvested = true;
  checkAchievements();
  save(); toast(`🌾 เก็บเกี่ยว ${BERRIES[kind].name} ×${yieldN}!`, 'good'); renderFarm(); renderBerryBar();
}
function renderFarm() {
  const box = $('#farmBox'); if (!box) return;
  state.farm = state.farm || [{ berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }, { berry: null, readyAt: 0 }];
  box.innerHTML = state.farm.map((plot, i) => {
    if (!plot.berry) {
      const canPlant = BERRY_ORDER.filter(k => (state.berries[k] || 0) > 0);
      return `<div class="preset-row"><span class="pr-name">แปลงที่ ${i + 1}: ว่าง 🟫</span>
        <div class="pr-actions">${canPlant.length
          ? canPlant.map(k => `<button class="claim-btn" data-plant="${i}-${k}">ปลูก ${itemIcon(BERRIES[k].emoji, BERRIES[k].img)} ×1</button>`).join('')
          : '<span style="font-size:11px;color:var(--muted)">ไม่มีเบอร์รี่ให้ปลูก</span>'}</div></div>`;
    }
    const ready = Date.now() >= plot.readyAt;
    const left = Math.max(0, Math.ceil((plot.readyAt - Date.now()) / 1000));
    const b = BERRIES[plot.berry];
    return `<div class="preset-row"><span class="pr-name">${itemIcon(b.emoji, b.img)} ${b.name} ${ready ? '(พร้อมเก็บ!)' : `(รอ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})`}</span>
      <div class="pr-actions"><button class="claim-btn${ready ? '' : ' done'}" data-harvest="${i}" ${ready ? '' : 'disabled'}>เก็บเกี่ยว ×${FARM_YIELD[plot.berry]}</button></div></div>`;
  }).join('');
  box.querySelectorAll('[data-plant]').forEach(el => el.onclick = () => { const [i, k] = el.dataset.plant.split('-'); plantBerry(+i, k); });
  box.querySelectorAll('[data-harvest]').forEach(el => el.onclick = () => harvestPlot(+el.dataset.harvest));
}
function updateFarmCd() {   // อัปเดตนับถอยหลังไร่เบอร์รี่ทุกวินาที (เรียก renderFarm ใหม่เฉพาะตอนมีแปลงกำลังโต)
  if (!$('#farmBox') || currentView !== 'quest') return;
  if ((state.farm || []).some(p => p.berry)) renderFarm();
}
// ===== พ่อค้าเร่ (Wandering Merchant) — โผล่มาแบบสุ่ม มีของลดราคาจำกัดจำนวน =====
const MERCHANT_CHANCE = 0.04;      // โอกาสโผล่มาต่อการเช็ค (เช็คทุก 30 วิ เหมือนอีเวนต์สุ่ม)
const MERCHANT_STAY_MS = 15 * 60000;   // อยู่ 15 นาทีถ้าไม่ถูกซื้อหมด
const MERCHANT_DISCOUNT = 0.7;     // ลดราคา 30%
const MERCHANT_DEALS = [
  { id: 'net3',   name: 'Net Ball ×3',    emoji: BALLS.net.emoji,   img: BALLS.net.img,   basePrice: BALLS.net.price * 3,   give: () => { state.balls.net = (state.balls.net || 0) + 3; } },
  { id: 'dusk3',  name: 'Dusk Ball ×3',   emoji: BALLS.dusk.emoji,  img: BALLS.dusk.img,  basePrice: BALLS.dusk.price * 3,  give: () => { state.balls.dusk = (state.balls.dusk || 0) + 3; } },
  { id: 'quick3', name: 'Quick Ball ×3',  emoji: BALLS.quick.emoji, img: BALLS.quick.img, basePrice: BALLS.quick.price * 3, give: () => { state.balls.quick = (state.balls.quick || 0) + 3; } },
  { id: 'ultra2', name: 'Ultra Ball ×2',  emoji: BALLS.ultra.emoji, img: BALLS.ultra.img, basePrice: BALLS.ultra.price * 2, give: () => { state.balls.ultra = (state.balls.ultra || 0) + 2; } },
  { id: 'candy3', name: 'Rare Candy ×3',  emoji: '🍬', img: 'rare-candy', basePrice: 450, give: () => { state.candies = (state.candies || 0) + 3; } },
  { id: 'candy5', name: 'Rare Candy ×5',  emoji: '🍬', img: 'rare-candy', basePrice: 750, give: () => { state.candies = (state.candies || 0) + 5; } },
  { id: 'razz3', name: 'Razz Berry ×3',  emoji: BERRIES.razz.emoji, img: BERRIES.razz.img, basePrice: BERRIES.razz.price * 3, give: () => { state.berries.razz = (state.berries.razz || 0) + 3; } },
  { id: 'golden2', name: 'Golden Razz ×2', emoji: BERRIES.golden.emoji, img: BERRIES.golden.img, basePrice: BERRIES.golden.price * 2, give: () => { state.berries.golden = (state.berries.golden || 0) + 2; } },
  { id: 'lockbox1', name: 'กล่องสุ่ม (Lockbox)', emoji: '🎁', img: null, basePrice: 1200, give: () => { state.lockboxes = (state.lockboxes || 0) + 1; } },
];
function tryTriggerMerchant() {
  if (state.merchant && state.merchant.until > Date.now()) return;   // อยู่แล้ว ไม่สุ่มซ้ำ
  if (Math.random() < MERCHANT_CHANCE) spawnMerchant();
}
function spawnMerchant() {
  const picks = pickN(MERCHANT_DEALS, 3);
  state.merchant = { until: Date.now() + MERCHANT_STAY_MS, stock: picks.map(d => ({ id: d.id, bought: false })) };
  save();
  toast('🧳 พ่อค้าเร่ปรากฏตัว! มีของลดราคาจำนวนจำกัด', 'good');
  logMsg('🧳 พ่อค้าเร่มาเยือน! ของมีจำกัด รีบไปดูในเมนู ⚙️', 'big');
  if (currentView === 'menu') renderMenu();
}
function buyFromMerchant(dealId) {
  if (!state.merchant || state.merchant.until <= Date.now()) { toast('❌ พ่อค้าเร่จากไปแล้ว', 'bad'); return; }
  const entry = state.merchant.stock.find(s => s.id === dealId);
  if (!entry || entry.bought) return;
  const deal = MERCHANT_DEALS.find(d => d.id === dealId); if (!deal) return;
  const price = Math.round(deal.basePrice * MERCHANT_DISCOUNT);
  if (!spend(price)) return;
  deal.give();
  entry.bought = true;
  state._merchantBought = true;
  checkAchievements();
  save(); toast(`🧳 ซื้อ ${deal.name} จากพ่อค้าเร่แล้ว!`, 'good'); renderMerchant(); renderTopbar();
}
function renderMerchant() {
  const box = $('#merchantBox'); if (!box) return;
  const active = state.merchant && state.merchant.until > Date.now();
  if (!active) { box.innerHTML = `<div class="sr-sub">ยังไม่มีพ่อค้าเร่ตอนนี้ — เขาจะโผล่มาแบบสุ่มเป็นระยะๆ ระหว่างเล่น</div>`; return; }
  const left = Math.max(0, Math.ceil((state.merchant.until - Date.now()) / 1000));
  box.innerHTML = `<div class="sr-sub" style="margin-bottom:6px">⏳ อยู่อีก ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ซื้อได้ชิ้นละ 1 เท่านั้น</div>` +
    state.merchant.stock.map(entry => {
      const deal = MERCHANT_DEALS.find(d => d.id === entry.id); if (!deal) return '';
      const price = Math.round(deal.basePrice * MERCHANT_DISCOUNT);
      return `<div class="preset-row"><span class="pr-name">${itemIcon(deal.emoji, deal.img)} ${deal.name} <s style="color:var(--muted);font-size:10px">${deal.basePrice}🪙</s></span>
        <div class="pr-actions"><button class="claim-btn${entry.bought ? ' done' : ''}" data-buymerchant="${deal.id}" ${entry.bought ? 'disabled' : ''}>${entry.bought ? 'ซื้อแล้ว ✓' : `${price}🪙`}</button></div></div>`;
    }).join('');
  box.querySelectorAll('[data-buymerchant]').forEach(el => el.onclick = () => buyFromMerchant(el.dataset.buymerchant));
}
function updateMerchantCd() {
  if (!$('#merchantBox') || currentView !== 'menu') return;
  if (state.merchant && state.merchant.until > Date.now()) renderMerchant();
}
function fleeSpawn() {
  if (!currentSpawn) return;
  logMsg(`💨 <b>${currentSpawn.mon.name}</b> หนีไปแล้ว...`, 'bad');
  clearSpawn(); scheduleSpawn();
}
// ตั้งตัวจับเวลาหนีใหม่ (ใช้หลังปาบอลพลาดแต่ยังไม่หนี — เผื่อเวลาขั้นต่ำถ้า deadline ผ่านไปแล้วตอนปาจังหวะสุดท้าย)
function armDespawn() {
  clearTimeout(despawnTimer);
  if (!currentSpawn) return;
  if (currentSpawn.deadline - Date.now() < 3000) currentSpawn.deadline = Date.now() + 3000;
  despawnTimer = setTimeout(fleeSpawn, Math.max(0, currentSpawn.deadline - Date.now()));
  startCountdown();
}
function clearSpawn() {
  currentSpawn = null;
  clearInterval(countdownTimer); clearTimeout(despawnTimer);
  hideRareAlert(); renderSpawn();
}

// ================================================================
//  RENDER: HOME (region + spawn + balls)
// ================================================================
function renderRegionBanner() {
  const r = region();
  $('#rbEmoji').textContent = r.emoji;
  $('#rbName').textContent = r.name;
  const w = WEATHERS[getWeather(r.id)];
  const timeIco = timeOfDay() === 'night' ? '🌙' : '☀️';
  const ev = isEventActive() ? ' · <b style="color:var(--accent)">✨อีเวนต์สุดสัปดาห์ x2</b>' : '';
  const safari = (state.safari && state.safari.left > 0) ? ` · <b style="color:#ffd76b">🎫 Safari เหลือ ${state.safari.left}</b>` : '';
  const wk = weeklyEvent();
  const wkChip = ` · <b style="color:#c9a3ff" title="${wk.desc} · เหรียญ ×${WEEKLY_COIN_MULT} · เลเจนดารี ×${WEEKLY_LEG_MULT} ทั้งสัปดาห์ (เหลือ ${weeklyEventDaysLeft()} วัน)">📅 ${wk.emoji} ${wk.name}</b>`;
  $('#rbLvl').innerHTML = `${timeIco} · ${w.emoji}${w.name}${wkChip}${ev}${safari}`;
  const card = $('#spawnCard');
  card.style.background = sceneBgCss(r);
  card.classList.toggle('night', timeOfDay() === 'night');
  renderBoostStrip();

  const we = currentWorldEvent();
  const ribbon = $('#eventRibbon');
  if (we) {
    const left = Math.max(0, Math.ceil((state.worldEvent.until - Date.now()) / 60000));
    ribbon.innerHTML = `${we.emoji} <b>${we.name}</b> · ${we.desc} · เหลือ ${left} นาที`;
    ribbon.classList.remove('hidden');
    card.querySelector('.scrim').style.background = we.tint;
    $('#spawnDeco').innerHTML = mascotDecoHtml(we.mascots);
  } else {
    ribbon.classList.add('hidden');
    card.querySelector('.scrim').style.background = '';
    $('#spawnDeco').innerHTML = mascotDecoHtml(r.mascots);
  }
}
// ตกแต่งด้วยสไปรต์โปเกมอนจริงที่เป็นตัวแทนธีมเขต (ลอย+โปร่งแสง) แทนอีโมจิ
function mascotDecoHtml(ids) {
  if (state.settings && state.settings.mascotDeco === false) return '';
  return (ids || []).map((id, i) =>
    `<span class="deco-mon" style="left:${6 + i * 23}%;top:${8 + (i % 3) * 24}%;animation-delay:${i * .7}s">${spriteImg(id, false)}</span>`).join('');
}
// วาดฝั่งเรา (โปเกมอนหันหลังยืนบนพื้น) — คงอยู่เสมอ ไม่ขึ้นกับสปอว์นป่า
function renderBuddyScene() {
  const wrap = $('#buddyBackWrap'); if (!wrap) return;
  const b = getBuddy();
  wrap.innerHTML = b ? backSpriteImg(b.id, b.shiny, 'buddy-mon') : '';
}
function renderSpawn() {
  const card = $('#spawnCard');
  card.classList.remove('rare-glow', 'legend-glow', 'shiny-glow');
  const battleBtn = $('#battleBtn');
  renderBuddyScene();
  if (!currentSpawn) {
    card.classList.add('empty');
    $('#spawnTop').innerHTML = '';
    $('#spawnTags').innerHTML = '';
    $('#wildHp').innerHTML = '';
    $('#spawnTimer').innerHTML = '<div class="empty-msg">🔎 กำลังค้นหาโปเกมอนในเขตนี้...</div>';
    if (battleBtn) battleBtn.disabled = true;
    renderBerryBar();
    return;
  }
  const { mon, tier, shiny, level } = currentSpawn;
  card.classList.remove('empty');
  if (shiny) card.classList.add('shiny-glow');
  else if (tier === 'legendary') card.classList.add('legend-glow');
  else if (tier === 'rare' || tier === 'superrare') card.classList.add('rare-glow');

  $('#spawnSprite').outerHTML =
    spriteImg(mon.id, shiny, '').replace('<img', '<img id="spawnSprite"');
  $('#spawnTop').innerHTML =
    `<span class="lv-badge">${mon.types.map(t => TYPE_EMOJI[t] || '').join('')} Lv.${level}</span>` +
    (shiny ? '<span class="lv-badge">✨</span>' : '');
  const cc = state.catchCombo;
  const comboMatch = cc && cc.id === mon.id && cc.count >= 2;
  $('#spawnTags').innerHTML =
    typeBadges(mon.types) +
    `<span class="badge rarity-${shiny ? 'shiny' : tier}">${shiny ? '✨ shiny' : TIER_EMOJI[tier] + ' ' + TIER_LABEL[tier]}</span>` +
    (comboMatch ? `<span class="badge combo-badge" title="จับต่อเนื่อง ×${cc.count} — โอกาส Shiny เพิ่มขึ้น!">🔥 คอมโบ ×${cc.count} · Shiny↑</span>` : '');
  renderWildHp();
  renderBerryBar();
  if (battleBtn) {
    const b = getBuddy();
    battleBtn.disabled = !b;
    battleBtn.textContent = b ? '⚔️ สู้เพื่อทำ HP ลด' : '⚔️ ต้องมี Buddy ก่อน';
  }
  startCountdown();
}
function renderWildHp() {
  const el = $('#wildHp');
  if (!currentSpawn || !currentSpawn.maxHp) { el.innerHTML = ''; return; }
  const pct = clamp(currentSpawn.hp / currentSpawn.maxHp * 100, 0, 100);
  const cls = pct <= 20 ? 'crit' : pct <= 50 ? 'low' : '';
  el.innerHTML = `<div class="hp-track"><div class="hp-fill ${cls}" style="width:${pct}%"></div></div>
    <div class="hp-txt">HP ${Math.ceil(currentSpawn.hp)}/${currentSpawn.maxHp}${currentSpawn.hp < currentSpawn.maxHp ? ' · จับง่ายขึ้น!' : ''}</div>`;
}
function startCountdown() {
  clearInterval(countdownTimer);
  const upd = () => {
    if (!currentSpawn) return;
    const left = Math.max(0, Math.ceil((currentSpawn.deadline - Date.now()) / 1000));
    $('#spawnTimer').textContent = `⏳ หนีใน ${left} วินาที`;
  };
  upd(); countdownTimer = setInterval(upd, 1000);
}

function renderBallBar() {
  const bar = $('#ballBar');
  const owned = BALL_ORDER.filter(k => (state.balls[k] || 0) > 0);   // โชว์แค่บอลที่มีจริง กันกินที่หน้าจอ
  if (!owned.length) {
    bar.innerHTML = `<div class="sr-sub" style="padding:8px 4px">🎒 ไม่มีบอลเลย — ไปซื้อที่ร้านค้าก่อนนะ</div>`;
    return;
  }
  if (!owned.includes(state.selBall)) state.selBall = owned[0];   // บอลที่เลือกไว้หมดแล้ว สลับไปตัวที่ยังมี
  bar.innerHTML = owned.map(k => {
    const b = BALLS[k], have = state.balls[k] || 0;
    const sel = state.selBall === k ? ' sel' : '';
    const tag = b.mult >= 999 ? '100%' : b.cond ? '★' : '×' + b.mult;
    return `<div class="ball-opt${sel}" data-ball="${k}" title="${b.hint}">
      <span class="bmult">${tag}</span>
      <div class="be">${itemIcon(b.emoji, b.img)}</div>
      <div class="bn">${b.name.replace(' Ball', '')}</div>
      <div class="bc">×${have}</div></div>`;
  }).join('');
  bar.querySelectorAll('.ball-opt').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.ball;
      if (currentSpawn && !throwing) { throwBall(k); }   // แตะบอล = โยนทันที
      else { state.selBall = k; save(); renderBallBar(); }
    };
  });
}
// เบอร์รี่ตอนนี้ใช้ได้ตลอดเวลา (ไม่ต้องรอมีสปอว์น) เพื่อบูสต์ "โอกาสเจอตัวหายาก" ของสปอว์นถัดไป
function renderBerryBar() {
  const bar = $('#berryBar');
  const bb = state.berryBoost;
  const activeTxt = (bb && bb.spawnsLeft > 0)
    ? `<div class="berry-active">🍀 กำลังบูสต์โอกาสเจอตัวหายาก · เหลืออีก ${bb.spawnsLeft} ครั้ง</div>` : '';
  bar.innerHTML = activeTxt + BERRY_ORDER.map(k => {
    const b = BERRIES[k], have = state.berries[k] || 0;
    return `<div class="berry-opt${have <= 0 ? ' disabled' : ''}" data-berry="${k}" title="${b.desc}">
      <div class="be">${itemIcon(b.emoji, b.img)}</div><div class="bn">${b.name.replace(' Berry', '')}</div>
      <div class="bc">×${have}</div></div>`;
  }).join('');
  bar.querySelectorAll('.berry-opt').forEach(el => el.onclick = () => throwBerry(el.dataset.berry));
}
function throwBerry(k) {
  if ((state.berries[k] || 0) <= 0) { toast('❌ ไม่มีเบอร์รี่นี้', 'bad'); return; }
  state.berries[k]--;
  const b = BERRIES[k];
  const bb = state.berryBoost;
  bb.luck = Math.max(bb.luck, b.luck);          // ใช้ค่า luck สูงสุด (ไม่บวกซ้อนแบบไม่จำกัด)
  bb.spawnsLeft = (bb.spawnsLeft || 0) + b.spawns;
  toast(`${b.emoji} ใช้ ${b.name} · โอกาสเจอตัวหายากเพิ่มขึ้น ${bb.spawnsLeft} ครั้งถัดไป!`, 'good');
  logMsg(`${b.emoji} ใช้ ${b.name} — ${b.desc}`, '');
  save(); renderBerryBar();
}
// ================================================================
//  CATCH (ปาบอล)
// ================================================================
function wildMaxHp(mon, level) { return Math.floor((2 * mon.stats.hp + 15) * level / 100) + level + 10; }
function hpBonusFor(spawn) {
  if (!spawn || !spawn.maxHp) return 1;
  const missing = 1 - spawn.hp / spawn.maxHp;    // 0 = เต็ม, 1 = ใกล้ตาย
  return 1 + missing * 1.6;                       // ยิ่ง HP ลด ยิ่งจับง่าย (สูงสุด ×2.6)
}
// catchChance ย้ายไป logic.js แล้ว (import ด้านบน)
let throwing = false;
function throwBall(k) {
  if (!currentSpawn || throwing) return;
  k = (typeof k === 'string') ? k : state.selBall;
  const have = state.balls[k] || 0;
  if (have <= 0) { toast('❌ บอลหมด', 'bad'); return; }
  state.selBall = k;
  throwing = true;
  // แช่แข็งตัวจับเวลาระหว่างแอนิเมชันปาบอล กันสปอว์นหนีกลางคัน (ปาจังหวะสุดท้ายแล้วเสียบอลฟรี)
  clearTimeout(despawnTimer); clearInterval(countdownTimer);
  const prevThrows = currentSpawn.throws;   // จำนวนก่อนขว้างครั้งนี้ (ใช้เช็ค Quick Ball)
  state.balls[k]--;
  currentSpawn.throws++;
  renderBallBar();

  const ctx = { mon: currentSpawn.mon, throws: prevThrows, time: timeOfDay(), region: region(), alreadyCaught: speciesCount(currentSpawn.mon.id) > 0 };
  const mods = { hpBonus: hpBonusFor(currentSpawn), shiny: currentSpawn.shiny,
    catchMult: catchCharmMultiplier(), ctx };   // Catch Charm พาสซีฟถาวร · shiny สำหรับ Premier Ball
  const p = catchChance(currentSpawn.mon, currentSpawn.level, BALLS[k], mods);
  const success = Math.random() < p;

  // แอนิเมชันปาบอล 3 จังหวะ: ขว้าง → ดูดเข้าบอล → สั่น 3 ครั้ง → รู้ผล
  const ball = $('#throwBall');
  const sprite = $('#spawnSprite');
  ball.innerHTML = `<img class="tb-img" src="${ITEM_BASE}${BALLS[k].img}.png" data-src="${ITEM_BASE}${BALLS[k].img}.png" data-try="0" onerror="__imgRetry(this)" alt="">`;
  ball.className = 'throw-ball'; void ball.offsetWidth; ball.classList.add('animate');
  setTimeout(() => {                       // ดูดโปเกมอนเข้าบอล แล้วเริ่มสั่น
    if (sprite) sprite.style.opacity = '0';
    ball.classList.remove('animate'); ball.classList.add('shake');
  }, 600);
  setTimeout(() => {                       // รู้ผล
    ball.classList.remove('shake'); ball.classList.add('hidden');
    if (sprite) sprite.style.opacity = '';
    throwing = false;
    if (!currentSpawn) return;             // กันเคสสปอว์นหายไปแล้ว (เช่น เปลี่ยนเขต) — บอลถูกหักไปแล้วแต่ไม่ crash
    if (success) onCatchSuccess(k);
    else { playSfx('fail'); onCatchFail(k); }
  }, 1750);
}
function onCatchSuccess(ballKey) {
  const { mon, tier, shiny, level } = currentSpawn;
  const ind = makeIndividual(mon.id, level, tier, shiny);
  if (BALLS[ballKey] && BALLS[ballKey].friendBonus) ind.friend = Math.min(FRIEND_MAX, BALLS[ballKey].friendBonus);
  state.caught.push(ind);
  state.seen[mon.id] = true;
  state.totalCaught++;
  updateCatchCombo(mon.id, shiny);
  if (Math.random() < CATCH_LOCKBOX_CHANCE) {   // 5% ได้กล่องสุ่มจากการจับ
    state.lockboxes = (state.lockboxes || 0) + 1;
    toast('🎁 เจอกล่องสุ่ม! เปิดได้ที่เมนู', 'good');
    logMsg('🎁 จับได้พร้อม <b>กล่องสุ่ม</b>! เปิดที่เมนู 🤖 Catchbot & กล่องสุ่ม', 'big');
  }

  const amuletMul = 1 + Math.min(state.amulets || 0, AMULET_MAX) * 0.05;   // Amulet Coin
  const eventCoinMul = (currentWorldEvent() ? currentWorldEvent().coinMult : 1) * WEEKLY_COIN_MULT;   // อีเวนต์สุ่ม × อีเวนต์ประจำสัปดาห์
  const coins = Math.round(TIER_COIN[tier] * (1 + level / 100) * (shiny ? 3 : 1) * amuletMul * eventCoinMul);
  const xp = Math.round(TIER_XP[tier] * (1 + level / 50) * (boostActive('xp') ? CHARMS.xp.mult : 1));
  state.coins += coins;

  gainTrainerXp({ common: 3, uncommon: 6, rare: 12, superrare: 25, legendary: 60 }[tier] + (shiny ? 30 : 0));
  playSfx(shiny || tier === 'legendary' || tier === 'superrare' ? 'rare' : 'catch');
  toast(`🎉 จับ ${shiny ? '✨' : ''}<b>${mon.name}</b> Lv.${level} ได้! +${coins}🪙`, 'good');
  logMsg(`✅ จับ <b>${mon.name}</b> (${shiny ? 'Shiny' : TIER_LABEL[tier]}) Lv.${level} · IV ${ivPercent(ind)}% · +${coins}🪙`, 'good');
  gainXp(xp);
  addStreak(tier);            // สตรีคจับต่อเนื่อง
  addFriendship(2);           // มิตรภาพหัวหน้าทีม
  updateQuestProgress(mon, tier);
  if (currentSpawn && currentSpawn.fishing) bumpQuest('fishCatch');
  checkEggHatch();
  checkRegionUnlocks();
  checkAchievements();

  clearSpawn(); save(); renderTopbar(); renderCurrentView(); renderBallBar(); renderBoostStrip();
  scheduleSpawn();
}
// ---------- สตรีค + มิตรภาพ ----------
function addStreak(tier) {
  state.streaks[tier] = (state.streaks[tier] || 0) + 1;
  const s = state.streaks[tier];
  if (s > (state.bestStreaks[tier] || 0)) state.bestStreaks[tier] = s;
  if (s % STREAK_MILESTONE === 0) {
    state.lockboxes = (state.lockboxes || 0) + 1;
    toast(`🔥 สตรีค ${TIER_LABEL[tier]} ครบ ${s}! ได้ 🎁 กล่องสุ่ม`, 'good');
    logMsg(`🔥 สตรีค ${TIER_LABEL[tier]} ${s} ต่อเนื่อง! รับกล่องสุ่ม 🎁`, 'big');
  }
}
function resetStreak(tier) { if (state.streaks[tier]) state.streaks[tier] = 0; }
function addFriendship(n) {
  const b = getBuddy(); if (!b) return;
  b.friend = Math.min(FRIEND_MAX, (b.friend || 0) + n);
}
function onCatchFail(ballKey) {
  const tier = currentSpawn.tier;
  const fledChance = 0.12 + currentSpawn.throws * 0.03;
  resetStreak(tier);          // จับพลาด = สตรีคระดับนี้รีเซ็ต
  logMsg(`❌ <b>${currentSpawn.mon.name}</b> ดิ้นหลุด! (เสีย ${BALLS[ballKey].name}) · สตรีค ${TIER_LABEL[tier]} รีเซ็ต`, 'bad');
  save(); renderBallBar();
  if (Math.random() < fledChance) {
    toast(`💨 ${currentSpawn.mon.name} หนีไปแล้ว!`, 'bad');
    clearSpawn(); scheduleSpawn();
  } else {
    armDespawn();   // ยังไม่หนี — ตั้งเวลาหนีใหม่ (กันสปอว์นค้างถาวรเพราะ timer ถูกแช่แข็งตอนปา)
  }
}

// ================================================================
//  REGION UNLOCK
// ================================================================
function speciesOwnedCount() { return Object.keys(state.caught.reduce((o, c) => (o[c.id] = 1, o), {})).length; }
function checkRegionUnlocks() {
  const owned = speciesOwnedCount();
  REGIONS.forEach(r => {
    if (r.unlock && !state.unlocked[r.id] && owned >= r.unlock) {
      state.unlocked[r.id] = true;
      toast(`🗺️ ปลดล็อกเขตใหม่: <b>${r.name}</b>!`, 'good');
    }
  });
}
const REGION_SWITCH_CD = 45000;   // คูลดาวน์เปลี่ยนเขต 45 วิ กันสลับแมพรัวๆ เพื่อรีโรลสปอว์น
function selectRegion(id) {
  const r = REGION_BY_ID[id];
  if (r.unlock && !state.unlocked[id]) {
    toast(`🔒 ต้องจับให้ครบ ${r.unlock} ชนิดก่อน (ตอนนี้ ${speciesOwnedCount()})`, 'bad'); return;
  }
  if (id !== state.region) {
    const left = (state.regionSwitchReadyAt || 0) - Date.now();
    if (left > 0) { toast(`⏳ รอเปลี่ยนเขตอีก ${Math.ceil(left / 1000)} วิ`, 'bad'); return; }
    state.regionSwitchReadyAt = Date.now() + REGION_SWITCH_CD;
  }
  state.region = id; save();
  renderRegionBanner(); clearSpawn(); scheduleSpawn(1500);
  switchView('home');
  summonBuddyFx();   // เทรนเนอร์เรียกโปเกมอนออกมาตอนเข้าเขต
  toast(`${r.emoji} เดินทางสู่ <b>${r.name}</b>`, 'good');
}
// เอฟเฟคเรียกโปเกมอนฝั่งเราเด้งออกมา (ตอนเข้าเขต) — เด้งบอลจากเทรนเนอร์แล้วบัดดี้ปรากฏ
function summonBuddyFx() {
  if (state.settings && state.settings.reduceMotion) return;
  const wrap = $('#buddyBackWrap'); if (!wrap || !getBuddy()) return;
  wrap.classList.remove('summon'); void wrap.offsetWidth; wrap.classList.add('summon');
  setTimeout(() => wrap.classList.remove('summon'), 600);
}

// ================================================================
//  MAP view
// ================================================================
// ===== แผนที่โลกแฟนตาซี (สร้างขึ้นเอง) — ทุกเขตเป็นหมุดบนแผ่นดินเดียว ตำแหน่งตรงกับธีมชื่อเขต =====
// ตกแต่งภูมิประเทศเฉพาะจุด (อีโมจิจางๆ) ให้แต่ละที่มีเอกลักษณ์ เช่น รังมังกรมีกระดูกมังกร ยอดเขาหิมะมีภูเขา
const WORLD_DECOR = [
  { x: 41, y: 6, e: '☁️', s: 30 }, { x: 48, y: 18, e: '☁️', s: 22 }, { x: 34, y: 16, e: '☁️', s: 20 },
  { x: 61, y: 19, e: '⛰️', s: 30 }, { x: 66, y: 23, e: '❄️', s: 20 }, { x: 56, y: 22, e: '🏔️', s: 26 },
  { x: 55, y: 62, e: '🌋', s: 20 }, { x: 47, y: 92, e: '🌵', s: 26 }, { x: 53, y: 90, e: '🌵', s: 18 },
  { x: 76, y: 71, e: '🦴', s: 30 }, { x: 82, y: 82, e: '🦴', s: 22 }, { x: 70, y: 84, e: '🐉', s: 20 },
  { x: 17, y: 72, e: '🌿', s: 24 }, { x: 89, y: 30, e: '💠', s: 26 }, { x: 93, y: 6, e: '🌀', s: 30 },
  { x: 86, y: 68, e: '🌊', s: 24 }, { x: 6, y: 33, e: '🐚', s: 20 }, { x: 53, y: 33, e: '🏛️', s: 24 },
  { x: 72, y: 40, e: '🔮', s: 22 }, { x: 35, y: 64, e: '🌳', s: 24 }, { x: 45, y: 48, e: '🕳️', s: 22 },
];
function renderMap() {
  const wm = $('#worldMap'); if (!wm) return;
  const owned = speciesOwnedCount();
  const decor = WORLD_DECOR.map(d => `<text x="${d.x * 10}" y="${d.y * 6.4}" font-size="${d.s}" text-anchor="middle" opacity=".5">${d.e}</text>`).join('');
  const pins = REGIONS.map(r => {
    const locked = r.unlock && !state.unlocked[r.id];
    const active = state.region === r.id;
    const beaten = state.badges[r.id];
    return `<button class="wm-pin${active ? ' active' : ''}${locked ? ' locked' : ''}" style="left:${r.wx}%;top:${r.wy}%" data-region="${r.id}">
      <span class="wm-dot t-${r.types[0]}">${locked ? '🔒' : r.emoji}${beaten ? '<span class="wm-badge">🏅</span>' : ''}</span>
      <span class="wm-label">${r.name}</span>
    </button>`;
  }).join('');
  const mainLand = 'M70,360 C40,250 150,150 280,180 C380,110 520,140 560,250 C660,230 700,360 630,430 C690,540 540,600 420,575 C300,635 140,590 110,480 C50,455 80,410 70,360 Z';
  const mysticLand = 'M640,300 C690,230 810,230 860,300 C930,330 920,430 850,455 C820,530 700,510 690,440 C640,410 620,340 640,300 Z';
  const dragonLand = 'M690,520 C760,495 850,520 860,585 C885,635 800,665 730,640 C680,630 655,555 690,520 Z';
  // ภูเขาหิมะ (สามเหลี่ยมขาว), ต้นไม้ป่า (พุ่มเขียว), ภูเขาไฟ (กรวยลาวา) วาดตรงจุดธีม
  const mountains = [[590,180],[615,168],[640,182]].map(([x,y]) => `<path d="M${x - 24},${y + 30} L${x},${y - 14} L${x + 24},${y + 30} Z" fill="#eef4ff" stroke="#b8ccdf" stroke-width="2"/><path d="M${x - 9},${y + 8} L${x},${y - 14} L${x + 9},${y + 8} Z" fill="#fff"/>`).join('');
  const trees = [[330,440],[352,455],[312,458],[368,436],[340,470]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#356b2a"/><circle cx="${x}" cy="${y - 6}" r="10" fill="#4a8a3a"/>`).join('');
  const volcano = `<path d="M520,470 L556,392 L592,470 Z" fill="#6a3326" stroke="#3a1a12" stroke-width="2"/><path d="M540,428 C548,414 564,414 572,428 C566,440 546,440 540,428 Z" fill="#ff7a2a"/><circle cx="556" cy="398" r="7" fill="#ffce4a"/>`;
  wm.innerHTML = `
    <svg class="wm-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wmOcean" cx="50%" cy="38%" r="85%">
          <stop offset="0%" stop-color="#2a7aa8"/><stop offset="55%" stop-color="#12547d"/><stop offset="100%" stop-color="#07223a"/>
        </radialGradient>
        <linearGradient id="wmLand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#74b657"/><stop offset="55%" stop-color="#4f9440"/><stop offset="100%" stop-color="#3a6b2e"/>
        </linearGradient>
        <linearGradient id="wmMystic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7a56b8"/><stop offset="100%" stop-color="#38205e"/>
        </linearGradient>
        <linearGradient id="wmSand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#eccb82"/><stop offset="100%" stop-color="#b8934a"/>
        </linearGradient>
        <radialGradient id="wmVign" cx="50%" cy="50%" r="72%">
          <stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/>
        </radialGradient>
        <radialGradient id="wmSky" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#bfe6ff"/><stop offset="100%" stop-color="#6fb0e0"/>
        </radialGradient>
      </defs>
      <rect width="1000" height="640" fill="url(#wmOcean)"/>
      <ellipse cx="860" cy="400" rx="160" ry="128" fill="#061c30" opacity=".5"/>
      <!-- ชายฝั่งเรืองน้ำตื้น (เงาน้ำรอบแผ่นดิน) -->
      <path d="${mainLand}" fill="none" stroke="#8fe0d8" stroke-width="14" opacity=".28"/>
      <path d="${mysticLand}" fill="none" stroke="#c8a8ff" stroke-width="12" opacity=".25"/>
      <path d="${dragonLand}" fill="none" stroke="#e0b48a" stroke-width="12" opacity=".22"/>
      <path d="${mainLand}" fill="url(#wmLand)" stroke="#2c4d22" stroke-width="3"/>
      <path d="M430,560 C470,520 560,520 590,570 C650,560 700,600 660,650 C690,720 560,720 500,690 C440,700 400,610 430,560 Z" fill="url(#wmSand)" stroke="#8a6a34" stroke-width="3"/>
      <path d="${mysticLand}" fill="url(#wmMystic)" stroke="#2a1848" stroke-width="3"/>
      <path d="${dragonLand}" fill="#5a3a2a" stroke="#3a2418" stroke-width="3"/>
      ${mountains}${trees}${volcano}
      <!-- เกาะลอยฟ้า -->
      <ellipse cx="410" cy="94" rx="98" ry="44" fill="#5a3a24"/>
      <ellipse cx="410" cy="86" rx="98" ry="42" fill="url(#wmSky)"/>
      <path d="M330,120 C360,150 460,150 490,120 C470,150 350,150 330,120 Z" fill="#4a2f1c" opacity=".7"/>
      <!-- รอยแยกมิติ (void) มุมขวาบน -->
      <circle cx="930" cy="82" r="56" fill="#1a0a2e" stroke="#8a4aff" stroke-width="3"/>
      <circle cx="930" cy="82" r="38" fill="none" stroke="#a86bff" stroke-width="4" opacity=".7"/>
      <circle cx="930" cy="82" r="20" fill="#3a1060"/>
      <circle cx="930" cy="82" r="7" fill="#c9a3ff"/>
      ${decor}
      <rect width="1000" height="640" fill="url(#wmVign)" pointer-events="none"/>
    </svg>
    <div class="wm-pins">${pins}</div>`;
  wm.querySelectorAll('.wm-pin').forEach(el => el.onclick = () => openRegionPopup(el.dataset.region));
}
// ป๊อปอัพรายละเอียดเขต — กดจากหมุดบนแผนที่โลก มีข้อมูล/อัตราเจอ/ปุ่มเข้าล่า+ท้าบอส
function openRegionPopup(id) {
  const r = REGION_BY_ID[id]; if (!r) return;
  const owned = speciesOwnedCount();
  const locked = r.unlock && !state.unlocked[id];
  const beaten = state.badges[id];
  // อัตราความหายากเท่ากันทุกแมพ — โชว์แค่ "ธาตุที่พบในเขตนี้" (จุดต่างของแต่ละแมพ) ไม่โชว์เปอร์เซ็นต์
  const typeChips = r.types.map(t => `<span class="badge t-${t}">${TYPE_EMOJI[t] || ''} ${t}</span>`).join('');
  $('#modalBox').innerHTML = `
    <div style="height:96px;border-radius:14px;background:${regionBgCss(r)};background-size:cover;display:flex;align-items:flex-end;padding:8px 12px;margin-bottom:10px;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.6))"></div>
      <div style="position:relative;font-size:20px;font-weight:900;color:#fff;text-shadow:0 2px 6px #000">${r.emoji} ${r.name}${beaten ? ' 🏅' : ''}</div>
    </div>
    <div class="sr-sub" style="text-align:left;margin-bottom:8px">${r.desc}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">เลเวลป่า Lv.${r.lvl[0]}–${r.lvl[1]} · ธาตุที่พบบ่อยในเขตนี้:</div>
    <div class="tags" style="justify-content:center;margin-bottom:12px">${typeChips}</div>
    ${locked
      ? `<div class="empty-state" style="padding:14px"><div class="es-ico">🔒</div><div class="es-title">ยังปลดล็อกไม่ได้</div><div class="es-sub">จับให้ครบ ${r.unlock} ชนิดก่อน (ตอนนี้ ${owned}/${r.unlock})</div></div>
         <div class="modal-actions"><button class="btn-ghost" id="rpClose">ปิด</button></div>`
      : `<div class="modal-actions">
           <button class="btn-primary" id="rpEnter">🎯 เข้าล่าในเขตนี้</button>
           <button class="btn-primary" id="rpBoss" style="background:var(--btn-primary-grad)">⚔️ ${beaten ? 'ท้าบอสอีกครั้ง' : 'ท้าบอสประจำเขต'}</button>
           <button class="btn-ghost" id="rpClose">ปิด</button>
         </div>`}`;
  openModal();
  $('#rpClose').onclick = closeModal;
  const en = $('#rpEnter'); if (en) en.onclick = () => { closeModal(); selectRegion(id); };
  const bo = $('#rpBoss'); if (bo) bo.onclick = () => { closeModal(); startBossBattle(id); };
}

// ================================================================
//  COLLECTION
// ================================================================
function fillDexFilter() {
  $('#dexFilter').innerHTML =
    `<option value="all">ทั้งหมด</option><option value="owned">ที่จับได้</option>` +
    TIER_ORDER.map(t => `<option value="tier:${t}">${TIER_LABEL[t]}</option>`).join('') +
    `<option value="shiny">Shiny ✨</option>` +
    ALL_TYPES.map(t => `<option value="type:${t}">ธาตุ ${t}</option>`).join('');
  $('#dexSort').innerHTML =
    `<option value="dex">เรียง: เลข#</option>
     <option value="count">มากสุด</option>
     <option value="iv">IV สูงสุด</option>
     <option value="tier">ระดับ</option>`;
}
function bestIvOf(id) {
  const mine = state.caught.filter(c => c.id === id);
  return mine.length ? Math.max(...mine.map(ivPercent)) : -1;
}
function sortDexList(list) {
  const by = $('#dexSort') ? $('#dexSort').value : 'dex';
  if (by === 'count') list.sort((a, b) => speciesCount(b.id) - speciesCount(a.id) || a.id - b.id);
  else if (by === 'iv') list.sort((a, b) => bestIvOf(b.id) - bestIvOf(a.id) || a.id - b.id);
  else if (by === 'tier') list.sort((a, b) => TIER_ORDER.indexOf(b._tier) - TIER_ORDER.indexOf(a._tier) || a.id - b.id);
  // 'dex' = ตามลำดับเดิม (id)
}
function dexFilteredSpecies() {
  const search = $('#dexSearch').value.trim().toLowerCase();
  const filter = $('#dexFilter').value;
  const list = MONSTERS.filter(m => {
    if (search && !m.name.toLowerCase().includes(search)) return false;
    if (filter === 'owned' && !speciesCount(m.id)) return false;
    if (filter === 'shiny' && !state.caught.some(c => c.id === m.id && c.shiny)) return false;
    if (filter.startsWith('tier:') && m._tier !== filter.slice(5)) return false;
    if (filter.startsWith('type:') && !m.types.includes(filter.slice(5))) return false;
    return true;
  });
  sortDexList(list);
  return list;
}
function renderDex() {
  const grid = $('#dexGrid');
  const speciesOwned = speciesOwnedCount();
  const shinyCount = state.caught.filter(c => c.shiny).length;
  $('#dexStats').innerHTML =
    `จับได้ ${speciesOwned}/${MONSTERS.length} ชนิด · รวม ${state.totalCaught} ตัว · ✨ ${shinyCount} ตัว`;

  if (bulkMode) { renderBulkList(); return; }

  const list = dexFilteredSpecies();
  if (!list.length) { grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('🔍', 'ไม่มีโปเกมอนตรงตัวกรอง', 'ลองเปลี่ยนคำค้นหาหรือตัวกรองดู')}</div>`; return; }
  grid.innerHTML = list.map(m => {
    const cnt = speciesCount(m.id);
    const seen = state.seen[m.id];
    const b = getBuddy();
    const isBuddy = b && b.id === m.id;
    const hasShiny = state.caught.some(c => c.id === m.id && c.shiny);
    if (!seen) {
      return `<div class="dex-cell locked">
        <div style="height:56px;display:flex;align-items:center;justify-content:center;font-size:28px">❓</div>
        <div class="dname">???</div><div class="dnum">#${String(m.id).padStart(3, '0')}</div></div>`;
    }
    return `<div class="dex-cell${cnt ? '' : ' locked'} ${tierClass(m._tier, hasShiny)}" data-id="${m.id}">
      ${cnt ? `<div class="count">×${cnt}</div>` : ''}
      ${isBuddy ? '<div class="buddytag">⭐</div>' : ''}
      ${hasShiny ? '<div class="shinytag">✨</div>' : ''}
      ${spriteImg(m.id, hasShiny)}
      <div class="dname">${TYPE_EMOJI[m.types[0]] || ''} ${m.name}</div>
      <div class="dnum">${TIER_EMOJI[m._tier]} #${String(m.id).padStart(3, '0')}</div></div>`;
  }).join('');
  grid.querySelectorAll('.dex-cell[data-id]').forEach(cell => {
    cell.onclick = () => { cnt(+cell.dataset.id); };
  });
  function cnt(id) { speciesCount(id) ? openSpeciesModal(id) : openDexEntry(id); }
}

// ---------- bulk management mode ----------
let bulkMode = false;
let bulkSelected = new Set();
function toggleBulkMode() {
  bulkMode = !bulkMode;
  bulkSelected.clear();
  $('#dexGrid').classList.toggle('hidden', bulkMode);
  $('#dexList').classList.toggle('hidden', !bulkMode);
  $('#bulkBar').classList.toggle('hidden', !bulkMode);
  $('#bulkModeBtn').textContent = bulkMode ? '📖 กลับหน้าปกติ' : '📋 จัดการหลายตัว';
  renderDex();
}
function bulkIndividuals() {
  const speciesIds = new Set(dexFilteredSpecies().map(m => m.id));
  return state.caught.filter(c => speciesIds.has(c.id))
    .sort((a, b) => (b.tier === a.tier ? ivPercent(b) - ivPercent(a) : TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier)));
}
function renderBulkList() {
  const list = bulkIndividuals();
  const listEl = $('#dexList');
  listEl.innerHTML = list.map(ind => {
    const m = MON_BY_ID[ind.id];
    const sel = bulkSelected.has(ind.uid);
    const tags = (ind.locked ? '🔒' : '') + (inParty(ind.uid) ? '⭐' : '') + (ind.shiny ? '✨' : '');
    return `<div class="ind-row bulk-mode${sel ? ' selected' : ''} ${tierClass(ind.tier, ind.shiny, ind.golden)}" data-uid="${ind.uid}">
      <div class="ir-check">${sel ? '✓' : ''}</div>
      ${spriteImg(ind.id, ind.shiny)}
      <div class="ir-main">
        <div class="ir-name">${ind.nick || m.name} ${genderIcon(ind.gender)} <span class="ir-tags">${tags}</span></div>
        <div class="ir-sub">Lv.${ind.level} · ${TIER_LABEL[ind.tier]}</div>
      </div>
      <div class="ir-iv">IV ${ivPercent(ind)}%</div></div>`;
  }).join('') || emptyState('🔍', 'ไม่มีโปเกมอนตรงตัวกรอง', 'ลองเปลี่ยนคำค้นหาหรือตัวกรองดู');
  listEl.querySelectorAll('.ind-row[data-uid]').forEach(row => {
    row.onclick = () => { toggleBulkSelect(row.dataset.uid); };
  });
  updateBulkBar();
}
function toggleBulkSelect(uid) {
  bulkSelected.has(uid) ? bulkSelected.delete(uid) : bulkSelected.add(uid);
  renderBulkList();
}
function updateBulkBar() {
  $('#bulkCount').textContent = `เลือก ${bulkSelected.size} ตัว`;
}
function bulkSelectAll() {
  const list = bulkIndividuals();
  if (bulkSelected.size === list.length) bulkSelected.clear();
  else list.forEach(ind => bulkSelected.add(ind.uid));
  renderBulkList();
}
function bulkDoRelease() {
  const uids = [...bulkSelected].filter(uid => { const ind = indByUid(uid); return ind && !ind.locked; });
  if (!uids.length) { toast('ไม่มีตัวที่เลือก (หรือถูกล็อกทั้งหมด)', 'bad'); return; }
  if (!confirmAction(`ปล่อย ${uids.length} ตัว? (ตัวล็อกจะถูกข้าม)`)) return;
  let refund = 0;
  uids.forEach(uid => { const ind = indByUid(uid); if (ind) refund += Math.round(TIER_COIN[ind.tier] * 0.4); });
  const set = new Set(uids);
  state.caught = state.caught.filter(c => !set.has(c.uid));
  state.party = state.party.filter(u => !set.has(u));
  state.buddyUid = state.party[0] || null;
  state.coins += refund;
  bulkSelected.clear();
  save(); renderTopbar();
  toast(`👋 ปล่อย ${uids.length} ตัว · +${refund}🪙`, 'good');
  renderDex();
}
function bulkDoParty() {
  const uids = [...bulkSelected];
  if (!uids.length) return;
  let added = 0, skipped = 0;
  uids.forEach(uid => {
    if (state.party.length >= 6) { skipped++; return; }
    if (inParty(uid)) return;
    state.party.push(uid); added++;
  });
  if (added && !state.buddyUid) state.buddyUid = state.party[0];
  save(); renderTopbar();
  toast(`➕ เพิ่มเข้าทีม ${added} ตัว${skipped ? ` (ทีมเต็ม เหลือ ${skipped} ตัวไม่ได้เพิ่ม)` : ''}`, 'good');
  renderDex();
}
function bulkDoLock() {
  const uids = [...bulkSelected];
  if (!uids.length) return;
  const allLocked = uids.every(uid => { const ind = indByUid(uid); return ind && ind.locked; });
  uids.forEach(uid => { const ind = indByUid(uid); if (ind) ind.locked = !allLocked; });
  save();
  toast(allLocked ? '🔓 ปลดล็อกแล้ว' : '🔒 ล็อกแล้ว', 'good');
  renderDex();
}

// ---------- species modal: list individuals ----------
function openSpeciesModal(id) {
  const m = MON_BY_ID[id];
  const mine = state.caught.filter(c => c.id === id).sort((a, b) => ivPercent(b) - ivPercent(a));
  $('#modalBox').innerHTML = `
    <h3>${m.name} <span style="font-size:13px;color:var(--muted)">#${String(id).padStart(3, '0')}</span></h3>
    <div class="tags" style="justify-content:center;margin-bottom:6px">
      ${typeBadges(m.types)}
      <span class="badge rarity-${m._tier}">${TIER_LABEL[m._tier]}</span></div>
    <p style="font-size:12px;color:var(--muted);margin:4px 0 12px">มีในคลัง ${mine.length} ตัว · แตะเพื่อดูรายตัว</p>
    <div style="text-align:left">${mine.map(ind => indRow(ind)).join('')}</div>
    <div class="modal-actions">
      ${mine.length > 1 ? `<button class="btn-danger" id="mBulk">ปล่อยตัวซ้ำ (เก็บ IV สูงสุด)</button>` : ''}
      <button class="btn-ghost" id="mClose">ปิด</button></div>`;
  openModal();
  $('#mClose').onclick = closeModal;
  const bk = $('#mBulk'); if (bk) bk.onclick = () => bulkRelease(id);
  $('#modalBox').querySelectorAll('.ind-row[data-uid]').forEach(row => {
    row.onclick = () => openIndividualModal(row.dataset.uid);
  });
}
function bulkRelease(id) {
  const mine = state.caught.filter(c => c.id === id).sort((a, b) => ivPercent(b) - ivPercent(a));
  const keep = mine[0];   // เก็บ IV สูงสุด
  const toRelease = mine.filter(c => c.uid !== keep.uid && !c.locked && !inParty(c.uid));
  if (!toRelease.length) { toast('ไม่มีตัวซ้ำให้ปล่อย (ล็อก/ในทีม ถูกยกเว้น)', ''); return; }
  let refund = 0;
  toRelease.forEach(c => { refund += Math.round(TIER_COIN[c.tier] * 0.4); });
  const uids = new Set(toRelease.map(c => c.uid));
  state.caught = state.caught.filter(c => !uids.has(c.uid));
  state.coins += refund;
  toast(`👋 ปล่อย ${toRelease.length} ตัว · +${refund}🪙`, 'good');
  save(); renderTopbar();
  state.caught.some(c => c.id === id) ? openSpeciesModal(id) : (closeModal(), renderCurrentView());
  renderCurrentView();
}
function indRow(ind) {
  const m = MON_BY_ID[ind.id];
  const b = getBuddy();
  const isBuddy = b && b.uid === ind.uid;
  return `<div class="ind-row ${tierClass(ind.tier, ind.shiny, ind.golden)}" data-uid="${ind.uid}">
    ${spriteImg(ind.id, ind.shiny)}
    <div class="ir-main">
      <div class="ir-name">${ind.golden ? '🏆' : ind.shiny ? '✨' : ''}${ind.nick ? ind.nick : m.name} ${genderIcon(ind.gender)} ${isBuddy ? '⭐' : ''}</div>
      <div class="ir-sub">Lv.${ind.level} · ${ind.nature}${ind.nick ? ' · ' + m.name : ''}</div>
    </div>
    <div class="ir-iv">IV ${ivPercent(ind)}%</div></div>`;
}

// ---------- dex entry for unowned-but-seen ----------
function openDexEntry(id) {
  const m = MON_BY_ID[id], s = m.stats;
  $('#modalBox').innerHTML = `
    ${spriteImg(id, false, 'big')}
    <h3>${m.name} <span style="font-size:14px;color:var(--muted)">#${String(id).padStart(3, '0')}</span></h3>
    <div class="tags" style="justify-content:center;margin-bottom:10px">
      ${typeBadges(m.types)}
      <span class="badge rarity-${m._tier}">${TIER_LABEL[m._tier]}</span></div>
    <p style="font-size:13px;color:var(--muted)">ยังไม่มีในคลัง — ค่าพื้นฐาน (Base Stats)</p>
    ${baseStatRows(s)}
    ${evoText(m)}
    <div class="modal-actions"><button class="btn-ghost" id="mClose">ปิด</button></div>`;
  openModal(); $('#mClose').onclick = closeModal;
}
function baseStatRows(s) {
  return ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd']
    .map(k => `<div class="stat-row"><span>${STAT_LABEL[k]}</span><span>${s[k]}</span></div>`).join('');
}
function heldSectionHtml(ind) {
  const owned = HELD_ORDER.filter(k => (state.heldInv[k] || 0) > 0);
  let html = '<div class="ms-title">🎽 ไอเทมสวม (Held Item)</div>';
  if (ind.held) {
    const h = HELD_ITEMS[ind.held];
    html += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
      ${itemIcon(h.emoji, h.img)} <b>${h.name}</b> <span style="font-size:11px;color:var(--muted)">${h.desc}</span>
      <button class="claim-btn" id="hUnequip" style="padding:4px 10px">ถอด</button></div>`;
  }
  if (owned.length) {
    html += `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">แตะเพื่อสวม:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">` +
      owned.map(k => `<button class="pill" data-held="${k}" style="cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px">
        ${itemIcon(HELD_ITEMS[k].emoji, HELD_ITEMS[k].img)} ${HELD_ITEMS[k].name} ×${state.heldInv[k]}</button>`).join('') + `</div>`;
  } else if (!ind.held) {
    html += `<div style="font-size:12px;color:var(--muted)">ยังไม่มีไอเทมสวม — ซื้อได้ที่ร้านค้า 🏪</div>`;
  }
  return html;
}
function megaSectionHtml(ind) {
  const forms = megaFormsFor(ind.id);
  const gmax = gmaxFormFor(ind.id);
  if (!forms && !gmax) return '';
  let html = '<div class="ms-title">💎 เมก้าอีโวลูชัน / ไดนาแม็กซ์</div>';
  if (forms) {
    const attuned = forms.find(f => f.key === ind.megaKey);
    if (attuned) {
      html += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
        ${itemIcon('💎', attuned.stone)} <b>${attuned.name}</b>
        <button class="claim-btn" id="mgUnattach" style="padding:4px 10px">ถอด</button></div>`;
    }
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:6px">` +
      forms.filter(f => f.key !== ind.megaKey).map(f => {
        const have = state.megaStoneInv[f.stone] || 0;
        return have > 0
          ? `<button class="pill" data-attune="${f.stone}" style="cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px">${itemIcon('💎', f.stone)} แนบ ${f.name} ×${have}</button>`
          : `<span class="pill" style="opacity:.55;display:inline-flex;align-items:center;gap:4px" title="ชนะบอสในลีคเมก้าเพื่อรับหิน">${itemIcon('💎', f.stone)} ${f.name} — หาจาก 💎 ลีคเมก้า</span>`;
      }).join('') + `</div>`;
  }
  if (gmax) {
    const gmaxAttuned = ind.gmaxKey === gmax.key;
    if (gmaxAttuned) {
      html += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
        ${spriteImg(gmax.spriteId, false, 'item-ico')} <b>${gmax.name}</b>
        <button class="claim-btn" id="gxUnattach" style="padding:4px 10px">ถอด</button></div>`;
    } else {
      const have = state.gmaxStoneInv[gmax.key] || 0;
      html += `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">แนบหินปลุกพลัง G-Max เพื่อให้ตัวนี้ไดนาแม็กซ์เป็น <b>${gmax.name}</b> จริง (ไม่งั้นได้แค่ไดนาแม็กซ์ธรรมดา):</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:6px">` +
        (have > 0
          ? `<button class="pill" data-attunegx="1" style="cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px">${spriteImg(gmax.spriteId, false, 'item-ico')} แนบหินปลุกพลัง ×${have}</button>`
          : `<span class="pill" style="opacity:.55;display:inline-flex;align-items:center;gap:4px">${spriteImg(gmax.spriteId, false, 'item-ico')} หินปลุกพลัง G-Max — หาจากกล่องสุ่ม/หอคอย</span>`)
        + `</div>`;
    }
  }
  return html;
}
function evoText(m) {
  if (!m.evolvesTo) return '';
  const to = MON_BY_ID[m.evolvesTo];
  let how = m.evolveItem ? `ด้วย ${m.evolveItem}` : (m.evolveLevel ? `ที่ Lv.${m.evolveLevel}` : '');
  return `<p style="font-size:13px;color:var(--muted);margin-top:10px">🔀 วิวัฒนาการเป็น <b>${to.name}</b> ${how}</p>`;
}

// ---------- individual detail ----------
function openIndividualModal(uid) {
  const ind = state.caught.find(c => c.uid === uid);
  if (!ind) return;
  const m = MON_BY_ID[ind.id];
  const st = calcStats(ind);
  const b = getBuddy();
  const isBuddy = b && b.uid === uid;
  const ivRows = ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd'].map(k =>
    `<div class="iv-bar-wrap"><span class="lbl">${STAT_LABEL[k]}</span>
      <div class="iv-bar"><div style="width:${(ind.iv[k] / 31 * 100)}%"></div></div>
      <span class="val">${st[k]} <span style="color:var(--muted);font-size:10px">(${ind.iv[k]})</span></span></div>`).join('');
  $('#modalBox').innerHTML = `
    ${spriteImg(ind.id, ind.shiny, 'big')}
    <h3>${ind.shiny ? '✨' : ''}${ind.nick ? ind.nick : m.name} ${genderIcon(ind.gender)}</h3>
    ${ind.nick ? `<div style="font-size:12px;color:var(--muted);margin-top:-4px">(${m.name})</div>` : ''}
    <div style="margin-bottom:8px">
      <span class="pill">Lv.${ind.level}</span>
      <span class="pill">${ind.nature} nature</span>
      <span class="pill rarity-${ind.shiny ? 'shiny' : ind.tier}" style="color:#fff">${ind.shiny ? 'Shiny' : TIER_LABEL[ind.tier]}</span>
      <span class="pill">IV ${ivPercent(ind)}%</span>
      <span class="pill" title="มิตรภาพ ${ind.friend || 0}/${FRIEND_MAX}">${'❤️'.repeat(Math.ceil((ind.friend || 0) / 20)) || '🤍'} ${ind.friend || 0}</span>
      ${abilityFor(ind.id) ? `<span class="pill" title="${abilityFor(ind.id).desc}">🧬 ${abilityFor(ind.id).name}</span>` : ''}
    </div>
    <div class="tags" style="justify-content:center;margin-bottom:12px">
      ${typeBadges(m.types)}</div>
    <div style="text-align:left">${ivRows}</div>
    <div class="moveset">
      <div class="ms-title">⚔️ ท่าโจมตี</div>
      ${getMoves(ind.id).map(mv => `<span class="pill t-${mv.type}" style="color:#fff">${mv.name} <b>${mv.pow}</b> <small style="opacity:.75">🎯${mv.acc}%</small></span>`).join('')}
    </div>
    <div class="moveset" id="heldSection">${heldSectionHtml(ind)}</div>
    ${(megaFormsFor(ind.id) || gmaxFormFor(ind.id)) ? `<div class="moveset" id="megaSection">${megaSectionHtml(ind)}</div>` : ''}
    ${evoText(m)}
    <div class="modal-actions">
      <button class="btn-primary" id="mBuddy" ${isBuddy ? 'disabled' : ''}>${isBuddy ? '⭐ หัวหน้าทีม' : 'ตั้งเป็นหัวหน้า'}</button>
      ${inParty(uid)
        ? (isBuddy ? '' : `<button class="btn-ghost" id="mParty">➖ ออกจากทีม</button>`)
        : `<button class="btn-primary" id="mParty">➕ เข้าทีม (${state.party.length}/6)</button>`}
      ${(m.evolveItem && state.stones > 0) ? `<button class="btn-primary" id="mStone">💎 ใช้หินวิวัฒนาการ</button>` : ''}
      ${(state.candies > 0 && ind.level < 100) ? `<button class="btn-primary" id="mCandy">🍬 Rare Candy (มี ${state.candies})</button>` : ''}
      <button class="btn-ghost" id="mNick">✏️ ตั้งชื่อเล่น</button>
      <button class="btn-ghost" id="mLock">${ind.locked ? '🔒 ล็อกอยู่' : '🔓 ล็อก'}</button>
      <button class="btn-primary" id="mTrade" ${(ind.locked || (state.swapTickets || 0) <= 0 || swapReadyLeft() > 0) ? 'disabled' : ''}>🔀 Swap NPC (${state.swapTickets || 0} ตั๋ว)</button>
      <button class="btn-danger" id="mRelease" ${ind.locked ? 'disabled' : ''}>ปล่อย</button>
      <button class="btn-ghost" id="mClose">ปิด</button>
    </div>`;
  openModal();
  $('#mClose').onclick = closeModal;
  const bb = $('#mBuddy'); if (bb && !isBuddy) bb.onclick = () => { setBuddy(uid); openIndividualModal(uid); renderCurrentView(); };
  const pt = $('#mParty'); if (pt) pt.onclick = () => { inParty(uid) ? removeFromParty(uid) : addToParty(uid); openIndividualModal(uid); renderCurrentView(); };
  const rl = $('#mRelease'); if (rl && !ind.locked) rl.onclick = () => releaseIndividual(uid);
  const tr = $('#mTrade'); if (tr && !ind.locked) tr.onclick = () => tradeNpc(uid);
  const lk = $('#mLock'); if (lk) lk.onclick = () => { ind.locked = !ind.locked; save(); openIndividualModal(uid); };
  const sn = $('#mStone'); if (sn) sn.onclick = () => {
    if ((state.stones || 0) <= 0) { toast('❌ ไม่มีหินวิวัฒนาการ', 'bad'); return; }
    state.stones--; doEvolve(ind, m.evolvesTo); save(); openIndividualModal(uid); renderCurrentView();
  };
  const cd = $('#mCandy'); if (cd) cd.onclick = () => {
    if ((state.candies || 0) <= 0 || ind.level >= 100) return;
    state.candies--; ind.level++; ind.xp = 0;
    toast(`🍬 ${MON_BY_ID[ind.id].name} ขึ้นเป็น Lv.${ind.level}`, 'good');
    tryEvolveByLevel(ind); save(); renderTopbar(); openIndividualModal(uid); renderCurrentView();
  };
  const nk = $('#mNick'); if (nk) nk.onclick = () => {
    const cur = ind.nick || '';
    const name = (prompt('ตั้งชื่อเล่น (เว้นว่างเพื่อลบ):', cur) || '').trim().slice(0, 16);
    ind.nick = name || null; save(); openIndividualModal(uid); renderCurrentView();
    toast(name ? `✏️ ตั้งชื่อ "${name}" แล้ว` : 'ลบชื่อเล่นแล้ว', 'good');
  };
  const un = $('#hUnequip'); if (un) un.onclick = () => { unequipHeld(uid); openIndividualModal(uid); };
  $('#modalBox').querySelectorAll('[data-held]').forEach(b =>
    b.onclick = () => { equipHeld(uid, b.dataset.held); openIndividualModal(uid); });
  const mgu = $('#mgUnattach'); if (mgu) mgu.onclick = () => { detachStone(uid); openIndividualModal(uid); };
  $('#modalBox').querySelectorAll('[data-attune]').forEach(b =>
    b.onclick = () => { attuneStone(uid, b.dataset.attune); openIndividualModal(uid); });
  $('#modalBox').querySelectorAll('[data-buystone]').forEach(b =>
    b.onclick = () => { buyMegaStone(b.dataset.buystone, MEGA_STONE_PRICE); openIndividualModal(uid); });
  const gxu = $('#gxUnattach'); if (gxu) gxu.onclick = () => { detachGmaxStone(uid); openIndividualModal(uid); };
  const gxa = $('[data-attunegx]'); if (gxa) gxa.onclick = () => { attuneGmaxStone(uid); openIndividualModal(uid); };
  const gxb = $('[data-buygx]'); if (gxb) gxb.onclick = () => { buyGmaxStone(gmaxFormFor(ind.id).key, GMAX_STONE_PRICE); openIndividualModal(uid); };
}
// เทรดกับ NPC — ต้องใช้ 🔀 ตั๋ว Swap (ดรอปจากกล่องสุ่ม/หอคอย 1%) ได้ตัวใหม่แบบสุ่มล้วนเหมือนออกไปจับเอง
// (ไม่เกี่ยวกับระดับ/ระดับความหายากของตัวที่เอาไปแลก) โอกาส Shiny 1/6000 (ง่ายกว่าจับปกติ 1/8192)
// และมีโอกาสจิ๋ว 1/100000 ได้ Golden Dedenne (IV เต็ม 31 ทุกสเตตัส หาได้จากตรงนี้ที่เดียว)
const SWAP_TRADE_CD = 30000;
const SWAP_SHINY_CHANCE = 1 / 6000;
const GOLDEN_DEDENNE_CHANCE = 1 / 100000;
function swapReadyLeft() { return Math.max(0, (state.swapReadyAt || 0) - Date.now()); }
function tradeNpc(uid) {
  const idx = state.caught.findIndex(c => c.uid === uid);
  if (idx < 0) return;
  const ind = state.caught[idx];
  if (ind.locked) { toast('🔒 ตัวนี้ถูกล็อกอยู่', 'bad'); return; }
  if (inParty(uid)) { toast('❌ เอาออกจากทีมก่อนเทรด', 'bad'); return; }
  if ((state.swapTickets || 0) <= 0) { toast('❌ ไม่มีตั๋ว Swap (ดรอปจากกล่องสุ่ม/หอคอย 1%)', 'bad'); return; }
  const left = swapReadyLeft();
  if (left > 0) { toast(`⏳ รอเทรด NPC อีก ${Math.ceil(left / 1000)} วิ`, 'bad'); return; }
  if (!confirmAction(`ใช้ 🔀 ตั๋ว Swap เทรด ${MON_BY_ID[ind.id].name} กับ NPC เพื่อสุ่มตัวใหม่? (ตัวเดิมจะหายไป)`)) return;
  state.swapTickets--;
  state.swapReadyAt = Date.now() + SWAP_TRADE_CD;
  state.caught.splice(idx, 1);
  state.party = state.party.filter(u => u !== uid);
  state.buddyUid = state.party[0] || null;
  let nu, msg, logHtml;
  if (Math.random() < GOLDEN_DEDENNE_CHANCE) {   // แจ็คพอต Golden Dedenne
    const level = rand(TIER_LEVEL.legendary[0], TIER_LEVEL.legendary[1]);
    nu = makeIndividual(702, level, 'legendary', false);
    nu.golden = true;
    nu.iv = { hp: 31, atk: 31, def: 31, spatk: 31, spdef: 31, spd: 31 };
    state._gotGolden = true;
    msg = `🏆 แจ็คพอต! ได้ <b>Golden Dedenne</b> Lv.${level} IV 100%!!`;
    logHtml = `🏆 <b>Golden Dedenne</b> ตัวทองปรากฏจากการ Swap!! (1/100000)`;
  } else {
    const tier = weightedTier(1);
    const pool = MONSTERS.filter(m => m._tier === tier);
    const mon = pick(pool.length ? pool : MONSTERS);
    const shiny = Math.random() < SWAP_SHINY_CHANCE;
    const level = rand(TIER_LEVEL[tier][0], TIER_LEVEL[tier][1]);
    nu = makeIndividual(mon.id, level, tier, shiny);
    msg = `🔀 Swap ได้ ${shiny ? '✨' : ''}<b>${mon.name}</b> (${TIER_LABEL[tier]}) Lv.${level}!`;
    logHtml = `🔀 Swap ${MON_BY_ID[ind.id].name} → <b>${shiny ? '✨' : ''}${mon.name}</b> (${TIER_LABEL[tier]})`;
  }
  state.caught.push(nu); state.seen[nu.id] = true;
  save(); renderTopbar();
  toast(msg, 'good');
  logMsg(logHtml, 'big');
  checkAchievements(); closeModal(); openIndividualModal(nu.uid); renderCurrentView();
}
function releaseIndividual(uid) {
  const idx = state.caught.findIndex(c => c.uid === uid);
  if (idx < 0) return;
  const ind = state.caught[idx];
  if (ind.locked) { toast('🔒 ตัวนี้ถูกล็อกอยู่', 'bad'); return; }
  if (!confirmAction(`ปล่อย ${MON_BY_ID[ind.id].name} ทิ้ง?`)) return;
  const refund = Math.round(TIER_COIN[ind.tier] * 0.4);
  state.caught.splice(idx, 1);
  state.party = state.party.filter(u => u !== uid);
  state.buddyUid = state.party[0] || null;
  state.coins += refund;
  toast(`👋 ปล่อย ${MON_BY_ID[ind.id].name} · +${refund}🪙`, '');
  save(); renderTopbar(); closeModal();
  const stillHave = state.caught.some(c => c.id === ind.id);
  stillHave ? openSpeciesModal(ind.id) : renderCurrentView();
  renderCurrentView();
}

// ================================================================
//  SHOP
// ================================================================
const BALL_QTY_OPTIONS = [1, 5, 10, 25];
function renderShop() {
  const ballsHtml = SHOP_BALL_ORDER.map(k => {
    const b = BALLS[k];
    const qty = (state.shopQty && state.shopQty[k]) || 1;
    const total = b.price * qty;
    const cant = state.coins < total;
    return `<div class="shop-item">
      <div class="emoji">${itemIcon(b.emoji, b.img, 'big')}</div>
      <div class="si-body"><div class="si-name">${b.name}</div><div class="si-desc">${b.hint}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:stretch">
        <select class="set-select" data-ballqty="${k}" style="font-size:11px;padding:2px 4px">
          ${BALL_QTY_OPTIONS.map(n => `<option value="${n}"${n === qty ? ' selected' : ''}>×${n}</option>`).join('')}
        </select>
        <button class="buy-btn" data-buyball="${k}" ${cant ? 'disabled' : ''}>${total}${itemIcon('🪙', 'nugget', 'price-ico')}</button>
      </div></div>`;
  }).join('');
  // ร้านหลักขายเฉพาะ "บอล + ตั๋วซาฟารี + อุปกรณ์ปลดล็อกถาวร" — ไอเทมสิ้นเปลือง/ของสวมใส่ได้จากการเล่น (ตียิม/หอคอย/กล่องสุ่ม) แทน
  const items = [
    { cat: 'ball', emoji: '🟡', img: 'ultra-ball', name: 'Ultra Ball', desc: 'แลกด้วยเหรียญตกปลา', tokenPrice: 3, act: () => { if (spendTokens(3)) { state.balls.ultra = (state.balls.ultra || 0) + 1; toast('🟡 +1 Ultra Ball', 'good'); postBuy(); } } },
    { cat: 'ticket', emoji: '🎫', img: 'member-card', name: 'ตั๋ว Safari', desc: `เข้า Safari Zone ${SAFARI_SPAWNS} ตัวหายากสุดๆ (กดปุ่ม Safari หน้าล่า)`, price: 800, act: () => { if (spend(800)) { state.safariTickets = (state.safariTickets || 0) + 1; toast('🎫 +1 ตั๋ว Safari', 'good'); postBuy(); } } },
    { cat: 'ticket', emoji: '💎', img: 'shiny-stone', name: 'หินวิวัฒนาการ', desc: 'วิวัฒนาการตัวที่ต้องใช้ไอเทม', price: STONE_PRICE, act: () => { if (spend(STONE_PRICE)) { state.stones = (state.stones || 0) + 1; toast('💎 +1 หินวิวัฒนาการ', 'good'); postBuy(); } } },
    { cat: 'ticket', emoji: '📿', img: 'lucky-egg', name: 'XP Charm', desc: 'ได้ XP ×2 นาน 30 นาที (กดใช้ในเมนู 🔮 Charms)', price: CHARMS.xp.price, act: () => buyCharm('xp') },
    // แลกด้วยเหรียญเช็คอิน (ได้จากล็อกอินรายวัน)
    { cat: 'perm', emoji: '💍', img: 'mega-ring', name: state.hasMegaRing ? 'กำไลเมก้า (มีแล้ว)' : 'กำไลเมก้า', desc: 'ปลดล็อกครั้งเดียว ถาวร — จำเป็นก่อนเมก้าอีโวลูชัน · แลกด้วยเหรียญเช็คอิน', checkinPrice: MEGA_RING_CHECKIN, act: () => { if (state.hasMegaRing) { toast('มีกำไลเมก้าอยู่แล้ว', ''); return; } if (spendCheckin(MEGA_RING_CHECKIN)) { state.hasMegaRing = true; toast('💍 ได้กำไลเมก้าแล้ว! เมก้าอีโวลูชันได้ในการต่อสู้', 'good'); postBuy(); checkAchievements(); } } },
    { cat: 'perm', emoji: '⌚', img: 'macho-brace', name: state.hasDynamaxBand ? 'กำไลไดนาแม็กซ์ (มีแล้ว)' : 'กำไลไดนาแม็กซ์', desc: 'ปลดล็อกครั้งเดียว ถาวร — จำเป็นก่อนไดนาแม็กซ์ · แลกด้วยเหรียญเช็คอิน', checkinPrice: DYNAMAX_BAND_CHECKIN, act: () => { if (state.hasDynamaxBand) { toast('มีกำไลไดนาแม็กซ์อยู่แล้ว', ''); return; } if (spendCheckin(DYNAMAX_BAND_CHECKIN)) { state.hasDynamaxBand = true; toast('⌚ ได้กำไลไดนาแม็กซ์แล้ว! ไดนาแม็กซ์ได้ในการต่อสู้', 'good'); postBuy(); checkAchievements(); } } },
    { cat: 'perm', emoji: '🪙', img: 'amulet-coin', name: `Amulet Coin (${state.amulets || 0}/${AMULET_MAX})`, desc: 'เงินที่ได้จากการจับ +5% ต่อชิ้น สูงสุด +50% (ติดตัวถาวร) · หรือลุ้นดรอปหายากจากบอสหอคอย/บอสประจำเขต', price: 150000, act: () => { if ((state.amulets || 0) >= AMULET_MAX) { toast('มี Amulet Coin เต็มแล้ว', ''); return; } if (spend(150000)) { state.amulets = (state.amulets || 0) + 1; toast(`🪙 Amulet Coin +1 (เงิน +${state.amulets * 5}%)`, 'good'); postBuy(); } } },
    { cat: 'perm', emoji: '🎓', img: null, owned: !!state.hasExpShare, name: state.hasExpShare ? 'EXP Share (มีแล้ว)' : 'EXP Share', desc: 'ปลดล็อกครั้งเดียว ถาวร — จับได้ทีนึงแบ่ง XP ให้ทั้งทีม', price: 2500000, act: () => { if (state.hasExpShare) { toast('มี EXP Share อยู่แล้ว', ''); return; } if (spend(2500000)) { state.hasExpShare = true; toast('🎓 ได้ EXP Share! ทั้งทีมได้ XP จากการจับ', 'good'); postBuy(); } } },
    // แลกด้วยเหรียญเช็คอิน 🎟️
    { cat: 'perm', emoji: '🔮', img: 'shiny-charm', name: `Shiny Charm (${state.shinyCharms || 0}/${SHINY_CHARM_MAX})`, desc: `ติดตัวถาวร เพิ่มโอกาส Shiny +${Math.round(SHINY_CHARM_PER * 100)}% ทบต้น · แลกด้วยเหรียญเช็คอิน`, checkinPrice: 50, act: () => { if ((state.shinyCharms || 0) >= SHINY_CHARM_MAX) { toast('มี Shiny Charm ครบแล้ว', ''); return; } if (spendCheckin(50)) { state.shinyCharms = (state.shinyCharms || 0) + 1; toast(`🔮 Shiny Charm ${state.shinyCharms}/${SHINY_CHARM_MAX}`, 'good'); postBuy(); } } },
    { cat: 'perm', emoji: '🧲', img: 'oval-charm', name: `Catch Charm (${state.catchCharms || 0}/${CATCH_CHARM_MAX})`, desc: `ติดตัวถาวร เพิ่มโอกาสจับ +${Math.round(CATCH_CHARM_PER * 100)}% ทบต้น · แลกด้วยเหรียญเช็คอิน`, checkinPrice: 50, act: () => { if ((state.catchCharms || 0) >= CATCH_CHARM_MAX) { toast('มี Catch Charm ครบแล้ว', ''); return; } if (spendCheckin(50)) { state.catchCharms = (state.catchCharms || 0) + 1; toast(`🧲 Catch Charm ${state.catchCharms}/${CATCH_CHARM_MAX}`, 'good'); postBuy(); } } },
  ];
  const SHOP_CATS = [
    { key: 'ball', label: '🔴 บอล' },
    { key: 'ticket', label: '🎫 ตั๋ว & ไอเทมใช้แล้วหมด' },
    { key: 'perm', label: '💎 อัปเกรดถาวร' },
  ];
  const renderItem = (it, i) => {
    const isTok = it.tokenPrice != null;
    const isCheckin = it.checkinPrice != null;
    const owned = it.owned || (it.img === 'mega-ring' && state.hasMegaRing) || (it.img === 'macho-brace' && state.hasDynamaxBand);
    const cant = owned || (isCheckin ? (state.checkinCoins || 0) < it.checkinPrice : isTok ? (state.fishTokens || 0) < it.tokenPrice : state.coins < it.price);
    const label = owned ? 'มีแล้ว' : (isCheckin ? `${it.checkinPrice} 🗓️เช็คอิน` : isTok ? `${it.tokenPrice}🎟️` : `${it.price}${itemIcon('🪙', 'nugget', 'price-ico')}`);
    const curClass = isCheckin ? ' cur-checkin' : isTok ? ' cur-token' : '';
    return `<div class="shop-item">
      <div class="emoji">${itemIcon(it.emoji, it.img, 'big')}</div>
      <div class="si-body"><div class="si-name">${it.name}</div><div class="si-desc">${it.desc}</div></div>
      <button class="buy-btn${curClass}" data-i="${i}" ${cant ? 'disabled' : ''}>${label}</button></div>`;
  };
  $('#shopGrid').innerHTML =
    `<div class="dex-stats">💎 ${state.stones || 0} · 🎟️ ${state.fishTokens || 0} เหรียญตกปลา · 🗓️ ${state.checkinCoins || 0} เหรียญเช็คอิน · ${itemIcon('🔀', 'eon-ticket', 'price-ico')} ${state.swapTickets || 0} ตั๋ว Swap · บอล: ` +
    BALL_ORDER.map(k => `${itemIcon(BALLS[k].emoji, BALLS[k].img)}${state.balls[k] || 0}`).join(' ') + `</div>` +
    `<div class="shop-cat">${SHOP_CATS[0].label}</div>` + ballsHtml +
    SHOP_CATS.map(c => {
      const rows = items.map((it, i) => ({ it, i })).filter(({ it }) => it.cat === c.key);
      if (!rows.length) return '';
      const head = c.key === 'ball' ? '' : `<div class="shop-cat">${c.label}</div>`;
      return head + rows.map(({ it, i }) => renderItem(it, i)).join('');
    }).join('');
  $('#shopGrid').querySelectorAll('.buy-btn[data-i]').forEach(btn => btn.onclick = () => items[+btn.dataset.i].act());
  $('#shopGrid').querySelectorAll('[data-ballqty]').forEach(sel => sel.onchange = () => {
    state.shopQty = state.shopQty || {};
    state.shopQty[sel.dataset.ballqty] = +sel.value;
    save(); renderShop();
  });
  $('#shopGrid').querySelectorAll('[data-buyball]').forEach(btn => btn.onclick = () => {
    const k = btn.dataset.buyball;
    const qty = (state.shopQty && state.shopQty[k]) || 1;
    addBalls(k, qty, BALLS[k].price * qty);
  });
}
function spendTokens(n) { if ((state.fishTokens || 0) < n) { toast('❌ เหรียญตกปลาไม่พอ', 'bad'); return false; } state.fishTokens -= n; return true; }
function spendCheckin(n) { if ((state.checkinCoins || 0) < n) { toast('❌ เหรียญเช็คอินไม่พอ (ได้จากล็อกอินรายวัน)', 'bad'); return false; } state.checkinCoins -= n; return true; }
function spend(n) { if (state.coins < n) { toast('❌ เงินไม่พอ', 'bad'); return false; } state.coins -= n; return true; }
function postBuy() { save(); renderTopbar(); renderShop(); renderBallBar(); }
function addBalls(k, n, price) { if (spend(price)) { state.balls[k] = (state.balls[k] || 0) + n; toast(`${BALLS[k].emoji} +${n} ${BALLS[k].name}`, 'good'); postBuy(); } }
function addBerries(k, n, price) { if (spend(price)) { state.berries[k] = (state.berries[k] || 0) + n; toast(`${BERRIES[k].emoji} +${n} ${BERRIES[k].name}`, 'good'); postBuy(); renderBerryBar(); } }
function buyCharm(k) { if (spend(CHARMS[k].price)) { state.charms[k] = (state.charms[k] || 0) + 1; toast(`${CHARMS[k].emoji} ซื้อ ${CHARMS[k].name} — กดใช้ในเมนู ⚙️`, 'good'); postBuy(); } }
function buyHeld(k) { if (spend(HELD_ITEMS[k].price)) { state.heldInv[k] = (state.heldInv[k] || 0) + 1; toast(`${HELD_ITEMS[k].emoji} ซื้อ ${HELD_ITEMS[k].name} — สวมได้ในหน้าโปเกมอน`, 'good'); postBuy(); } }
// สุ่มอุปกรณ์สวมใส่ให้ 1 ชิ้น (ใช้เป็นดรอปจากยิม/หอคอย) — คืนข้อความไอเทมที่ได้
function grantRandomHeld() {
  const k = pick(HELD_ORDER);
  state.heldInv = state.heldInv || {};
  state.heldInv[k] = (state.heldInv[k] || 0) + 1;
  return `${HELD_ITEMS[k].emoji} ${HELD_ITEMS[k].name}`;
}
const HELD_DROP_CHANCE = 0.05;   // 5% ดรอปอุปกรณ์สวมใส่
// Amulet Coin ดรอปหายากจากบอสหอคอย/บอสประจำเขตเท่านั้น (นอกจากซื้อด้วยเงิน 150000 ที่ร้าน) — คืนข้อความถ้าได้ ไม่งั้นคืนค่าว่าง
const AMULET_DROP_CHANCE = 0.01;   // 1% ต่อการชนะบอสหอคอย/บอสประจำเขต
function grantAmuletDrop() {
  if ((state.amulets || 0) >= AMULET_MAX) return '';
  if (Math.random() >= AMULET_DROP_CHANCE) return '';
  state.amulets = (state.amulets || 0) + 1;
  return `🪙 Amulet Coin! (เงิน +${state.amulets * 5}%)`;
}
// ตั๋ว Swap — ดรอปหายากจากกล่องสุ่ม/หอคอยเท่านั้น ใช้แลกโปเกมอนกับพ่อค้าเร่ (ดูฟังก์ชัน npcSwap)
const SWAP_TICKET_DROP_CHANCE = 0.01;   // 1% ต่อการเปิดกล่องสุ่ม/ผ่านชั้นหอคอย
function grantSwapTicketDrop() {
  if (Math.random() >= SWAP_TICKET_DROP_CHANCE) return '';
  state.swapTickets = (state.swapTickets || 0) + 1;
  return `🔀 ตั๋ว Swap!`;
}
function equipHeld(uid, k) {
  const ind = indByUid(uid); if (!ind) return;
  if ((state.heldInv[k] || 0) <= 0) { toast('❌ ไม่มีไอเทมนี้', 'bad'); return; }
  if (ind.held) { state.heldInv[ind.held] = (state.heldInv[ind.held] || 0) + 1; }  // คืนของเดิม
  state.heldInv[k]--; ind.held = k;
  save(); toast(`🎽 สวม ${HELD_ITEMS[k].name} ให้ ${MON_BY_ID[ind.id].name}`, 'good');
}
function unequipHeld(uid) {
  const ind = indByUid(uid); if (!ind || !ind.held) return;
  state.heldInv[ind.held] = (state.heldInv[ind.held] || 0) + 1; ind.held = null;
  save(); toast('ถอดไอเทมแล้ว', '');
}
function buyEgg(kind) {
  const k = kind || 'mystery', e = EGG_KINDS[k];
  if (spend(e.price)) { state.eggs.push({ kind: k, progressStart: state.totalCaught }); toast(`🥚 ได้${e.name}! จับอีก ${e.catches} ตัวเพื่อฟัก`, 'good'); postBuy(); }
}

// ================================================================
//  EGGS
// ================================================================
function checkEggHatch() {
  let hatched = false;
  state.eggs = state.eggs.filter(egg => {
    const e = EGG_KINDS[egg.kind || 'mystery'];
    if (state.totalCaught - egg.progressStart >= e.catches) {
      let mon;
      const tp = e.tiers ? MONSTERS.filter(m => e.tiers.includes(m._tier)) : null;
      if (tp && tp.length) mon = pick(tp);
      else { const tier = weightedTier(1); const p = MONSTERS.filter(m => m._tier === tier); mon = pick(p.length ? p : MONSTERS); }
      const shiny = Math.random() < SHINY_CHANCE * (e.shinyMul || 3);
      const ind = makeIndividual(mon.id, rand(3, 12), mon._tier, shiny);
      state.caught.push(ind); state.seen[mon.id] = true; state.totalCaught++;
      toast(`🥚➡️ ${e.name}ฟักเป็น ${shiny ? '✨' : ''}<b>${mon.name}</b>!`, 'good');
      logMsg(`🥚 ${e.name}ฟักเป็น <b>${mon.name}</b> (${TIER_LABEL[mon._tier]})`, 'big');
      playSfx('rare'); hatched = true; return false;
    }
    return true;
  });
  if (hatched) { save(); renderCurrentView(); }
}

// ================================================================
//  QUESTS
// ================================================================
// พูลแบบเควส — สุ่มเลือก 3 จากทั้งหมดทุกวัน ให้แต่ละวันไม่ซ้ำแนวเดิมตลอด (เดิมตายตัวแค่ 3 แบบ)
const QUEST_DEFS = [
  { type: 'catchAny', gen: () => { const n = rand(4, 8); return { target: n, name: `จับโปเกมอน ${n} ตัว`, rewardCoins: 60 + n * 10, rewardBall: ['poke', 3] }; } },
  { type: 'catchType', gen: () => { const t = pick(ALL_TYPES), n = rand(2, 4); return { typeName: t, target: n, name: `จับธาตุ ${t} ${n} ตัว`, rewardCoins: 90 + n * 15, rewardBall: ['great', 2] }; } },
  { type: 'catchRare', gen: () => { const n = rand(1, 3); return { target: n, name: `จับ Rare ขึ้นไป ${n} ตัว`, rewardCoins: 200, rewardBall: ['ultra', 1] }; } },
  { type: 'winBattle', gen: () => { const n = rand(2, 4); return { target: n, name: `ชนะบอส/ยิม/หอคอย ${n} ครั้ง`, rewardCoins: 150 + n * 30, rewardBall: ['great', 3] }; } },
  { type: 'fishCatch', gen: () => { const n = rand(2, 5); return { target: n, name: `ตกปลาได้โปเกมอน ${n} ตัว`, rewardCoins: 100 + n * 20, rewardBall: ['net', 2] }; } },
  { type: 'contestEnter', gen: () => { const n = rand(1, 2); return { target: n, name: `ส่งเข้าประกวดคอนเทสต์ ${n} ครั้ง`, rewardCoins: 120, rewardBall: ['premier', 2] }; } },
  { type: 'evolvePokemon', gen: () => { const n = 1; return { target: n, name: `วิวัฒนาการโปเกมอน ${n} ตัว`, rewardCoins: 250, rewardBall: ['ultra', 1] }; } },
  { type: 'farmHarvest', gen: () => { const n = rand(1, 2); return { target: n, name: `เก็บเกี่ยวไร่เบอร์รี่ ${n} ครั้ง`, rewardCoins: 100, rewardBall: ['great', 2] }; } },
  { type: 'rivalBattle', gen: () => { const n = 1; return { target: n, name: `ท้าคู่แข่งประจำตัว ${n} ครั้ง`, rewardCoins: 150, rewardBall: ['ultra', 1] }; } },
];
function pickN(arr, n) {   // สุ่มหยิบ n ตัวไม่ซ้ำจาก arr
  const pool = [...arr], out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function makeQuests() {
  return pickN(QUEST_DEFS, 3).map((def, i) => {
    const g = def.gen();
    return { key: 'q' + (i + 1), type: def.type, progress: 0, claimed: false, ...g };
  });
}
function ensureDailyQuests() {
  if (state.questDate !== todayStr() || !state.quests.length) {
    state.quests = makeQuests(); state.questDate = todayStr(); save();
  }
  ensureWeeklyQuest();
}
// เควสพิเศษประจำสัปดาห์ — ผูกธีมกับอีเวนต์ประจำสัปดาห์ รางวัลใหญ่กว่าเควสรายวัน
function makeWeeklyQuest() {
  const wk = weeklyEvent();
  let q;
  if (wk.types && wk.types.length) {
    const t = pick(wk.types), n = rand(8, 15);
    q = { type: 'catchType', typeName: t, target: n, name: `จับธาตุ ${t} ${n} ตัว` };
  } else {
    const n = rand(5, 10);
    q = { type: 'catchRare', target: n, name: `จับ Rare ขึ้นไป ${n} ตัว` };
  }
  return Object.assign(q, { key: 'weekly', progress: 0, claimed: false, event: `${wk.emoji} ${wk.name}`,
    rewardCoins: 800, rewardBall: ['ultra', 3], rewardLockbox: 1 });
}
function ensureWeeklyQuest() {
  const key = weeklyEventKey();
  if (state.weeklyQuestKey !== key || !state.weeklyQuest) {
    state.weeklyQuest = makeWeeklyQuest(); state.weeklyQuestKey = key; save();
  }
}
function advanceWeeklyQuest(mon, tier, bumpType) {
  const wq = state.weeklyQuest; if (!wq || wq.claimed || wq.progress >= wq.target) return false;
  let hit = false;
  if (mon) hit = wq.type === 'catchAny' || (wq.type === 'catchType' && mon.types.includes(wq.typeName)) || (wq.type === 'catchRare' && ['rare', 'superrare', 'legendary'].includes(tier));
  else if (bumpType) hit = wq.type === bumpType;
  if (hit) { wq.progress++; return true; }
  return false;
}
function claimWeeklyQuest() {
  const q = state.weeklyQuest;
  if (!q || q.claimed || q.progress < q.target) return;
  q.claimed = true; state.coins += q.rewardCoins;
  const [bk, bn] = q.rewardBall; state.balls[bk] = (state.balls[bk] || 0) + bn;
  if (q.rewardLockbox) state.lockboxes = (state.lockboxes || 0) + q.rewardLockbox;
  save(); renderTopbar(); renderQuests(); renderBallBar();
  toast(`🎁 รับรางวัลอีเวนต์: +${q.rewardCoins}🪙 +${bn}${BALLS[bk].emoji}${q.rewardLockbox ? ' +🎁' : ''}`, 'good');
  playSfx('rare');
}
function updateQuestProgress(mon, tier) {
  let ch = false;
  for (const q of state.quests) {
    if (q.claimed || q.progress >= q.target) continue;
    let hit = q.type === 'catchAny'
      || (q.type === 'catchType' && mon.types.includes(q.typeName))
      || (q.type === 'catchRare' && ['rare', 'superrare', 'legendary'].includes(tier));
    if (hit) { q.progress++; ch = true; }
  }
  if (advanceWeeklyQuest(mon, tier, null)) ch = true;
  if (ch) save();
}
function bumpQuest(type) {   // เพิ่มความคืบหน้าเควสประเภทที่ไม่เกี่ยวกับการจับ (ชนะ/ตกปลา/คอนเทสต์/วิวัฒนาการ)
  let ch = false;
  for (const q of state.quests) {
    if (q.claimed || q.progress >= q.target) continue;
    if (q.type === type) { q.progress++; ch = true; }
  }
  if (advanceWeeklyQuest(null, null, type)) ch = true;
  if (ch) save();
}
function claimQuest(key) {
  const q = state.quests.find(x => x.key === key);
  if (!q || q.claimed || q.progress < q.target) return;
  q.claimed = true; state.coins += q.rewardCoins;
  const [bk, bn] = q.rewardBall; state.balls[bk] = (state.balls[bk] || 0) + bn;
  save(); renderTopbar(); renderQuests(); renderBallBar();
  toast(`🎁 รับรางวัล: +${q.rewardCoins}🪙 +${bn}${BALLS[bk].emoji}`, 'good');
}
function renderQuests() {
  ensureDailyQuests();
  $('#questReset').textContent = `รีเซ็ตทุกวัน · วันนี้ ${state.questDate}`;
  renderWeeklyQuest();
  $('#questList').innerHTML = state.quests.map(q => {
    const done = q.progress >= q.target, pct = clamp(q.progress / q.target * 100, 0, 100);
    const [bk, bn] = q.rewardBall;
    return `<div class="quest">
      <div class="quest-top"><div class="quest-name">${q.name}</div>
        <div class="quest-reward">+${q.rewardCoins}🪙 +${bn}${BALLS[bk].emoji}</div></div>
      <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
      <div class="quest-foot"><span>${Math.min(q.progress, q.target)}/${q.target}</span>
        <button class="claim-btn${q.claimed ? ' done' : ''}" data-key="${q.key}" ${(!done || q.claimed) ? 'disabled' : ''}>${q.claimed ? 'รับแล้ว ✓' : 'รับรางวัล'}</button>
      </div></div>`;
  }).join('');
  $('#questList').querySelectorAll('.claim-btn[data-key]').forEach(btn => btn.onclick = () => claimQuest(btn.dataset.key));
  renderEggs();
  renderContest();
  renderFarm();
}
function renderWeeklyQuest() {
  const box = $('#weeklyQuestBox'); if (!box) return;
  ensureWeeklyQuest();
  const q = state.weeklyQuest;
  const done = q.progress >= q.target, pct = clamp(q.progress / q.target * 100, 0, 100);
  const [bk, bn] = q.rewardBall;
  box.innerHTML = `<div class="quest weekly-quest">
    <div class="wq-tag">📅 เควสอีเวนต์สัปดาห์นี้ · ${q.event} · เหลือ ${weeklyEventDaysLeft()} วัน</div>
    <div class="quest-top"><div class="quest-name">${q.name}</div>
      <div class="quest-reward">+${q.rewardCoins}🪙 +${bn}${BALLS[bk].emoji}${q.rewardLockbox ? ' +🎁' : ''}</div></div>
    <div class="quest-bar"><div class="quest-fill" style="width:${pct}%;background:linear-gradient(90deg,#c9a3ff,#8e5bff)"></div></div>
    <div class="quest-foot"><span>${Math.min(q.progress, q.target)}/${q.target}</span>
      <button class="claim-btn${q.claimed ? ' done' : ''}" id="wqClaim" ${(!done || q.claimed) ? 'disabled' : ''}>${q.claimed ? 'รับแล้ว ✓' : 'รับรางวัล'}</button>
    </div></div>`;
  const btn = $('#wqClaim'); if (btn) btn.onclick = claimWeeklyQuest;
}
function renderEggs() {
  const box = $('#eggList');
  if (!state.eggs.length) {
    box.innerHTML = `<div class="egg-item"><div class="emoji">🥚</div><div class="eb">
      <div class="si-name">ยังไม่มีไข่</div><div class="si-desc">ซื้อได้ที่ร้านค้า</div></div></div>`; return;
  }
  box.innerHTML = state.eggs.map((egg, i) => {
    const e = EGG_KINDS[egg.kind || 'mystery'];
    const prog = clamp(state.totalCaught - egg.progressStart, 0, e.catches);
    return `<div class="egg-item"><div class="emoji">🥚</div><div class="eb">
      <div class="si-name">${e.name}${egg.kind === 'gold' ? ' ✨' : ''}</div>
      <div class="quest-bar"><div class="quest-fill" style="width:${prog / e.catches * 100}%"></div></div>
      <div class="si-desc">ฟักเมื่อจับครบ: ${prog}/${e.catches} ตัว${e.tiers ? ' · ออกตัว ' + e.tiers.map(t => TIER_LABEL[t]).join('/') : ''}</div></div></div>`;
  }).join('');
}

// ================================================================
//  ACHIEVEMENTS
// ================================================================
function checkAchievements() {
  let any = false;
  ACHIEVEMENTS.forEach(a => {
    if (!state.achievements[a.id] && a.goal(state)) {
      state.achievements[a.id] = true;
      state.coins += a.reward;
      toast(`🏆 สำเร็จ: <b>${a.name}</b> +${a.reward}🪙`, 'good');
      logMsg(`🏆 ปลดล็อกความสำเร็จ: <b>${a.name}</b> (+${a.reward}🪙)`, 'big');
      any = true;
    }
  });
  if (any) { playSfx('rare'); save(); renderTopbar(); if (currentView === 'menu') renderMenu(); }
}

// ================================================================
//  MENU: achievements + settings
// ================================================================
function renderMenu() {
  $('#profileBox').innerHTML = renderProfile();
  $('#profileBox').querySelectorAll('.party-mini[data-uid]').forEach(el =>
    el.onclick = () => openIndividualModal(el.dataset.uid));
  $('#profileBox').querySelectorAll('[data-savepreset]').forEach(el => el.onclick = () => savePreset(+el.dataset.savepreset));
  $('#profileBox').querySelectorAll('[data-loadpreset]').forEach(el => el.onclick = () => loadPreset(+el.dataset.loadpreset));
  $('#profileBox').querySelectorAll('[data-delpreset]').forEach(el => el.onclick = () => deletePreset(+el.dataset.delpreset));
  const btnCheckin = $('#btnCheckin'); if (btnCheckin) btnCheckin.onclick = claimDailyLogin;
  renderHallOfFame();
  renderShinyDex();
  renderBattleGuide();
  renderMerchant();
  renderRival();
  renderCloudUI();
  renderLeaderboard();
  renderRaid();
  renderGhostArena();
  renderTrade();
  renderIdle();
  renderTower();
  renderMegaLeague();
  renderGyms();
  renderBpShop();
  renderCharms();
  renderDexRewards();
  const done = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
  $('#achList').innerHTML =
    `<div class="dex-stats">ปลดล็อกแล้ว ${done}/${ACHIEVEMENTS.length}</div>` +
    ACHIEVEMENTS.map(a => {
      const unlocked = !!state.achievements[a.id];
      const [cur, goal] = a.prog(state);
      return `<div class="ach${unlocked ? ' done' : ''}">
        <div class="ach-ico">${a.ico}</div>
        <div class="ach-body">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc} · รางวัล ${a.reward}🪙</div>
          ${unlocked ? '' : `<div class="ach-prog">${Math.min(cur, goal)}/${goal}</div>`}
        </div>
        <div class="ach-state">${unlocked ? '✅' : '🔒'}</div></div>`;
    }).join('');

  const badges = REGIONS.filter(r => state.badges[r.id]);
  const st = state.settings;
  $('#settingsBox').innerHTML = `
    <div class="set-row">
      <div><div class="sr-label">🏅 เหรียญตราเขต</div><div class="sr-sub">ชนะบอสประจำเขต</div>
        <div class="badge-strip">${badges.length ? badges.map(r => `<span class="pill">${r.emoji} ${r.name}</span>`).join('') : '<span class="sr-sub">ยังไม่มี</span>'}</div></div>
    </div>
    <div class="set-row">
      <div class="sr-label">🔊 เสียงแจ้งเตือน<div class="sr-sub">เปิด/ปิดเสียงตอนจับติด/เจอตัวหายาก</div></div>
      <div class="toggle${st.sound ? ' on' : ''}" id="tSound"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">🎵 เพลงพื้นหลัง<div class="sr-sub">เพลงเปลี่ยนตามเขต (สร้างสดด้วยเสียงสังเคราะห์)</div></div>
      <div class="toggle${st.music ? ' on' : ''}" id="tMusic"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">⭐ แจ้งเตือนตัวหายาก<div class="sr-sub">ป๊อปอัพมุมขวาบนเมื่อเจอ Rare/Shiny</div></div>
      <div class="toggle${st.rareAlerts ? ' on' : ''}" id="tRareAlert"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">🎉 แจ้งเตือนอีเวนต์ฤดูกาล<div class="sr-sub">ป๊อปอัพเมื่ออีเวนต์สุ่มเริ่ม/เพลงพิเศษ</div></div>
      <div class="toggle${st.eventAlerts ? ' on' : ''}" id="tEventAlert"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">🐾 ตกแต่งด้วยสไปรต์เขต<div class="sr-sub">แสดงโปเกมอนลอยตกแต่งพื้นหลัง (ปิดช่วยเร็วขึ้นบนเครื่องช้า)</div></div>
      <div class="toggle${st.mascotDeco ? ' on' : ''}" id="tMascotDeco"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">🎬 ลดแอนิเมชัน<div class="sr-sub">ปิดการเคลื่อนไหว/สั่นไหวส่วนใหญ่ (accessibility)</div></div>
      <div class="toggle${st.reduceMotion ? ' on' : ''}" id="tReduceMotion"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">⚠️ ยืนยันก่อนปล่อย<div class="sr-sub">ถามยืนยันทุกครั้งก่อนปล่อย/เทรดโปเกมอน</div></div>
      <div class="toggle${st.confirmRelease ? ' on' : ''}" id="tConfirmRelease"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">⚡ โหมดต่อสู้เร็ว<div class="sr-sub">ข้ามการหน่วงเวลาแสดงผลทีละฝ่ายในการต่อสู้ (สู้เร็วขึ้นตอนบดตัวที่เคยชนะแล้ว)</div></div>
      <div class="toggle${st.fastBattle ? ' on' : ''}" id="tFastBattle"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">💀 โหมด Hardcore<div class="sr-sub">${st.hardcoreMode ? `เปิดอยู่ — มอนที่หมดแรงในสู้จะถูกปล่อยถาวร (ปล่อยไปแล้ว ${state.hardcoreDeaths || 0} ตัว)` : 'มอนที่ HP หมดระหว่างต่อสู้ = ปล่อยถาวร ห้ามใช้ซ้ำ (ท้าทายขึ้น มีกระดานอันดับแยก)'}</div></div>
      <div class="toggle${st.hardcoreMode ? ' on' : ''}" id="tHardcore"></div>
    </div>
    <div class="set-row">
      <div class="sr-label">⏱️ ความเร็วการปรากฏ<div class="sr-sub">ปรับเวลารอโปเกมอนใหม่</div></div>
      <select class="set-select" id="selSpeed">
        <option value="fast"${st.spawnSpeed === 'fast' ? ' selected' : ''}>เร็ว</option>
        <option value="normal"${st.spawnSpeed === 'normal' ? ' selected' : ''}>ปกติ</option>
        <option value="slow"${st.spawnSpeed === 'slow' ? ' selected' : ''}>ช้า</option>
      </select>
    </div>
    <div class="set-row" style="flex-direction:column;align-items:stretch">
      <div class="sr-label">🎉 อีเวนต์ฤดูกาลล่าสุด<div class="sr-sub">${(state.eventHistory || []).length ? '' : 'ยังไม่เคยเจออีเวนต์'}</div></div>
      <div class="badge-strip">${(state.eventHistory || []).map(id => { const e = RANDOM_EVENTS.find(x => x.id === id); return e ? `<span class="pill">${e.emoji} ${e.name}</span>` : ''; }).join('')}</div>
    </div>
    <div class="set-row" style="flex-direction:column;align-items:stretch">
      <div class="sr-label">💾 สำรอง / กู้คืนเซฟ<div class="sr-sub">คัดลอกโค้ดเก็บไว้ หรือวางโค้ดเพื่อกู้คืน (สำคัญเวลาฝังเว็บ)</div></div>
      <textarea class="save-io" id="saveIO" placeholder="โค้ดเซฟจะปรากฏที่นี่..."></textarea>
      <div class="action-row">
        <button class="set-btn" id="btnExport">📤 Export</button>
        <button class="set-btn" id="btnImport">📥 Import</button>
        <button class="set-btn" id="btnCopy">📋 คัดลอก</button>
      </div>
    </div>
    <div class="set-row">
      <div class="sr-label">❓ วิธีเล่น<div class="sr-sub">เปิดดูสรุปวิธีเล่นอีกครั้ง (มีอัปเดตระบบใหม่ๆ เพิ่มเรื่อยๆ)</div></div>
      <button class="set-btn" id="btnHelp">เปิดดู</button>
    </div>
    <div class="set-row">
      <div class="sr-label">🗑️ รีเซ็ตเกม<div class="sr-sub">ลบข้อมูลทั้งหมด เริ่มใหม่</div></div>
      <button class="set-btn danger" id="btnReset">รีเซ็ต</button>
    </div>`;
  $('#btnHelp').onclick = showTutorial;

  $('#tSound').onclick = () => { st.sound = !st.sound; save(); renderMenu(); };
  $('#tMusic').onclick = () => { st.music = !st.music; save(); st.music ? startMusic() : stopMusic(); renderMenu(); };
  $('#tRareAlert').onclick = () => { st.rareAlerts = !st.rareAlerts; save(); renderMenu(); };
  $('#tEventAlert').onclick = () => { st.eventAlerts = !st.eventAlerts; save(); renderMenu(); };
  $('#tMascotDeco').onclick = () => { st.mascotDeco = !st.mascotDeco; save(); renderMenu(); renderRegionBanner(); };
  $('#tReduceMotion').onclick = () => { st.reduceMotion = !st.reduceMotion; save(); applyReduceMotion(); renderMenu(); };
  $('#tConfirmRelease').onclick = () => { st.confirmRelease = !st.confirmRelease; save(); renderMenu(); };
  $('#tFastBattle').onclick = () => { st.fastBattle = !st.fastBattle; save(); renderMenu(); };
  $('#tHardcore').onclick = () => {
    if (!st.hardcoreMode && !confirm('เปิดโหมด Hardcore? มอนที่ HP หมดระหว่างต่อสู้จะถูกปล่อยออกจากคลังถาวร ไม่สามารถเรียกคืนได้')) return;
    st.hardcoreMode = !st.hardcoreMode;
    if (st.hardcoreMode) state._hardcoreEverOn = true;
    save(); renderMenu(); checkAchievements();
    toast(st.hardcoreMode ? '💀 เปิดโหมด Hardcore แล้ว — ระวังให้ดี!' : 'ปิดโหมด Hardcore แล้ว', st.hardcoreMode ? 'bad' : '');
  };
  $('#selSpeed').onchange = e => { st.spawnSpeed = e.target.value; save(); toast('⏱️ ปรับความเร็วแล้ว', 'good'); };
  $('#btnExport').onclick = () => { $('#saveIO').value = exportSave(); toast('📤 สร้างโค้ดเซฟแล้ว — คัดลอกเก็บไว้', 'good'); };
  $('#btnCopy').onclick = () => {
    const t = $('#saveIO'); if (!t.value) t.value = exportSave();
    t.select(); try { document.execCommand('copy'); } catch (e) {}
    if (navigator.clipboard) navigator.clipboard.writeText(t.value).catch(() => {});
    toast('📋 คัดลอกแล้ว', 'good');
  };
  $('#btnImport').onclick = () => importSave($('#saveIO').value);
  $('#btnReset').onclick = () => { if (confirm('รีเซ็ตเกมทั้งหมด? ข้อมูลจะหายถาวร')) resetGame(); };
}

function renderIdle() {
  const box = $('#idleBox'); if (!box) return;
  const c = state.catchbot;
  const running = c.active;
  box.innerHTML = `
    <div class="set-row" style="flex-direction:column;align-items:stretch">
      <div class="sr-label">🤖 Catchbot ${running ? '<span style="color:var(--good)">· กำลังทำงาน</span>' : ''}
        <div class="sr-sub">จับ ~${catchbotRate(c)} ตัว/ชม. · สูงสุด ${catchbotHours(c)} ชม. · ${catchbotCoins(c)}🪙/ตัว · เก็บผลตอนเปิดเกมกลับมา (ไม่นับสตรีค/เควส)</div></div>
      <div class="action-row" style="margin-top:8px">
        <button class="set-btn" id="cbToggle">${running ? '⏹️ เก็บผลตอนนี้' : '▶️ เปิด Catchbot'}</button>
      </div>
      <div class="stat-grid" style="margin-top:8px">
        <button class="stat-tile" id="cbUpPk" style="border:none;cursor:pointer;text-align:left">
          <div class="st-num">จับ Lv.${c.pkLvl}</div><div class="st-lbl">อัป ${catchbotUpCost(c.pkLvl)}🪙</div></button>
        <button class="stat-tile" id="cbUpDur" style="border:none;cursor:pointer;text-align:left">
          <div class="st-num">เวลา Lv.${c.durLvl}</div><div class="st-lbl">อัป ${catchbotUpCost(c.durLvl)}🪙</div></button>
        <button class="stat-tile" id="cbUpProf" style="border:none;cursor:pointer;text-align:left">
          <div class="st-num">เงิน Lv.${c.profLvl}</div><div class="st-lbl">อัป ${catchbotUpCost(c.profLvl)}🪙</div></button>
      </div>
    </div>
    <div class="set-row">
      <div class="sr-label">🎁 กล่องสุ่ม (Lockbox) × ${state.lockboxes || 0}<div class="sr-sub">ได้จากสตรีคครบทุก ${STREAK_MILESTONE} · เปิดสุ่มรางวัล</div></div>
      <button class="set-btn" id="lbOpen" ${(state.lockboxes || 0) <= 0 ? 'disabled' : ''}>เปิด</button>
    </div>`;
  $('#cbToggle').onclick = () => { running ? (afterCatchbotCollect()) : activateCatchbot(); };
  $('#cbUpPk').onclick = () => upgradeCatchbot('pkLvl');
  $('#cbUpDur').onclick = () => upgradeCatchbot('durLvl');
  $('#cbUpProf').onclick = () => upgradeCatchbot('profLvl');
  $('#lbOpen').onclick = openLockbox;
}
function afterCatchbotCollect() {
  const r = collectCatchbot();
  toast(r ? `🤖 เก็บผล Catchbot: ${r}` : '🤖 ยังไม่มีผลผลิต', r ? 'good' : '');
  renderTopbar(); renderMenu();
}
function renderTower() {
  const box = $('#towerBox'); if (!box) return;
  const floor = state.tower.floor || 1, best = state.tower.bestFloor || 0;
  const nextIsBoss = floor % TOWER_BOSS_EVERY === 0;
  const inProgress = battleState && battleState.mode === 'tower' && !battleState.over;
  box.innerHTML = `<div class="set-row" style="flex-direction:column;align-items:stretch">
    <div class="sr-label">🗼 ชั้นปัจจุบัน: ${floor}${nextIsBoss ? ' <span style="color:var(--accent)">(บอส!)</span>' : ''}
      <div class="sr-sub">สถิติสูงสุด: ชั้น ${best} · ไม่ฮีลระหว่างชั้น (เสี่ยง!) · แพ้ = รีเซ็ตกลับชั้น 1 · ทุก ${TOWER_BOSS_EVERY} ชั้นเจอบอส
      ${floor >= TOWER_GMAX_FLOOR ? ' · มีโอกาสเจอบอส G-Max' : ''}${floor >= TOWER_MEGA_FLOOR ? ' + เมก้า' : ''}</div></div>
    <div class="action-row" style="margin-top:8px">
      <button class="set-btn" id="towerEnterBtn">${inProgress ? '🗼 กลับเข้าสู้ต่อ' : '🗼 เข้าหอคอย'}</button>
    </div>
  </div>`;
  $('#towerEnterBtn').onclick = startTowerBattle;
}
function renderGyms() {
  const box = $('#gymBox'); if (!box) return;
  box.innerHTML = GYMS.map((g, i) => {
    const beaten = state.gymsBeaten[g.id];
    const unlocked = i === 0 || state.gymsBeaten[GYMS[i - 1].id];
    return `<div class="ach${beaten ? ' done' : ''}">
      <div class="ach-ico">${g.emoji}</div>
      <div class="ach-body">
        <div class="ach-name">${g.name} ${beaten ? '✅' : ''}</div>
        <div class="ach-desc">${g.type ? 'ธาตุ ' + g.type + ' · ' : ''}${g.count} ตัว (${(g.tierBias || []).map(t => TIER_EMOJI[t]).join('')}) · Lv.~${g.lvl} · ${g.reward}🪙 + ไอเทม</div>
      </div>
      ${unlocked
        ? `<button class="claim-btn" data-gym="${g.id}">${beaten ? 'สู้อีก' : 'ท้าสู้'}</button>`
        : '<div class="ach-state">🔒</div>'}
    </div>`;
  }).join('');
  box.querySelectorAll('.claim-btn[data-gym]').forEach(btn =>
    btn.onclick = () => startTrainerBattle(btn.dataset.gym));
}
function renderBpShop() {
  const box = $('#bpShopBox'); if (!box) return;
  box.innerHTML = `<div class="dex-stats">🎖️ Battle Points: ${state.battlePoints || 0} (ได้จากชนะยิม/บอสเท่านั้น)</div>` +
    BP_SHOP.map(it => {
      const bought = (state.bpBought[it.id] || 0);
      const maxed = it.limit && bought >= it.limit;
      const cant = maxed || (state.battlePoints || 0) < it.cost;
      return `<div class="shop-item">
        <div class="emoji">${itemIcon(it.emoji, it.img, 'big')}</div>
        <div class="si-body"><div class="si-name">${it.name}</div>
          <div class="si-desc">${it.limit ? `จำกัด ${bought}/${it.limit}` : 'ไม่จำกัด'}</div></div>
        <button class="buy-btn" data-bp="${it.id}" ${cant ? 'disabled' : ''}>${maxed ? 'เต็ม' : it.cost + '🎖️'}</button></div>`;
    }).join('');
  box.querySelectorAll('.buy-btn[data-bp]').forEach(btn => btn.onclick = () => redeemBP(btn.dataset.bp));
}
function redeemBP(id) {
  const it = BP_SHOP.find(x => x.id === id); if (!it) return;
  const bought = state.bpBought[id] || 0;
  if (it.limit && bought >= it.limit) { toast('❌ แลกครบจำนวนจำกัดแล้ว', 'bad'); return; }
  if ((state.battlePoints || 0) < it.cost) { toast('❌ BP ไม่พอ', 'bad'); return; }
  const desc = it.act();
  if (!desc) { toast('❌ แลกไม่ได้ตอนนี้', 'bad'); return; }
  state.battlePoints -= it.cost;
  state.bpBought[id] = bought + 1;
  save(); renderTopbar(); renderBpShop(); renderBallBar();
  toast(`🎖️ แลกได้: <b>${desc}</b>`, 'good');
  playSfx('rare');
}
function renderCharms() {
  const box = $('#charmBox'); if (!box) return;
  const shinyPct = Math.round((shinyCharmMultiplier() - 1) * 100);
  const catchPct = Math.round((catchCharmMultiplier() - 1) * 100);
  box.innerHTML = `<div class="ach done">
      <div class="ach-ico">${itemIcon('🔮', 'shiny-charm', 'big')}</div>
      <div class="ach-body">
        <div class="ach-name">Shiny Charm (ติดตัวถาวร) ${state.shinyCharms || 0}/${SHINY_CHARM_MAX}</div>
        <div class="ach-desc">โอกาส Shiny รวม +${shinyPct}% · ซื้อเพิ่มได้ที่ร้านค้า</div>
      </div>
    </div>
    <div class="ach done">
      <div class="ach-ico">${itemIcon('🧲', 'oval-charm', 'big')}</div>
      <div class="ach-body">
        <div class="ach-name">Catch Charm (ติดตัวถาวร) ${state.catchCharms || 0}/${CATCH_CHARM_MAX}</div>
        <div class="ach-desc">โอกาสจับรวม +${catchPct}% · ซื้อเพิ่มได้ที่ร้านค้า (พาสซีฟ ไม่หมดอายุ)</div>
      </div>
    </div>` +
    CHARM_ORDER.map(k => {
    const c = CHARMS[k], have = state.charms[k] || 0;
    const active = boostActive(k);
    const left = active ? Math.ceil((state.activeBoosts[k] - Date.now()) / 60000) : 0;
    return `<div class="ach${active ? ' done' : ''}">
      <div class="ach-ico">${itemIcon(c.emoji, c.img, 'big')}</div>
      <div class="ach-body">
        <div class="ach-name">${c.name} ${active ? `<span style="color:var(--good)">· ทำงาน ${left} นาที</span>` : ''}</div>
        <div class="ach-desc">${c.desc} · มี ${have} ชิ้น</div>
      </div>
      <button class="claim-btn" data-charm="${k}" ${have <= 0 ? 'disabled' : ''}>ใช้</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.claim-btn[data-charm]').forEach(btn =>
    btn.onclick = () => { activateCharm(btn.dataset.charm); renderCharms(); });
}
function renderDexRewards() {
  const owned = speciesOwnedCount();
  $('#dexRewardBox').innerHTML = DEX_REWARDS.map(d => {
    const claimed = state.dexRewards[d.id];
    const ready = owned >= d.need && !claimed;
    const [bk, bn] = d.ball;
    return `<div class="ach${claimed ? ' done' : ''}">
      <div class="ach-ico">🎖️</div>
      <div class="ach-body">
        <div class="ach-name">จับครบ ${d.need} ชนิด</div>
        <div class="ach-desc">รางวัล +${d.coins}🪙 +${bn}${BALLS[bk].emoji}</div>
        ${claimed ? '' : `<div class="ach-prog">${Math.min(owned, d.need)}/${d.need}</div>`}
      </div>
      ${claimed ? '<div class="ach-state">✅</div>'
        : `<button class="claim-btn" data-dr="${d.id}" ${ready ? '' : 'disabled'}>รับ</button>`}
    </div>`;
  }).join('');
  $('#dexRewardBox').querySelectorAll('.claim-btn[data-dr]').forEach(btn =>
    btn.onclick = () => claimDexReward(btn.dataset.dr));
}
function claimDexReward(id) {
  const d = DEX_REWARDS.find(x => x.id === id);
  if (!d || state.dexRewards[id] || speciesOwnedCount() < d.need) return;
  state.dexRewards[id] = true;
  state.coins += d.coins;
  const [bk, bn] = d.ball; state.balls[bk] = (state.balls[bk] || 0) + bn;
  save(); renderTopbar(); renderDexRewards(); renderBallBar();
  toast(`🎖️ รับรางวัลจบเดกซ์: +${d.coins}🪙 +${bn}${BALLS[bk].emoji}`, 'good');
  playSfx('rare');
}

// ---------- export / import / reset ----------
function exportSave() {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  catch (e) { return JSON.stringify(state); }
}
function importSave(code) {
  code = (code || '').trim();
  if (!code) { toast('❌ วางโค้ดเซฟก่อน', 'bad'); return; }
  let obj;
  try { obj = JSON.parse(decodeURIComponent(escape(atob(code)))); }
  catch (e) { try { obj = JSON.parse(code); } catch (e2) { toast('❌ โค้ดเซฟไม่ถูกต้อง', 'bad'); return; } }
  if (!obj || typeof obj !== 'object' || !('caught' in obj)) { toast('❌ โค้ดเซฟไม่ถูกต้อง', 'bad'); return; }
  state = mergeSave(obj);
  save();
  toast('✅ กู้คืนเซฟสำเร็จ!', 'good');
  clearSpawn(); renderRegionBanner(); renderTopbar(); renderBallBar(); ensureDailyQuests();
  scheduleSpawn(1500); switchView('home');
}
function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  state = newSave(); save();
  toast('🔄 รีเซ็ตเกมแล้ว', 'good');
  clearSpawn(); renderRegionBanner(); renderTopbar(); renderBallBar(); ensureDailyQuests();
  fillDexFilter(); scheduleSpawn(1500); switchView('home');
}

// ================================================================
//  OFFLINE REWARDS + DAILY LOGIN CALENDAR (วนทุก 7 วัน เห็นล่วงหน้าได้ว่าแต่ละวันได้อะไร)
// ================================================================
const LOGIN_CALENDAR = [
  { day: 1, coins: 80,  ball: ['poke', 3],  checkin: 15 },
  { day: 2, coins: 120, ball: ['poke', 5],  checkin: 15 },
  { day: 3, coins: 180, ball: ['great', 2], checkin: 20 },
  { day: 4, coins: 240, ball: ['great', 3], checkin: 20 },
  { day: 5, coins: 320, ball: ['ultra', 1], checkin: 25 },
  { day: 6, coins: 420, ball: ['ultra', 2], checkin: 25 },
  { day: 7, coins: 800, ball: ['ultra', 3], lockbox: 1, checkin: 50 },   // วันที่ 7 ของรอบ — รางวัลใหญ่ ก่อนวนกลับวันที่ 1
];
function loginCycleDay(streak) { return ((Math.max(1, streak) - 1) % 7) + 1; }   // 1-7 วนทุกสัปดาห์ (ไม่รีเซ็ต streak สะสมจริง)
// เช็คอิน — เดิมได้อัตโนมัติวันละครั้งตามวันที่ปฏิทิน เปลี่ยนเป็นกดรับเองได้ทุก 12 ชม. (เร็วขึ้น กด 2 ครั้ง/วันได้ถ้าจำได้)
const CHECKIN_CD = 12 * 3600000;
const CHECKIN_GRACE = CHECKIN_CD * 3;   // ทิ้งช่วงเกิน 36 ชม. (3 รอบ) สตรีครีเซ็ตกลับวันที่ 1
function checkinReadyLeft() { return Math.max(0, (state.checkinReadyAt || 0) - Date.now()); }
function claimDailyLogin() {
  const left = checkinReadyLeft();
  if (left > 0) { toast(`⏳ รอเช็คอินรอบถัดไปอีก ${Math.floor(left / 3600000)}ชม ${Math.floor((left % 3600000) / 60000)}น`, 'bad'); return; }
  const last = state.lastCheckinAt || 0;
  state.streak = (last && Date.now() - last <= CHECKIN_GRACE) ? (state.streak || 0) + 1 : 1;
  state.lastCheckinAt = Date.now();
  state.checkinReadyAt = Date.now() + CHECKIN_CD;
  const cd = LOGIN_CALENDAR[loginCycleDay(state.streak) - 1];
  state.coins += cd.coins;
  state.balls[cd.ball[0]] = (state.balls[cd.ball[0]] || 0) + cd.ball[1];
  if (cd.lockbox) state.lockboxes = (state.lockboxes || 0) + cd.lockbox;
  if (cd.checkin) state.checkinCoins = (state.checkinCoins || 0) + cd.checkin;   // เหรียญเช็คอิน — แลกกำไลเมก้า/ไดนาแม็กซ์/ไอเทมพิเศษ
  save(); renderMenu(); renderTopbar();
  const ballTxt = `${cd.ball[1]}${BALLS[cd.ball[0]].emoji}`;
  const lockboxTxt = cd.lockbox ? ` +${cd.lockbox}🎁` : '';
  const ciTxt = cd.checkin ? ` +${cd.checkin}🗓️เช็คอิน` : '';
  toast(`📅 เช็คอินสำเร็จ! วันที่ ${loginCycleDay(state.streak)}/7 (สตรีค ${state.streak}) +${cd.coins}🪙 +${ballTxt}${lockboxTxt}${ciTxt}`, 'good');
  checkAchievements();
}
function applyOfflineRewards() {
  const now = Date.now();
  const idleMs = now - (state.lastSeen || now);
  state.lastSeen = now;
  const bot = collectCatchbot();     // เก็บผลผลิต catchbot (ถ้าเปิดไว้)
  const idleMin = Math.floor(idleMs / 60000);
  if (idleMin < 5 && !bot) return;
  let coins = 0, balls = 0;
  if (idleMin >= 5) {
    coins = Math.min(idleMin * 2, 900);
    balls = Math.min(Math.floor(idleMin / 30), 10);
    state.coins += coins; state.balls.poke += balls;
  }
  save();
  const hrs = Math.floor(idleMin / 60), mins = idleMin % 60;
  const timeStr = (hrs ? hrs + ' ชม. ' : '') + mins + ' นาที';
  $('#modalBox').innerHTML = `<div class="wb-box">
    <div class="wb-ico">🎁</div>
    <h3>ยินดีต้อนรับกลับ!</h3>
    <p style="color:var(--muted);font-size:13px">คุณหายไป ${timeStr}</p>
    ${(coins || balls) ? `<div style="font-size:15px;margin:10px 0;font-weight:800">+${coins} 🪙${balls ? ` · +${balls} 🔴` : ''}</div>` : ''}
    ${bot ? `<div style="font-size:14px;margin:8px 0;color:#8ef0a5">🤖 Catchbot: ${bot}</div>` : ''}
    <div class="modal-actions"><button class="btn-primary" id="wbOk">รับเลย!</button></div></div>`;
  openModal(); $('#wbOk').onclick = closeModal;
}
// ---------- Catchbot ----------
function collectCatchbot() {
  const c = state.catchbot; if (!c || !c.active || !c.startedAt) return null;
  const hours = Math.min(catchbotHours(c), (Date.now() - c.startedAt) / 3600000);
  const n = Math.floor(hours * catchbotRate(c));
  c.active = false; c.startedAt = 0;
  if (n <= 0) return null;
  const coins = n * catchbotCoins(c);
  state.coins += coins;
  // จับตัว common/uncommon (ไม่นับสตรีค/เควส)
  const pool = MONSTERS.filter(m => m._tier === 'common' || m._tier === 'uncommon');
  for (let i = 0; i < n; i++) {
    const mon = pick(pool);
    state.caught.push(makeIndividual(mon.id, rand(2, 12), mon._tier, false));
    state.seen[mon.id] = true; state.totalCaught++;
  }
  save();
  return `จับ ${n} ตัว + ${coins}🪙`;
}
function activateCatchbot() {
  const c = state.catchbot;
  if (c.active) { toast('🤖 Catchbot ทำงานอยู่แล้ว', ''); return; }
  c.active = true; c.startedAt = Date.now();
  save(); renderMenu();
  toast(`🤖 เปิด Catchbot! จับ ~${catchbotRate(c)}/ชม. สูงสุด ${catchbotHours(c)} ชม. — เก็บผลตอนกลับมา`, 'good');
}
function upgradeCatchbot(axis) {
  const c = state.catchbot;
  const lvl = c[axis] || 0, cost = catchbotUpCost(lvl);
  if (!spend(cost)) return;
  c[axis] = lvl + 1;
  save(); renderMenu(); renderTopbar();
  toast('🤖 อัปเกรด Catchbot แล้ว', 'good');
}
// ---------- Lockbox ----------
function openLockbox() {
  if ((state.lockboxes || 0) <= 0) { toast('❌ ไม่มีกล่องสุ่ม', 'bad'); return; }
  state.lockboxes--;
  const total = LOCKBOX_REWARDS.reduce((s, r) => s + r.w, 0);
  let roll = Math.random() * total, chosen = LOCKBOX_REWARDS[0];
  for (const r of LOCKBOX_REWARDS) { if ((roll -= r.w) < 0) { chosen = r; break; } }
  let desc = chosen.act();
  const swapMsg = grantSwapTicketDrop();
  if (swapMsg) desc += ` + ${swapMsg}`;
  save(); renderTopbar(); renderMenu(); renderBallBar();
  toast(`🎁 เปิดกล่องได้: <b>${desc}</b>!`, 'good');
  logMsg(`🎁 เปิดกล่องสุ่มได้ <b>${desc}</b>`, 'big');
  playSfx('rare');
}

// ================================================================
//  PROFILE (stats)
// ================================================================
function avgIv() {
  if (!state.caught.length) return 0;
  return Math.round(state.caught.reduce((s, c) => s + ivPercent(c), 0) / state.caught.length);
}
function loginCalendarHtml() {
  const todayCycle = loginCycleDay(state.streak || 1);
  return `<div style="display:flex;gap:4px;margin:4px 0 2px">` +
    LOGIN_CALENDAR.map(cd => {
      const isToday = cd.day === todayCycle, isPast = cd.day < todayCycle, isBig = cd.day === 7;
      const bg = isToday ? 'var(--accent)' : isPast ? 'rgba(71,209,108,.15)' : 'var(--card)';
      const fg = isToday ? '#3a2c00' : 'var(--muted)';
      return `<div style="flex:1;min-width:0;text-align:center;padding:4px 1px;border-radius:8px;background:${bg};
        border:1px solid ${isBig ? 'rgba(255,203,5,.5)' : 'rgba(255,255,255,.08)'}">
        <div style="font-size:8px;font-weight:800;color:${fg}">วัน${cd.day}</div>
        <div style="height:20px;display:flex;align-items:center;justify-content:center">${isPast ? '<span style="font-size:13px">✅</span>' : itemIcon('🎁', isBig ? null : BALLS[cd.ball[0]].img, 'price-ico')}</div>
        <div style="font-size:8px;color:${fg}">${cd.coins}🪙</div>
      </div>`;
    }).join('') + `</div>`;
}
function readyStatusHtml() {
  const now = Date.now();
  const mk = (name, readyAt) => ({ name, ready: (readyAt || 0) <= now, left: (readyAt || 0) - now });
  const items = [
    mk('ยิม', state.gymReadyAt),
    mk('บอส', state.bossReadyAt),
    mk('คอนเทสต์', state.contest && state.contest.readyAt),
    mk('คู่แข่ง', state.rival && state.rival.readyAt),
    mk('ตกปลา', state.fishReadyAt),
  ];
  const farm = state.farm || [];
  const farmReady = farm.filter(p => p.berry && p.readyAt <= now).length;
  const farmGrowing = farm.filter(p => p.berry && p.readyAt > now).length;
  const chip = (label, ready, extra) => `<span class="badge" style="font-size:10px;padding:3px 8px;background:${ready ? 'rgba(71,209,108,.25)' : 'rgba(255,255,255,.06)'}">${ready ? '✅' : '⏳'} ${label}${extra || ''}</span>`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 2px">` +
    items.map(it => chip(it.name, it.ready, it.ready ? '' : ` ${Math.ceil(it.left / 1000)}วิ`)).join('') +
    (farmReady > 0 ? chip('ไร่', true, ` ${farmReady} แปลง`) : farmGrowing > 0 ? `<span class="badge" style="font-size:10px;padding:3px 8px;background:rgba(255,255,255,.06)">🌱 ไร่กำลังโต ${farmGrowing}</span>` : '') +
    `</div>`;
}
function renderProfile() {
  const b = getBuddy();
  const tl = trainerLevel();
  const nextXp = Math.pow(tl, 2) * 60;
  const dexPct = Math.round(speciesOwnedCount() / MONSTERS.length * 100);
  const shinyN = state.caught.filter(c => c.shiny).length;
  const legendN = state.caught.filter(c => c.tier === 'legendary').length;
  const playH = Math.floor((state.playSec || 0) / 3600), playM = Math.floor(((state.playSec || 0) % 3600) / 60);
  const partyStrip = state.party.length
    ? `<div class="party-strip">${partyMembers().map((ind, i) => `<div class="party-mini${i === 0 ? ' lead' : ''} ${tierClass(ind.tier, ind.shiny, ind.golden)}" data-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}<span class="pm-lv">L${ind.level}</span></div>`).join('')}</div>`
    : '<div class="sr-sub" style="margin-top:6px">ยังไม่มีทีม — ตั้ง Buddy/เข้าทีมจากคลัง</div>';
  const prevXp = Math.pow(tl - 1, 2) * 60;
  const xpPct = clamp(Math.round(((state.trainerXp || 0) - prevXp) / Math.max(1, nextXp - prevXp) * 100), 0, 100);
  return `<div class="profile-card">
    <div class="profile-top">
      <div class="pf-avatar">
        ${trainerImg(TRAINER_SPRITES.player, 'pf-trainer')}
        ${b ? `<span class="pf-buddy" title="Buddy: ${MON_BY_ID[b.id].name}">${spriteImg(b.id, b.shiny)}</span>` : ''}
      </div>
      <div style="flex:1;min-width:0"><div class="profile-lv">👤 เทรนเนอร์ Lv.${tl}</div>
        <div class="profile-sub">🔥 streak ${state.streak || 0} วัน</div>
        <div class="pf-xpbar"><div class="pf-xpfill" style="width:${xpPct}%"></div></div>
        <div class="profile-sub" style="font-size:10px;margin-top:3px">Trainer XP ${state.trainerXp || 0} / ${nextXp}</div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:12px;font-weight:700">⏱️ สถานะพร้อมใช้</div>
    ${readyStatusHtml()}
    <div style="margin-top:8px;font-size:12px;font-weight:700">📅 ปฏิทินล็อกอิน (วนทุก 7 วัน) · 🗓️ เหรียญเช็คอิน: <b style="color:#ffd76b">${state.checkinCoins || 0}</b></div>
    ${loginCalendarHtml()}
    ${(() => { const left = checkinReadyLeft(); return `<button class="claim-btn${left > 0 ? ' done' : ''}" id="btnCheckin" style="width:100%;margin-top:6px" ${left > 0 ? 'disabled' : ''}>${left > 0 ? `⏳ รอ ${Math.floor(left / 3600000)}ชม ${Math.floor((left % 3600000) / 60000)}น` : '📅 กดรับเช็คอินวันนี้!'}</button>`; })()}
    <div class="stat-grid">
      <div class="stat-tile"><div class="st-num">${speciesOwnedCount()}/${MONSTERS.length}</div><div class="st-lbl">📖 เดกซ์ (${dexPct}%)</div></div>
      <div class="stat-tile"><div class="st-num">${state.totalCaught}</div><div class="st-lbl">🎯 จับรวม</div></div>
      <div class="stat-tile"><div class="st-num">✨ ${shinyN}</div><div class="st-lbl">Shiny</div></div>
      <div class="stat-tile"><div class="st-num">👑 ${legendN}</div><div class="st-lbl">Legendary</div></div>
      <div class="stat-tile"><div class="st-num">${avgIv()}%</div><div class="st-lbl">IV เฉลี่ย</div></div>
      <div class="stat-tile"><div class="st-num">${playH}ชม ${playM}น</div><div class="st-lbl">⏱️ เวลาเล่น</div></div>
    </div>
    <div style="margin-top:10px;font-size:12px;font-weight:700">🔥 สตรีคจับต่อเนื่อง</div>
    <div class="party-strip" style="gap:4px">
      ${TIER_ORDER.map(t => `<span class="pill" style="font-size:10px">${TIER_EMOJI[t]} ${state.streaks[t] || 0}</span>`).join('')}
    </div>
    <div style="margin-top:6px;font-size:11px;color:var(--muted)">🪙 Amulet Coin ${state.amulets || 0}/${AMULET_MAX} (เงิน +${(state.amulets || 0) * 5}%)</div>
    <div style="margin-top:10px;font-size:12px;font-weight:700">👥 ทีม (${state.party.length}/6)</div>
    ${partyStrip}
    <div style="margin-top:12px;font-size:12px;font-weight:700">💾 ชุดทีมสำรอง</div>
    ${presetsHtml()}</div>`;
}
function presetsHtml() {
  return `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">` +
    state.teamPresets.map((p, i) => {
      if (!p) return `<div class="preset-row"><span style="color:var(--muted)">ช่อง ${i + 1}: ว่าง</span>
        <div class="pr-actions"><button class="claim-btn" data-savepreset="${i}">บันทึกทีมปัจจุบัน</button></div></div>`;
      const sprites = p.uids.slice(0, 6).map(uid => { const ind = indByUid(uid); return ind ? spriteImg(ind.id, ind.shiny, 'preset-mini') : ''; }).join('');
      return `<div class="preset-row"><span class="pr-name"><b>${p.name}</b> ${sprites}</span>
        <div class="pr-actions">
          <button class="claim-btn" data-loadpreset="${i}">โหลด</button>
          <button class="claim-btn done" data-savepreset="${i}">บันทึกทับ</button>
          <button class="claim-btn done" data-delpreset="${i}">ลบ</button>
        </div></div>`;
    }).join('') + `</div>`;
}
function savePreset(slot) {
  if (!state.party.length) { toast('❌ ต้องมีตัวในทีมก่อนถึงจะบันทึกได้', 'bad'); return; }
  const cur = state.teamPresets[slot];
  const name = (prompt('ตั้งชื่อชุดทีม:', cur ? cur.name : `ชุดที่ ${slot + 1}`) || '').trim().slice(0, 16);
  if (!name) return;
  state.teamPresets[slot] = { name, uids: [...state.party] };
  save(); toast(`💾 บันทึกชุดทีม "${name}" แล้ว`, 'good'); renderMenu();
}
function loadPreset(slot) {
  const p = state.teamPresets[slot]; if (!p) return;
  const validUids = p.uids.filter(uid => state.caught.some(c => c.uid === uid));
  if (!validUids.length) { toast('❌ ตัวในชุดนี้ไม่อยู่ในคลังแล้วทั้งหมด', 'bad'); return; }
  state.party = validUids;
  state.buddyUid = validUids[0];
  save(); toast(`👥 โหลดชุดทีม "${p.name}" แล้ว (${validUids.length}/${p.uids.length} ตัว)`, 'good');
  renderCurrentView();
}
function deletePreset(slot) {
  const p = state.teamPresets[slot]; if (!p) return;
  if (!confirmAction(`ลบชุดทีม "${p.name}"?`)) return;
  state.teamPresets[slot] = null;
  save(); renderMenu();
}

// ================================================================
//  HALL OF FAME — โชว์ตัวเด็ดที่สุดในคลัง (ใช้สไปรต์จริงล้วน)
// ================================================================
function hofIndRow(ind, sub) {
  if (!ind) return '';
  const m = MON_BY_ID[ind.id];
  return `<div class="ind-row ${tierClass(ind.tier, ind.shiny, ind.golden)}" data-hof-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}
    <div class="ir-main"><div class="ir-name">${ind.shiny ? '✨' : ''}${ind.nick || m.name}</div>
    <div class="ir-sub">${sub}</div></div></div>`;
}
// คู่มือต่อสู้ — สรุปตารางธาตุแพ้ทาง + Ability ทั้งหมด ให้ผู้เล่นดูอ้างอิงได้ในเกม (ไม่ต้องเจอเองทีละตัว)
function teamWeaknessHtml() {
  const members = partyMembers();
  if (!members.length) return `<div class="sr-sub">ยังไม่มีทีม — ตั้ง Buddy/เข้าทีมจากคลังก่อนเพื่อดูจุดอ่อนทีม</div>`;
  const weaknessCount = {};
  ALL_TYPES.forEach(t => weaknessCount[t] = 0);
  members.forEach(ind => {
    const m = MON_BY_ID[ind.id];
    ALL_TYPES.forEach(atkType => { if (typeEffect(atkType, m.types) > 1) weaknessCount[atkType]++; });
  });
  const ranked = ALL_TYPES.filter(t => weaknessCount[t] > 0).sort((a, b) => weaknessCount[b] - weaknessCount[a]);
  if (!ranked.length) return `<div class="sr-sub">ทีมนี้ไม่มีจุดอ่อนธาตุชัดเจน (สมดุลดี) 👍</div>`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">` +
    ranked.map(t => `<span class="badge t-${t}" style="font-size:11px;padding:3px 8px">${t} ×${weaknessCount[t]}</span>`).join('') +
    `</div><div style="font-size:11px;color:var(--muted);margin-top:6px">จำนวน = ตัวในทีม (${members.length} ตัว) ที่โดนธาตุนั้นเอาเปรียบ (ดาเมจ ≥×2)</div>`;
}
function renderBattleGuide() {
  const box = $('#battleGuideBox'); if (!box) return;
  const typeRows = ALL_TYPES.map(t => {
    const row = TYPE_CHART[t] || {};
    const strong = Object.keys(row).filter(k => row[k] === 2);
    const weak = Object.keys(row).filter(k => row[k] === 0.5);
    const immune = Object.keys(row).filter(k => row[k] === 0);
    return `<div class="preset-row" style="flex-direction:column;align-items:flex-start;gap:4px">
      <span class="badge t-${t}" style="font-size:11px;padding:2px 8px">${t}</span>
      <div style="font-size:11px;color:var(--muted);line-height:1.6">
        ${strong.length ? `<div>⬆️ ได้เปรียบ: ${strong.join(', ')}</div>` : ''}
        ${weak.length ? `<div>⬇️ เสียเปรียบ: ${weak.join(', ')}</div>` : ''}
        ${immune.length ? `<div>🚫 ไม่มีผล: ${immune.join(', ')}</div>` : ''}
        ${!strong.length && !weak.length && !immune.length ? '<div>ไม่มีธาตุที่ได้เปรียบ/เสียเปรียบเป็นพิเศษ</div>' : ''}
      </div></div>`;
  }).join('');
  const abilityRows = Object.keys(TYPE_ABILITY).sort().map(t => {
    const ab = TYPE_ABILITY[t];
    return `<div class="preset-row"><span class="pr-name"><span class="badge t-${t}" style="font-size:10px;padding:1px 6px">${t}</span> <b>${ab.name}</b></span>
      <span style="font-size:11px;color:var(--muted);text-align:right;max-width:55%">${ab.desc}</span></div>`;
  }).join('');
  box.innerHTML = `
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">⚠️ จุดอ่อนทีมปัจจุบัน</div>
    <div style="margin-bottom:16px">${teamWeaknessHtml()}</div>
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">🔺 ตารางธาตุแพ้ทาง (มองจากฝ่ายโจมตี)</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">${typeRows}</div>
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">🧬 Ability ตามธาตุหลักของสายพันธุ์ (ครบ 18/18 ธาตุ)</div>
    <div style="display:flex;flex-direction:column;gap:6px">${abilityRows}</div>`;
}
function renderShinyDex() {
  const box = $('#shinyDexBox'); if (!box) return;
  const shinies = state.caught.filter(c => c.shiny);
  const speciesSet = new Set(shinies.map(c => c.id));
  const uniqueIds = [...speciesSet].sort((a, b) => a - b);
  const total = MONSTERS.length;
  const pct = Math.round(speciesSet.size / total * 100);
  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><div class="st-num">✨ ${speciesSet.size}/${total}</div><div class="st-lbl">ชนิด Shiny (${pct}%)</div></div>
      <div class="stat-tile"><div class="st-num">${shinies.length}</div><div class="st-lbl">ตัว Shiny รวม</div></div>
    </div>
    ${uniqueIds.length
      ? `<div class="sr-sub" style="margin:8px 0 4px">Shiny ที่คุณมี (${uniqueIds.length} ชนิด):</div>
         <div class="shiny-grid">${uniqueIds.map(id => `<div class="shiny-cell" title="${MON_BY_ID[id].name}${speciesShinyCount(id) > 1 ? ' ×' + speciesShinyCount(id) : ''}">${spriteImg(id, true, 'roster-mini')}${speciesShinyCount(id) > 1 ? `<span class="shiny-cnt">${speciesShinyCount(id)}</span>` : ''}</div>`).join('')}</div>`
      : emptyState('✨', 'ยังไม่มี Shiny', 'ออกล่าหาตัวแวววาว! คอมโบจับตัวเดิมซ้ำๆ ช่วยเพิ่มโอกาส')}`;
}
function speciesShinyCount(id) { return state.caught.filter(c => c.id === id && c.shiny).length; }
function renderHallOfFame() {
  const box = $('#hallOfFameBox'); if (!box) return;
  if (!state.caught.length) { box.innerHTML = emptyState('🏛️', 'ยังไม่มีตัวในคลัง', 'จับโปเกมอนสักตัวก่อนเพื่อเริ่มห้องโชว์!'); return; }
  const byIv = [...state.caught].sort((a, b) => ivPercent(b) - ivPercent(a));
  const topIv = byIv[0];
  const shinies = state.caught.filter(c => c.shiny).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const goldens = state.caught.filter(c => c.golden).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const legends = state.caught.filter(c => c.tier === 'legendary' && !c.golden).sort((a, b) => ivPercent(b) - ivPercent(a));
  const oldest = [...state.caught].sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
  const bestFriend = [...state.caught].sort((a, b) => (b.friend || 0) - (a.friend || 0))[0];
  const ribbons = (state.contest && state.contest.ribbons) || {};
  const totalRibbons = Object.values(ribbons).reduce((s, n) => s + n, 0);
  const galleryRow = (list, emptyMsg) => list.length
    ? `<div class="dex-grid">` + list.slice(0, 12).map(ind => {
        const m = MON_BY_ID[ind.id];
        return `<div class="dex-cell ${tierClass(ind.tier, ind.shiny, ind.golden)}" data-hof-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}<div class="dname">${ind.nick || m.name}</div><div class="dnum">IV ${ivPercent(ind)}%</div></div>`;
      }).join('') + `</div>`
    : `<div class="sr-sub">${emptyMsg}</div>`;
  box.innerHTML = `
    <div class="stat-grid" style="margin-bottom:10px">
      <div class="stat-tile"><div class="st-num">${legends.length}</div><div class="st-lbl">👑 Legendary</div></div>
      <div class="stat-tile"><div class="st-num">${shinies.length}</div><div class="st-lbl">✨ Shiny</div></div>
      <div class="stat-tile"><div class="st-num">🏆 ${goldens.length}</div><div class="st-lbl">Golden</div></div>
      <div class="stat-tile"><div class="st-num">${totalRibbons}</div><div class="st-lbl">🎀 ริบบิ้นคอนเทสต์</div></div>
    </div>
    ${goldens.length ? `<div style="font-size:12px;font-weight:700;margin:0 0 4px;color:#ffd700">🏆 แกลเลอรี Golden (${goldens.length})</div>${galleryRow(goldens, '')}` : ''}
    <div style="font-size:12px;font-weight:700;margin-bottom:4px">💯 IV สูงสุดในคลัง</div>
    ${hofIndRow(topIv, `IV ${ivPercent(topIv)}% · นิสัย ${topIv.nature} · Lv.${topIv.level}`)}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">🤝 ตัวที่มิตรภาพดีที่สุด</div>
    ${bestFriend ? hofIndRow(bestFriend, `มิตรภาพ ${bestFriend.friend || 0}/${FRIEND_MAX}`) : '<div class="sr-sub">ยังไม่มี</div>'}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">🕰️ ตัวแรกที่จับได้</div>
    ${hofIndRow(oldest, `จับตอน ${new Date(oldest.ts || Date.now()).toLocaleDateString('th-TH')}`)}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">✨ แกลเลอรี Shiny (${shinies.length})</div>
    ${galleryRow(shinies, 'ยังไม่มีตัว Shiny')}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">👑 แกลเลอรี Legendary (${legends.length})</div>
    ${galleryRow(legends, 'ยังไม่มีตัว Legendary')}`;
  box.querySelectorAll('[data-hof-uid]').forEach(el => el.onclick = () => openIndividualModal(el.dataset.hofUid));
}

// ================================================================
//  TUTORIAL
// ================================================================
function showTutorial() {
  $('#modalBox').innerHTML = `<div class="tut-box">
    <h3>👋 ยินดีต้อนรับสู่ PokePP!</h3>
    <div class="tut-step"><span class="ts-ico">🗺️</span><div>เลือก <b>เขต</b> ในแผนที่ แต่ละเขตมีโปเกมอนต่างกัน</div></div>
    <div class="tut-step"><span class="ts-ico">🔴</span><div>เลือก <b>บอล</b> แล้วกด <b>ปาบอล</b> — บอลดีกว่าโอกาสจับสูงกว่า</div></div>
    <div class="tut-step"><span class="ts-ico">⚔️</span><div>ตั้ง <b>Buddy</b> จากคลัง แล้วกด <b>สู้</b> เพื่อทำ HP โปเกมอนป่าลด → จับง่ายขึ้น</div></div>
    <div class="tut-step"><span class="ts-ico">🍓</span><div>โยน <b>เบอร์รี่</b> ก่อนปา เพิ่มโอกาสจับ</div></div>
    <div class="tut-step"><span class="ts-ico">🏆</span><div>ท้า <b>บอสประจำเขต</b> / <b>ยิม</b> / <b>หอคอยไต่ระดับ</b> · ทำ <b>เควส/ความสำเร็จ</b> รับรางวัล</div></div>
    <div class="tut-step"><span class="ts-ico">💎</span><div>ซื้อ <b>กำไลเมก้า/ไดนาแม็กซ์</b> ในร้านค้า แล้วซื้อหิน/พลังงานแนบให้ตัวที่ชอบ เปลี่ยนร่างกลางศึกได้</div></div>
    <div class="tut-step"><span class="ts-ico">🎀</span><div>ในเมนู ⚙️ ยังมี <b>คอนเทสต์ / ไร่เบอร์รี่ / พ่อค้าเร่ / คู่แข่งประจำตัว / คู่มือต่อสู้</b> ให้สำรวจเพิ่มเติม</div></div>
    <div class="tut-step"><span class="ts-ico">💾</span><div>อย่าลืม <b>Export เซฟ</b> ในเมนู ⚙️ เก็บไว้กันข้อมูลหาย</div></div>
    <div class="modal-actions"><button class="btn-primary" id="tutOk">เริ่มเล่นเลย!</button></div></div>`;
  openModal();
  $('#tutOk').onclick = () => { state.tutorialDone = true; save(); closeModal(); };
}

// ================================================================
//  BATTLE ENGINE
// ================================================================
let battleState = null;
// statsForBase ย้ายไป logic.js แล้ว (import ด้านบน)
function statsForWild(mon, level) { return statsForBase(mon.stats, level); }
function gainXpTo(ind, amount) {
  if (!ind) return;
  ind.xp = (ind.xp || 0) + amount; let leveled = false;
  while (ind.xp >= xpForLevel(ind.level) && ind.level < 100) { ind.xp -= xpForLevel(ind.level); ind.level++; leveled = true; }
  if (leveled) { toast(`⬆️ <b>${MON_BY_ID[ind.id].name}</b> ขึ้น Lv.${ind.level}`, 'good'); tryEvolveByLevel(ind); }
  renderTopbar();
}
function gainTrainerXp(n) { state.trainerXp = (state.trainerXp || 0) + n; }
function trainerLevel() { return Math.floor(Math.pow((state.trainerXp || 0) / 60, 0.5)) + 1; }

function weatherBoosted(moveType) {   // ธาตุที่ได้บูสต์จากสภาพอากาศปัจจุบันของเขต (ใช้ทั้งฝั่งเราและศัตรู)
  const w = WEATHERS[getWeather(state.region)];
  return !!(w && w.boost && w.boost.includes(moveType));
}
// ===== Stat Stages (-6..+6) แบบเกมจริง — ท่าบางท่ามีผลข้างเคียงปรับสเตตัสขึ้น/ลงชั่วคราวในแมตช์ =====
function statStageMult(stage) {
  stage = clamp(stage || 0, -6, 6);
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}
function statsWithStages(stats, stages) {   // คืนสเตตัสชุดใหม่ที่คูณด้วย stage แล้ว (ไม่แก้ของเดิม)
  if (!stages) return stats;
  const out = {};
  for (const k in stats) out[k] = k === 'hp' ? stats[k] : Math.max(1, Math.floor(stats[k] * statStageMult(stages[k])));
  return out;
}
function freshStages() { return { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 }; }
// ท่าที่มีผลข้างเคียงปรับสเตตัส (คัดจากท่าจริงในเกมที่มีเอฟเฟกต์นี้จริง) — target: self = ปรับตัวเอง, foe = ปรับคู่ต่อสู้
const MOVE_STAT_FX = {
  'Flame Charge':  { stat: 'spd',   delta: 1,  target: 'self', chance: 1 },
  'Overheat':      { stat: 'spatk', delta: -2, target: 'self', chance: 1 },
  'Draco Meteor':  { stat: 'spatk', delta: -2, target: 'self', chance: 1 },
  'Close Combat':  { stat: 'def',   delta: -1, target: 'self', chance: 1 },
  'Superpower':    { stat: 'atk',   delta: -1, target: 'self', chance: 1 },
  'Rock Tomb':     { stat: 'spd',   delta: -1, target: 'foe',  chance: 1 },
  'Bulldoze':      { stat: 'spd',   delta: -1, target: 'foe',  chance: 1 },
  'Play Rough':    { stat: 'atk',   delta: -1, target: 'foe',  chance: 0.1 },
  'Crunch':        { stat: 'def',   delta: -1, target: 'foe',  chance: 0.2 },
  'Iron Tail':     { stat: 'def',   delta: -1, target: 'foe',  chance: 0.3 },
  'Moonblast':     { stat: 'spatk', delta: -1, target: 'foe',  chance: 0.3 },
  'Shadow Ball':   { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.2 },
  'Psychic':       { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Energy Ball':   { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Focus Blast':   { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Earth Power':   { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Bug Buzz':      { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Flash Cannon':  { stat: 'spdef', delta: -1, target: 'foe',  chance: 0.1 },
  'Ancient Power': { stat: 'atk',   delta: 1,  target: 'self', chance: 0.1 },   // เกมจริงบวกทุกสเตตัส แต่ระบบนี้รองรับทีละสเตตัส เลยเลือก ATK แทน
  'Meteor Mash':   { stat: 'atk',   delta: 1,  target: 'self', chance: 0.2 },
  'Steel Wing':    { stat: 'def',   delta: 1,  target: 'self', chance: 0.1 },
};
function applyStatFx(mv, casterStages, targetStages, casterName, targetName, casterAbility, targetAbility) {
  const fx = MOVE_STAT_FX[mv.name]; if (!fx) return '';
  let chance = fx.chance;
  if (casterAbility && casterAbility.name === 'Serene Grace') chance = Math.min(1, chance * 2);   // Serene Grace: โอกาสเอฟเฟกต์ท่าตัวเอง ×2
  if (Math.random() > chance) return '';
  const isSelf = fx.target === 'self';
  if (!isSelf && fx.delta < 0 && targetAbility && targetAbility.name === 'Clear Body') return '';   // Clear Body บล็อกท่าที่ลดสเตตัสจากศัตรู
  const stages = isSelf ? casterStages : targetStages;
  const name = isSelf ? casterName : targetName;
  const before = stages[fx.stat] || 0;
  stages[fx.stat] = clamp(before + fx.delta, -6, 6);
  if (stages[fx.stat] === before) return '';   // ติดเพดานแล้ว ไม่มีอะไรเปลี่ยน
  return ` · ${STAT_LABEL[fx.stat]} ${name} ${fx.delta > 0 ? '⬆️' : '⬇️'}`;
}
function stageBadges(stages) {   // แสดง badge สเตตัสที่เปลี่ยนไปแบบย่อ เช่น ATK+1 SPD-2
  if (!stages) return '';
  return Object.keys(stages).filter(k => stages[k]).map(k =>
    `<span class="badge" style="font-size:9px;padding:1px 5px;background:${stages[k] > 0 ? 'rgba(71,209,108,.3)' : 'rgba(255,93,108,.3)'}">${STAT_LABEL[k]}${stages[k] > 0 ? '+' : ''}${stages[k]}</span>`).join(' ');
}
// ===== Ability ติดตัว — คัดจากธาตุหลักของสายพันธุ์ (types[0]) ใช้ Ability จริงจากเกม พร้อมกลไกจริงแบบย่อ =====
const TYPE_ABILITY = {
  fire:     { name: 'Blaze',        desc: 'ท่าธาตุไฟแรงขึ้น ×1.5 เมื่อ HP≤1/3', boostType: 'fire' },
  water:    { name: 'Torrent',      desc: 'ท่าธาตุน้ำแรงขึ้น ×1.5 เมื่อ HP≤1/3', boostType: 'water' },
  grass:    { name: 'Overgrow',     desc: 'ท่าธาตุพืชแรงขึ้น ×1.5 เมื่อ HP≤1/3', boostType: 'grass' },
  bug:      { name: 'Swarm',        desc: 'ท่าธาตุแมลงแรงขึ้น ×1.5 เมื่อ HP≤1/3', boostType: 'bug' },
  electric: { name: 'Static',       desc: '30% ทำให้ศัตรูที่โจมตีตัวนี้ติดอัมพาต', onHitStatus: 'para', onHitChance: 0.3 },
  poison:   { name: 'Poison Point', desc: '30% ทำให้ศัตรูที่โจมตีตัวนี้ติดพิษ', onHitStatus: 'poison', onHitChance: 0.3 },
  flying:   { name: 'Levitate',     desc: 'ต้านท่าธาตุดินสมบูรณ์ (โดนดาเมจ 0)', immuneType: 'ground' },
  rock:     { name: 'Sturdy',       desc: 'รอดท่าสังหารครั้งแรกถ้า HP เต็ม (ไม่ต้องใช้ไอเทม)' },
  dragon:   { name: 'Multiscale',   desc: 'ดาเมจที่ได้รับ -50% ตอน HP เต็ม' },
  dark:     { name: 'Intimidate',   desc: 'ตอนลงสนาม ลด ATK ศัตรู 1 ระดับ' },
  ghost:    { name: 'Insomnia',     desc: 'ต้านสถานะหลับสมบูรณ์' },
  psychic:  { name: 'Regenerator',  desc: 'ฟื้น HP 1/3 เมื่อสลับตัวออก' },
  normal:   { name: 'Adaptability', desc: 'ท่าธาตุตรง (STAB) แรงขึ้นเป็น ×2 แทน ×1.5' },
  ice:      { name: 'Ice Body',     desc: 'ฟื้น HP 1/16 ทุกเทิร์นตอนหิมะโปรย' },
  ground:   { name: 'Sand Veil',    desc: 'ตอนพายุทราย ศัตรูที่โจมตีตัวนี้ความแม่นยำ -15%' },
  steel:    { name: 'Clear Body',   desc: 'ต้านทุกท่า/ความสามารถที่ลดสเตตัสตัวเองจากศัตรู (รวม Intimidate)' },
  fairy:    { name: 'Serene Grace', desc: 'โอกาสติดสถานะ/ปรับสเตตัสจากท่าตัวเอง ×2' },
  fighting: { name: 'Guts',         desc: 'ATK ×1.5 เมื่อติดสถานะผิดปกติ' },
};
function abilityFor(id) { const m = MON_BY_ID[id]; return TYPE_ABILITY[m.types[0]] || null; }
// Intimidate: เช็คตัวที่เพิ่งลงสนามฝั่งไหน แล้วลด ATK ฝั่งตรงข้าม 1 ระดับถ้ามีความสามารถนี้
function applyIntimidate(holderSide, b) {
  const holderId = holderSide === 'player' ? b.team[b.activeIdx].ind.id : b.foeMon.id;
  const ab = abilityFor(holderId);
  if (!ab || ab.name !== 'Intimidate') return '';
  const targetId = holderSide === 'player' ? b.foeMon.id : b.team[b.activeIdx].ind.id;
  const targetAbility = abilityFor(targetId);
  const targetName = holderSide === 'player' ? (b.foeDisplayName || b.foeMon.name) : activeMonView(b.team[b.activeIdx]).name;
  if (targetAbility && targetAbility.name === 'Clear Body') return ` · 😤 Intimidate! แต่ ${targetName} มี Clear Body ต้านไว้`;
  const targetStages = holderSide === 'player' ? b.foe.stages : b.team[b.activeIdx].stages;
  const before = targetStages.atk;
  targetStages.atk = clamp(before - 1, -6, 6);
  if (targetStages.atk === before) return '';
  return ` · 😤 Intimidate! ATK ${targetName} ⬇️`;
}
// Regenerator: ฟื้น HP 1/3 ให้ตัวที่มีความสามารถนี้เมื่อสลับตัวออก
function applyRegenerator(member) {
  const ab = abilityFor(member.ind.id);
  if (!ab || ab.name !== 'Regenerator' || member.hp <= 0) return '';
  const heal = Math.max(1, Math.floor(member.maxHp / 3));
  const before = member.hp;
  member.hp = Math.min(member.maxHp, member.hp + heal);
  if (member.hp === before) return '';
  return ` · 🌿 Regenerator! ${MON_BY_ID[member.ind.id].name} ฟื้น ${member.hp - before}`;
}
// calcDamage — wrapper: คำนวณ weatherBoost (ขึ้นกับ state) + สุ่ม แล้วเรียก damageCore (pure) ใน logic.js
function calcDamage(atkMon, atkStats, atkLevel, defMon, defStats, move, held, opts) {
  const moveType = move ? move.type : atkMon.types[0];
  return damageCore(atkMon, atkStats, atkLevel, defMon, defStats, move, held, opts, weatherBoosted(moveType), Math.random(), Math.random());
}
// ใส่ผล Held Item ที่ปรับสเตตัส (ตอนสร้างทีมสู้)
function statsWithHeld(ind) {
  const s = calcStats(ind);
  if (ind.held === 'choice-band') s.atk = Math.floor(s.atk * 1.5);
  if (ind.held === 'choice-specs') s.spatk = Math.floor(s.spatk * 1.5);
  if (ind.held === 'assault-vest') s.spdef = Math.floor(s.spdef * 1.5);
  return s;
}
// ไอเทมถือของศัตรูตัวแรง (เอซยิม/บอส/บอสหอคอย) — สุ่มได้ 1 ชิ้นให้ท้าทายขึ้นจริง
const FOE_HELD_POOL = ['life-orb', 'choice-band', 'choice-specs', 'expert-belt', 'scope-lens'];
function applyFoeHeld(stats, held) {
  if (held === 'choice-band') stats.atk = Math.floor(stats.atk * 1.5);
  if (held === 'choice-specs') stats.spatk = Math.floor(stats.spatk * 1.5);
  return stats;
}
function buildBattleTeam(members) {
  return members.map(ind => {
    const s = statsWithHeld(ind);
    const ppMax = getMoves(ind.id).map(mv => movePP(mv.pow));
    return { ind, stats: s, hp: s.hp, maxHp: s.hp, sashUsed: false, sitrusUsed: false, status: null, sleepT: 0, mega: null, dynamax: null, stages: freshStages(), pp: ppMax.slice(), ppMax };
  });
}
function checkSitrus(active, b) {   // Sitrus Berry: ฟื้น HP 25% อัตโนมัติครั้งเดียวเมื่อ HP ต่ำกว่าครึ่ง
  if (active && active.hp > 0 && !active.sitrusUsed && active.ind.held === 'sitrus-berry' && active.hp <= active.maxHp * 0.5) {
    const heal = Math.max(1, Math.floor(active.maxHp * 0.25));
    active.hp = Math.min(active.maxHp, active.hp + heal);
    active.sitrusUsed = true;
    b.msg += ` · 🫐 ${MON_BY_ID[active.ind.id].name} กิน Sitrus Berry ฟื้น ${heal}!`;
  }
}
// ประเมินดาเมจคร่าวๆ แบบไม่มี RNG (ใช้ค่าเฉลี่ยของช่วงสุ่ม) เพื่อให้ AI รู้ว่าท่าไหน "จบเกมได้" ก่อนเลือกจริง
function foeEstimateDamage(mv, atkStats, atkLevel, defStats, defTypes, atkTypes) {
  const physical = atkStats.atk >= atkStats.spatk;
  const A = physical ? atkStats.atk : atkStats.spatk;
  const D = physical ? defStats.def : defStats.spdef;
  const eff = typeEffect(mv.type, defTypes);
  const stab = atkTypes.includes(mv.type) ? 1.5 : 1;
  const base = (((2 * atkLevel / 5 + 2) * mv.pow * A / Math.max(1, D)) / 50 + 2);
  return Math.floor(base * stab * eff * 0.925);
}
// AI เลือกท่า — คิดธาตุ+STAB+ความแม่นยำ, เอนเอียงไปทางท่าที่จบเกมได้ทันที และท่าที่ทำให้ติดสถานะถ้าคู่ต่อสู้ยังไม่มีสถานะ
// ctx (ถ้ามี) = { atkStats, atkLevel, defStats, targetHp, targetStatus } ให้ AI ประเมินสถานการณ์จริงได้แม่นขึ้น
function foeChooseMove(foeMon, defTypes, ctx) {
  const moves = getMoves(foeMon.id);
  let best = moves[0], bestScore = -Infinity;
  moves.forEach(mv => {
    const eff = typeEffect(mv.type, defTypes);
    const stab = foeMon.types.includes(mv.type) ? 1.5 : 1;
    const acc = (mv.acc || 100) / 100;
    let score = eff * stab * (mv.pow / 100) * acc;
    if (ctx) {
      const estDmg = foeEstimateDamage(mv, ctx.atkStats, ctx.atkLevel, ctx.defStats, defTypes, foeMon.types);
      if (estDmg >= ctx.targetHp) score += 5;   // ท่านี้จบเกมได้ ให้ความสำคัญสูงสุด
      if (!ctx.targetStatus && TYPE_STATUS[mv.type]) score += 0.15;   // เอนเอียงไปทางท่าที่ทำให้ติดสถานะได้ถ้ายังไม่มีสถานะ
    }
    if (score > bestScore) { bestScore = score; best = mv; }
  });
  return best;
}
function startBattle(isBoss, bossData) {
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน (ตั้ง Buddy/เข้าทีมจากคลัง)', 'bad'); return; }
  let foeMon, foeLevel, foeStats, foeHp, foeMaxHp, foeHeld = null;
  if (isBoss) {
    foeMon = bossData.mon; foeLevel = bossData.level;
    const base = statsForWild(foeMon, foeLevel);
    foeStats = { atk: Math.floor(base.atk * 1.5), def: Math.floor(base.def * 1.5),
      spatk: Math.floor(base.spatk * 1.5), spdef: Math.floor(base.spdef * 1.5), spd: Math.floor(base.spd * 1.15) };
    foeMaxHp = Math.floor(base.hp * 1.7); foeHp = foeMaxHp;   // บอสอึด+แรงขึ้นมาก ท้าทายจริง
    foeHeld = pick(FOE_HELD_POOL); applyFoeHeld(foeStats, foeHeld);   // บอสถือไอเทมด้วย ท้าทายขึ้นจริง
  } else {
    if (!currentSpawn) return;
    foeMon = currentSpawn.mon; foeLevel = currentSpawn.level;
    foeStats = statsForWild(foeMon, foeLevel);
    foeMaxHp = currentSpawn.maxHp; foeHp = currentSpawn.hp;
  }
  const team = buildBattleTeam(members);
  battleState = {
    mode: isBoss ? 'boss' : 'wild',
    isBoss, bossData, foeMon, foeLevel, foeStats, foeHp, foeMaxHp, foeHeld,
    foeQueue: [{ mon: foeMon }], foeIdx: 0,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: isBoss && !(state.settings && state.settings.fastBattle),
    msg: isBoss ? `👑 บอส ${foeMon.name} ท้าดวล!` : `เจอ ${foeMon.name} ป่า — เลือกท่าโจมตี!`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
// ===== หน้า VS ก่อนเริ่มต่อสู้ (สไตล์ PokeMeow) — โชว์เทรนเนอร์ + ทีมทั้งสองฝั่ง + ความสามารถ =====
function rosterRow(mons, shinyOf) {
  return mons.map((m, i) => `<div class="roster-cell" title="${MON_BY_ID[m.id].name}">${spriteImg(m.id, shinyOf ? shinyOf(i) : false, 'roster-mini')}</div>`).join('');
}
function abilityRows(mons, shinyOf) {
  return mons.map((m, i) => {
    const mon = MON_BY_ID[m.id]; const ab = abilityFor(m.id);
    return `<div class="vs-ability" title="${ab ? ab.desc : ''}">${spriteImg(m.id, shinyOf ? shinyOf(i) : false, 'ab-mini')}
      <span class="vs-ab-name">${mon.name}</span>${ab ? `<span class="vs-ab-dash">—</span><span class="vs-ab-skill">${ab.name}</span>` : ''}</div>`;
  }).join('');
}
// ปิดหน้า VS โดยไม่สู้ (ไม่คิดคูลดาวน์ใดๆ เพราะยังไม่เริ่มจริง)
function cancelIntro() {
  battleState = null;
  $('#battleModal').classList.add('hidden');
  renderTopbar();
  if (currentView === 'menu') renderMenu();
}
function renderBattleIntro(b) {
  const foeTeam = (b.foeQueue && b.foeQueue.length) ? b.foeQueue.map(f => f.mon) : [b.foeMon];
  const myTeam = b.team.map(t => t.ind);
  const foeLabel = b.mode === 'tower' ? `หอคอยชั้น ${b.floorNow || (state.tower && state.tower.floor) || 1}`
    : b.isRival ? `${RIVAL_NAME}` : (b.mode === 'trainer' ? `${b.gym.name}` : `บอส ${b.foeMon.name}`);
  const foeEmoji = b.mode === 'tower' ? '🗼' : b.isRival ? '🔥' : (b.mode === 'trainer' ? b.gym.emoji : '👑');
  const myLabel = `เทรนเนอร์ (คุณ)`;
  const foeTr = foeTrainerName(b), myTr = TRAINER_SPRITES.player;
  const myShiny = i => !!(myTeam[i] && myTeam[i].shiny);
  $('#battleBox').innerHTML = `
    <div class="vs-intro">
      <div class="vs-title">⚔️ การต่อสู้กำลังจะเริ่ม!</div>
      <div class="vs-challenge"><b>👤 ${myLabel}</b> ท้า <b>${foeEmoji} ${foeLabel}</b> ให้ต่อสู้! ⚔️</div>
      <div class="vs-stage">
        <div class="vs-corner foe">
          <div class="vs-tr-wrap">${trainerImg(foeTr)}<span class="vs-tr-emoji">${foeEmoji}</span></div>
          <div class="vs-tr-name">${foeLabel}</div>
          <div class="roster-row">${rosterRow(foeTeam)}</div>
        </div>
        <div class="vs-badge">VS</div>
        <div class="vs-corner me">
          <div class="vs-tr-wrap">${trainerImg(myTr)}<span class="vs-tr-emoji">👤</span></div>
          <div class="vs-tr-name">${myLabel} Lv.${trainerLevel()}</div>
          <div class="roster-row">${rosterRow(myTeam, myShiny)}</div>
        </div>
      </div>
      <div class="vs-abilities">
        <div class="vs-ab-col">
          <div class="vs-ab-head foe">🧬 ความสามารถของ ${foeLabel}</div>
          ${abilityRows(foeTeam)}
        </div>
        <div class="vs-ab-col">
          <div class="vs-ab-head me">🧬 ความสามารถของทีมคุณ</div>
          ${abilityRows(myTeam, myShiny)}
        </div>
      </div>
      <div class="vs-actions">
        <button class="vs-start" id="btVsStart">เริ่มต่อสู้! ⚔️</button>
        <button class="vs-close" id="btVsClose">ปิด / ย้อนกลับ</button>
      </div>
    </div>`;
  $('#btVsStart').onclick = () => {
    if (b.isGhost) { state.ghostReadyAt = Date.now() + GHOST_CD; save(); }   // เริ่มสู้จริงถึงคิดคูลดาวน์ (ปิดก่อนไม่โดน)
    b.showIntro = false; playSfx('rare'); renderBattle();
  };
  $('#btVsClose').onclick = cancelIntro;
}
// ===== หน้าสรุปชัยชนะ (หลังชนะเทรนเนอร์/บอส/คู่แข่ง) =====
function renderVictory(b) {
  const v = b.victory;
  const rows = [];
  if (v.coins) rows.push(['🪙', 'เหรียญ', '+' + v.coins]);
  if (v.bp) rows.push(['🎖️', 'Battle Points', '+' + v.bp]);
  if (v.xp) rows.push(['⭐', 'Trainer XP', '+' + v.xp]);
  if (v.items) rows.push(['🎁', 'ไอเทม', v.items]);
  $('#battleBox').innerHTML = `
    <div class="vic-screen">
      <div class="vic-title">🏆 ชนะแล้ว!</div>
      <div class="vic-portrait">${trainerImg(v.trainerKey, 'vic-tr')}<span class="vic-emoji">${v.emoji || '👑'}</span></div>
      <div class="vic-foe-name">เอาชนะ <b>${v.emoji || ''} ${v.title}</b></div>
      <div class="vic-rewards">
        ${rows.map(([i, l, val]) => `<div class="vic-row"><span class="vic-ic">${i}</span><span class="vic-lbl">${l}</span><span class="vic-val">${val}</span></div>`).join('')}
      </div>
      ${v.bonus ? `<div class="vic-bonus">✨ ${v.bonus}</div>` : ''}
      <button class="vs-start" id="btVicDone">รับรางวัล ✅</button>
    </div>`;
  $('#btVicDone').onclick = endBattle;
}
function renderBattle() {
  const b = battleState; if (!b) return;
  // พื้นหลังฉากต่อสู้ (battle background เกมจริง) — หรี่เข้มให้อ่าน UI ง่าย ทำให้ดูเหมือนเกมจริง
  const bx = $('#battleBox');
  if (bx) {
    const bg = REGION_BATTLE_BG[state.region];
    bx.style.background = bg
      ? `linear-gradient(180deg, rgba(10,14,30,.74), rgba(8,10,22,.86)), url('${SHOWDOWN_FX}${bg}') center/cover no-repeat`
      : '';
  }
  if (b.showIntro) { renderBattleIntro(b); return; }
  if (b.over && b.victory) { renderVictory(b); return; }
  const active = b.team[b.activeIdx];
  const mon = MON_BY_ID[active.ind.id];
  const view = activeMonView(active);
  const hpCls = (hp, max) => { const p = hp / max * 100; return p <= 20 ? 'crit' : p <= 50 ? 'low' : ''; };
  const foePct = clamp(b.foeHp / b.foeMaxHp * 100, 0, 100);
  const myPct = clamp(active.hp / active.maxHp * 100, 0, 100);

  const teamStrip = b.team.map((t, i) => {
    const fainted = t.hp <= 0;
    return `<div class="team-chip${i === b.activeIdx ? ' active' : ''}${fainted ? ' fainted' : ''} ${tierClass(t.ind.tier, t.ind.shiny, t.ind.golden)}" data-sw="${i}" title="${MON_BY_ID[t.ind.id].name} HP ${Math.ceil(t.hp)}/${t.maxHp}">
      ${spriteImg(t.ind.id, t.ind.shiny)}<span class="tc-hp">${Math.ceil(t.hp)}</span></div>`;
  }).join('');

  const foeTypes = b.foeTypes || b.foeMon.types;
  const foeSpriteId = b.foeSpriteId || b.foeMon.id;
  const foeName = b.foeDisplayName || b.foeMon.name;
  const foeTr = foeTrainerName(b);
  const foeAbility = abilityFor(b.foeMon.id), myAbility = abilityFor(active.ind.id);
  const abilityBadge = ab => ab ? `<span class="badge" style="background:#2c3a55" title="${ab.desc}">🧬 ${ab.name}</span>` : '';
  const curWeather = WEATHERS[getWeather(state.region)];
  const moves = getMoves(active.ind.id);
  if (!active.pp) { active.ppMax = moves.map(mv => movePP(mv.pow)); active.pp = active.ppMax.slice(); }   // เผื่อเซฟเก่า/สลับตัวที่ยังไม่มี pp
  const outOfPP = active.pp.every((p, i) => i >= moves.length || p <= 0);
  let moveBtns;
  if (outOfPP) {
    moveBtns = `<button class="move-btn t-normal struggle-btn" data-mv="-1" title="ท่าทั้งหมด PP หมด — ดิ้นรนโจมตีพร้อมบาดเจ็บตัวเอง">ดิ้นรน (Struggle) <b>50</b> <span class="mv-acc">↩️ บาดเจ็บตัวเอง</span></button>`;
  } else {
    moveBtns = moves.map((mv, i) => {
      const e = typeEffect(mv.type, foeTypes);
      const tag = e > 1 ? '↑' : e < 1 ? '↓' : '';
      const prio = mv.priority > 0 ? ' ⚡' : '';
      const wBoost = weatherBoosted(mv.type) ? ` ${curWeather.emoji}` : '';
      const pp = active.pp[i] == null ? movePP(mv.pow) : active.pp[i];
      const ppMax = active.ppMax[i] == null ? movePP(mv.pow) : active.ppMax[i];
      const noPP = pp <= 0;
      const ppCls = noPP ? ' pp-empty' : (pp <= ppMax * 0.25 ? ' pp-low' : '');
      return `<button class="move-btn t-${mv.type}${ppCls}" data-mv="${i}" ${noPP ? 'disabled' : ''} title="${mv.priority > 0 ? 'ท่า Priority — โจมตีก่อนเสมอ' : ''}">${mv.name}${prio} <b>${mv.pow}</b>${tag}${wBoost}<span class="mv-acc">🎯${mv.acc}% · PP ${pp}/${ppMax}</span></button>`;
    }).join('');
  }

  const canMega = state.hasMegaRing && !b.usedMega && !active.mega && !!(megaFormsFor(active.ind.id) || []).find(f => f.key === active.ind.megaKey);
  const canDynamax = state.hasDynamaxBand && !b.usedDynamax && !active.dynamax;   // ใช้แค่กำไลไดนาแม็กซ์ (ไม่ต้องใช้พลังงานแล้ว)
  const specialBadge = view.special ? `<span class="badge" style="background:linear-gradient(90deg,#ff6b6b,#ffcb05)">${active.mega ? '💎 MEGA' : '💥 G-MAX'}</span>` : (active.dynamax ? `<span class="badge" style="background:#e23b4e">💥 DYNAMAX ${active.dynamax.turnsLeft}T</span>` : '');
  const foeSpecialBadge = b.special ? `<span class="badge" style="background:${b.special === 'mega' ? 'linear-gradient(90deg,#8e5bff,#5a2ba8)' : b.special === 'gmax' ? 'linear-gradient(90deg,#ff6b6b,#c1122e)' : '#555'}">${b.special === 'mega' ? '💎 MEGA' : b.special === 'gmax' ? '💥 G-MAX' : '⭐ ELITE'}</span>` : '';

  $('#battleBox').innerHTML = `
    ${curWeather.boost && curWeather.boost.length ? `<div style="font-size:11px;color:#9fd3ff;font-weight:700;text-align:center;margin-bottom:4px">${curWeather.emoji} ${curWeather.name} — ท่าธาตุ ${curWeather.boost.join('/')} แรงขึ้น ×1.2${curWeather.dotImmune ? ` · ธาตุอื่นโดนซัดทุกเทิร์น (ยกเว้น ${curWeather.dotImmune.join('/')})` : ''}</div>` : ''}
    <div class="battle-arena">
      <div class="bt-side foe">
        ${b.mode === 'trainer' ? `<div class="bt-foe-trainer">${trainerImg(foeTr, 'bt-trainer')}<span>${b.gym.emoji} ${b.gym.name}</span><span class="bt-foe-dots">${b.foeQueue.map((_, i) => `<span class="fd${i < b.foeIdx ? ' down' : i === b.foeIdx ? ' cur' : ''}"></span>`).join('')}</span></div>` : ''}
        ${b.isBoss ? `<div class="bt-foe-trainer">${trainerImg(foeTr, 'bt-trainer')}<span>👑 บอสประจำเขต</span></div>` : ''}
        ${b.mode === 'tower' ? `<div style="font-size:11px;color:#ffd76b;font-weight:700">🗼 ชั้น ${b.floorNow}${b.special ? ' · บอส!' : ''} · สูงสุด ${state.tower.bestFloor || 0}</div>` : ''}
        <div class="bt-head"><span>${b.isBoss ? '👑 ' : ''}${foeName} Lv.${b.foeLevel} ${statusBadge(b.foe.status)} ${foeSpecialBadge}${b.foeHeld ? ` <span class="badge" style="background:#3a3a55" title="${HELD_ITEMS[b.foeHeld].desc}">${HELD_ITEMS[b.foeHeld].emoji} ${HELD_ITEMS[b.foeHeld].name}</span>` : ''} ${abilityBadge(foeAbility)} ${foeTypes.map(t => `<span class="badge t-${t}" style="font-size:9px;padding:1px 6px">${t}</span>`).join('')}</span>${spriteImg(foeSpriteId, false)}</div>
        <div class="bt-hpbar"><div class="${hpCls(b.foeHp, b.foeMaxHp)}" style="width:${foePct}%"></div></div>
        <div class="hp-txt" style="text-align:left">HP ${Math.ceil(b.foeHp)}/${b.foeMaxHp}</div>
        <div style="text-align:left;margin-top:2px">${stageBadges(b.foe.stages)}</div>
      </div>
      <div class="bt-side me">
        <div class="bt-head">${spriteImg(view.spriteId, view.special ? false : active.ind.shiny)}<span>${view.name} Lv.${active.ind.level} ${genderIcon(active.ind.gender)} ${statusBadge(active.status)} ${specialBadge} ${abilityBadge(myAbility)}</span></div>
        <div class="bt-hpbar"><div class="${hpCls(active.hp, active.maxHp)}" style="width:${myPct}%"></div></div>
        <div class="hp-txt" style="text-align:right">HP ${Math.ceil(active.hp)}/${active.maxHp}</div>
        <div style="text-align:right;margin-top:2px">${stageBadges(active.stages)}</div>
      </div>
    </div>
    <div class="team-strip">${teamStrip}</div>
    <div class="bt-log${battleBusy ? ' bt-log-wait' : ''}">${b.msg}${battleBusy ? ' <span class="bt-dots">●●●</span>' : ''}</div>
    ${b.over
      ? (b.towerCleared
          ? `<div class="bt-actions"><button class="bt-flee" id="btTowerNext" style="background:linear-gradient(180deg,#47d16c,#1f8a44);color:#fff">🗼 ปีนต่อ (ชั้น ${state.tower.floor})</button><button class="bt-flee" id="btDone">หยุดพัก</button></div>`
          : `<div class="bt-actions"><button class="bt-flee" id="btDone">ปิด</button></div>`)
      : `${(canMega || canDynamax) ? `<div class="bt-actions" style="margin-bottom:6px">
           ${canMega ? `<button class="bt-flee" id="btMega" ${battleBusy ? 'disabled' : ''} style="background:linear-gradient(180deg,#8e5bff,#5a2ba8);color:#fff">💎 เมก้าอีโวลูชัน</button>` : ''}
           ${canDynamax ? `<button class="bt-flee" id="btDynamax" ${battleBusy ? 'disabled' : ''} style="background:linear-gradient(180deg,#ff6b6b,#c1122e);color:#fff">💥 ไดนาแม็กซ์</button>` : ''}
         </div>` : ''}
         <div class="move-grid${battleBusy ? ' move-grid-busy' : ''}">${moveBtns}</div>
         <div class="bt-actions"><button class="bt-flee" id="btFlee" ${battleBusy ? 'disabled' : ''}>${b.isBoss ? 'ยอมแพ้' : (b.mode === 'tower' ? 'ล่าถอย (คูลดาวน์ 12 ชม.)' : 'หนี')}</button></div>`}`;

  if (b.over) {
    $('#btDone').onclick = endBattle;
    const twBtn = $('#btTowerNext'); if (twBtn) twBtn.onclick = towerContinueClimb;
  } else {
    $('#btFlee').onclick = endBattle;
    $('#battleBox').querySelectorAll('.move-btn[data-mv]').forEach(el => el.onclick = battleBusy ? null : () => battleAttack(+el.dataset.mv));
    if (battleBusy) $('#battleBox').querySelectorAll('.move-btn[data-mv]').forEach(el => el.disabled = true);
    $('#battleBox').querySelectorAll('.team-chip[data-sw]').forEach(el => el.onclick = battleBusy ? null : () => battleSwitch(+el.dataset.sw));
    const mgBtn = $('#btMega'); if (mgBtn) mgBtn.onclick = battleMegaEvolve;
    const dyBtn = $('#btDynamax'); if (dyBtn) dyBtn.onclick = battleDynamax;
  }
  applyBattleFx(b);
}
// เอฟเฟกต์ต่อสู้: สั่น/แฟลชสไปรต์ + ตัวเลขดาเมจลอย (อ่านจาก b._fx ที่ตั้งไว้ตอนคำนวณดาเมจ)
function applyBattleFx(b) {
  if (!b || !b._fx) return;
  const fx = b._fx; b._fx = null;
  const reduce = state.settings && state.settings.reduceMotion;
  const doSide = (sel, info) => {
    if (!info) return;
    const side = $(sel); if (!side) return;
    const img = side.querySelector('.bt-head img');
    if (img && !reduce) { img.classList.remove('hit-shake'); void img.offsetWidth; img.classList.add('hit-shake'); }
    if (info.dmg > 0) {
      const f = document.createElement('div');
      f.className = 'dmg-float' + (info.crit ? ' crit' : '') + (info.eff > 1 ? ' super' : info.eff < 1 && info.eff > 0 ? ' weak' : '');
      f.textContent = '-' + info.dmg + (info.crit ? '!' : '');
      side.appendChild(f);
      setTimeout(() => { if (f.parentNode) f.parentNode.removeChild(f); }, 1000);
    }
  };
  doSide('.bt-side.foe', fx.foe);
  doSide('.bt-side.me', fx.me);
}
// ===== สถานะผิดปกติ (Status) =====
const STATUS = {
  burn:   { emoji: '🔥', name: 'ไหม้', dot: 1 / 16 },
  poison: { emoji: '☠️', name: 'พิษ', dot: 1 / 8 },
  para:   { emoji: '⚡', name: 'อัมพาต' },
  sleep:  { emoji: '💤', name: 'หลับ' },
  freeze: { emoji: '❄️', name: 'แช่แข็ง' },
};
const TYPE_STATUS = {   // ธาตุของท่า -> สถานะที่อาจติด + โอกาส
  fire: { s: 'burn', c: 0.3 }, electric: { s: 'para', c: 0.3 }, ice: { s: 'freeze', c: 0.2 },
  poison: { s: 'poison', c: 0.35 }, grass: { s: 'poison', c: 0.2 }, bug: { s: 'poison', c: 0.2 },
  ghost: { s: 'sleep', c: 0.25 }, psychic: { s: 'sleep', c: 0.2 }, fairy: { s: 'para', c: 0.2 },
};
const STATUS_IMMUNE = { burn: ['fire'], freeze: ['ice'], para: ['electric', 'ground'], poison: ['poison', 'steel'] };
function statusBadge(st) { return st ? `<span title="${STATUS[st].name}" style="font-size:12px">${STATUS[st].emoji}</span>` : ''; }
function canAct(ent) {   // ตรวจว่าขยับได้ไหม (mutate: ตื่น/ละลาย/สะดุ้ง)
  if (ent.flinched) { ent.flinched = false; return { can: false, note: 'สะดุ้ง! ขยับไม่ได้ 👑' }; }
  const st = ent.status; if (!st) return { can: true };
  if (st === 'freeze') { if (Math.random() < 0.2) { ent.status = null; return { can: true, note: 'ละลายน้ำแข็ง' }; } return { can: false, note: 'ถูกแช่แข็ง' }; }
  if (st === 'sleep') { ent.sleepT = (ent.sleepT || 1) - 1; if (ent.sleepT <= 0) { ent.status = null; return { can: true, note: 'ตื่นแล้ว' }; } return { can: false, note: 'หลับอยู่ 💤' }; }
  if (st === 'para' && Math.random() < 0.25) return { can: false, note: 'อัมพาต ขยับไม่ได้' };
  return { can: true };
}
// ===== Mega Evolution / Dynamax ระหว่างการต่อสู้ =====
// คืนธาตุ/สไปรต์/ชื่อ "ที่ใช้จริงตอนนี้" ของฝั่งผู้เล่น (ปกติ/เมก้า/G-Max) — ไม่แก้ข้อมูลตัวจริงถาวร
function activeMonView(active) {
  const base = MON_BY_ID[active.ind.id];
  if (active.mega) return { types: active.mega.types, spriteId: active.mega.spriteId, name: active.mega.name, special: true };
  if (active.dynamax && active.dynamax.isGmax) {
    const g = gmaxFormFor(active.ind.id);
    return { types: base.types, spriteId: g.spriteId, name: g.name, special: true };
  }
  return { types: base.types, spriteId: active.ind.id, name: base.name, special: false };
}
function battleMegaEvolve() {
  const b = battleState; if (!b || b.over || b.usedMega || battleBusy) return;
  if (!state.hasMegaRing) { toast('❌ ต้องมีกำไลเมก้าก่อน (ซื้อได้ที่ร้าน)', 'bad'); return; }
  const active = b.team[b.activeIdx];
  const forms = megaFormsFor(active.ind.id) || [];
  const form = forms.find(f => f.key === active.ind.megaKey);
  if (!form) { toast('❌ ไม่มีหินเมก้าแนบอยู่ (แนบได้ในหน้าโปเกมอน)', 'bad'); return; }
  const newStats = calcStats(active.ind, form.stats);
  const gained = newStats.hp - active.maxHp;
  active.maxHp = newStats.hp; active.hp = Math.max(1, active.hp + gained);
  active.stats = newStats;
  active.mega = form;
  b.usedMega = true;
  state._megaEvolved = true;
  b.msg = `💎 ${MON_BY_ID[active.ind.id].name} เมก้าอีโวลูชันเป็น <b>${form.name}</b>!`;
  logMsg(`💎 เมก้าอีโวลูชัน: <b>${form.name}</b>!`, 'big');
  playSfx('rare'); checkAchievements();
  save(); renderBattle();
}
function battleDynamax() {
  const b = battleState; if (!b || b.over || b.usedDynamax || battleBusy) return;
  if (!state.hasDynamaxBand) { toast('❌ ต้องมีกำไลไดนาแม็กซ์ก่อน (แลกด้วยเหรียญเช็คอิน)', 'bad'); return; }
  const active = b.team[b.activeIdx];
  b.usedDynamax = true;
  const gform = gmaxFormFor(active.ind.id);
  const isGmax = !!gform && active.ind.gmaxKey === gform.key;   // ต้องแนบหินปลุกพลังของตัวนั้นๆ ถึงจะได้ร่าง G-Max จริง
  const newMax = Math.round(active.maxHp * DYNAMAX_HP_MULT);
  active.hp = active.hp + (newMax - active.maxHp);
  active.maxHp = newMax;
  active.dynamax = { turnsLeft: DYNAMAX_TURNS, isGmax };
  state._dynamaxed = true;
  if (isGmax) state._gmaxed = true;
  const dispName = isGmax ? gmaxFormFor(active.ind.id).name : MON_BY_ID[active.ind.id].name;
  b.msg = `💥 ${MON_BY_ID[active.ind.id].name} ไดนาแม็กซ์เป็น <b>${dispName}</b>! HP/พลังโจมตีพุ่งขึ้น!`;
  logMsg(`💥 ไดนาแม็กซ์! <b>${dispName}</b>`, 'big');
  playSfx('rare'); checkAchievements();
  save(); renderBattle();
}
function revertDynamax(active, b) {
  if (!active.dynamax) return;
  const origMax = Math.round(active.maxHp / DYNAMAX_HP_MULT);
  active.hp = Math.max(1, Math.round(active.hp / DYNAMAX_HP_MULT));
  active.maxHp = origMax;
  active.dynamax = null;
  if (b) b.msg += ` · ${MON_BY_ID[active.ind.id].name} คืนร่างจากไดนาแม็กซ์`;
}
function tryInflict(move, target, targetTypes, name, targetAbility, casterAbility) {
  if (target.status) return '';
  const ts = TYPE_STATUS[move.type]; if (!ts) return '';
  if ((STATUS_IMMUNE[ts.s] || []).some(t => targetTypes.includes(t))) return '';
  if (targetAbility && targetAbility.name === 'Insomnia' && ts.s === 'sleep') return '';
  const chance = (casterAbility && casterAbility.name === 'Serene Grace') ? Math.min(1, ts.c * 2) : ts.c;
  if (Math.random() < chance) {
    target.status = ts.s;
    if (ts.s === 'sleep') target.sleepT = rand(1, 3);
    return ` · ${STATUS[ts.s].emoji} ${name} ติด${STATUS[ts.s].name}!`;
  }
  return '';
}
// เอไอเทรนเนอร์ตัดสินใจเรียกตัวกลับ ถ้าอ่อนแรง (HP<=30%) และมีตัวสำรองเหลือ (ไม่ใช่เอซตัวสุดท้ายที่ต้องสู้จนจบเสมอ)
// เลือกตัวสำรองที่โดนธาตุผู้เล่นเอาเปรียบน้อยที่สุดมาแทน — ตัวที่ถอยไปต่อท้ายคิว มีโอกาสถูกเรียกกลับมาสู้อีกทีแบบเต็ม HP
function trainerTrySwitch(b, playerTypes) {
  if (b.foeIdx >= b.foeQueue.length - 1) return false;
  if (b.foeHp / b.foeMaxHp > 0.3) return false;
  if (Math.random() > 0.4) return false;
  let bestI = -1, bestVuln = Infinity;
  for (let i = b.foeIdx + 1; i < b.foeQueue.length; i++) {
    const vuln = playerTypes.reduce((s, t) => s + typeEffect(t, b.foeQueue[i].mon.types), 0);
    if (vuln < bestVuln) { bestVuln = vuln; bestI = i; }
  }
  if (bestI < 0) return false;
  const retreating = b.foeQueue[b.foeIdx];
  const chosen = b.foeQueue[bestI];
  b.foeQueue.splice(bestI, 1);
  b.foeQueue.splice(b.foeIdx, 1, chosen);
  b.foeQueue.push(retreating);
  loadFoe(b, chosen);
  return true;
}
function foeTurn(b) {
  if (b.over) return;
  const active = b.team[b.activeIdx];
  const aMon = MON_BY_ID[active.ind.id];
  const view = activeMonView(active);
  const foeNameBefore = b.foeDisplayName || b.foeMon.name;
  if (b.mode === 'trainer' && trainerTrySwitch(b, view.types)) {
    b.msg += ` · ${b.gym.emoji} เรียก ${foeNameBefore} กลับ! ส่ง ${b.foeMon.name} Lv.${b.foeLevel} ลงแทน!`;
    b.msg += applyIntimidate('foe', b);
    return;
  }
  const gate = canAct(b.foe);
  const foeName = b.foeDisplayName || b.foeMon.name;
  const foeTypesForAtk = b.foeTypes || b.foeMon.types;
  if (gate.note) b.msg += ` · ${foeName} ${gate.note}`;
  if (!gate.can) return;
  const aiCtx = { atkStats: b.foeStats, atkLevel: b.foeLevel, defStats: active.stats, targetHp: active.hp, targetStatus: active.status };
  const mv = foeChooseMove(b.foeMon, view.types, aiCtx);
  if (!rollHit(mv, b.foeHeld, active.ind.held, abilityFor(active.ind.id))) {                     // ท่าศัตรูพลาดเป้า
    b.msg += ` · ${foeName} ใช้ ${mv.name}! แต่พลาดเป้า... 💨`;
    return;
  }
  const atkAbility = abilityFor(b.foeMon.id), defAbility = abilityFor(active.ind.id);
  const wasFull = active.hp === active.maxHp;
  const atkRes = calcDamage({ types: foeTypesForAtk }, statsWithStages(b.foeStats, b.foe.stages), b.foeLevel, { types: view.types }, statsWithStages(active.stats, active.stages), mv, b.foeHeld,
    { atkAbility, defAbility, atkHpRatio: b.foeHp / b.foeMaxHp, defHpRatio: active.hp / active.maxHp, atkHasStatus: !!b.foe.status });
  let dmg = atkRes.dmg;
  if (b.foe.status === 'burn') dmg = Math.floor(dmg * 0.6);
  let sturdyMsg = '';
  if (defAbility && defAbility.name === 'Sturdy' && wasFull && dmg >= active.hp) { dmg = active.hp - 1; sturdyMsg = ` · 🗿 ${view.name} ทนอยู่ด้วย Sturdy!`; }
  active.hp = Math.max(0, active.hp - dmg);
  b._fx = Object.assign(b._fx || {}, { me: { dmg, crit: atkRes.crit, eff: atkRes.eff } });
  b.msg += ` · ${foeName} ใช้ ${mv.name}! ${atkRes.crit ? '🎯คริติคอล! ' : ''}${atkRes.weather ? '🌦️ ' : ''}-${dmg}${sturdyMsg}`;
  b.msg += tryInflict(mv, active, view.types, view.name, defAbility, atkAbility);
  b.msg += applyStatFx(mv, b.foe.stages, active.stages, foeName, view.name, atkAbility, defAbility);
  if (defAbility && defAbility.onHitStatus && !active.status && !b.foe.status && Math.random() < defAbility.onHitChance
      && !(STATUS_IMMUNE[defAbility.onHitStatus] || []).some(t => foeTypesForAtk.includes(t))) {
    b.foe.status = defAbility.onHitStatus; if (b.foe.status === 'sleep') b.foe.sleepT = rand(1, 3);
    b.msg += ` · ${STATUS[defAbility.onHitStatus].emoji} ${defAbility.name}! ${foeName} ติด${STATUS[defAbility.onHitStatus].name}!`;
  }
  if (active.hp <= 0 && active.ind.held === 'focus-sash' && !active.sashUsed && wasFull) {
    active.hp = 1; active.sashUsed = true;
    b.msg += ` · 🎗️ ${aMon.name} ยึด Focus Sash รอดมาได้!`;
  }
  if (b.foeHeld === 'kings-rock' && Math.random() < 0.1) { active.flinched = true; b.msg += ` · 👑 ${view.name} สะดุ้ง!`; }
  if (active.ind.held === 'rocky-helmet') {   // Rocky Helmet: ผู้เล่นสะท้อนดาเมจกลับศัตรู
    const recoil = Math.max(1, Math.floor(b.foeMaxHp / 6));
    b.foeHp = Math.max(b.mode === 'wild' ? 1 : 0, b.foeHp - recoil);
    b.msg += ` · 🪨 ${foeName} โดน Rocky Helmet สะท้อน -${recoil}`;
    if (b.mode === 'wild' && currentSpawn) currentSpawn.hp = b.foeHp;
    if (b.foeHp <= 0) { onFoeDown(); return; }
  }
  if (b.foeHeld === 'shell-bell') {   // Shell Bell: ศัตรูฟื้น HP 1/8 ของดาเมจที่ทำ
    const heal = Math.max(1, Math.floor(dmg / 8));
    b.foeHp = Math.min(b.foeMaxHp, b.foeHp + heal);
    b.msg += ` · 🐚 ${foeName} ฟื้น ${heal}`;
  }
  if (active.hp <= 0) { faintActive(b, aMon); return; }
  checkSitrus(active, b);
}
function faintActive(b, aMon) {
  b.msg += ` · 😵 ${aMon.name} หมดแรง!`;
  if (state.settings && state.settings.hardcoreMode) {
    const t = b.team[b.activeIdx];
    if (t && t.ind && !t.hcDead) {
      t.hcDead = true;   // กันปล่อยซ้ำถ้าถูกเรียกซ้ำในเทิร์นเดียว
      state.caught = state.caught.filter(c => c.uid !== t.ind.uid);
      state.party = (state.party || []).filter(u => u !== t.ind.uid);
      state.buddyUid = state.party[0] || null;
      state.hardcoreDeaths = (state.hardcoreDeaths || 0) + 1;
      b.msg += ` · 💀 Hardcore: ${aMon.name} ถูกปล่อยถาวร!`;
      save();
    }
  }
  const next = b.team.findIndex(t => t.hp > 0);
  if (next < 0) {
    b.over = true; b.lost = true;
    if (b.mode === 'wild') { b.msg += ` · แต่โปเกมอนป่ายังเหลือ HP ${Math.ceil(b.foeHp)}`; }
    else if (b.mode === 'tower') {
      const lostFloor = b.floorNow;
      state.tower.floor = 1;   // แพ้ = รีเซ็ตกลับชั้น 1 (สถิติสูงสุดยังเก็บไว้)
      state.towerReadyAt = Date.now() + TOWER_CD;   // คูลดาวน์ 12 ชม.
      b.msg += ` · 🗼 แพ้ที่ชั้น ${lostFloor}! หอคอยรีเซ็ตกลับชั้น 1 + คูลดาวน์ 12 ชม. (สถิติสูงสุด ${state.tower.bestFloor || 0})`;
      save();
    } else {
      b.msg += ' · แพ้! ลองใหม่';
      if (b.isRival) { state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 }; state.rival.losses = (state.rival.losses || 0) + 1; save(); }
      if (b.isLeague && b.league) { state.megaLeague = state.megaLeague || {}; state.megaLeague.cooldowns = state.megaLeague.cooldowns || {}; state.megaLeague.cooldowns[b.league.id] = Date.now() + MEGA_LEAGUE_CD; b.msg += ` · 💎 แพ้บอสลีค! คูลดาวน์ 2 ชม.`; save(); }
      if (b.isRaid) {   // ทีมล้มไม่ทันฆ่า Raid บอส — ความเสียหายที่ทำได้ยังสมทบเข้ากองกลาง
        const dmgDealt = Math.max(0, b.foeMaxHp - b.foeHp);
        b.msg += ` · 👹 ทีมหมดแรง! ส่งความเสียหาย ${dmgDealt.toLocaleString()} เข้ากองกลาง Raid`;
        raidSubmitDamage(dmgDealt);
      }
    }
  } else { b.activeIdx = next; b.msg += ` ส่ง ${MON_BY_ID[b.team[next].ind.id].name} ลงสนาม!${applyIntimidate('player', b)}`; }
}
// นับถอยหลังไดนาแม็กซ์ — เรียกทุกครั้งที่ผู้เล่นขยับ (ไม่ว่าผลจะเป็นอย่างไร กันเทิร์นหลุดตอน KO ทันที)
function tickDynamax(active, b) {
  if (active && active.hp > 0 && active.dynamax) {
    active.dynamax.turnsLeft--;
    if (active.dynamax.turnsLeft <= 0) revertDynamax(active, b);
  }
}
function endRound(b) {
  if (b.over) return;
  const a = b.team[b.activeIdx];
  const w = WEATHERS[getWeather(state.region)];
  if (w.dotImmune && a && a.hp > 0) {   // ดาเมจสภาพอากาศ (พายุทราย/หิมะ) ใส่ฝ่ายเรา ถ้าธาตุไม่ต้าน
    const aTypes = activeMonView(a).types;
    if (!aTypes.some(t => w.dotImmune.includes(t))) {
      const d = Math.max(1, Math.floor(a.maxHp / 16));
      a.hp = Math.max(0, a.hp - d);
      b.msg += ` · ${w.emoji} ${MON_BY_ID[a.ind.id].name} โดน${w.name}ซัด -${d}`;
      if (a.hp <= 0) faintActive(b, MON_BY_ID[a.ind.id]);
    }
  }
  if (!b.over && w.dotImmune && b.foeHp > 0) {   // ดาเมจสภาพอากาศใส่ฝ่ายศัตรู
    const foeTypesNow = b.foeTypes || b.foeMon.types;
    if (!foeTypesNow.some(t => w.dotImmune.includes(t))) {
      const d = Math.max(1, Math.floor(b.foeMaxHp / 16));
      b.foeHp = Math.max(b.mode === 'wild' ? 1 : 0, b.foeHp - d);
      b.msg += ` · ${w.emoji} ${b.foeDisplayName || b.foeMon.name} โดน${w.name}ซัด -${d}`;
      if (b.mode === 'wild' && currentSpawn) currentSpawn.hp = b.foeHp;
      if (b.foeHp <= 0) onFoeDown();
    }
  }
  if (b.over) return;
  if (a && a.hp > 0 && a.hp < a.maxHp && a.ind.held === 'leftovers') {   // Leftovers
    const heal = Math.max(1, Math.floor(a.maxHp / 16));
    a.hp = Math.min(a.maxHp, a.hp + heal); b.msg += ` · 🍖 ฟื้น ${heal}`;
  }
  if (a && a.hp > 0 && a.hp < a.maxHp && w === WEATHERS.snow) {   // Ice Body ฟื้นตอนหิมะโปรย
    const ab = abilityFor(a.ind.id);
    if (ab && ab.name === 'Ice Body') { const heal = Math.max(1, Math.floor(a.maxHp / 16)); a.hp = Math.min(a.maxHp, a.hp + heal); b.msg += ` · ❄️ Ice Body! ฟื้น ${heal}`; }
  }
  if (a && a.hp > 0 && (a.status === 'burn' || a.status === 'poison')) {   // DoT ผู้เล่น
    const d = Math.max(1, Math.floor(a.maxHp * STATUS[a.status].dot));
    a.hp = Math.max(0, a.hp - d);
    b.msg += ` · ${STATUS[a.status].emoji} ${MON_BY_ID[a.ind.id].name} -${d}`;
    if (a.hp <= 0) faintActive(b, MON_BY_ID[a.ind.id]);
  }
  if (a && a.hp > 0) checkSitrus(a, b);
  if (!b.over && b.foeHp > 0 && b.foeHp < b.foeMaxHp && w === WEATHERS.snow) {   // Ice Body ฝั่งศัตรู
    const ab = abilityFor(b.foeMon.id);
    if (ab && ab.name === 'Ice Body') { const heal = Math.max(1, Math.floor(b.foeMaxHp / 16)); b.foeHp = Math.min(b.foeMaxHp, b.foeHp + heal); b.msg += ` · ❄️ Ice Body! ${b.foeDisplayName || b.foeMon.name} ฟื้น ${heal}`; if (b.mode === 'wild' && currentSpawn) currentSpawn.hp = b.foeHp; }
  }
  if (!b.over && b.foeHp > 0 && (b.foe.status === 'burn' || b.foe.status === 'poison')) {   // DoT ศัตรู
    const d = Math.max(1, Math.floor(b.foeMaxHp * STATUS[b.foe.status].dot));
    b.foeHp = Math.max(b.mode === 'wild' ? 1 : 0, b.foeHp - d);
    b.msg += ` · ${STATUS[b.foe.status].emoji} ${b.foeDisplayName || b.foeMon.name} -${d}`;
    if (b.mode === 'wild' && currentSpawn) currentSpawn.hp = b.foeHp;
    if (b.foeHp <= 0) onFoeDown();
  }
}
// ===== เทิร์นต่อเทิร์น: แสดงผลฝ่ายที่ไปก่อนให้เห็นก่อน แล้วค่อยแสดงฝ่ายที่สองหลังหน่วงเวลา (แทนที่จะโชว์รวดเดียวทั้งสองฝ่าย) =====
let battleBusy = false;   // ล็อกปุ่มระหว่างรอแสดงผลสเตจถัดไป กันกดซ้อนขณะรออนิเมชัน
const TURN_REVEAL_MS = 750;
const TURN_REVEAL_MS_FAST = 60;   // โหมดต่อสู้เร็ว — แทบไม่หน่วงเลย แต่ยังกันกดซ้อนได้
function revealTurns(b, stage1Msg, finishFn) {
  battleBusy = true;
  b.msg = stage1Msg;
  renderBattle();
  setTimeout(() => {
    if (battleState !== b) { battleBusy = false; return; }   // ปิด/ออกจากการต่อสู้ไปแล้วระหว่างรอ กันชนกัน
    battleBusy = false;
    finishFn();
  }, (state.settings && state.settings.fastBattle) ? TURN_REVEAL_MS_FAST : TURN_REVEAL_MS);
}
function battleAttack(moveIdx) {
  const b = battleState; if (!b || b.over || battleBusy) return;
  const active = b.team[b.activeIdx];
  const mon = MON_BY_ID[active.ind.id];
  const view = activeMonView(active);
  const isStruggle = moveIdx === -1;
  const mv = isStruggle ? STRUGGLE_MOVE : (getMoves(active.ind.id)[moveIdx] || getMoves(active.ind.id)[0]);
  b.msg = '';
  const gate = canAct(active);
  if (gate.note) b.msg += `${mon.name} ${gate.note} · `;
  const wasDynamaxed = !!active.dynamax;   // เช็คก่อน tick เพื่อใช้คำนวณโบนัสดาเมจของเทิร์นนี้
  tickDynamax(active, b);                  // เทิร์นผู้เล่นผ่านไปแล้ว นับถอยหลังเสมอไม่ว่าผลจะเป็นอย่างไร
  if (!gate.can) {                        // ผู้เล่นขยับไม่ได้ → เห็นสถานะก่อน แล้วค่อยเห็นเทิร์นศัตรู
    const stage1 = b.msg;
    revealTurns(b, stage1, () => {
      foeTurn(b); endRound(b);
      if (b.mode === 'wild' && currentSpawn) renderSpawn();
      save(); renderBattle();
    });
    return;
  }
  const foeTypesForDef = b.foeTypes || b.foeMon.types;
  const foeNameForMsg = b.foeDisplayName || b.foeMon.name;

  // ลำดับการโจมตี: ท่า priority สูงกว่าไปก่อนเสมอ ถ้าเท่ากันตัวที่ SPD สูงกว่าไปก่อน
  const aiCtx = { atkStats: b.foeStats, atkLevel: b.foeLevel, defStats: active.stats, targetHp: active.hp, targetStatus: active.status };
  const foeMvPreview = foeChooseMove(b.foeMon, view.types, aiCtx);
  const pPrio = mv.priority || 0, fPrio = foeMvPreview.priority || 0;
  let foeFirst = fPrio !== pPrio ? fPrio > pPrio : (b.foeStats.spd > active.stats.spd);
  const quickClawSave = foeFirst && active.ind.held === 'quick-claw' && Math.random() < 0.2;   // Quick Claw: 20% แซงคิวได้แม้ช้ากว่า
  if (quickClawSave) { foeFirst = false; b.msg += `🍀 Quick Claw! ${view.name} แซงคิวโจมตีก่อน! · `; state._quickClawSaved = true; }

  function playerHalf() {   // คืนค่า true ถ้าเทิร์นจบทันที (KO/ป่าอ่อนแรงสุดขีด) ไม่ต้องรอศัตรูตอบโต้
    if (!isStruggle && active.pp && moveIdx >= 0) active.pp[moveIdx] = Math.max(0, (active.pp[moveIdx] || 0) - 1);   // ใช้ PP เมื่อออกท่า (ไม่ว่าจะโดนหรือพลาด)
    if (!rollHit(mv, active.ind.held, b.foeHeld, abilityFor(b.foeMon.id))) {
      b.msg += `${view.name} ใช้ ${mv.name}! แต่พลาดเป้า... 💨`;
      return false;
    }
    if (pPrio > 0) state._usedPriority = true;
    const atkAbility = abilityFor(active.ind.id), defAbility = abilityFor(b.foeMon.id);
    const foeWasFull = b.foeHp === b.foeMaxHp;
    const atk = calcDamage({ types: view.types }, statsWithStages(active.stats, active.stages), active.ind.level, { types: foeTypesForDef }, statsWithStages(b.foeStats, b.foe.stages), mv, active.ind.held,
      { atkAbility, defAbility, atkHpRatio: active.hp / active.maxHp, defHpRatio: b.foeHp / b.foeMaxHp, atkHasStatus: !!active.status });
    if (atk.crit) state._critHit = true;
    if (atk.weather) state._weatherHit = true;
    let dmg = atk.dmg;
    if (active.status === 'burn') dmg = Math.floor(dmg * 0.6);   // ไหม้ลดพลังโจมตี
    if (wasDynamaxed) dmg = Math.floor(dmg * DYNAMAX_DMG_MULT);   // โบนัสดาเมจไดนาแม็กซ์
    const koMode = b.mode !== 'wild';
    let sturdyMsg = '';
    if (defAbility && defAbility.name === 'Sturdy' && foeWasFull && dmg >= b.foeHp && b.mode !== 'wild') { dmg = b.foeHp - 1; sturdyMsg = ` · 🗿 ${foeNameForMsg} ทนอยู่ด้วย Sturdy!`; }
    b.foeHp = Math.max(koMode ? 0 : 1, b.foeHp - dmg);
    b._fx = Object.assign(b._fx || {}, { foe: { dmg, crit: atk.crit, eff: atk.eff } });
    b.msg += `${view.name} ใช้ ${mv.name}! ${atk.crit ? '🎯 คริติคอล! ' : ''}${atk.weather ? '🌦️ อากาศช่วย! ' : ''}-${dmg}${atk.eff > 1 ? ' (ได้เปรียบ!)' : atk.eff < 1 ? ' (เสียเปรียบ)' : ''}${sturdyMsg}`;
    if (isStruggle) {   // ดิ้นรน: บาดเจ็บตัวเอง 1/4 HP
      const recoil = Math.max(1, Math.floor(active.maxHp / 4));
      active.hp = Math.max(0, active.hp - recoil);
      b._fx = Object.assign(b._fx || {}, { me: { dmg: recoil, crit: false, eff: 1 } });
      b.msg += ` · ↩️ ดิ้นรนบาดเจ็บ -${recoil}`;
      if (active.hp <= 0) { faintActive(b, mon); if (b.over) return true; }
    }
    b.msg += tryInflict(mv, b.foe, foeTypesForDef, foeNameForMsg, defAbility, atkAbility);
    b.msg += applyStatFx(mv, active.stages, b.foe.stages, view.name, foeNameForMsg, atkAbility, defAbility);
    if (defAbility && defAbility.onHitStatus && !b.foe.status && !active.status && Math.random() < defAbility.onHitChance
        && !(STATUS_IMMUNE[defAbility.onHitStatus] || []).some(t => view.types.includes(t))) {
      active.status = defAbility.onHitStatus; if (active.status === 'sleep') active.sleepT = rand(1, 3);
      b.msg += ` · ${STATUS[defAbility.onHitStatus].emoji} ${defAbility.name}! ${view.name} ติด${STATUS[defAbility.onHitStatus].name}!`;
    }
    if (active.ind.held === 'kings-rock' && Math.random() < 0.1) { b.foe.flinched = true; b.msg += ` · 👑 ${foeNameForMsg} สะดุ้ง!`; }
    if (b.foeHeld === 'rocky-helmet') {   // Rocky Helmet: ศัตรูสะท้อนดาเมจกลับ
      const recoil = Math.max(1, Math.floor(active.maxHp / 6));
      active.hp = Math.max(0, active.hp - recoil);
      b.msg += ` · 🪨 ${view.name} โดน Rocky Helmet สะท้อน -${recoil}`;
      if (active.hp <= 0) { faintActive(b, mon); if (b.over) return true; }
    }
    if (active.ind.held === 'shell-bell') {   // Shell Bell: ฟื้น HP 1/8 ของดาเมจที่ทำ
      const heal = Math.max(1, Math.floor(dmg / 8));
      active.hp = Math.min(active.maxHp, active.hp + heal);
      b.msg += ` · 🐚 ฟื้น ${heal}`;
    }
    if (b.mode === 'wild' && currentSpawn) currentSpawn.hp = b.foeHp;
    if (b.foeHp <= 0) { onFoeDown(); return true; }
    if (b.mode === 'wild' && b.foeHp <= 1) {
      b.over = true;
      b.msg = `${b.foeMon.name} อ่อนแรงสุดขีด! รีบปาบอลเลย — จับง่ายสุด ✅`;
      gainXpTo(active.ind, Math.round(b.foeLevel)); gainTrainerXp(4);
      if (currentSpawn) renderSpawn();
      return true;
    }
    return false;
  }

  if (foeFirst) {
    foeTurn(b);
    const stage1 = b.msg;
    if (b.over || active.hp <= 0) {   // ผู้เล่นสลบก่อนจะได้โจมตี จบเทิร์นเลย
      revealTurns(b, stage1, () => {
        endRound(b);
        if (b.mode === 'wild' && currentSpawn) renderSpawn();
        save(); renderBattle();
      });
      return;
    }
    revealTurns(b, stage1, () => {
      b.msg = '';
      const ended = playerHalf();
      if (!ended) endRound(b);
      if (b.mode === 'wild' && currentSpawn) renderSpawn();
      checkAchievements(); save(); renderBattle();
    });
    return;
  }

  const ended = playerHalf();
  if (ended) { checkAchievements(); save(); renderBattle(); return; }   // จบเทิร์นทันที ไม่มีฝ่ายสองให้รอ
  checkAchievements();
  const stage1 = b.msg;
  revealTurns(b, stage1, () => {
    b.msg = '';
    foeTurn(b);
    b.msg = b.msg.replace(/^\s*·\s*/, '');   // ตัด " · " นำหน้าที่เหลือจากการขึ้นสเตจใหม่
    endRound(b);
    if (b.mode === 'wild' && currentSpawn) renderSpawn();
    save(); renderBattle();
  });
}
function battleSwitch(idx) {
  const b = battleState; if (!b || b.over || battleBusy || idx === b.activeIdx) return;
  const t = b.team[idx];
  if (!t || t.hp <= 0) { toast('ตัวนี้หมดแรงแล้ว', 'bad'); return; }
  const outgoing = b.team[b.activeIdx];
  const regenMsg = applyRegenerator(outgoing);   // Regenerator: ฟื้น HP ให้ตัวที่ออกก่อนรีเซ็ตสเตตัส
  outgoing.stages = freshStages();   // สลับตัวออก = สเตตัสที่เปลี่ยนไว้รีเซ็ต แบบเกมจริง
  b.activeIdx = idx;
  const stage1 = `สลับมา ${MON_BY_ID[t.ind.id].name}!${regenMsg}${applyIntimidate('player', b)}`;
  revealTurns(b, stage1, () => {                       // สลับตัวเสียเทิร์น ศัตรูโจมตีก่อน
    b.msg = '';
    foeTurn(b);
    b.msg = b.msg.replace(/^\s*·\s*/, '');
    endRound(b);
    save(); renderBattle();
  });
}
function onFoeDown() {
  const b = battleState;
  const active = b.team[b.activeIdx];
  if (b.mode === 'tower') {
    const floor = b.floorNow;
    gainXpTo(active.ind, Math.round(b.foeLevel * 1.3)); gainTrainerXp(10 + floor);
    const coins = 80 + floor * 30;
    state.coins += coins;
    const bp = 6 + Math.floor(floor / 2);
    state.battlePoints = (state.battlePoints || 0) + bp;
    let itemMsg = '';
    if (b.special) {   // ชั้นบอส การันตีไอเทมดี
      const roll = Math.random();
      if (roll < 0.35) { state.balls.ultra = (state.balls.ultra || 0) + 1; itemMsg = '🟡×1'; }
      else if (roll < 0.6) { state.candies = (state.candies || 0) + 1; itemMsg = '🍬×1'; }
      else if (roll < 0.85) { state.lockboxes = (state.lockboxes || 0) + 1; itemMsg = '🎁×1'; }
      else { state.berries.golden = (state.berries.golden || 0) + 1; itemMsg = '🥭×1'; }
    } else if (Math.random() < 0.3) { state.balls.great = (state.balls.great || 0) + 1; itemMsg = '🔵×1'; }
    if (floor % 20 === 0 && Math.random() < HELD_DROP_CHANCE) {   // ทุก 20 ชั้น มีโอกาส 5% ดรอปอุปกรณ์สวมใส่
      const h = grantRandomHeld(); itemMsg = (itemMsg ? itemMsg + ' + ' : '') + '🎽 ' + h;
    }
    if (b.special) {   // ชั้นบอสเท่านั้น — โอกาสหายากได้ Amulet Coin
      const amuletMsg = grantAmuletDrop();
      if (amuletMsg) itemMsg = (itemMsg ? itemMsg + ' + ' : '') + amuletMsg;
    }
    const swapMsg = grantSwapTicketDrop();   // ทุกชั้น — โอกาสหายากได้ตั๋ว Swap
    if (swapMsg) itemMsg = (itemMsg ? itemMsg + ' + ' : '') + swapMsg;
    if (Math.random() < 0.25) { itemMsg = (itemMsg ? itemMsg + ' + ' : '') + grantRandomBall(); }   // 25% ดรอปบอลพิเศษนอกร้าน
    if (floor > (state.tower.bestFloor || 0)) state.tower.bestFloor = floor;
    state.tower.floor = floor + 1;
    b.over = true; b.towerCleared = true;
    b.msg = `🏆 ผ่านชั้น ${floor}${b.special ? ' (บอส!)' : ''}! +${coins}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''}`;
    logMsg(`🗼 ผ่านหอคอยชั้น ${floor}! +${coins}🪙`, 'big');
    playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
    return;
  }
  if (b.mode === 'trainer') {
    const downed = b.foeMon.name;
    gainXpTo(active.ind, Math.round(b.foeLevel * 1.5)); gainTrainerXp(15);
    b.foeIdx++;
    if (b.foeIdx < b.foeQueue.length) {
      loadFoe(b, b.foeQueue[b.foeIdx]);
      b.msg = `${downed} ล้ม! ${b.gym.emoji} ${b.gym.name} ส่ง ${b.foeMon.name} Lv.${b.foeLevel} ลงต่อ! (เหลือ ${b.foeQueue.length - b.foeIdx})${applyIntimidate('foe', b)}`;
      return;   // ยังไม่จบ สู้ตัวต่อไป
    }
    b.over = true;
    if (b.isRegionBoss && b.bossData) {   // ชนะบอสประจำเขต (ทีม 6 ตัว IV/เลเวลสูงสุด + เมก้า)
      const first = !state.badges[b.bossData.region.id];
      state.badges[b.bossData.region.id] = true;
      const baseReward = 500 + trainerLevel() * 20;
      const reward = first ? baseReward : Math.round(baseReward * 0.3);
      const bp = first ? 40 : 15;
      state.coins += reward; state.battlePoints = (state.battlePoints || 0) + bp;
      if (first) state.balls.ultra = (state.balls.ultra || 0) + 3;
      const ballDrop = grantRandomBall();
      const amuletMsg = grantAmuletDrop();
      gainTrainerXp(100);
      b.victory = { trainerKey: foeTrainerName(b), emoji: b.gym.emoji, title: b.gym.name, coins: reward, bp, xp: 100, items: (first ? '🟡 Ultra Ball ×3 ' : '') + ballDrop + (amuletMsg ? ' ' + amuletMsg : ''), bonus: first ? '🏅 เหรียญตราประจำเขต!' : 'ชนะซ้ำ — รางวัลลดลง' };
      b.msg = `🏆 ชนะ${b.gym.name}! +${reward}🪙 +${bp}🎖️BP`;
      logMsg(`🏆 ชนะบอสเขต <b>${b.bossData.region.name}</b>! +${reward}🪙`, 'big');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    if (b.isLeague && b.league) {   // ชนะบอสลีคเมก้า — การันตีหินเมก้า + ไข่ทอง + อุปกรณ์ + เงิน
      const lg = b.league;
      const stoneMsg = grantMegaStone(lg.stone);
      state.eggs.push({ kind: 'gold', progressStart: state.totalCaught });
      const heldMsg = grantRandomHeld();
      const coins = 3000 + trainerLevel() * 40;
      state.coins += coins;
      const bp = 30;
      state.battlePoints = (state.battlePoints || 0) + bp;
      gainXpTo(active.ind, 100); gainTrainerXp(120);
      state.megaLeague = state.megaLeague || {}; state.megaLeague.beaten = state.megaLeague.beaten || {};
      state.megaLeague.beaten[lg.id] = true;
      b.victory = { trainerKey: foeTrainerName(b), emoji: '💎', title: lg.name, coins, bp, xp: 120, items: `💎 ${lg.stone} + 🥚✨ ไข่ทอง + 🎽 ${heldMsg}`, bonus: `ได้หินเมก้า ${lg.name}! (แนบให้โปเกมอนในหน้าตัวมันได้)` };
      b.msg = `💎 ชนะบอสลีค ${lg.name}! ได้ 💎 หินเมก้า + 🥚✨ ไข่ทอง + 🎽 ${heldMsg} + ${coins}🪙`;
      logMsg(`💎 พิชิตบอสลีค <b>${lg.name}</b>! ได้หินเมก้า ${lg.stone} + ไข่ทอง + ${heldMsg}`, 'big');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    if (b.isRaid) {   // ฆ่า Raid บอสได้เอง (หายากมาก HP สูงมาก แต่เป็นไปได้ถ้าทีมแข็งจริง) — เครดิตความเสียหายเต็ม maxHp
      const dmgDealt = b.foeMaxHp;
      const bonusCoins = 2000;
      state.coins += bonusCoins;
      state._raidBossKilled = true;
      gainTrainerXp(150);
      b.victory = { trainerKey: null, emoji: '👹', title: `Raid ${b.foeMon.name}`, coins: bonusCoins, bp: 0, xp: 150, items: '', bonus: `🔥 ฆ่า Raid บอสได้เอง! ส่งความเสียหาย ${dmgDealt.toLocaleString()} เข้ากองกลาง` };
      b.msg = `👹 พิชิต Raid บอส ${b.foeMon.name} ได้เอง! ส่งความเสียหาย ${dmgDealt.toLocaleString()} เข้ากองกลาง +${bonusCoins}🪙`;
      logMsg(`👹 ฆ่า Raid บอส <b>${b.foeMon.name}</b> ได้เองทั้งตัว!`, 'big');
      raidSubmitDamage(dmgDealt);
      playSfx('rare'); checkAchievements(); save(); renderTopbar();
      return;
    }
    if (b.isGhost) {   // ชนะทีมผู้เล่นออนไลน์ (Ghost)
      const g = b.gym;
      const bp = 6 + Math.floor(trainerLevel() / 2);
      state.coins += g.reward;
      state.battlePoints = (state.battlePoints || 0) + bp;
      state.ghostWins = (state.ghostWins || 0) + 1;
      gainTrainerXp(60);
      b.victory = { trainerKey: foeTrainerName(b), emoji: '👤', title: `${g.name} (ออนไลน์)`, coins: g.reward, bp, xp: 60, items: '', bonus: `ชนะทีมออนไลน์รวม ${state.ghostWins} ครั้ง` };
      b.msg = `👤 ชนะทีม ${g.name}! +${g.reward}🪙 +${bp}🎖️BP`;
      logMsg(`👤 ชนะ Ghost <b>${g.name}</b>! +${g.reward}🪙`, 'big');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    if (b.isRoute) {   // ชนะเทรนเนอร์เส้นทาง — รางวัลย่อม ไม่แตะ state ยิม/คู่แข่ง
      const g = b.gym;
      const bp = 4 + Math.floor(trainerLevel() / 3);
      state.coins += g.reward;
      state.battlePoints = (state.battlePoints || 0) + bp;
      state.routeWins = (state.routeWins || 0) + 1;
      const itemMsg = grantItemRewards(g.items);
      gainTrainerXp(40);
      b.victory = { trainerKey: foeTrainerName(b), emoji: g.emoji, title: g.name, coins: g.reward, bp, xp: 40, items: itemMsg, bonus: 'เทรนเนอร์เส้นทาง' };
      b.msg = `${g.emoji} ชนะ ${g.name}! +${g.reward}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''}`;
      logMsg(`${g.emoji} ชนะ <b>${g.name}</b>! +${g.reward}🪙`, '');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    if (b.isRival) {   // ชนะคู่แข่ง (แยกจากยิม ไม่แตะ state.gymsBeaten)
      state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 };
      state.rival.wins = (state.rival.wins || 0) + 1;
      const reward = b.gym.reward;
      const bp = 15 + Math.floor(trainerLevel() * 1.5);
      state.coins += reward;
      state.battlePoints = (state.battlePoints || 0) + bp;
      const itemMsg = grantItemRewards(b.gym.items);
      gainTrainerXp(80);
      state._rivalWon = true;
      b.victory = { trainerKey: foeTrainerName(b), emoji: '🔥', title: `คู่แข่ง ${RIVAL_NAME}`, coins: reward, bp, xp: 80, items: itemMsg, bonus: `ชนะรวม ${state.rival.wins} ครั้ง` };
      b.msg = `🔥 ชนะคู่แข่ง ${RIVAL_NAME}! +${reward}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''} (ชนะรวม ${state.rival.wins} ครั้ง)`;
      logMsg(`🔥 ชนะคู่แข่ง <b>${RIVAL_NAME}</b>! +${reward}🪙 +${bp}BP ${itemMsg}`, 'big');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    // ชนะยิม — รางวัลเต็มแค่ครั้งแรก กันฟาร์มยิมสูงๆ (โดยเฉพาะแชมป์ 16000🪙) ซ้ำไม่จำกัดจนเศรษฐกิจพัง
    const g = b.gym, first = !state.gymsBeaten[g.id];
    state.gymsBeaten[g.id] = true;
    const coinsEarned = first ? g.reward : Math.round(g.reward * 0.3);
    state.coins += coinsEarned;
    const bp = (GYMS.indexOf(g) + 1) * (first ? 20 : 8);
    state.battlePoints = (state.battlePoints || 0) + bp;
    let itemMsg = first ? grantItemRewards(g.items) : '';
    if (first) { state.fishTokens = (state.fishTokens || 0) + 8; state.lockboxes = (state.lockboxes || 0) + 1; }
    let heldDrop = '';
    if (Math.random() < HELD_DROP_CHANCE) { heldDrop = grantRandomHeld(); itemMsg = (itemMsg ? itemMsg + ' ' : '') + heldDrop; }   // 5% ดรอปอุปกรณ์สวมใส่
    if (Math.random() < 0.5) { itemMsg = (itemMsg ? itemMsg + ' ' : '') + grantRandomBall(); }   // 50% ดรอปบอลพิเศษนอกร้าน
    gainTrainerXp(150);
    b.victory = { trainerKey: foeTrainerName(b), emoji: g.emoji, title: g.name, coins: coinsEarned, bp, xp: 150, items: itemMsg, bonus: (first ? '🎁 กล่องสุ่ม + 🎣 เหรียญตกปลา ×8 (ชนะครั้งแรก!)' : 'ชนะซ้ำ — รางวัลลดลง') + (heldDrop ? ` · 🎽 ดรอป ${heldDrop}!` : '') };
    b.msg = `🏆 ชนะ ${g.emoji} ${g.name}! +${coinsEarned}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''}${first ? ' +🎁กล่องสุ่ม (ชนะครั้งแรก!)' : ' (ชนะซ้ำ — รางวัลลดลง)'}`;
    logMsg(`🏆 พิชิต <b>${g.name}</b>! +${coinsEarned}🪙 +${bp}BP ${itemMsg}`, 'big');
    playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
    return;
  }
  b.over = true;
  if (b.isBoss) {
    const first = !state.badges[b.bossData.region.id];   // รางวัลเต็มแค่ครั้งแรก กันฟาร์มบอสซ้ำไม่จำกัด
    state.badges[b.bossData.region.id] = true;
    const baseReward = 200 + b.foeLevel * 10;
    const reward = first ? baseReward : Math.round(baseReward * 0.3);
    const bp = first ? 40 : 15;
    state.coins += reward;
    state.battlePoints = (state.battlePoints || 0) + bp;
    if (first) state.balls.ultra = (state.balls.ultra || 0) + 2;
    const bossBall = Math.random() < 0.6 ? grantRandomBall() : '';   // 60% ดรอปบอลพิเศษนอกร้าน
    gainXpTo(active.ind, Math.round(b.foeLevel * 2.5)); gainTrainerXp(80);
    b.victory = { trainerKey: foeTrainerName(b), emoji: '👑', title: `บอส ${b.foeMon.name}`, coins: reward, bp, xp: 80, items: (first ? '🟡 Ultra Ball ×2 ' : '') + bossBall, bonus: first ? '🏅 เหรียญตราประจำเขต!' : 'ชนะซ้ำ — รางวัลลดลง' };
    b.msg = `🏆 ชนะบอส ${b.foeMon.name}! ได้ 🏅 เหรียญตรา + ${reward}🪙 + ${bp}🎖️BP${first ? ' + Ultra Ball ×2' : ' (ชนะซ้ำ — รางวัลลดลง)'}`;
    logMsg(`🏆 ชนะบอสเขต <b>${b.bossData.region.name}</b>! +${reward}🪙 +${bp}BP`, 'big');
    playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
  } else {
    const xp = Math.round(b.foeLevel * 2);
    gainXpTo(active.ind, xp); gainTrainerXp(8);
    b.msg = `${b.foeMon.name} หมดแรงและหนีไป! (+${xp} XP)`;
    clearSpawn(); scheduleSpawn();
  }
}
function endBattle() {
  if (battleState && !battleState.over && battleBusy) return;   // กันกดหนีขณะรออนิเมชันเทิร์นอยู่
  const wasMode = battleState ? battleState.mode : null;
  // หนีหอคอยกลางคัน (ยังไม่จบ) = คูลดาวน์ 12 ชม. + รีเซ็ตชั้น (กันปั๊มเงินด้วยการเข้าๆ ออกๆ)
  if (battleState && wasMode === 'tower' && !battleState.over) {
    state.tower.floor = 1; state.towerReadyAt = Date.now() + TOWER_CD; save();
    toast('🗼 หนีหอคอย — คูลดาวน์ 12 ชม. + รีเซ็ตกลับชั้น 1', 'bad');
  }
  // หนี Raid กลางคัน — ความเสียหายที่ทำไปแล้วยังนับเข้ากองกลาง (ไม่เสียเปล่า)
  if (battleState && battleState.isRaid && !battleState.over) {
    raidSubmitDamage(Math.max(0, battleState.foeMaxHp - battleState.foeHp));
  }
  battleState = null;
  $('#battleModal').classList.add('hidden');
  if (wasMode === 'wild') { renderSpawn(); renderBerryBar(); }
  if (currentView === 'map') renderMap();
  if (currentView === 'menu') renderMenu();
  renderTopbar();
}
const GYM_CD = 60000, BOSS_CD = 60000;   // คูลดาวน์ท้ายิม/บอส กันสแปมกด (เสริมจากรางวัลลดลงตอนชนะซ้ำ)
function startBossBattle(regionId) {
  const left = (state.bossReadyAt || 0) - Date.now();
  if (left > 0) { toast(`⏳ รอท้าบอสพร้อมอีก ${Math.ceil(left / 1000)} วิ`, 'bad'); return; }
  const r = REGION_BY_ID[regionId];
  if (r.unlock && !state.unlocked[regionId]) { toast('🔒 ปลดล็อกเขตนี้ก่อน', 'bad'); return; }
  // เลือกบอส = ตัวระดับสูงสุดที่มีในเขต
  let bossMon = null;
  for (let i = TIER_ORDER.length - 1; i >= 0 && !bossMon; i--) {
    const p = r._byTier[TIER_ORDER[i]];
    if (p && p.length) bossMon = p.reduce((a, c) => c._bst > a._bst ? c : a, p[0]);
  }
  if (!bossMon) { toast('เขตนี้ยังไม่มีบอส', 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  state.bossReadyAt = Date.now() + BOSS_CD;
  // ทีมบอสประจำเขต: 6 ตัว · เวล 100 · IV max · มีร่างเมก้าปิดท้าย 1 ตัว (ท้าทายจริง)
  const strong = r._pool.filter(m => ['rare', 'superrare', 'legendary'].includes(m._tier));
  const usePool = strong.length ? strong : (r._pool.length ? r._pool : MONSTERS);
  const megaInRegion = usePool.filter(m => megaFormsFor(m.id));
  const megaId = megaInRegion.length ? pick(megaInRegion).id : pick(Object.keys(MEGA_FORMS).map(Number));
  const megaForm = pick(MEGA_FORMS[megaId]);
  const queue = [];
  for (let i = 0; i < 5; i++) queue.push(makeFoeDef(pick(usePool), 100, 1.15, true, 31));
  queue.push(makeMegaFoeDef(MON_BY_ID[megaId], megaForm, 100, 31));
  const team = buildBattleTeam(members);
  const bossGym = { id: 'rboss_' + regionId, name: `บอส${r.name}`, emoji: r.emoji, sprite: bossTrainerFor(regionId) };
  battleState = {
    mode: 'trainer', isBoss: false, isRegionBoss: true, bossData: { region: r }, gym: bossGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `${r.emoji} บอส${r.name} ท้าดวล! ทีม 6 ตัว เวล 100 IV สูงสุด`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
// โหลดศัตรูตัวถัดไปเข้า current-foe fields (ใช้ในโหมดเทรนเนอร์) — statMult ใช้บูสต์เอซ/บอสให้แรงขึ้นจริง
// giveHeld: true = สุ่มไอเทมถือให้ (ใช้กับเอซ/บอสเท่านั้น ให้ท้าทายขึ้นจริง ไม่ใช่แค่บวกสเตตัสเฉยๆ)
function makeFoeDef(mon, level, statMult, giveHeld, iv) {
  const base = statsForBase(mon.stats, level, iv || 16);   // iv=31 = IV max (บอส)
  const m = statMult || 1;
  const stats = { atk: Math.floor(base.atk * m), def: Math.floor(base.def * m), spatk: Math.floor(base.spatk * m), spdef: Math.floor(base.spdef * m), spd: Math.floor(base.spd * m) };
  const held = giveHeld ? pick(FOE_HELD_POOL) : null;
  if (held) applyFoeHeld(stats, held);
  return {
    mon, level, stats, held,
    maxHp: Math.floor(base.hp * m),
  };
}
// รางวัลไอเทมจากยิม/หอคอย — คืนข้อความสรุปไอเทมที่ได้
function grantItemRewards(list) {
  const msgs = [];
  (list || []).forEach(([key, qty]) => {
    if (key === 'candy') { state.candies = (state.candies || 0) + qty; msgs.push(`🍬×${qty}`); }
    else if (BERRIES[key]) { state.berries[key] = (state.berries[key] || 0) + qty; msgs.push(`${BERRIES[key].emoji}×${qty}`); }
    else if (BALLS[key]) { state.balls[key] = (state.balls[key] || 0) + qty; msgs.push(`${BALLS[key].emoji}×${qty}`); }
  });
  return msgs.join(' ');
}
function loadFoe(b, def) {
  b.foeMon = def.mon; b.foeLevel = def.level; b.foeStats = def.stats;
  b.foeMaxHp = def.maxHp; b.foeHp = def.maxHp; b.foeHeld = def.held || null;
  // ฟิลด์ร่างพิเศษ (เมก้า/G-Max) — ตั้งถ้ามี ไม่มีก็เคลียร์ (กันค่าค้างจากตัวก่อนหน้า)
  b.foeTypes = def.foeTypes || null;
  b.foeSpriteId = def.foeSpriteId || null;
  b.foeDisplayName = def.foeDisplayName || null;
  b.special = def.special || null;
  b.foe = { status: null, sleepT: 0, stages: freshStages() };   // ศัตรูตัวใหม่ = สถานะ/สเตตัสเคลียร์
}
// สร้าง def ศัตรูร่างเมก้า (ใช้ในลีคเมก้า) — สเตตัสตามร่างเมก้าจริง + เก็บสไปรต์/ธาตุ/ชื่อ
function makeMegaFoeDef(mon, form, level, iv) {
  const ms = statsForBase(form.stats, level, iv || 16);
  const stats = { atk: ms.atk, def: ms.def, spatk: ms.spatk, spdef: ms.spdef, spd: ms.spd };
  const held = pick(FOE_HELD_POOL); applyFoeHeld(stats, held);
  return { mon, level, stats, maxHp: Math.floor(ms.hp * 1.25), held,
    foeTypes: form.types, foeSpriteId: form.spriteId, foeDisplayName: form.name, special: 'mega' };
}
// ศัตรูร่างไดนาแม็กซ์/G-Max (ใช้ในลีค) — HP บวมมาก
function makeGmaxFoeDef(mon, level, iv) {
  const base = statsForBase(mon.stats, level, iv || 16);
  const stats = { atk: base.atk, def: base.def, spatk: base.spatk, spdef: base.spdef, spd: base.spd };
  const held = pick(FOE_HELD_POOL); applyFoeHeld(stats, held);
  const g = gmaxFormFor(mon.id);
  return { mon, level, stats, maxHp: Math.floor(base.hp * 1.9), held,
    foeTypes: mon.types, foeSpriteId: g ? g.spriteId : mon.id, foeDisplayName: (g ? g.name : 'Dynamax ' + mon.name), special: 'gmax' };
}
function startTrainerBattle(gymId) {
  const left = (state.gymReadyAt || 0) - Date.now();
  if (left > 0) { toast(`⏳ รอท้ายิมพร้อมอีก ${Math.ceil(left / 1000)} วิ`, 'bad'); return; }
  const g = GYMS.find(x => x.id === gymId); if (!g) return;
  const idx = GYMS.indexOf(g);
  const prevBeaten = idx === 0 || state.gymsBeaten[GYMS[idx - 1].id];
  if (!prevBeaten) { toast('🔒 ต้องชนะยิมก่อนหน้าก่อน', 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  state.gymReadyAt = Date.now() + GYM_CD;
  // สร้างทีมศัตรูจากธาตุยิม + เอนไปทางระดับหายากตาม tierBias (ยิมสูง = ศัตรูแรงจริง ไม่ใช่สุ่มมั่วๆ)
  const typePool = g.type ? MONSTERS.filter(m => m.types.includes(g.type)) : MONSTERS.filter(m => m._tier === 'superrare' || m._tier === 'legendary');
  const tierPool = (g.tierBias && g.tierBias.length) ? typePool.filter(m => g.tierBias.includes(m._tier)) : typePool;
  const pool = tierPool.length ? tierPool : (typePool.length ? typePool : MONSTERS);
  const gymCount = Math.max(g.count, 6);   // ยิมทีมเต็ม 6 ตัว (บอทเก่งขึ้น)
  const queue = [];
  for (let i = 0; i < gymCount; i++) {
    const isAce = i === gymCount - 1;
    const mon = pick(pool);
    const lv = clamp(g.lvl + rand(-2, 3) + (isAce ? 6 : 0), 1, 100);   // เอซ (ตัวสุดท้าย) เลเวลสูง+สเตตัสบูสต์ 25%+ไอเทมถือ
    queue.push(makeFoeDef(mon, lv, isAce ? 1.3 : 1.1, isAce));   // แรงขึ้น
  }
  const team = buildBattleTeam(members);
  battleState = {
    mode: 'trainer', isBoss: false, gym: g, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `${g.emoji} ${g.name} — ศัตรู ${gymCount} ตัว! เลือกท่าโจมตี`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}

// ================================================================
//  คู่แข่งประจำตัว (Rival) — แยกจากยิม สเกลตามเลเวลเทรนเนอร์ ท้าซ้ำได้เรื่อยๆ
// ================================================================
const RIVAL_NAME = 'อาคาสึกิ';
const RIVAL_CD = 5 * 60000;   // ท้าได้ทุก 5 นาที
const RIVAL_TEAM_POOL = MONSTERS.filter(m => m.types.includes('fire') || m.types.includes('dragon'));
function rivalReadyLeft() {
  state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 };
  return Math.max(0, state.rival.readyAt - Date.now());
}
function startRivalBattle() {
  state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 };
  if (rivalReadyLeft() > 0) { toast(`⏳ รอคู่แข่งพร้อมอีก ${Math.ceil(rivalReadyLeft() / 1000)} วิ`, 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  state.rival.readyAt = Date.now() + RIVAL_CD;
  bumpQuest('rivalBattle');
  const tl = trainerLevel();
  const rivalLvl = clamp(10 + tl * 3, 10, 100);
  const pool = RIVAL_TEAM_POOL.length ? RIVAL_TEAM_POOL : MONSTERS;
  const count = 6;   // คู่แข่งทีมเต็ม 6 ตัว เก่งขึ้น
  const queue = [];
  for (let i = 0; i < count; i++) {
    const isAce = i === count - 1;
    const mon = pick(pool);
    const lv = clamp(rivalLvl + rand(-2, 3) + (isAce ? 5 : 0), 1, 100);
    queue.push(makeFoeDef(mon, lv, isAce ? 1.35 : 1.15, isAce));   // แรงขึ้น
  }
  const team = buildBattleTeam(members);
  const rivalGym = { id: 'rival', name: `คู่แข่ง ${RIVAL_NAME}`, emoji: '🔥', reward: 300 + tl * 50, items: [['ultra', 2], ['candy', 2]] };
  battleState = {
    mode: 'trainer', isBoss: false, isRival: true, gym: rivalGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `🔥 คู่แข่ง ${RIVAL_NAME} ท้าดวล! ทีม ${count} ตัว!`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
function renderRival() {
  const box = $('#rivalBox'); if (!box) return;
  state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 };
  const left = Math.max(0, Math.ceil(rivalReadyLeft() / 1000));
  const tl = trainerLevel();
  const rw = state.rival.wins || 0, rl = state.rival.losses || 0;
  box.innerHTML = `<div class="rival-card">
    <div class="rival-portrait">${trainerImg(TRAINER_SPRITES.rival, 'rival-tr')}<span class="rival-emoji">🔥</span></div>
    <div class="rival-info">
      <div class="rival-name">🔥 ${RIVAL_NAME}</div>
      <div class="rival-stat">Lv.~${clamp(10 + tl * 3, 10, 100)} · 🏆 ชนะ ${rw} · 💀 แพ้ ${rl}</div>
    </div>
    <button class="claim-btn" id="btnRival" ${left > 0 ? 'disabled' : ''}>${left > 0 ? `รอ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'ท้าดวล'}</button>
  </div>`;
  const btn = $('#btnRival'); if (btn) btn.onclick = startRivalBattle;
}
function updateRivalCd() {
  if (!$('#rivalBox') || currentView !== 'menu') return;
  renderRival();
}
function updateCheckinCd() {
  const btn = $('#btnCheckin'); if (!btn || currentView !== 'menu') return;
  const left = checkinReadyLeft();
  if (left > 0) {
    btn.disabled = true; btn.classList.add('done');
    btn.textContent = `⏳ รอ ${Math.floor(left / 3600000)}ชม ${Math.floor((left % 3600000) / 60000)}น`;
  } else if (btn.disabled) {
    btn.disabled = false; btn.classList.remove('done'); btn.textContent = '📅 กดรับเช็คอินวันนี้!';
  }
}
// ================================================================
//  MEGA LEAGUE — บอสร่างเมก้า สุ่ม 5 ตัว/สัปดาห์ · ชนะได้หินเมก้าของบอสนั้น
// ================================================================
const MEGA_LEAGUE_CD = 2 * 3600000;   // แพ้ = คูลดาวน์ 2 ชม.
function ensureMegaLeague() {
  const wk = weeklyEventKey();
  state.megaLeague = state.megaLeague || {};
  if (state.megaLeague.week === wk && Array.isArray(state.megaLeague.bosses) && state.megaLeague.bosses.length) return;
  // สุ่ม 5 บอสจากทุกสายพันธุ์ที่มีร่างเมก้า (seed ตามสัปดาห์ — ทุกคนเจอชุดเดียวกัน + สุ่มวนหาครบทุกร่างได้)
  let seed = 0; for (const c of wk) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pool = Object.keys(MEGA_FORMS).map(id => +id).sort(() => rnd() - 0.5);
  state.megaLeague.bosses = pool.slice(0, 5).map((megaId, i) => {
    const forms = MEGA_FORMS[megaId];
    const form = forms[Math.floor(rnd() * forms.length)];   // สุ่มร่าง X/Y ถ้ามี
    return { id: 'ml' + megaId + '_' + i, megaId, formKey: form.key, stone: form.stone, name: form.name, spriteId: form.spriteId };
  });
  state.megaLeague.beaten = {};
  state.megaLeague.cooldowns = {};
  state.megaLeague.week = wk;
  save();
}
function startMegaLeagueBattle(bossId) {
  ensureMegaLeague();
  const boss = state.megaLeague.bosses.find(x => x.id === bossId);
  if (!boss) return;
  if (state.megaLeague.beaten[bossId]) { toast('✅ ชนะบอสนี้แล้วรอบนี้ (รอรีเซ็ตสัปดาห์หน้า)', ''); return; }
  const cdLeft = (state.megaLeague.cooldowns[bossId] || 0) - Date.now();
  if (cdLeft > 0) { toast(`⏳ แพ้บอสนี้ รออีก ${Math.ceil(cdLeft / 60000)} นาที`, 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const forms = MEGA_FORMS[boss.megaId];
  const form = forms.find(f => f.key === boss.formKey) || forms[0];
  const megaMon = MON_BY_ID[boss.megaId];
  // ทีมบอสลีค: 6 ตัว · เวล 100 · IV max · มอนสนับสนุน 4 + ไดนาแม็กซ์ 1 + เมก้า 1 (ปิดท้าย)
  const supPool = MONSTERS.filter(m => m.id !== boss.megaId && (m.types.some(t => form.types.includes(t)) || m._tier === 'superrare' || m._tier === 'legendary'));
  const gmaxMon = MON_BY_ID[pick(Object.keys(GMAX_FORMS).map(Number))];
  const queue = [];
  for (let i = 0; i < 4; i++) queue.push(makeFoeDef(pick(supPool.length ? supPool : MONSTERS), 100, 1.2, true, 31));
  queue.push(makeGmaxFoeDef(gmaxMon, 100, 31));   // ไดนาแม็กซ์ 1 ตัว
  queue.push(makeMegaFoeDef(megaMon, form, 100, 31));   // เมก้าปิดท้าย
  const team = buildBattleTeam(members);
  const leagueGym = { id: boss.id, name: boss.name, emoji: '💎', sprite: bossTrainerFor(boss.id) };
  battleState = {
    mode: 'trainer', isBoss: false, isLeague: true, league: boss, gym: leagueGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `💎 ลีคเมก้า: ${boss.name} ท้าดวล! ทีมเวล 100`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
function renderMegaLeague() {
  const box = $('#megaLeagueBox'); if (!box) return;
  ensureMegaLeague();
  const ml = state.megaLeague;
  const daysLeft = weeklyEventDaysLeft();
  box.innerHTML = `<div class="sr-sub" style="margin-bottom:8px">บอสร่างเมก้า 5 ตัว (ทีมเวล 100) · ชนะได้ 💎 หินเมก้าของบอสนั้น + 🥚✨ ไข่ทอง + 🎽 อุปกรณ์ + เงิน · สุ่มบอสใหม่ทุกสัปดาห์ (เหลือ ${daysLeft} วัน) · แพ้ = คูลดาวน์ 2 ชม.</div>` +
    ml.bosses.map(b => {
      const beaten = ml.beaten[b.id];
      const cdLeft = Math.max(0, Math.ceil(((ml.cooldowns[b.id] || 0) - Date.now()) / 60000));
      const btn = beaten ? `<button class="claim-btn done" disabled>ชนะแล้ว ✓</button>`
        : cdLeft > 0 ? `<button class="claim-btn" disabled>รอ ${cdLeft} น.</button>`
          : `<button class="claim-btn" data-league="${b.id}">ท้าสู้</button>`;
      return `<div class="ghost-row">
        <span>${spriteImg(b.spriteId, false, 'roster-mini')}</span>
        <div class="ghost-info"><div class="ghost-name">💎 ${b.name}</div><div class="sr-sub">รางวัล: หิน ${b.stone}</div></div>
        ${btn}</div>`;
    }).join('');
  box.querySelectorAll('[data-league]').forEach(el => el.onclick = () => startMegaLeagueBattle(el.dataset.league));
}

// ================================================================
//  หอคอยไต่ระดับ (Battle Tower) — ยิ่งสูงยิ่งยาก ของยิ่งดี
//  ไม่ฮีลระหว่างชั้น (HP ค้างจากชั้นก่อน) · แพ้ = รีเซ็ตกลับชั้น 1 · ทุก 5 ชั้นเจอบอส
//  ชั้นสูงพอ: บอสอาจเป็นเมก้า/ไดนาแม็กซ์ (เฉพาะสายพันธุ์ที่มีร่างจริงเท่านั้น)
// ================================================================
const TOWER_BOSS_EVERY = 5;
const TOWER_MEGA_FLOOR = 20, TOWER_GMAX_FLOOR = 12;   // ต้องขึ้นสูงพอสมควรถึงจะเจอบอสร่างพิเศษ
const TOWER_CD = 12 * 3600000;   // แพ้/หนีหอคอย = คูลดาวน์ 12 ชม. (กันปั๊มเงิน)
function towerFoeDef(floor) {
  const lvl = clamp(18 + floor * 4, 18, 100);
  let tierPool;
  if (floor < 5) tierPool = ['common', 'uncommon'];
  else if (floor < 10) tierPool = ['uncommon', 'rare'];
  else if (floor < 20) tierPool = ['rare', 'superrare'];
  else tierPool = ['superrare', 'legendary'];
  const isMegaFloor = floor % 10 === 0;   // ทุก 10 ชั้น = บอสร่างเมก้าแน่นอน
  const isBossFloor = floor % TOWER_BOSS_EVERY === 0;
  let mon, special = null;
  if (isMegaFloor) {
    mon = MON_BY_ID[pick(Object.keys(MEGA_FORMS).map(Number))];   // เลือกมอนที่มีร่างเมก้า
    special = 'mega';
  } else {
    const pool = MONSTERS.filter(m => tierPool.includes(m._tier));
    mon = pick(pool.length ? pool : MONSTERS);
    if (isBossFloor) {
      if (floor >= TOWER_GMAX_FLOOR && gmaxFormFor(mon.id) && Math.random() < 0.7) special = 'gmax';
      else special = 'elite';
    }
  }
  const held = (isBossFloor || isMegaFloor) ? pick(FOE_HELD_POOL) : null;
  return { mon, lvl, isBossFloor: isBossFloor || isMegaFloor, special, held };
}
// เซ็ตศัตรูของชั้นนี้ลงใน battleState (ทับของเดิม แต่ทีมผู้เล่น/HP เดิมยังอยู่ — นี่คือความท้าทายของหอคอย)
function applyTowerFoeToBattle(b, def, floor) {
  const foeBase = statsForWild(def.mon, def.lvl);
  let statMult = 1.1 + Math.min(floor, 40) * 0.015;   // แรงขึ้นเรื่อยๆ ตามชั้น
  if (def.isBossFloor) statMult *= 1.35;
  let types = def.mon.types, spriteId = def.mon.id, name = def.mon.name;
  let fStats, fMaxHp;
  if (def.special === 'mega') {
    const forms = megaFormsFor(def.mon.id);
    const form = pick(forms);
    const ms = statsForBase(form.stats, def.lvl);
    fStats = { atk: ms.atk, def: ms.def, spatk: ms.spatk, spdef: ms.spdef, spd: ms.spd };
    fMaxHp = Math.floor(ms.hp * 1.1);
    types = form.types; spriteId = form.spriteId; name = form.name;
  } else {
    fStats = { atk: Math.floor(foeBase.atk * statMult), def: Math.floor(foeBase.def * statMult), spatk: Math.floor(foeBase.spatk * statMult), spdef: Math.floor(foeBase.spdef * statMult), spd: Math.floor(foeBase.spd * statMult) };
    fMaxHp = Math.floor(foeBase.hp * statMult);
    if (def.special === 'gmax') {
      fMaxHp = Math.floor(fMaxHp * 1.8);
      const g = gmaxFormFor(def.mon.id);
      spriteId = g.spriteId; name = g.name;
    }
  }
  if (def.held) applyFoeHeld(fStats, def.held);
  b.foeMon = def.mon; b.foeLevel = def.lvl; b.foeStats = fStats; b.foeMaxHp = fMaxHp; b.foeHp = fMaxHp; b.foeHeld = def.held || null;
  b.foeTypes = types; b.foeSpriteId = spriteId; b.foeDisplayName = name; b.special = def.special;
  b.floorNow = floor; b.foe = { status: null, sleepT: 0, stages: freshStages() };
}
function startTowerBattle() {
  if (battleState && battleState.mode === 'tower' && !battleState.over) {
    $('#battleModal').classList.remove('hidden'); renderBattle(); return;   // กลับเข้าไปสู้ต่อที่ค้างไว้
  }
  const cdLeft = (state.towerReadyAt || 0) - Date.now();
  if (cdLeft > 0) { toast(`⏳ หอคอยคูลดาวน์อีก ${Math.ceil(cdLeft / 3600000 * 10) / 10} ชม. (แพ้/หนีต้องรอ 12 ชม.)`, 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const floor = state.tower.floor || 1;
  const def = towerFoeDef(floor);
  const team = buildBattleTeam(members);
  battleState = {
    mode: 'tower', isBoss: false, team, activeIdx: 0, over: false, lost: false,
    foeQueue: [{ mon: def.mon }], foeIdx: 0, usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),   // มีหน้า VS + ปุ่มปิด (ถอยก่อนเริ่มได้ ไม่โดนคูลดาวน์)
  };
  applyTowerFoeToBattle(battleState, def, floor);
  battleState.msg = `🗼 ชั้น ${floor}${def.isBossFloor ? ' (บอส!)' : ''} — ${battleState.foeDisplayName} Lv.${battleState.foeLevel} ท้าดวล!`;
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
function towerContinueClimb() {
  const b = battleState;
  if (!b || b.mode !== 'tower' || !b.towerCleared) return;
  const floor = state.tower.floor;
  const def = towerFoeDef(floor);
  const prevActiveIdx = b.activeIdx;
  applyTowerFoeToBattle(b, def, floor);
  b.over = false; b.towerCleared = false; b.lost = false;
  b.activeIdx = b.team.findIndex(t => t.hp > 0);
  b.usedMega = false; b.usedDynamax = false;   // ขึ้นชั้นใหม่ = ใช้เมก้า/ไดนาแม็กซ์ได้อีกครั้ง
  b.msg = `🗼 ชั้น ${floor}${def.isBossFloor ? ' (บอส!)' : ''} — ${b.foeDisplayName} Lv.${b.foeLevel} ท้าดวล!`;
  b.msg += applyIntimidate('foe', b);   // ศัตรูใหม่ทุกชั้นเสมอ
  if (b.activeIdx !== prevActiveIdx) b.msg += applyIntimidate('player', b);   // สลับตัวจริงเท่านั้นถึงเรียก Intimidate ฝั่งเรา
  renderBattle();
}

// ================================================================
//  MODAL / NAV
// ================================================================
function openModal() { $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

let currentView = 'home';
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  renderCurrentView();
}
function renderCurrentView() {
  if (currentView === 'map') renderMap();
  else if (currentView === 'dex') renderDex();
  else if (currentView === 'shop') renderShop();
  else if (currentView === 'quest') renderQuests();
  else if (currentView === 'menu') renderMenu();
  else if (currentView === 'home') renderRouteTrainer();
}

// ================================================================
//  CLOUD SAVE / LOGIN
// ================================================================
async function initCloud() {
  if (!(window.Cloud && Cloud.enabled)) { renderCloudUI(); return; }
  await Cloud.restoreSession();
  if (Cloud.loggedIn()) {
    const cloud = await Cloud.pull();
    if (cloud && cloud.data) applyCloudSave(cloud.data, true);
    else await Cloud.push(state);   // บัญชีใหม่ → ดันเซฟปัจจุบันขึ้น
    checkIncomingTrades();          // รับตัวที่เพื่อนส่งกลับจากเทรด
  }
  Cloud.onAuth(() => renderCloudUI());
  renderCloudUI();
}
function applyCloudSave(data, silent) {
  state = mergeSave(data);
  migrateSave();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  ensureDailyQuests(); fillDexFilter();
  renderRegionBanner(); renderTopbar(); renderBallBar(); clearSpawn(); scheduleSpawn(1500);
  renderCurrentView();
  if (!silent) toast('☁️ โหลดเซฟจากคลาวด์แล้ว', 'good');
}
async function cloudSignIn() {
  const email = ($('#clEmail').value || '').trim(), pw = $('#clPw').value || '';
  if (!email || !pw) { toast('กรอกอีเมล + รหัสผ่าน', 'bad'); return; }
  toast('⏳ กำลังเข้าสู่ระบบ...', '');
  const r = await Cloud.signIn(email, pw);
  if (r.error) { toast('❌ ' + r.error, 'bad'); return; }
  const cloud = await Cloud.pull();
  if (cloud && cloud.data) applyCloudSave(cloud.data, false);
  else { await Cloud.push(state); toast('✅ เข้าสู่ระบบ (ดันเซฟปัจจุบันขึ้นคลาวด์)', 'good'); }
  checkIncomingTrades();
  renderCloudUI();
}
async function cloudSignUp() {
  const email = ($('#clEmail').value || '').trim(), pw = $('#clPw').value || '';
  if (!email || pw.length < 6) { toast('อีเมลถูกต้อง + รหัสผ่าน ≥ 6 ตัว', 'bad'); return; }
  toast('⏳ กำลังสมัคร...', '');
  const r = await Cloud.signUp(email, pw);
  if (r.error) { toast('❌ ' + r.error, 'bad'); return; }
  if (r.needConfirm) { toast('📧 สมัครแล้ว! ยืนยันอีเมลก่อนเข้าสู่ระบบ', 'good'); renderCloudUI(); return; }
  await Cloud.push(state);
  toast('✅ สมัคร + ล็อกอินแล้ว เซฟขึ้นคลาวด์', 'good');
  renderCloudUI();
}
async function cloudSignOut() {
  await Cloud.signOut(); renderCloudUI(); toast('ออกจากระบบแล้ว (เซฟในเครื่องยังอยู่)', '');
}
// ================================================================
//  LEADERBOARD (กระดานจัดอันดับผ่านคลาวด์)
// ================================================================
let _lbTab = 'dex';
const LB_TABS = [
  { key: 'dex', label: '📖 เดกซ์', fmt: v => `${v}/${MONSTERS.length}` },
  { key: 'tower', label: '🗼 หอคอย', fmt: v => `ชั้น ${v}` },
  { key: 'caught', label: '🎯 จับรวม', fmt: v => `${v}` },
  { key: 'playtime', label: '⏱️ เวลาเล่น', fmt: v => `${Math.floor(v / 60)}ชม ${v % 60}น` },
  { key: 'hardcore', label: '💀 Hardcore', fmt: v => v > 0 ? `${v}/${MONSTERS.length}` : '—' },
];
function myLbScore() {
  // จำกัดค่าให้อยู่ในกรอบที่เป็นไปได้จริง กันการแก้เซฟส่งค่าเว่อร์ (กันโกงเบื้องต้นฝั่ง client)
  return {
    name: state.playerName || 'เทรนเนอร์',
    dex: clamp(speciesOwnedCount(), 0, MONSTERS.length),
    tower: clamp((state.tower && state.tower.bestFloor) || 0, 0, 999),
    caught: clamp(state.totalCaught || 0, 0, 9999999),
    playtime: clamp(Math.floor((state.playSec || 0) / 60), 0, 5259600),
    // เดกซ์ที่ทำได้ ถ้าเปิดโหมด Hardcore อยู่ตอนนี้ (0 = ไม่ได้เปิด/ไม่ขึ้นกระดานนี้)
    hardcore: state.settings && state.settings.hardcoreMode ? clamp(speciesOwnedCount(), 0, MONSTERS.length) : 0,
    team: myTeamSnapshot(),
  };
}
// สแนปช็อตทีมปัจจุบัน (ย่อ) สำหรับให้คนอื่นสู้แบบ Ghost Battle
function myTeamSnapshot() {
  return partyMembers().slice(0, 6).map(ind => ({ id: ind.id, level: ind.level, shiny: !!ind.shiny }));
}
function renderLeaderboard() {
  const box = $('#leaderboardBox'); if (!box) return;
  if (!(window.Cloud && Cloud.enabled)) {
    box.innerHTML = `<div class="sr-sub">ยังไม่ได้ตั้งค่าคลาวด์ — กระดานจัดอันดับใช้ไม่ได้ในโหมดออฟไลน์</div>`;
    return;
  }
  if (!Cloud.loggedIn()) {
    box.innerHTML = `<div class="sr-sub">เข้าสู่ระบบที่ส่วน "☁️ บัญชี / เซฟคลาวด์" ก่อน เพื่อส่งสถิติขึ้นกระดานและดูอันดับ</div>`;
    return;
  }
  const me = myLbScore();
  const tabs = LB_TABS.map(t => `<button class="lb-tab${t.key === _lbTab ? ' active' : ''}" data-lbtab="${t.key}">${t.label}</button>`).join('');
  box.innerHTML = `
    <div class="lb-name-row">
      <input class="save-io lb-name" id="lbName" maxlength="24" placeholder="ชื่อที่แสดงบนกระดาน" value="${(state.playerName || '').replace(/"/g, '&quot;')}" style="min-height:auto;padding:9px;font-family:inherit;font-size:13px;flex:1">
      <button class="set-btn" id="lbSubmit" style="flex:0 0 auto;background:var(--good);color:#062611">📤 ส่งสถิติ</button>
    </div>
    <div class="sr-sub" style="margin:4px 0 8px">สถิติของคุณ: 📖 ${me.dex}/${MONSTERS.length} · 🗼 ชั้น ${me.tower} · 🎯 ${me.caught} · ⏱️ ${Math.floor(me.playtime / 60)}ชม${me.hardcore ? ' · 💀 Hardcore' : ''}
      <a href="#" id="lbDelete" style="color:#ff8a95;margin-left:6px">ลบสถิติของฉัน</a></div>
    <div class="lb-tabs">${tabs}</div>
    <div id="lbList" class="lb-list"><div class="sr-sub">⏳ กำลังโหลด...</div></div>`;
  $('#lbSubmit').onclick = lbSubmit;
  $('#lbDelete').onclick = (e) => { e.preventDefault(); lbDelete(); };
  box.querySelectorAll('[data-lbtab]').forEach(el => el.onclick = () => { _lbTab = el.dataset.lbtab; renderLeaderboard(); });
  lbLoadList();
}
async function lbDelete() {
  if (!confirm('ลบสถิติของคุณออกจากกระดานจัดอันดับ? (ทีมสำหรับ Ghost Battle จะหายไปด้วย)')) return;
  toast('⏳ กำลังลบ...', '');
  const res = await Cloud.deleteMyScore();
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  toast('🗑️ ลบสถิติออกจากกระดานแล้ว', 'good');
  renderLeaderboard();
}
async function lbLoadList() {
  const list = $('#lbList'); if (!list) return;
  const tab = LB_TABS.find(t => t.key === _lbTab) || LB_TABS[0];
  const res = await Cloud.topScores(_lbTab, 20);
  if (!$('#lbList')) return;   // เปลี่ยนหน้าไปแล้ว
  if (res.error) {
    $('#lbList').innerHTML = `<div class="sr-sub">⚠️ ยังเปิดกระดานไม่ได้ — เจ้าของเกมต้องสร้างตาราง leaderboard ใน Supabase ก่อน (ดู CLOUD_SETUP.md)<br><span style="opacity:.6">${res.error}</span></div>`;
    return;
  }
  if (!res.rows.length) { $('#lbList').innerHTML = emptyState('🏆', 'ยังไม่มีใครส่งสถิติ', 'เป็นคนแรกเลย! ตั้งชื่อแล้วกดส่งสถิติด้านบน'); return; }
  const myName = state.playerName || 'เทรนเนอร์';
  $('#lbList').innerHTML = res.rows.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="lb-rank">${i + 1}</span>`;
    const mine = r.name === myName;
    return `<div class="lb-row${mine ? ' mine' : ''}"><span class="lb-medal">${medal}</span><span class="lb-nm">${escapeHtml(r.name || '—')}</span><span class="lb-sc">${tab.fmt(r[_lbTab] || 0)}</span></div>`;
  }).join('');
}
async function lbSubmit() {
  const nm = ($('#lbName').value || '').trim();
  if (!nm) { toast('ตั้งชื่อที่จะแสดงก่อน', 'bad'); return; }
  state.playerName = nm.slice(0, 24); save();
  toast('⏳ กำลังส่งสถิติ...', '');
  const res = await Cloud.submitScore(myLbScore());
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  toast('✅ ส่งสถิติ + ทีมขึ้นกระดานแล้ว!', 'good');
  renderLeaderboard();
}
// ================================================================
//  RAID บอสรายสัปดาห์ — ทุกคนช่วยกันตี บอสตัวเดียวกันทั้งเซิร์ฟเวอร์ สะสมความเสียหายผ่านคลาวด์
//  (HP บอสสูงมาก แทบไม่มีใครเก็บคนเดียวจบได้ — ต้องรวมพลังหลายคนตลอดสัปดาห์)
// ================================================================
const RAID_CD = 24 * 3600000;      // ตีได้วันละ 1 ครั้ง/คน กันคนเดียวปั๊มจบในวันเดียว ต้องช่วยกันข้ามวัน
const RAID_HP_MULT = 35;
const RAID_TARGET = 80000;         // เป้าหมายความเสียหายรวมของเซิร์ฟเวอร์ต่อสัปดาห์ (~7 เท่าของ HP บอส ให้กลุ่มเล็กๆ ก็ไปถึงได้จริงถ้าช่วยกันหลายวัน)
function raidBossForWeek() {   // deterministic ตามเลขสัปดาห์ — ทุกคนเจอบอสตัวเดียวกัน
  const n = new Date();
  const idx = (isoWeekNumber(n) + n.getUTCFullYear() * 7) % ALL_LEGENDARY.length;
  return ALL_LEGENDARY[idx];
}
function raidReadyLeft() { return Math.max(0, (state.raidReadyAt || 0) - Date.now()); }
function makeRaidFoeDef(mon) {
  const base = statsForBase(mon.stats, 100, 31);
  const stats = { atk: Math.floor(base.atk * 1.3), def: Math.floor(base.def * 1.3), spatk: Math.floor(base.spatk * 1.3), spdef: Math.floor(base.spdef * 1.3), spd: Math.floor(base.spd * 1.1) };
  return { mon, level: 100, stats, maxHp: Math.floor(base.hp * RAID_HP_MULT), held: null };
}
let _raidCache = null;   // แคชล่าสุด { total, top, mine, contributors } จากคลาวด์
function renderRaid() {
  const box = $('#raidBox'); if (!box) return;
  if (!(window.Cloud && Cloud.enabled)) { box.innerHTML = emptyState('👹', 'ต้องตั้งค่าคลาวด์ก่อน', 'Raid เป็นระบบร่วมมือหลายคนผ่านคลาวด์ — ดูวิธีตั้งค่าที่ CLOUD_SETUP.md'); return; }
  if (!Cloud.loggedIn()) { box.innerHTML = emptyState('👹', 'เข้าสู่ระบบก่อน', 'ไปที่ส่วน "☁️ บัญชี / เซฟคลาวด์" เพื่อเข้าสู่ระบบแล้วร่วม Raid กับผู้เล่นคนอื่น'); return; }
  const boss = raidBossForWeek();
  const left = raidReadyLeft();
  const daysLeft = weeklyEventDaysLeft();
  box.innerHTML = `
    <div class="rival-card" style="margin-bottom:8px">
      <div class="rival-portrait">${spriteImg(boss.id, false, 'rival-tr')}</div>
      <div class="rival-info">
        <div class="rival-name">👹 ${boss.name} (Raid ประจำสัปดาห์)</div>
        <div class="rival-stat">เหลืออีก ${daysLeft} วัน · ตีได้วันละ 1 ครั้ง · ความเสียหายที่ทำได้จะสะสมเข้ากองกลาง</div>
      </div>
    </div>
    <div id="raidProgress" class="sr-sub" style="margin-bottom:8px">⏳ กำลังโหลดความคืบหน้า...</div>
    <button class="rt-fight" id="raidFightBtn" style="width:100%" ${left > 0 ? 'disabled' : ''}>${left > 0 ? `รออีก ${Math.floor(left / 3600000)}ชม ${Math.floor((left % 3600000) / 60000)}น` : '⚔️ โจมตี Raid บอส!'}</button>`;
  const btn = $('#raidFightBtn'); if (btn) btn.onclick = startRaidBattle;
  raidLoadProgress();
}
async function raidLoadProgress() {
  const el = $('#raidProgress'); if (!el) return;
  const res = await Cloud.raidTotal(weeklyEventKey());
  if (!$('#raidProgress')) return;   // เปลี่ยนหน้าไปแล้ว
  if (res.error) { el.innerHTML = `⚠️ ยังใช้ไม่ได้ — เจ้าของเกมต้องสร้างตาราง raid_contrib ใน Supabase ก่อน (ดู CLOUD_SETUP.md)<br><span style="opacity:.6">${escapeHtml(res.error)}</span>`; return; }
  _raidCache = res;
  const pct = clamp(Math.round(res.total / RAID_TARGET * 100), 0, 100);
  const done = res.total >= RAID_TARGET;
  el.innerHTML = `รวมทั้งเซิร์ฟเวอร์: <b>${res.total.toLocaleString()}</b> / ${RAID_TARGET.toLocaleString()} (${pct}%) · ผู้ร่วม ${res.contributors} คน${res.mine ? ` · คุณทำไปแล้ว ${res.mine.toLocaleString()}` : ''}
    <div class="quest-bar" style="margin-top:6px"><div class="quest-fill" style="width:${pct}%"></div></div>
    ${done ? renderRaidClaim() : ''}`;
  const claimBtn = $('#raidClaimBtn'); if (claimBtn) claimBtn.onclick = raidClaimReward;
}
function renderRaidClaim() {
  const claimed = state.raidClaimedWeek === weeklyEventKey();
  return `<div style="margin-top:8px"><button class="claim-btn${claimed ? ' done' : ''}" id="raidClaimBtn" ${claimed ? 'disabled' : ''}>${claimed ? '✅ รับรางวัลแล้ว' : '🎁 รับรางวัลร่วมมือ!'}</button></div>`;
}
function raidClaimReward() {
  const key = weeklyEventKey();
  if (state.raidClaimedWeek === key) return;
  if (!_raidCache || _raidCache.total < RAID_TARGET) return;
  state.raidClaimedWeek = key;
  state.lockboxes = (state.lockboxes || 0) + 2;
  state.coins += 5000;
  state.checkinCoins = (state.checkinCoins || 0) + 20;
  save(); renderTopbar(); renderMenu();
  toast('🎉 ชุมชนพิชิต Raid! ได้ 🎁×2 + 5000🪙 + 20🗓️เช็คอิน', 'good');
  logMsg('👹 ชุมชนร่วมมือกันพิชิต Raid บอสประจำสัปดาห์สำเร็จ!', 'big');
}
function startRaidBattle() {
  const left = raidReadyLeft();
  if (left > 0) { toast(`⏳ รอโจมตี Raid อีก ${Math.ceil(left / 60000)} นาที`, 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const boss = raidBossForWeek();
  const def = makeRaidFoeDef(boss);
  const team = buildBattleTeam(members);
  const raidGym = { id: 'raid', name: `${boss.name} (Raid)`, emoji: '👹' };
  battleState = {
    mode: 'trainer', isBoss: false, isRaid: true, gym: raidGym, foeQueue: [def], foeIdx: 0,
    foeMon: def.mon, foeLevel: def.level, foeStats: def.stats, foeMaxHp: def.maxHp, foeHp: def.maxHp, foeHeld: def.held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `👹 Raid บอส ${boss.name}! HP มหาศาล — สู้จนสุดกำลัง ความเสียหายที่ทำได้จะสะสมเข้ากองกลาง`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
async function raidSubmitDamage(dmgDealt) {
  state.raidReadyAt = Date.now() + RAID_CD;
  if (dmgDealt > 0) { state.raidTotalDamage = (state.raidTotalDamage || 0) + dmgDealt; checkAchievements(); }
  save();   // คูลดาวน์นับตอนจบการโจมตี (ไม่ว่าผลจะเป็นยังไง)
  if (!(dmgDealt > 0) || !(window.Cloud && Cloud.enabled) || !Cloud.loggedIn()) return;
  const res = await Cloud.raidAddDamage(weeklyEventKey(), state.playerName || 'เทรนเนอร์', dmgDealt);
  if (res && res.ok) { toast(`👹 ส่งความเสียหายเข้ากองกลาง Raid: +${dmgDealt.toLocaleString()}`, 'good'); if (currentView === 'menu') renderRaid(); }
}
// ================================================================
//  GHOST BATTLE — สู้กับทีมของผู้เล่นคนอื่นแบบ AI (async PvP)
// ================================================================
let _ghostCache = null;
function renderGhostArena() {
  const box = $('#ghostBox'); if (!box) return;
  if (!(window.Cloud && Cloud.enabled)) { box.innerHTML = `<div class="sr-sub">ต้องตั้งค่าคลาวด์ก่อนถึงจะสู้ออนไลน์ได้</div>`; return; }
  if (!Cloud.loggedIn()) { box.innerHTML = `<div class="sr-sub">เข้าสู่ระบบก่อน (ส่วน "☁️ บัญชี / เซฟคลาวด์") แล้ว 📤 ส่งสถิติที่กระดานเพื่อลงทะเบียนทีม</div>`; return; }
  const myName = state.playerName || '(ยังไม่ตั้งชื่อ — ตั้งที่กระดานอันดับ)';
  box.innerHTML = `
    <div class="sr-sub" style="margin-bottom:6px">สู้กับทีมของผู้เล่นคนอื่นแบบ AI · ชนะได้เหรียญ + BP<br>(อย่าลืม 📤 ส่งสถิติที่กระดาน เพื่อให้ทีมคุณโผล่ให้คนอื่นสู้ด้วย)</div>
    <div class="trade-card" style="margin-bottom:8px">
      <div class="trade-h">🎯 ท้าเพื่อนเจาะจง (ใส่ชื่อเพื่อน)</div>
      <div class="sr-sub" style="margin-bottom:5px">ชื่อของคุณ: <b class="trade-code">${escapeHtml(myName)}</b> — บอกเพื่อนเพื่อให้เขาท้าคุณ</div>
      <div style="display:flex;gap:6px"><input class="save-io" id="ghostFriendName" maxlength="24" placeholder="ชื่อเพื่อน" style="min-height:auto;padding:9px;flex:1;font-family:inherit;font-size:13px"><button class="set-btn" id="ghostFriendBtn">ท้า!</button></div>
    </div>
    <button class="set-btn" id="ghostRefresh" style="width:100%;margin-bottom:8px">🔄 หาคู่สุ่ม</button>
    <div id="ghostList"></div>`;
  $('#ghostRefresh').onclick = ghostRefresh;
  $('#ghostFriendBtn').onclick = ghostChallengeFriend;
  if (_ghostCache) renderGhostList(_ghostCache);
}
async function ghostChallengeFriend() {
  const name = ($('#ghostFriendName').value || '').trim();
  if (!name) { toast('กรอกชื่อเพื่อนก่อน', 'bad'); return; }
  toast('⏳ กำลังหาเพื่อน...', '');
  const res = await Cloud.ghostByName(name);
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  if (res.own) { toast('นี่คือชื่อของคุณเอง', 'bad'); return; }
  if (!res.ghost) { toast('ไม่พบเพื่อนชื่อนี้ (ต้องส่งสถิติ+ทีมที่กระดานก่อน)', 'bad'); return; }
  startGhostBattle(res.ghost);
}
async function ghostRefresh() {
  const list = $('#ghostList'); if (list) list.innerHTML = `<div class="sr-sub">⏳ กำลังค้นหา...</div>`;
  const res = await Cloud.ghostList(40);
  if (!$('#ghostList')) return;
  if (res.error) { $('#ghostList').innerHTML = `<div class="sr-sub">⚠️ ยังใช้ไม่ได้ — ต้องมีคอลัมน์ team ในตาราง leaderboard (ดู CLOUD_SETUP.md)<br><span style="opacity:.6">${escapeHtml(res.error)}</span></div>`; return; }
  if (!res.rows.length) { $('#ghostList').innerHTML = emptyState('👻', 'ยังไม่มีทีมคนอื่นให้สู้', 'ชวนเพื่อนมาเล่นแล้วส่งสถิติที่กระดานจัดอันดับกัน!'); return; }
  _ghostCache = res.rows.sort(() => Math.random() - 0.5).slice(0, 6);
  renderGhostList(_ghostCache);
}
function renderGhostList(rows) {
  const list = $('#ghostList'); if (!list) return;
  list.innerHTML = rows.map((r, i) => {
    const team = (r.team || []).slice(0, 6);
    const roster = team.map(m => `<div class="roster-cell" style="width:28px;height:28px">${spriteImg(m.id, m.shiny, 'roster-mini')}</div>`).join('');
    const avgLv = Math.round(team.reduce((s, m) => s + (m.level || 1), 0) / Math.max(1, team.length));
    return `<div class="ghost-row">
      <div class="ghost-info"><div class="ghost-name">👤 ${escapeHtml(r.name || 'เทรนเนอร์')} · Lv.~${avgLv} · ${team.length} ตัว</div><div class="roster-row" style="justify-content:flex-start;margin-top:3px">${roster}</div></div>
      <button class="rt-fight" data-ghost="${i}">สู้!</button></div>`;
  }).join('');
  list.querySelectorAll('[data-ghost]').forEach(el => el.onclick = () => startGhostBattle(rows[+el.dataset.ghost]));
}
const GHOST_CD = 3 * 3600000;   // สู้กับเพื่อน/บอทออนไลน์ คูลดาวน์ 3 ชม.
function startGhostBattle(ghost) {
  const cdLeft = (state.ghostReadyAt || 0) - Date.now();
  if (cdLeft > 0) { toast(`⏳ รอสู้ออนไลน์อีก ${Math.ceil(cdLeft / 60000)} นาที (คูลดาวน์ 3 ชม.)`, 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const gTeam = (ghost.team || []).slice(0, 6).filter(m => MON_BY_ID[m.id]);
  if (!gTeam.length) { toast('ทีมคู่ต่อสู้ไม่ถูกต้อง', 'bad'); return; }
  const team = buildBattleTeam(members);   // คูลดาวน์คิดตอนกด "เริ่มต่อสู้" ในหน้า VS (ปิดก่อนไม่โดน)
  const queue = gTeam.map((m, i) => makeFoeDef(MON_BY_ID[m.id], clamp(m.level || 20, 1, 100), i === gTeam.length - 1 ? 1.1 : 1.0, false));
  const nameHash = hashIdx(ghost.name || 'x', BOSS_TRAINER_POOL.length);
  const ghostGym = { id: 'ghost', name: ghost.name || 'เทรนเนอร์', emoji: '👤', sprite: BOSS_TRAINER_POOL[nameHash], reward: 200 + queue.length * 40, items: [] };
  battleState = {
    mode: 'trainer', isBoss: false, isGhost: true, gym: ghostGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    showIntro: !(state.settings && state.settings.fastBattle),
    msg: `👤 ${ghost.name || 'เทรนเนอร์'} (ทีมออนไลน์) ท้าดวล!`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
// ================================================================
//  TRADE — เทรดโปเกมอนระหว่างผู้เล่นจริงผ่านโค้ด (คลาวด์)
// ================================================================
function tradeMonSnapshot(ind) { const s = Object.assign({}, ind); delete s.uid; return s; }
function receiveTradedMon(snap) {   // เพิ่มตัวที่ได้จากเทรดเข้าคลัง (uid ใหม่ กันชนกัน)
  const ind = Object.assign({}, snap, { uid: genUid(), ts: Date.now() });
  state.caught.push(ind);
  state.seen[ind.id] = true;
  return ind;
}
function genTradeCode() {
  const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // ตัดตัวที่สับสน (0/O, 1/I/L)
  let s = ''; for (let i = 0; i < 6; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}
function monLabel(m) {
  const mon = MON_BY_ID[m.id]; if (!mon) return '???';
  return `${m.shiny ? '✨' : ''}${mon.name} Lv.${m.level} · IV ${m.iv ? ivPercent(m) : '?'}%`;
}
let _tradeFound = null;   // ผลการค้นหาโค้ดล่าสุด
function renderTrade() {
  const box = $('#tradeBox'); if (!box) return;
  if (!(window.Cloud && Cloud.enabled)) { box.innerHTML = `<div class="sr-sub">ต้องตั้งค่าคลาวด์ก่อนถึงจะเทรดได้</div>`; return; }
  if (!Cloud.loggedIn()) { box.innerHTML = `<div class="sr-sub">เข้าสู่ระบบก่อน (ส่วน "☁️ บัญชี / เซฟคลาวด์") เพื่อเทรดกับเพื่อน</div>`; return; }
  const pool = state.caught.filter(c => !state.party.includes(c.uid) && !c.lock).sort((a, b) => ivPercent(b) - ivPercent(a));
  const opts = pool.map(c => `<option value="${c.uid}">${monLabel(c)}</option>`).join('');
  box.innerHTML = `
    <div class="sr-sub" style="margin-bottom:8px">เทรดตัวจริงกับเพื่อนผ่านโค้ด · ตัวในทีม/ตัวที่ล็อกจะไม่ถูกเทรด</div>
    <div class="trade-card">
      <div class="trade-h">📤 สร้างข้อเสนอ (ส่งโค้ดให้เพื่อน)</div>
      ${pool.length ? `<select class="set-select trade-sel" id="tradeGiveSel" style="width:100%">${opts}</select>
      <button class="set-btn" id="tradeCreate" style="width:100%;margin-top:6px;background:var(--good);color:#062611">สร้างโค้ดเทรด</button>` : `<div class="sr-sub">ไม่มีตัวที่เทรดได้ (ทุกตัวอยู่ในทีมหรือถูกล็อก)</div>`}
    </div>
    <div class="trade-card">
      <div class="trade-h">📥 รับเทรด (กรอกโค้ดจากเพื่อน)</div>
      <div style="display:flex;gap:6px"><input class="save-io trade-code-in" id="tradeCodeIn" maxlength="6" placeholder="รหัส 6 ตัว" style="min-height:auto;padding:9px;flex:1;text-transform:uppercase;font-family:monospace;letter-spacing:2px"><button class="set-btn" id="tradeFind">ค้นหา</button></div>
      <div id="tradeFoundBox"></div>
    </div>
    <div class="trade-card"><div class="trade-h">📋 ข้อเสนอที่เปิดอยู่ของคุณ</div><div id="tradeOpenList"><div class="sr-sub">⏳ ...</div></div></div>`;
  const cBtn = $('#tradeCreate'); if (cBtn) cBtn.onclick = tradeCreate;
  $('#tradeFind').onclick = tradeFind;
  renderTradeFound();
  loadMyOpenTrades();
}
async function tradeCreate() {
  const uid = $('#tradeGiveSel') && $('#tradeGiveSel').value;
  const ind = uid && indByUid(uid);
  if (!ind) { toast('เลือกตัวที่จะเทรดก่อน', 'bad'); return; }
  if (state.party.includes(uid)) { toast('เอาออกจากทีมก่อนถึงจะเทรดได้', 'bad'); return; }
  const code = genTradeCode();
  toast('⏳ กำลังสร้างข้อเสนอ...', '');
  const res = await Cloud.createTrade(code, state.playerName, tradeMonSnapshot(ind));
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  // นำตัวออกจากคลัง (ฝากไว้บนคลาวด์จนกว่าจะมีคนแลก/ยกเลิก)
  state.caught = state.caught.filter(c => c.uid !== uid);
  save();
  toast(`✅ สร้างโค้ดแล้ว: ${code} — ส่งให้เพื่อนกรอกเพื่อแลก`, 'good');
  logMsg(`🔄 สร้างข้อเสนอเทรด <b>${MON_BY_ID[ind.id].name}</b> · โค้ด <b>${code}</b>`, 'big');
  renderTrade(); renderCurrentView();
}
async function tradeFind() {
  const code = ($('#tradeCodeIn').value || '').trim().toUpperCase();
  if (code.length !== 6) { toast('กรอกรหัส 6 ตัว', 'bad'); return; }
  toast('⏳ กำลังค้นหา...', '');
  const res = await Cloud.findTrade(code);
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  if (res.own) { toast('นี่คือโค้ดของคุณเอง', 'bad'); _tradeFound = null; renderTradeFound(); return; }
  if (!res.trade) { toast('ไม่พบข้อเสนอนี้ (อาจถูกแลก/ยกเลิกแล้ว)', 'bad'); _tradeFound = null; renderTradeFound(); return; }
  _tradeFound = res.trade;
  renderTradeFound();
}
function renderTradeFound() {
  const box = $('#tradeFoundBox'); if (!box) return;
  if (!_tradeFound) { box.innerHTML = ''; return; }
  const t = _tradeFound;
  const pool = state.caught.filter(c => !state.party.includes(c.uid) && !c.lock).sort((a, b) => ivPercent(b) - ivPercent(a));
  const opts = pool.map(c => `<option value="${c.uid}">${monLabel(c)}</option>`).join('');
  box.innerHTML = `<div class="trade-offer">
    <div class="trade-offer-mon">${spriteImg(t.offer_mon.id, t.offer_mon.shiny, 'roster-mini')}<div><b>${escapeHtml(t.from_name || 'เทรนเนอร์')}</b> เสนอ<br>${monLabel(t.offer_mon)}</div></div>
    ${pool.length ? `<div class="sr-sub" style="margin:6px 0 3px">เลือกตัวที่จะให้ตอบแทน:</div>
    <select class="set-select" id="tradeReturnSel" style="width:100%">${opts}</select>
    <button class="set-btn" id="tradeConfirm" style="width:100%;margin-top:6px;background:var(--good);color:#062611">✅ ยืนยันแลก</button>` : `<div class="sr-sub">คุณไม่มีตัวที่จะให้ตอบแทน (ทุกตัวอยู่ในทีม/ล็อก)</div>`}
  </div>`;
  const cf = $('#tradeConfirm'); if (cf) cf.onclick = tradeConfirm;
}
async function tradeConfirm() {
  if (!_tradeFound) return;
  const uid = $('#tradeReturnSel') && $('#tradeReturnSel').value;
  const ind = uid && indByUid(uid);
  if (!ind) { toast('เลือกตัวที่จะให้ตอบแทน', 'bad'); return; }
  toast('⏳ กำลังแลก...', '');
  const res = await Cloud.completeTrade(_tradeFound.id, tradeMonSnapshot(ind));
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  // สำเร็จ: เอาตัวเราออก + รับตัวเขาเข้า
  state.caught = state.caught.filter(c => c.uid !== uid);
  const got = receiveTradedMon(_tradeFound.offer_mon);
  state._traded = true; checkAchievements();
  save();
  toast(`🎉 แลกสำเร็จ! ได้ ${MON_BY_ID[got.id].name} มา`, 'good');
  logMsg(`🔄 แลกสำเร็จ! ได้ <b>${MON_BY_ID[got.id].name}</b> จาก ${escapeHtml(_tradeFound.from_name || 'เทรนเนอร์')}`, 'big');
  _tradeFound = null;
  renderTrade(); renderCurrentView();
}
async function loadMyOpenTrades() {
  const list = $('#tradeOpenList'); if (!list) return;
  const res = await Cloud.myOpenTrades();
  if (!$('#tradeOpenList')) return;
  if (res.error) { $('#tradeOpenList').innerHTML = `<div class="sr-sub">⚠️ ยังใช้ไม่ได้ — ต้องสร้างตาราง trades ใน Supabase ก่อน (ดู CLOUD_SETUP.md)<br><span style="opacity:.6">${escapeHtml(res.error)}</span></div>`; return; }
  if (!res.rows.length) { $('#tradeOpenList').innerHTML = emptyState('🔄', 'ยังไม่มีข้อเสนอที่เปิดอยู่', 'เปิดข้อเสนอแลกของคุณเองด้านบนได้เลย'); return; }
  $('#tradeOpenList').innerHTML = res.rows.map(r => `<div class="trade-open-row">
    <span>${spriteImg(r.offer_mon.id, r.offer_mon.shiny, 'roster-mini')}</span>
    <span class="trade-open-info"><b>${monLabel(r.offer_mon)}</b><br>โค้ด <b class="trade-code">${r.code}</b></span>
    <button class="rt-skip" data-cancel="${r.id}">ยกเลิก</button></div>`).join('');
  $('#tradeOpenList').querySelectorAll('[data-cancel]').forEach(el => el.onclick = () => tradeCancel(el.dataset.cancel, res.rows.find(x => x.id === el.dataset.cancel)));
}
async function tradeCancel(id, row) {
  toast('⏳ กำลังยกเลิก...', '');
  const res = await Cloud.cancelTrade(id);
  if (res.error) { toast('❌ ' + res.error, 'bad'); return; }
  // คืนตัวกลับคลัง
  if (res.trade && res.trade.offer_mon) receiveTradedMon(res.trade.offer_mon);
  else if (row && row.offer_mon) receiveTradedMon(row.offer_mon);
  save();
  toast('↩️ ยกเลิกแล้ว คืนตัวกลับคลัง', 'good');
  renderTrade(); renderCurrentView();
}
// เรียกตอนโหลดเกม/ล็อกอิน — รับตัวที่เพื่อนส่งกลับจากเทรดที่แลกสำเร็จ
async function checkIncomingTrades() {
  if (!(window.Cloud && Cloud.loggedIn())) return;
  const res = await Cloud.myIncomingTrades();
  if (res.error || !res.rows || !res.rows.length) return;
  for (const r of res.rows) {
    if (r.return_mon) {
      const got = receiveTradedMon(r.return_mon);
      state._traded = true;
      toast(`🎁 ได้ ${MON_BY_ID[got.id].name} จากการเทรดที่สำเร็จ!`, 'good');
      logMsg(`🔄 เทรดสำเร็จ! ได้ <b>${MON_BY_ID[got.id].name}</b> ตอบแทนจาก ${escapeHtml(r.from_name || 'เพื่อน')}`, 'big');
    }
    await Cloud.markTradeCollected(r.id);
  }
  checkAchievements(); save();
}
async function cloudSyncNow() {
  if (!Cloud.loggedIn()) return;
  toast('⏳ กำลัง sync...', '');
  const r = await Cloud.push(state);
  toast(r.error ? '❌ ' + r.error : '☁️ อัปโหลดเซฟขึ้นคลาวด์แล้ว', r.error ? 'bad' : 'good');
  updateCloudStatus();
}
function renderCloudUI() {
  const box = $('#cloudBox'); if (!box) return;
  if (!(window.Cloud && Cloud.enabled)) {
    box.innerHTML = `<div class="set-row"><div class="sr-label">☁️ ยังไม่ได้ตั้งค่าคลาวด์
      <div class="sr-sub">เล่นแบบออฟไลน์อยู่ · เปิดใช้ Cloud Save ได้โดยตั้งค่า Supabase (ดู CLOUD_SETUP.md)</div></div></div>`;
    return;
  }
  if (Cloud.loggedIn()) {
    box.innerHTML = `<div class="set-row">
        <div class="sr-label">☁️ ล็อกอินแล้ว<div class="sr-sub" id="clStatus">${Cloud.email()}</div></div>
        <button class="set-btn" id="clSyncBtn">Sync</button></div>
      <div class="set-row"><div class="sr-label">ออกจากระบบ<div class="sr-sub">เซฟในเครื่องยังอยู่</div></div>
        <button class="set-btn danger" id="clOutBtn">ออก</button></div>`;
    $('#clSyncBtn').onclick = cloudSyncNow;
    $('#clOutBtn').onclick = cloudSignOut;
  } else {
    box.innerHTML = `<div class="set-row" style="flex-direction:column;align-items:stretch">
        <div class="sr-label">เข้าสู่ระบบเพื่อเซฟข้ามเครื่อง<div class="sr-sub">เซฟบนคลาวด์ ไม่หาย เล่นต่อเครื่องอื่นได้</div></div>
        <input class="save-io" id="clEmail" placeholder="อีเมล" style="min-height:auto;padding:10px;margin-top:8px" autocomplete="username">
        <input class="save-io" id="clPw" type="password" placeholder="รหัสผ่าน (≥6 ตัว)" style="min-height:auto;padding:10px;margin-top:6px" autocomplete="current-password">
        <div class="action-row" style="margin-top:8px">
          <button class="set-btn" id="clInBtn">เข้าสู่ระบบ</button>
          <button class="set-btn" id="clUpBtn" style="background:var(--good);color:#062611">สมัครใหม่</button>
        </div></div>`;
    $('#clInBtn').onclick = cloudSignIn;
    $('#clUpBtn').onclick = cloudSignUp;
  }
}
function updateCloudStatus() {
  const el = $('#clStatus');
  if (el && Cloud.loggedIn()) el.textContent = `${Cloud.email()} · sync ${new Date().toLocaleTimeString('th-TH')}`;
}

// ================================================================
//  INIT
// ================================================================
function init() {
  load();
  applyOfflineRewards();   // ต้องอ่าน lastSeen เก่าก่อน save ใดๆ
  checkWeeklyEvent();       // แจ้งอีเวนต์ประจำสัปดาห์ถ้าเข้าสัปดาห์ใหม่
  ensureDailyQuests();
  fillDexFilter();
  renderRegionBanner();
  renderTopbar();
  renderBallBar();
  renderSpawn();

  $('#battleBtn').addEventListener('click', () => startBattle(false));
  $('#fishBtn').addEventListener('click', fish);
  $('#safariBtn').addEventListener('click', enterSafari);
  updateFishBtn();
  setInterval(updateFishBtn, 1000);
  setInterval(updateContestCd, 1000);
  setInterval(updateFarmCd, 1000);
  $('#toMapBtn').addEventListener('click', () => switchView('map'));
  document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));
  // debounce ช่องค้นหา — เดกซ์มีได้ถึง ~1025 การ์ด อย่ารีเรนเดอร์ทุกการกดคีย์ (ลดกระตุกตอนพิมพ์)
  let _dexSearchTimer = null;
  $('#dexSearch').addEventListener('input', () => { clearTimeout(_dexSearchTimer); _dexSearchTimer = setTimeout(renderDex, 180); });
  $('#dexFilter').addEventListener('change', renderDex);
  $('#dexSort').addEventListener('change', renderDex);
  $('#bulkModeBtn').addEventListener('click', toggleBulkMode);
  $('#bulkSelAll').addEventListener('click', bulkSelectAll);
  $('#bulkRelease').addEventListener('click', bulkDoRelease);
  $('#bulkParty').addEventListener('click', bulkDoParty);
  $('#bulkLock').addEventListener('click', bulkDoLock);
  $('#buddyChip').addEventListener('click', () => switchView('dex'));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#battleModal').addEventListener('click', e => { if (e.target.id === 'battleModal' && battleState && battleState.over) endBattle(); });

  preloadItems();
  preloadMascots();
  checkAchievements();
  scheduleSpawn(2200);
  logMsg('👋 ยินดีต้อนรับ! เลือกเขตในแผนที่ แล้วปาบอลจับโปเกมอนได้เลย', 'big');

  // นับเวลาเล่น + อัปเดต lastSeen + รีเฟรชอากาศ/เวลา
  setInterval(() => {
    state.playSec = (state.playSec || 0) + 20; save();
    if (currentView === 'home') renderRegionBanner();
  }, 20000);
  // เช็คว่าจะสุ่มเกิดอีเวนต์ฤดูกาล/พ่อค้าเร่ไหม + รีเฟรชป้ายเมื่อหมดเวลา
  setInterval(() => {
    const before = !!state.worldEvent;
    tryTriggerRandomEvent();
    tryTriggerMerchant();
    if (before && !state.worldEvent) renderRegionBanner();   // อีเวนต์เพิ่งหมดเวลา
    if (currentView === 'home') renderRegionBanner();
  }, 30000);
  tryTriggerRandomEvent();   // เช็คทันทีตอนเปิดเกมด้วย (มีโอกาสเกิดตั้งแต่แรก)
  setInterval(updateMerchantCd, 1000);
  setInterval(updateRivalCd, 1000);
  setInterval(updateCheckinCd, 1000);
  applyReduceMotion();
  window.addEventListener('beforeunload', () => { state.lastSeen = Date.now(); save(); });

  if (!state.tutorialDone) setTimeout(showTutorial, 400);
  if (state.settings.music) document.addEventListener('pointerdown', () => startMusic(), { once: true });

  initCloud();   // เชื่อมคลาวด์ (ถ้าตั้งค่าไว้)
}
// โมดูล ES เป็น deferred — ถ้า DOM พร้อมแล้วให้ init ทันที ไม่งั้นรอ event (กันเคสที่ event ยิงไปก่อน)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// สะพานดีบั๊ก — เปิดเฉพาะตอนรันบนเครื่อง (localhost) เพื่อทดสอบ ไม่โผล่บนเว็บจริง (กันโกง)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__dev = {
    get state() { return state; }, get spawn() { return currentSpawn; }, get battle() { return battleState; },
    MON_BY_ID, makeIndividual, startBattle, beginSpawn, startTrainerBattle, startBossBattle,
    startMegaLeagueBattle, startGhostBattle, startTowerBattle, startRivalBattle, towerFoeDef,
    pickLegendaryGenWeighted, genOf, onFoeDown, endBattle, throwBall, save, switchView,
    renderMenu, startRaidBattle, raidBossForWeek, faintActive, grantAmuletDrop,
    openIndividualModal, tradeNpc, claimDailyLogin, selectRegion, playSpawnFx, renderHallOfFame,
  };
}
