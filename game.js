/* ================================================================
   PokePP — เกมจับมอนสเตอร์สไตล์ PokeMeow + แผนที่สไตล์ PokeRogue
   ปาบอล (ไม่พิมพ์ชื่อ) · ระดับความหายาก · โปเกมอนรายตัว (nature/เพศ/IV)
   ================================================================ */
'use strict';

// ---------- config ----------
const SAVE_KEY = 'pokepp_save_v2';
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
};
// ลำดับรูปที่จะลอง — เอา "showdown" (สไปรต์ขยับแบบ PokeMeow) เป็นหลัก
// ถ้าไม่มี ค่อยลอง gen5 ขยับ (ตัวเก่า) แล้วค่อยภาพนิ่ง (artwork)
function spriteChain(id, shiny) {
  const anim = shiny
    ? [SP.shiny(id), (id <= 649 ? SP.anim5s(id) : null), SP.artS(id), SP.pngS(id)]   // fallback = สี shiny
    : [SP.gif(id), (id <= 649 ? SP.anim5(id) : null), SP.art(id), SP.png(id)];
  return anim.filter(Boolean);
}
// ตัว fallback: เมื่อรูปโหลดไม่ได้ ไล่ไปรูปถัดไปในลิสต์
window.__sf = function (img) {
  const fb = (img.dataset.fb || '').split('|').filter(Boolean);
  if (fb.length) { img.dataset.fb = fb.slice(1).join('|'); img.src = fb[0]; }
};
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
    'rare-candy', 'nugget', 'mega-ring', 'macho-brace', 'shiny-stone', 'comet-shard', 'member-card',
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
  premier: { name: 'Premier Ball',emoji: '⚪', img: 'premier-ball', mult: 1.3, add: 0.00, price: 45,   hint: '×1.3' },
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
  master:  { name: 'Master Ball', emoji: '🟣', img: 'master-ball',  mult: 999, add: 1, price: 15000, hint: '100%' },
};
const BALL_ORDER = ['poke', 'premier', 'great', 'luxury', 'ultra', 'net', 'dusk', 'quick', 'timer', 'repeat', 'heavy', 'beast', 'master'];

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
  xp:    { name: 'XP Charm',    emoji: '📿', img: 'lucky-egg',      mult: 2,   price: 800,  desc: 'XP ที่ได้ ×2' },
};
const CHARM_ORDER = ['catch', 'xp'];

// Shiny Charm — ไอเทมติดตัวถาวรแบบพาสซีฟ (แบบเกมจริง/PokeMeow) สะสมได้สูงสุด 5 ชิ้น เพิ่มโอกาส Shiny ทีละเล็กน้อย
const SHINY_CHARM_MAX = 5, SHINY_CHARM_PRICE = 4500, SHINY_CHARM_PER = 0.02;   // +2%/ชิ้น ทบต้น (แบบเกมจริง เพิ่มน้อยแต่ถาวร)
function shinyCharmMultiplier() { return Math.pow(1 + SHINY_CHARM_PER, Math.min(state.shinyCharms || 0, SHINY_CHARM_MAX)); }
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
const MEGA_RING_PRICE = 15000;   // กำไลเมก้า — ปลดล็อกครั้งเดียว จำเป็นก่อนเมก้าอีโวลูชันได้ทุกตัว

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
  { id: 'bp_amulet', name: 'Amulet Coin', emoji: '🪙', img: 'amulet-coin', cost: 80, act: () => { if ((state.amulets || 0) >= AMULET_MAX) return null; state.amulets = (state.amulets || 0) + 1; return '🪙 +1 Amulet Coin'; } },
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
const LOCKBOX_REWARDS = [
  { w: 30, act: () => { const n = rand(3, 8); state.balls.great = (state.balls.great || 0) + n; return `${n} Great Ball`; } },
  { w: 22, act: () => { const n = rand(1, 3); state.balls.ultra = (state.balls.ultra || 0) + n; return `${n} Ultra Ball`; } },
  { w: 20, act: () => { const n = rand(200, 600); state.coins += n; return `${n} เหรียญ`; } },
  { w: 12, act: () => { const n = rand(1, 2); state.candies = (state.candies || 0) + n; return `${n} Rare Candy`; } },
  { w: 8, act: () => { state.berries.golden = (state.berries.golden || 0) + 1; return 'Golden Razz'; } },
  { w: 5, act: () => { state.eggs.push({ kind: 'rare', progressStart: state.totalCaught }); return 'ไข่หายาก'; } },
  { w: 2, act: () => { if ((state.shinyCharms || 0) >= SHINY_CHARM_MAX) { state.coins += 1000; return '1000🪙 (Shiny Charm เต็มแล้ว)'; } state.shinyCharms = (state.shinyCharms || 0) + 1; return `Shiny Charm ${state.shinyCharms}/${SHINY_CHARM_MAX}`; } },
  { w: 1, act: () => { state.balls.master = (state.balls.master || 0) + 1; return 'Master Ball! 🟣'; } },
];

const EGG_PRICE = 450, STONE_PRICE = 600, EGG_HATCH_CATCHES = 15;

// ไข่หลายชนิด — ฟักแล้วสุ่มจาก pool ต่างกัน + โอกาส shiny ต่างกัน
const EGG_KINDS = {
  mystery: { name: 'ไข่ปริศนา', catches: 15, price: 450, shinyMul: 3, tiers: null },
  rare:    { name: 'ไข่หายาก', catches: 22, price: 1200, shinyMul: 4, tiers: ['rare', 'superrare'] },
  gold:    { name: 'ไข่ทอง',   catches: 30, price: 3000, shinyMul: 8, tiers: ['superrare', 'legendary'] },
};

// ตารางธาตุแพ้ทาง (attacker -> {defender: multiplier}) เฉพาะที่ไม่ใช่ 1x
const TYPE_CHART = {
  normal: { rock: .5, ghost: 0, steel: .5 },
  fire: { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
  water: { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
  electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
  grass: { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
  ice: { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
  fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
  poison: { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
  flying: { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
  psychic: { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
  bug: { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
  rock: { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: .5 },
  dragon: { dragon: 2, steel: .5, fairy: 0 },
  dark: { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
  steel: { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
  fairy: { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 },
};
function typeEffect(atkType, defTypes) {
  let m = 1;
  const row = TYPE_CHART[atkType] || {};
  defTypes.forEach(d => { if (row[d] != null) m *= row[d]; });
  return m;
}

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
    desc: 'เขตขั้นสุด เหนือทะเลเมฆ ลมแรง โปเกมอนบินหายากรออยู่', unlock: 55 },
];
const REGION_BY_ID = {};
REGIONS.forEach(r => { REGION_BY_ID[r.id] = r; });
// รวมภาพพื้นหลังจริง (bgImg) กับ gradient เดิม (bg) เป็น CSS background เดียว
// ถ้าภาพโหลดไม่ขึ้น browser จะข้ามเลเยอร์นั้นไปเฉยๆ เหลือ gradient ให้เห็นเสมอ ไม่มีทางว่างเปล่า
function regionBgCss(r) {
  if (!r.bgImg) return r.bg;
  return `linear-gradient(180deg, rgba(10,12,26,.1), rgba(10,12,26,.28)), url('${r.bgImg}') center/cover no-repeat, ${r.bg}`;
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
function tierOf(m) {
  if (m.rarity === 'legendary') return 'legendary';
  if (m._bst >= 525) return 'superrare';
  if (m._bst >= 430) return 'rare';
  if (m._bst >= 320) return 'uncommon';
  return 'common';
}
MONSTERS.forEach(m => { m._tier = tierOf(m); });
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
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const todayStr = () => new Date().toISOString().slice(0, 10);
let _uidc = 0;
const genUid = () => Date.now().toString(36) + (_uidc++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

function spriteImg(id, shiny, cls) {
  const chain = spriteChain(id, shiny);
  const first = chain[0], fb = chain.slice(1).join('|');
  return `<img class="${cls || ''}" loading="lazy" src="${first}" data-fb="${fb}" onerror="__sf(this)" alt="">`;
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
      rareAlerts: true, eventAlerts: true, mascotDeco: true, reduceMotion: false, confirmRelease: true, fastBattle: false },
    trainerXp: 0,
    streak: 0, lastLogin: '',
    lastSeen: Date.now(), playSec: 0,
    tutorialDone: false,
    _evolved: false,
    totalCaught: 0,
    createdAt: Date.now(),
  };
}
// รวม save เก่า/นอก กับ newSave() — merge แบบ deep เฉพาะ settings กันคีย์ใหม่ที่ save เก่าไม่มีกลายเป็น undefined
function mergeSave(obj) {
  const fresh = newSave();
  const defaultSettings = fresh.settings;   // จับค่า default ไว้ก่อน เพราะ Object.assign ด้านล่างจะรีแอสไซน์ fresh.settings ทิ้ง
  const merged = Object.assign(fresh, obj || {});
  merged.settings = Object.assign({}, defaultSettings, (obj && obj.settings) || {});
  return merged;
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { state = mergeSave(JSON.parse(raw)); migrateSave(); return; }
  } catch (e) { console.warn('load failed', e); }
  state = newSave();
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
  _cloudTimer = setTimeout(() => { Cloud.push(state).then(() => updateCloudStatus()).catch(() => {}); }, 4000);
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
  snow:    { root: 67, tempo: 640, wave: 'sine' },
  mystic:  { root: 55, tempo: 580, wave: 'triangle' },
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

function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function logMsg(msg, kind) {
  const box = $('#log');
  const el = document.createElement('div');
  el.className = 'log-item ' + (kind || '');
  el.innerHTML = msg;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
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
  el.innerHTML = active.map(k => {
    const left = Math.ceil((state.activeBoosts[k] - Date.now()) / 60000);
    return `<span class="boost-chip">${CHARMS[k].emoji} ${CHARMS[k].name} ${left}น.</span>`;
  }).join('');
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
  amount = Math.round(amount * (1 + (b.friend || 0) / 500));   // มิตรภาพสูง = XP มากขึ้น (สูงสุด +20%)
  b.xp += amount; let leveled = false;
  while (b.xp >= xpForLevel(b.level) && b.level < 100) { b.xp -= xpForLevel(b.level); b.level++; leveled = true; }
  if (leveled) { toast(`⬆️ <b>${MON_BY_ID[b.id].name}</b> ขึ้น Lv.${b.level}`, 'good'); tryEvolveByLevel(b); }
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
  // เอนไปทางเลเวลต่ำ: เลเวลสูงในช่วงยิ่งเจอยาก (pow > 1)
  return Math.round(lo + (hi - lo) * Math.pow(Math.random(), 1.6));
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
function shinyMultiplier() {
  let m = 1;
  if (isEventActive()) m *= 2;         // อีเวนต์สุดสัปดาห์ shiny ×2
  if (timeOfDay() === 'night') m *= 1.3;
  m *= shinyCharmMultiplier();         // Shiny Charm ติดตัวถาวร (+2%/ชิ้น สูงสุด 5 ชิ้น)
  const we = currentWorldEvent();
  if (we) m *= we.shinyMult;           // อีเวนต์สุ่มตามฤดูกาล
  return m;
}
// ชั้น2 แบบ PokeMeow: Common 40% · Uncommon 30% · Rare 27% · Super Rare 3% (legendary แยกอิสระ)
// luck สูง (เขต boost/อีเวนต์) ดันโอกาสตัวหายากขึ้น
function rollRarity(luck) {
  const srP = 3 + luck * 3;        // super rare
  const raP = 27 + luck * 5;       // rare
  const unP = 30;                  // uncommon
  const roll = Math.random() * 100;
  if (roll < srP) return 'superrare';
  if (roll < srP + raP) return 'rare';
  if (roll < srP + raP + unP) return 'uncommon';
  return 'common';                 // ที่เหลือ ~40%
}
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
  const luck = r.boost + (isEventActive() ? 1 : 0) + (we ? 1 : 0) + berryLuck;
  let mon;
  // ชั้น1: legendary สุ่มแยกอิสระ (1/666 ปรับตามเขต/อีเวนต์/เบอร์รี่)
  const legChance = LEGENDARY_CHANCE * (1 + r.boost * 0.6) * (isEventActive() ? 2 : 1) * (we ? we.legMult : 1) * (1 + berryLuck * 0.5);
  const legPool = r._byTier.legendary.length ? r._byTier.legendary : MONSTERS.filter(m => m._tier === 'legendary');
  if (Math.random() < legChance && legPool.length) {
    mon = pick(legPool);
  } else {
    mon = pickFromRegion(r, rollRarity(luck));
  }
  // ชั้น shiny: overlay สุ่มแยกอิสระ (ซ้อนตัวที่สุ่มได้)
  const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier();
  beginSpawn(mon, shiny, false);
}
// สร้าง spawn จริง (ใช้ร่วมกันทั้งเดินป่าปกติและตกปลา)
function beginSpawn(mon, shiny, fromFishing) {
  const level = levelFor(mon._tier);
  const maxHp = wildMaxHp(mon, level);
  currentSpawn = { mon, tier: mon._tier, shiny, level, throws: 0, deadline: Date.now() + FLEE_MS,
    maxHp, hp: maxHp, fishing: !!fromFishing };
  state.seen[mon.id] = true;
  renderSpawn();
  if (shiny || mon._tier === 'rare' || mon._tier === 'superrare' || mon._tier === 'legendary') {
    showRareAlert(mon, mon._tier, shiny);
    logMsg(`${shiny ? '✨' : '⭐'} ${fromFishing ? '🎣 ' : ''}พบ <b>${mon.name}</b> (${shiny ? 'Shiny' : TIER_LABEL[mon._tier]}) Lv.${level}!`, 'big');
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
    const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier();
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
  { id: 'golden2', name: 'Golden Razz ×2', emoji: BERRIES.golden.emoji, img: BERRIES.golden.img, basePrice: BERRIES.golden.price * 2, give: () => { state.berries.golden = (state.berries.golden || 0) + 2; } },
  { id: 'lifeorb', name: 'Life Orb',      emoji: HELD_ITEMS['life-orb'].emoji,     img: HELD_ITEMS['life-orb'].img,     basePrice: HELD_ITEMS['life-orb'].price,     give: () => { state.heldInv['life-orb'] = (state.heldInv['life-orb'] || 0) + 1; } },
  { id: 'shellbell', name: 'Shell Bell',  emoji: HELD_ITEMS['shell-bell'].emoji,   img: HELD_ITEMS['shell-bell'].img,   basePrice: HELD_ITEMS['shell-bell'].price,   give: () => { state.heldInv['shell-bell'] = (state.heldInv['shell-bell'] || 0) + 1; } },
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
  $('#rbLvl').innerHTML = `${timeIco} · ${w.emoji}${w.name}${ev}${safari}`;
  const card = $('#spawnCard');
  card.style.background = regionBgCss(r);
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
function renderSpawn() {
  const card = $('#spawnCard');
  card.classList.remove('rare-glow', 'legend-glow', 'shiny-glow');
  const battleBtn = $('#battleBtn');
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
  $('#spawnTags').innerHTML =
    typeBadges(mon.types) +
    `<span class="badge rarity-${shiny ? 'shiny' : tier}">${shiny ? '✨ shiny' : TIER_EMOJI[tier] + ' ' + TIER_LABEL[tier]}</span>`;
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
  bar.innerHTML = BALL_ORDER.map(k => {
    const b = BALLS[k], have = state.balls[k] || 0;
    const sel = state.selBall === k ? ' sel' : '';
    const dis = have <= 0 ? ' disabled' : '';
    const tag = b.mult >= 999 ? '100%' : b.cond ? '★' : '×' + b.mult;
    return `<div class="ball-opt${sel}${dis}" data-ball="${k}" title="${b.hint}">
      <span class="bmult">${tag}</span>
      <div class="be">${itemIcon(b.emoji, b.img)}</div>
      <div class="bn">${b.name.replace(' Ball', '')}</div>
      <div class="bc">×${have}</div></div>`;
  }).join('');
  bar.querySelectorAll('.ball-opt').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.ball;
      if ((state.balls[k] || 0) <= 0) { toast('❌ บอลชนิดนี้หมด', 'bad'); return; }
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
function catchChance(mon, level, ball, mods) {
  if (ball.mult >= 999) return 1;                // master ball การันตี
  mods = mods || {};
  let mult = ball.mult, add = ball.add;
  if (ball.cond && mods.ctx) {                    // บอลพิเศษ (Net/Dusk/Quick) โบนัสตามเงื่อนไข
    const c = ball.cond(mods.ctx);
    if (c.mult != null) mult = c.mult;
    if (c.add != null) add += c.add;
  }
  let base = mon.captureRate / 300;              // 0.01 – 0.85
  let p = base * mult + add;
  p *= (mods.hpBonus || 1);                       // โบนัสจากการสู้ทำ HP ลด
  p *= (mods.catchMult || 1);                     // Catch Charm
  p *= (1 - Math.min(level, 80) * 0.004);        // เลเวลสูง จับยากขึ้น
  return clamp(p, 0.02, 0.96);
}
let throwing = false;
function throwBall(k) {
  if (!currentSpawn || throwing) return;
  k = (typeof k === 'string') ? k : state.selBall;
  const have = state.balls[k] || 0;
  if (have <= 0) { toast('❌ บอลหมด', 'bad'); return; }
  state.selBall = k;
  throwing = true;
  const prevThrows = currentSpawn.throws;   // จำนวนก่อนขว้างครั้งนี้ (ใช้เช็ค Quick Ball)
  state.balls[k]--;
  currentSpawn.throws++;
  renderBallBar();

  const ctx = { mon: currentSpawn.mon, throws: prevThrows, time: timeOfDay(), region: region(), alreadyCaught: speciesCount(currentSpawn.mon.id) > 0 };
  const mods = { hpBonus: hpBonusFor(currentSpawn),
    catchMult: boostActive('catch') ? CHARMS.catch.mult : 1, ctx };
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

  const amuletMul = 1 + Math.min(state.amulets || 0, AMULET_MAX) * 0.05;   // Amulet Coin
  const eventCoinMul = currentWorldEvent() ? currentWorldEvent().coinMult : 1;
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

  clearSpawn(); save(); renderTopbar(); renderCurrentView(); renderBallBar();
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
function selectRegion(id) {
  const r = REGION_BY_ID[id];
  if (r.unlock && !state.unlocked[id]) {
    toast(`🔒 ต้องจับให้ครบ ${r.unlock} ชนิดก่อน (ตอนนี้ ${speciesOwnedCount()})`, 'bad'); return;
  }
  state.region = id; save();
  renderRegionBanner(); clearSpawn(); scheduleSpawn(1500);
  switchView('home');
  toast(`${r.emoji} เดินทางสู่ <b>${r.name}</b>`, 'good');
}

// % โอกาสเจอแต่ละระดับของเขต (ตามระบบ PokeMeow — ใช้แสดงในแผนที่)
function regionRates(r) {
  const luck = r.boost;
  const superrare = 3 + luck * 3;
  const rare = 27 + luck * 5;
  const uncommon = 30;
  const common = Math.max(0, 100 - superrare - rare - uncommon);
  const legendary = LEGENDARY_CHANCE * (1 + r.boost * 0.6) * 100;
  return { common, uncommon, rare, superrare, legendary };
}

// ================================================================
//  MAP view
// ================================================================
function renderMap() {
  const owned = speciesOwnedCount();
  $('#mapGrid').innerHTML = REGIONS.map(r => {
    const locked = r.unlock && !state.unlocked[r.id];
    const active = state.region === r.id;
    const rt = regionRates(r);
    const rates = TIER_ORDER.filter(t => r._byTier[t] && r._byTier[t].length)
      .map(t => `<span class="mc-rate rarity-${t}">${TIER_EMOJI[t]} ${TIER_LABEL[t]} ${rt[t] < 1 ? rt[t].toFixed(2) : rt[t].toFixed(t === 'superrare' ? 1 : 0)}%</span>`).join('');
    const beaten = state.badges[r.id];
    return `<div class="map-card${active ? ' active-region' : ''}${locked ? ' locked' : ''}" style="background:${regionBgCss(r)}">
      <div class="mc-deco">${mascotDecoHtml(r.mascots)}</div>
      ${beaten ? '<div class="mc-badge">🏅</div>' : ''}
      <div class="mc-body">
        <div class="mc-name" data-go="${r.id}">${r.emoji} ${r.name}</div>
        <div class="mc-lvl">${r.desc}</div>
        <div class="mc-rates">${rates}</div>
        ${!locked ? `<button class="boss-btn" data-boss="${r.id}">${beaten ? '⚔️ ท้าบอสอีกครั้ง' : '⚔️ ท้าบอสประจำเขต'}</button>` : ''}
      </div>
      ${locked ? `<div class="lock-ov"><div class="lk">🔒</div>จับให้ครบ ${r.unlock} ชนิด<br>(${owned}/${r.unlock})</div>` : ''}
    </div>`;
  }).join('');
  $('#mapGrid').querySelectorAll('.map-card').forEach(el => {
    const locked = el.classList.contains('locked');
    el.onclick = e => {
      const bossBtn = e.target.closest('[data-boss]');
      if (bossBtn) { e.stopPropagation(); startBossBattle(bossBtn.dataset.boss); return; }
      if (locked) { const id = el.querySelector('[data-go]'); selectRegion(id ? id.dataset.go : state.region); return; }
      const go = el.querySelector('[data-go]');
      if (go) selectRegion(go.dataset.go);
    };
  });
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
    return `<div class="dex-cell${cnt ? '' : ' locked'}" data-id="${m.id}">
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
    return `<div class="ind-row bulk-mode${sel ? ' selected' : ''}" data-uid="${ind.uid}">
      <div class="ir-check">${sel ? '✓' : ''}</div>
      ${spriteImg(ind.id, ind.shiny)}
      <div class="ir-main">
        <div class="ir-name">${ind.nick || m.name} ${genderIcon(ind.gender)} <span class="ir-tags">${tags}</span></div>
        <div class="ir-sub">Lv.${ind.level} · ${TIER_LABEL[ind.tier]}</div>
      </div>
      <div class="ir-iv">IV ${ivPercent(ind)}%</div></div>`;
  }).join('') || `<p style="color:var(--muted);text-align:center;padding:20px">ไม่มีโปเกมอนตรงตัวกรอง</p>`;
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
  return `<div class="ind-row" data-uid="${ind.uid}">
    ${spriteImg(ind.id, ind.shiny)}
    <div class="ir-main">
      <div class="ir-name">${ind.shiny ? '✨' : ''}${ind.nick ? ind.nick : m.name} ${genderIcon(ind.gender)} ${isBuddy ? '⭐' : ''}</div>
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
          : `<button class="pill" data-buystone="${f.stone}" style="cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px">${itemIcon('💎', f.stone)} ซื้อ ${f.name} (${MEGA_STONE_PRICE}🪙)</button>`;
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
          : `<button class="pill" data-buygx="1" style="cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px">${spriteImg(gmax.spriteId, false, 'item-ico')} ซื้อหินปลุกพลัง (${GMAX_STONE_PRICE}🪙)</button>`)
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
      <button class="btn-primary" id="mTrade" ${ind.locked ? 'disabled' : ''}>🔄 เทรด NPC</button>
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
function tradeNpc(uid) {
  const idx = state.caught.findIndex(c => c.uid === uid);
  if (idx < 0) return;
  const ind = state.caught[idx];
  if (ind.locked) { toast('🔒 ตัวนี้ถูกล็อกอยู่', 'bad'); return; }
  if (inParty(uid)) { toast('❌ เอาออกจากทีมก่อนเทรด', 'bad'); return; }
  if (!confirmAction(`เทรด ${MON_BY_ID[ind.id].name} กับ NPC เพื่อสุ่มตัวใหม่? (ตัวเดิมจะหายไป)`)) return;
  // สุ่มตัวใหม่: ระดับเดียวกันหรือลุ้นอัปเกรด, เลเวลใกล้เคียง
  let tierIdx = TIER_ORDER.indexOf(ind.tier);
  if (Math.random() < 0.25 && tierIdx < TIER_ORDER.length - 1) tierIdx++;   // 25% ได้ระดับสูงขึ้น
  const tier = TIER_ORDER[tierIdx];
  const pool = MONSTERS.filter(m => m._tier === tier);
  const mon = pick(pool.length ? pool : MONSTERS);
  const shiny = Math.random() < SHINY_CHANCE * 2;
  const level = clamp(ind.level + rand(-3, 3), 1, 100);
  state.caught.splice(idx, 1);
  state.party = state.party.filter(u => u !== uid);
  state.buddyUid = state.party[0] || null;
  const nu = makeIndividual(mon.id, level, mon._tier, shiny);
  state.caught.push(nu); state.seen[mon.id] = true;
  save(); renderTopbar();
  toast(`🔄 เทรดได้ ${shiny ? '✨' : ''}<b>${mon.name}</b> (${TIER_LABEL[mon._tier]}) Lv.${level}!`, 'good');
  logMsg(`🔄 เทรด ${MON_BY_ID[ind.id].name} → <b>${mon.name}</b> (${TIER_LABEL[mon._tier]})`, 'big');
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
function renderShop() {
  const items = [
    // บอลทุกชนิด — ซื้อทีละ 1 ลูกเท่านั้น (กดซ้ำได้เรื่อยๆ)
    ...BALL_ORDER.map(k => ({ emoji: BALLS[k].emoji, img: BALLS[k].img, name: BALLS[k].name, desc: BALLS[k].hint, price: BALLS[k].price, act: () => addBalls(k, 1, BALLS[k].price) })),
    { emoji: '🍬', img: 'rare-candy', name: 'Rare Candy ×3', desc: 'เลเวลอัพทันที (ใช้กับตัวใดก็ได้ในคลัง)', price: 450, act: () => { if (spend(450)) { state.candies = (state.candies || 0) + 3; toast('🍬 +3 Rare Candy', 'good'); postBuy(); } } },
    { emoji: '🎫', img: 'member-card', name: 'ตั๋ว Safari', desc: `เข้า Safari Zone ${SAFARI_SPAWNS} ตัวหายากสุดๆ (กดปุ่ม Safari หน้าล่า)`, price: 800, act: () => { if (spend(800)) { state.safariTickets = (state.safariTickets || 0) + 1; toast('🎫 +1 ตั๋ว Safari', 'good'); postBuy(); } } },
    { emoji: '🪙', img: 'amulet-coin', name: `Amulet Coin (${state.amulets || 0}/${AMULET_MAX})`, desc: 'เงินที่ได้จากการจับ +5% ต่อชิ้น สูงสุด +50%', price: AMULET_PRICE, act: () => { if ((state.amulets || 0) >= AMULET_MAX) { toast('มี Amulet Coin เต็มแล้ว', ''); return; } if (spend(AMULET_PRICE)) { state.amulets = (state.amulets || 0) + 1; toast(`🪙 Amulet Coin +1 (เงิน +${state.amulets * 5}%)`, 'good'); postBuy(); } } },
    { emoji: '🥚', name: EGG_KINDS.mystery.name, desc: `ฟักเมื่อจับครบ ${EGG_KINDS.mystery.catches} ตัว · สุ่มทุกระดับ`, price: EGG_KINDS.mystery.price, act: () => buyEgg('mystery') },
    { emoji: '🥚', name: EGG_KINDS.rare.name, desc: `ฟักครบ ${EGG_KINDS.rare.catches} ตัว · ออก Rare/Super Rare`, price: EGG_KINDS.rare.price, act: () => buyEgg('rare') },
    { emoji: '🥚', name: EGG_KINDS.gold.name + ' ✨', desc: `ฟักครบ ${EGG_KINDS.gold.catches} ตัว · ออก Super Rare/Legendary · ลุ้น Shiny สูง`, price: EGG_KINDS.gold.price, act: () => buyEgg('gold') },
    { emoji: '💎', img: 'shiny-stone', name: 'หินวิวัฒนาการ', desc: 'วิวัฒนาการตัวที่ต้องใช้ไอเทม', price: STONE_PRICE, act: () => { if (spend(STONE_PRICE)) { state.stones = (state.stones || 0) + 1; toast('💎 +1 หินวิวัฒนาการ', 'good'); postBuy(); } } },
    { emoji: '💥', img: 'comet-shard', name: `พลังงานไดนาแม็กซ์ (มี ${state.maxEnergy || 0})`, desc: 'ใช้ครั้งละ 1 ในการต่อสู้ · HP×2 + ดาเมจ +30% เป็นเวลา 3 เทิร์น', price: MAX_ENERGY_PRICE, act: () => { if (spend(MAX_ENERGY_PRICE)) { state.maxEnergy = (state.maxEnergy || 0) + 1; toast('💥 +1 พลังงานไดนาแม็กซ์', 'good'); postBuy(); } } },
    { emoji: '💍', img: 'mega-ring', name: state.hasMegaRing ? 'กำไลเมก้า (มีแล้ว)' : 'กำไลเมก้า', desc: 'ปลดล็อกครั้งเดียว ถาวร — จำเป็นก่อนเมก้าอีโวลูชันตัวไหนก็ได้ทั้งหมด', price: MEGA_RING_PRICE, act: () => { if (state.hasMegaRing) { toast('มีกำไลเมก้าอยู่แล้ว', ''); return; } if (spend(MEGA_RING_PRICE)) { state.hasMegaRing = true; toast('💍 ได้กำไลเมก้าแล้ว! เมก้าอีโวลูชันได้ในการต่อสู้', 'good'); postBuy(); checkAchievements(); } } },
    { emoji: '⌚', img: 'macho-brace', name: state.hasDynamaxBand ? 'กำไลไดนาแม็กซ์ (มีแล้ว)' : 'กำไลไดนาแม็กซ์', desc: 'ปลดล็อกครั้งเดียว ถาวร — จำเป็นก่อนไดนาแม็กซ์ตัวไหนก็ได้ทั้งหมด', price: DYNAMAX_BAND_PRICE, act: () => { if (state.hasDynamaxBand) { toast('มีกำไลไดนาแม็กซ์อยู่แล้ว', ''); return; } if (spend(DYNAMAX_BAND_PRICE)) { state.hasDynamaxBand = true; toast('⌚ ได้กำไลไดนาแม็กซ์แล้ว! ไดนาแม็กซ์ได้ในการต่อสู้', 'good'); postBuy(); checkAchievements(); } } },
    { emoji: '🔮', img: 'shiny-charm', name: `Shiny Charm (${state.shinyCharms || 0}/${SHINY_CHARM_MAX})`, desc: `ติดตัวถาวร เพิ่มโอกาส Shiny +${Math.round(SHINY_CHARM_PER * 100)}% ทบต้น (ไม่หมดอายุ)`, price: SHINY_CHARM_PRICE, act: buyShinyCharm },
    { emoji: CHARMS.catch.emoji, img: CHARMS.catch.img, name: 'Catch Charm', desc: CHARMS.catch.desc + ' · 30 นาที', price: CHARMS.catch.price, act: () => buyCharm('catch') },
    { emoji: CHARMS.xp.emoji, img: CHARMS.xp.img, name: 'XP Charm', desc: CHARMS.xp.desc + ' · 30 นาที', price: CHARMS.xp.price, act: () => buyCharm('xp') },
    ...HELD_ORDER.map(k => ({ emoji: HELD_ITEMS[k].emoji, img: HELD_ITEMS[k].img, name: HELD_ITEMS[k].name, desc: '🎽 สวมสู้: ' + HELD_ITEMS[k].desc, price: HELD_ITEMS[k].price, act: () => buyHeld(k) })),
    // แลกด้วยเหรียญตกปลา 🎟️
    { emoji: '🟡', img: 'ultra-ball', name: 'Ultra Ball', desc: 'แลกด้วยเหรียญตกปลา', tokenPrice: 3, act: () => { if (spendTokens(3)) { state.balls.ultra = (state.balls.ultra || 0) + 1; toast('🟡 +1 Ultra Ball', 'good'); postBuy(); } } },
  ];
  $('#shopGrid').innerHTML =
    `<div class="dex-stats">💎 ${state.stones || 0} · 🍬 ${state.candies || 0} · 🎟️ ${state.fishTokens || 0} เหรียญตกปลา · บอล: ` +
    BALL_ORDER.map(k => `${itemIcon(BALLS[k].emoji, BALLS[k].img)}${state.balls[k] || 0}`).join(' ') + `</div>` +
    items.map((it, i) => {
      const isTok = it.tokenPrice != null;
      const owned = (it.img === 'mega-ring' && state.hasMegaRing) || (it.img === 'macho-brace' && state.hasDynamaxBand);
      const cant = owned || (isTok ? (state.fishTokens || 0) < it.tokenPrice : state.coins < it.price);
      const label = owned ? 'มีแล้ว' : (isTok ? `${it.tokenPrice}🎟️` : `${it.price}${itemIcon('🪙', 'nugget', 'price-ico')}`);
      return `<div class="shop-item">
        <div class="emoji">${itemIcon(it.emoji, it.img, 'big')}</div>
        <div class="si-body"><div class="si-name">${it.name}</div><div class="si-desc">${it.desc}</div></div>
        <button class="buy-btn" data-i="${i}" ${cant ? 'disabled' : ''}>${label}</button></div>`;
    }).join('');
  $('#shopGrid').querySelectorAll('.buy-btn[data-i]').forEach(btn => btn.onclick = () => items[+btn.dataset.i].act());
}
function spendTokens(n) { if ((state.fishTokens || 0) < n) { toast('❌ เหรียญตกปลาไม่พอ', 'bad'); return false; } state.fishTokens -= n; return true; }
function spend(n) { if (state.coins < n) { toast('❌ เงินไม่พอ', 'bad'); return false; } state.coins -= n; return true; }
function postBuy() { save(); renderTopbar(); renderShop(); renderBallBar(); }
function addBalls(k, n, price) { if (spend(price)) { state.balls[k] = (state.balls[k] || 0) + n; toast(`${BALLS[k].emoji} +${n} ${BALLS[k].name}`, 'good'); postBuy(); } }
function addBerries(k, n, price) { if (spend(price)) { state.berries[k] = (state.berries[k] || 0) + n; toast(`${BERRIES[k].emoji} +${n} ${BERRIES[k].name}`, 'good'); postBuy(); renderBerryBar(); } }
function buyCharm(k) { if (spend(CHARMS[k].price)) { state.charms[k] = (state.charms[k] || 0) + 1; toast(`${CHARMS[k].emoji} ซื้อ ${CHARMS[k].name} — กดใช้ในเมนู ⚙️`, 'good'); postBuy(); } }
function buyHeld(k) { if (spend(HELD_ITEMS[k].price)) { state.heldInv[k] = (state.heldInv[k] || 0) + 1; toast(`${HELD_ITEMS[k].emoji} ซื้อ ${HELD_ITEMS[k].name} — สวมได้ในหน้าโปเกมอน`, 'good'); postBuy(); } }
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
  if (ch) save();
}
function bumpQuest(type) {   // เพิ่มความคืบหน้าเควสประเภทที่ไม่เกี่ยวกับการจับ (ชนะ/ตกปลา/คอนเทสต์/วิวัฒนาการ)
  let ch = false;
  for (const q of state.quests) {
    if (q.claimed || q.progress >= q.target) continue;
    if (q.type === type) { q.progress++; ch = true; }
  }
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
  if (any) { save(); renderTopbar(); if (currentView === 'menu') renderMenu(); }
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
  renderHallOfFame();
  renderMerchant();
  renderRival();
  renderCloudUI();
  renderIdle();
  renderTower();
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
      <div class="sr-label">🗑️ รีเซ็ตเกม<div class="sr-sub">ลบข้อมูลทั้งหมด เริ่มใหม่</div></div>
      <button class="set-btn danger" id="btnReset">รีเซ็ต</button>
    </div>`;

  $('#tSound').onclick = () => { st.sound = !st.sound; save(); renderMenu(); };
  $('#tMusic').onclick = () => { st.music = !st.music; save(); st.music ? startMusic() : stopMusic(); renderMenu(); };
  $('#tRareAlert').onclick = () => { st.rareAlerts = !st.rareAlerts; save(); renderMenu(); };
  $('#tEventAlert').onclick = () => { st.eventAlerts = !st.eventAlerts; save(); renderMenu(); };
  $('#tMascotDeco').onclick = () => { st.mascotDeco = !st.mascotDeco; save(); renderMenu(); renderRegionBanner(); };
  $('#tReduceMotion').onclick = () => { st.reduceMotion = !st.reduceMotion; save(); applyReduceMotion(); renderMenu(); };
  $('#tConfirmRelease').onclick = () => { st.confirmRelease = !st.confirmRelease; save(); renderMenu(); };
  $('#tFastBattle').onclick = () => { st.fastBattle = !st.fastBattle; save(); renderMenu(); };
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
  box.innerHTML = `<div class="ach done">
      <div class="ach-ico">${itemIcon('🔮', 'shiny-charm', 'big')}</div>
      <div class="ach-body">
        <div class="ach-name">Shiny Charm (ติดตัวถาวร) ${state.shinyCharms || 0}/${SHINY_CHARM_MAX}</div>
        <div class="ach-desc">โอกาส Shiny รวม +${shinyPct}% · ซื้อเพิ่มได้ที่ร้านค้า</div>
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
//  OFFLINE REWARDS + DAILY LOGIN STREAK
// ================================================================
function applyDailyLogin() {
  const today = todayStr();
  if (state.lastLogin === today) return;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = (state.lastLogin === y) ? (state.streak || 0) + 1 : 1;
  state.lastLogin = today;
  const coins = 40 + state.streak * 20;
  const ballN = Math.min(2 + state.streak, 12);
  state.coins += coins; state.balls.poke += ballN;
  if (state.streak % 5 === 0) { state.balls.ultra = (state.balls.ultra || 0) + 1; }
  save();
  setTimeout(() => toast(`📅 ล็อกอินวันที่ ${state.streak} ติดต่อกัน! +${coins}🪙 +${ballN}🔴${state.streak % 5 === 0 ? ' +Ultra🟡' : ''}`, 'good'), 600);
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
  const desc = chosen.act();
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
function renderProfile() {
  const b = getBuddy();
  const tl = trainerLevel();
  const nextXp = Math.pow(tl, 2) * 60;
  const dexPct = Math.round(speciesOwnedCount() / MONSTERS.length * 100);
  const shinyN = state.caught.filter(c => c.shiny).length;
  const legendN = state.caught.filter(c => c.tier === 'legendary').length;
  const playH = Math.floor((state.playSec || 0) / 3600), playM = Math.floor(((state.playSec || 0) % 3600) / 60);
  const partyStrip = state.party.length
    ? `<div class="party-strip">${partyMembers().map((ind, i) => `<div class="party-mini${i === 0 ? ' lead' : ''}" data-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}<span class="pm-lv">L${ind.level}</span></div>`).join('')}</div>`
    : '<div class="sr-sub" style="margin-top:6px">ยังไม่มีทีม — ตั้ง Buddy/เข้าทีมจากคลัง</div>';
  return `<div class="profile-card">
    <div class="profile-top">
      ${b ? spriteImg(b.id, b.shiny) : '<div style="width:56px;height:56px"></div>'}
      <div><div class="profile-lv">👤 เทรนเนอร์ Lv.${tl}</div>
        <div class="profile-sub">Trainer XP ${state.trainerXp || 0} / ${nextXp} · 🔥 streak ${state.streak || 0} วัน</div></div>
    </div>
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
function indRow(ind, sub) {
  if (!ind) return '';
  const m = MON_BY_ID[ind.id];
  return `<div class="ind-row" data-hof-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}
    <div class="ir-main"><div class="ir-name">${ind.shiny ? '✨' : ''}${ind.nick || m.name}</div>
    <div class="ir-sub">${sub}</div></div></div>`;
}
function renderHallOfFame() {
  const box = $('#hallOfFameBox'); if (!box) return;
  if (!state.caught.length) { box.innerHTML = `<div class="sr-sub">ยังไม่มีตัวในคลัง — จับสักตัวก่อนเพื่อเริ่มห้องโชว์!</div>`; return; }
  const byIv = [...state.caught].sort((a, b) => ivPercent(b) - ivPercent(a));
  const topIv = byIv[0];
  const shinies = state.caught.filter(c => c.shiny).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const legends = state.caught.filter(c => c.tier === 'legendary').sort((a, b) => ivPercent(b) - ivPercent(a));
  const oldest = [...state.caught].sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
  const bestFriend = [...state.caught].sort((a, b) => (b.friend || 0) - (a.friend || 0))[0];
  const ribbons = (state.contest && state.contest.ribbons) || {};
  const totalRibbons = Object.values(ribbons).reduce((s, n) => s + n, 0);
  const galleryRow = (list, emptyMsg) => list.length
    ? `<div class="dex-grid">` + list.slice(0, 12).map(ind => {
        const m = MON_BY_ID[ind.id];
        return `<div class="dex-cell" data-hof-uid="${ind.uid}">${spriteImg(ind.id, ind.shiny)}<div class="dname">${ind.nick || m.name}</div><div class="dnum">IV ${ivPercent(ind)}%</div></div>`;
      }).join('') + `</div>`
    : `<div class="sr-sub">${emptyMsg}</div>`;
  box.innerHTML = `
    <div class="stat-grid" style="margin-bottom:10px">
      <div class="stat-tile"><div class="st-num">${legends.length}</div><div class="st-lbl">👑 Legendary</div></div>
      <div class="stat-tile"><div class="st-num">${shinies.length}</div><div class="st-lbl">✨ Shiny</div></div>
      <div class="stat-tile"><div class="st-num">${totalRibbons}</div><div class="st-lbl">🎀 ริบบิ้นคอนเทสต์</div></div>
      <div class="stat-tile"><div class="st-num">${state.tower && state.tower.bestFloor || 0}</div><div class="st-lbl">🗼 ชั้นหอคอยสูงสุด</div></div>
    </div>
    <div style="font-size:12px;font-weight:700;margin-bottom:4px">💯 IV สูงสุดในคลัง</div>
    ${indRow(topIv, `IV ${ivPercent(topIv)}% · นิสัย ${topIv.nature} · Lv.${topIv.level}`)}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">🤝 ตัวที่มิตรภาพดีที่สุด</div>
    ${bestFriend ? indRow(bestFriend, `มิตรภาพ ${bestFriend.friend || 0}/${FRIEND_MAX}`) : '<div class="sr-sub">ยังไม่มี</div>'}
    <div style="font-size:12px;font-weight:700;margin:10px 0 4px">🕰️ ตัวแรกที่จับได้</div>
    ${indRow(oldest, `จับตอน ${new Date(oldest.ts || Date.now()).toLocaleDateString('th-TH')}`)}
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
    <div class="tut-step"><span class="ts-ico">🏆</span><div>ท้า <b>บอสประจำเขต</b> · ทำ <b>เควส/ความสำเร็จ</b> รับรางวัล</div></div>
    <div class="tut-step"><span class="ts-ico">💾</span><div>อย่าลืม <b>Export เซฟ</b> ในเมนู ⚙️ เก็บไว้กันข้อมูลหาย</div></div>
    <div class="modal-actions"><button class="btn-primary" id="tutOk">เริ่มเล่นเลย!</button></div></div>`;
  openModal();
  $('#tutOk').onclick = () => { state.tutorialDone = true; save(); closeModal(); };
}

// ================================================================
//  BATTLE ENGINE
// ================================================================
let battleState = null;
function statsForBase(b, level) {   // คำนวณสเตตัส NPC จาก base stats ใดก็ได้ (IV คงที่ 16)
  const IV = 16;
  const s = key => Math.floor((2 * b[key] + IV) * level / 100) + 5;
  return { hp: Math.floor((2 * b.hp + IV) * level / 100) + level + 10, atk: s('atk'), def: s('def'), spatk: s('spatk'), spdef: s('spdef'), spd: s('spd') };
}
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
function calcDamage(atkMon, atkStats, atkLevel, defMon, defStats, move, held, opts) {
  opts = opts || {};
  const physical = atkStats.atk >= atkStats.spatk;
  let A = physical ? atkStats.atk : atkStats.spatk;
  const D = physical ? defStats.def : defStats.spdef;
  const moveType = move ? move.type : atkMon.types[0];
  let power = move ? move.pow : 55;
  let eff = typeEffect(moveType, defMon.types);
  if (opts.defAbility && opts.defAbility.immuneType === moveType) eff = 0;   // Levitate ฯลฯ
  const isStab = atkMon.types.includes(moveType);
  let stab = isStab ? 1.5 : 1;
  if (isStab && opts.atkAbility && opts.atkAbility.name === 'Adaptability') stab = 2;
  if (opts.atkAbility && opts.atkAbility.boostType === moveType && opts.atkHpRatio != null && opts.atkHpRatio <= 1 / 3) power *= 1.5;   // Blaze/Torrent/Overgrow/Swarm
  if (physical && opts.atkAbility && opts.atkAbility.name === 'Guts' && opts.atkHasStatus) A = Math.floor(A * 1.5);
  const weather = weatherBoosted(moveType);
  const crit = Math.random() < (held === 'scope-lens' ? 4 / 16 : 1 / 16);   // คริติคอล 6.25% (Scope Lens ×4 ~25%)
  let dmg = (((2 * atkLevel / 5 + 2) * power * A / Math.max(1, D)) / 50 + 2);
  dmg = dmg * stab * eff * (0.85 + Math.random() * 0.15) * (crit ? 1.5 : 1) * (weather ? 1.2 : 1);
  if (held === 'life-orb') dmg *= 1.3;                      // Life Orb
  if (held === 'expert-belt' && eff > 1) dmg *= 1.2;        // Expert Belt (ธาตุได้เปรียบ)
  if (opts.defAbility && opts.defAbility.name === 'Multiscale' && opts.defHpRatio != null && opts.defHpRatio >= 1) dmg *= 0.5;
  return { dmg: Math.max(1, Math.floor(dmg)), eff, crit, weather };
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
    return { ind, stats: s, hp: s.hp, maxHp: s.hp, sashUsed: false, sitrusUsed: false, status: null, sleepT: 0, mega: null, dynamax: null, stages: freshStages() };
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
    foeStats = { atk: Math.floor(base.atk * 1.25), def: Math.floor(base.def * 1.25),
      spatk: Math.floor(base.spatk * 1.25), spdef: Math.floor(base.spdef * 1.25), spd: base.spd };
    foeMaxHp = Math.floor(base.hp * 1.3); foeHp = foeMaxHp;
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
    msg: isBoss ? `👑 บอส ${foeMon.name} ท้าดวล!` : `เจอ ${foeMon.name} ป่า — เลือกท่าโจมตี!`,
  };
  battleState.msg += applyIntimidate('player', battleState) + applyIntimidate('foe', battleState);
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
function renderBattle() {
  const b = battleState; if (!b) return;
  const active = b.team[b.activeIdx];
  const mon = MON_BY_ID[active.ind.id];
  const view = activeMonView(active);
  const hpCls = (hp, max) => { const p = hp / max * 100; return p <= 20 ? 'crit' : p <= 50 ? 'low' : ''; };
  const foePct = clamp(b.foeHp / b.foeMaxHp * 100, 0, 100);
  const myPct = clamp(active.hp / active.maxHp * 100, 0, 100);

  const teamStrip = b.team.map((t, i) => {
    const fainted = t.hp <= 0;
    return `<div class="team-chip${i === b.activeIdx ? ' active' : ''}${fainted ? ' fainted' : ''}" data-sw="${i}" title="${MON_BY_ID[t.ind.id].name} HP ${Math.ceil(t.hp)}/${t.maxHp}">
      ${spriteImg(t.ind.id, t.ind.shiny)}<span class="tc-hp">${Math.ceil(t.hp)}</span></div>`;
  }).join('');

  const foeTypes = b.foeTypes || b.foeMon.types;
  const foeSpriteId = b.foeSpriteId || b.foeMon.id;
  const foeName = b.foeDisplayName || b.foeMon.name;
  const foeAbility = abilityFor(b.foeMon.id), myAbility = abilityFor(active.ind.id);
  const abilityBadge = ab => ab ? `<span class="badge" style="background:#2c3a55" title="${ab.desc}">🧬 ${ab.name}</span>` : '';
  const curWeather = WEATHERS[getWeather(state.region)];
  const moves = getMoves(active.ind.id);
  const moveBtns = moves.map((mv, i) => {
    const e = typeEffect(mv.type, foeTypes);
    const tag = e > 1 ? '↑' : e < 1 ? '↓' : '';
    const prio = mv.priority > 0 ? ' ⚡' : '';
    const wBoost = weatherBoosted(mv.type) ? ` ${curWeather.emoji}` : '';
    return `<button class="move-btn t-${mv.type}" data-mv="${i}" title="${mv.priority > 0 ? 'ท่า Priority — โจมตีก่อนเสมอ' : ''}">${mv.name}${prio} <b>${mv.pow}</b>${tag}${wBoost}<span class="mv-acc">🎯${mv.acc}%</span></button>`;
  }).join('');

  const canMega = state.hasMegaRing && !b.usedMega && !active.mega && !!(megaFormsFor(active.ind.id) || []).find(f => f.key === active.ind.megaKey);
  const canDynamax = state.hasDynamaxBand && !b.usedDynamax && !active.dynamax && (state.maxEnergy || 0) > 0;
  const specialBadge = view.special ? `<span class="badge" style="background:linear-gradient(90deg,#ff6b6b,#ffcb05)">${active.mega ? '💎 MEGA' : '💥 G-MAX'}</span>` : (active.dynamax ? `<span class="badge" style="background:#e23b4e">💥 DYNAMAX ${active.dynamax.turnsLeft}T</span>` : '');
  const foeSpecialBadge = b.special ? `<span class="badge" style="background:${b.special === 'mega' ? 'linear-gradient(90deg,#8e5bff,#5a2ba8)' : b.special === 'gmax' ? 'linear-gradient(90deg,#ff6b6b,#c1122e)' : '#555'}">${b.special === 'mega' ? '💎 MEGA' : b.special === 'gmax' ? '💥 G-MAX' : '⭐ ELITE'}</span>` : '';

  $('#battleBox').innerHTML = `
    ${curWeather.boost && curWeather.boost.length ? `<div style="font-size:11px;color:#9fd3ff;font-weight:700;text-align:center;margin-bottom:4px">${curWeather.emoji} ${curWeather.name} — ท่าธาตุ ${curWeather.boost.join('/')} แรงขึ้น ×1.2${curWeather.dotImmune ? ` · ธาตุอื่นโดนซัดทุกเทิร์น (ยกเว้น ${curWeather.dotImmune.join('/')})` : ''}</div>` : ''}
    <div class="battle-arena">
      <div class="bt-side foe">
        ${b.mode === 'trainer' ? `<div style="font-size:11px;color:#ffb3bb;font-weight:700">${b.gym.emoji} ${b.gym.name} · เหลือศัตรู ${b.foeQueue.length - b.foeIdx}/${b.foeQueue.length}</div>` : ''}
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
           ${canDynamax ? `<button class="bt-flee" id="btDynamax" ${battleBusy ? 'disabled' : ''} style="background:linear-gradient(180deg,#ff6b6b,#c1122e);color:#fff">💥 ไดนาแม็กซ์ (${state.maxEnergy}⚡)</button>` : ''}
         </div>` : ''}
         <div class="move-grid${battleBusy ? ' move-grid-busy' : ''}">${moveBtns}</div>
         <div class="bt-actions"><button class="bt-flee" id="btFlee" ${battleBusy ? 'disabled' : ''}>${b.isBoss ? 'ยอมแพ้' : (b.mode === 'tower' ? 'ล่าถอย (เก็บชั้นปัจจุบันไว้)' : 'หนี')}</button></div>`}`;

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
  if (!state.hasDynamaxBand) { toast('❌ ต้องมีกำไลไดนาแม็กซ์ก่อน (ซื้อได้ที่ร้าน)', 'bad'); return; }
  if ((state.maxEnergy || 0) <= 0) { toast('❌ ไม่มีพลังงานไดนาแม็กซ์ (ซื้อได้ที่ร้าน)', 'bad'); return; }
  const active = b.team[b.activeIdx];
  state.maxEnergy--; b.usedDynamax = true;
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
  const next = b.team.findIndex(t => t.hp > 0);
  if (next < 0) {
    b.over = true; b.lost = true;
    if (b.mode === 'wild') { b.msg += ` · แต่โปเกมอนป่ายังเหลือ HP ${Math.ceil(b.foeHp)}`; }
    else if (b.mode === 'tower') {
      const lostFloor = b.floorNow;
      state.tower.floor = 1;   // แพ้ = รีเซ็ตกลับชั้น 1 (สถิติสูงสุดยังเก็บไว้)
      b.msg += ` · 🗼 แพ้ที่ชั้น ${lostFloor}! หอคอยรีเซ็ตกลับชั้น 1 (สถิติสูงสุด ${state.tower.bestFloor || 0})`;
      save();
    } else {
      b.msg += ' · แพ้! ลองใหม่';
      if (b.isRival) { state.rival = state.rival || { readyAt: 0, wins: 0, losses: 0 }; state.rival.losses = (state.rival.losses || 0) + 1; save(); }
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
  const mv = getMoves(active.ind.id)[moveIdx] || getMoves(active.ind.id)[0];
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
    b.msg += `${view.name} ใช้ ${mv.name}! ${atk.crit ? '🎯 คริติคอล! ' : ''}${atk.weather ? '🌦️ อากาศช่วย! ' : ''}-${dmg}${atk.eff > 1 ? ' (ได้เปรียบ!)' : atk.eff < 1 ? ' (เสียเปรียบ)' : ''}${sturdyMsg}`;
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
      b.msg = `🔥 ชนะคู่แข่ง ${RIVAL_NAME}! +${reward}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''} (ชนะรวม ${state.rival.wins} ครั้ง)`;
      logMsg(`🔥 ชนะคู่แข่ง <b>${RIVAL_NAME}</b>! +${reward}🪙 +${bp}BP ${itemMsg}`, 'big');
      playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
      return;
    }
    // ชนะยิม
    const g = b.gym, first = !state.gymsBeaten[g.id];
    state.gymsBeaten[g.id] = true;
    state.coins += g.reward;
    const bp = (GYMS.indexOf(g) + 1) * (first ? 20 : 8);
    state.battlePoints = (state.battlePoints || 0) + bp;
    const itemMsg = grantItemRewards(g.items);
    if (first) { state.fishTokens = (state.fishTokens || 0) + 8; state.lockboxes = (state.lockboxes || 0) + 1; }
    gainTrainerXp(150);
    b.msg = `🏆 ชนะ ${g.emoji} ${g.name}! +${g.reward}🪙 +${bp}🎖️BP${itemMsg ? ' +' + itemMsg : ''}${first ? ' +🎁กล่องสุ่ม (ชนะครั้งแรก!)' : ''}`;
    logMsg(`🏆 พิชิต <b>${g.name}</b>! +${g.reward}🪙 +${bp}BP ${itemMsg}`, 'big');
    playSfx('rare'); checkAchievements(); bumpQuest('winBattle'); save(); renderTopbar();
    return;
  }
  b.over = true;
  if (b.isBoss) {
    state.badges[b.bossData.region.id] = true;
    const reward = 200 + b.foeLevel * 10;
    const bp = 40;
    state.coins += reward;
    state.battlePoints = (state.battlePoints || 0) + bp;
    state.balls.ultra = (state.balls.ultra || 0) + 2;
    gainXpTo(active.ind, Math.round(b.foeLevel * 2.5)); gainTrainerXp(80);
    b.msg = `🏆 ชนะบอส ${b.foeMon.name}! ได้ 🏅 เหรียญตรา + ${reward}🪙 + ${bp}🎖️BP + Ultra Ball ×2`;
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
  battleState = null;
  $('#battleModal').classList.add('hidden');
  if (wasMode === 'wild') { renderSpawn(); renderBerryBar(); }
  if (currentView === 'map') renderMap();
  if (currentView === 'menu') renderMenu();
  renderTopbar();
}
function startBossBattle(regionId) {
  const r = REGION_BY_ID[regionId];
  if (r.unlock && !state.unlocked[regionId]) { toast('🔒 ปลดล็อกเขตนี้ก่อน', 'bad'); return; }
  // เลือกบอส = ตัวระดับสูงสุดที่มีในเขต
  let bossMon = null;
  for (let i = TIER_ORDER.length - 1; i >= 0 && !bossMon; i--) {
    const p = r._byTier[TIER_ORDER[i]];
    if (p && p.length) bossMon = p.reduce((a, c) => c._bst > a._bst ? c : a, p[0]);
  }
  if (!bossMon) { toast('เขตนี้ยังไม่มีบอส', 'bad'); return; }
  const level = r.lvl[1] + 6;
  startBattle(true, { mon: bossMon, level, region: r });
}
// โหลดศัตรูตัวถัดไปเข้า current-foe fields (ใช้ในโหมดเทรนเนอร์) — statMult ใช้บูสต์เอซ/บอสให้แรงขึ้นจริง
// giveHeld: true = สุ่มไอเทมถือให้ (ใช้กับเอซ/บอสเท่านั้น ให้ท้าทายขึ้นจริง ไม่ใช่แค่บวกสเตตัสเฉยๆ)
function makeFoeDef(mon, level, statMult, giveHeld) {
  const base = statsForWild(mon, level);
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
  b.foe = { status: null, sleepT: 0, stages: freshStages() };   // ศัตรูตัวใหม่ = สถานะ/สเตตัสเคลียร์
}
function startTrainerBattle(gymId) {
  const g = GYMS.find(x => x.id === gymId); if (!g) return;
  const idx = GYMS.indexOf(g);
  const prevBeaten = idx === 0 || state.gymsBeaten[GYMS[idx - 1].id];
  if (!prevBeaten) { toast('🔒 ต้องชนะยิมก่อนหน้าก่อน', 'bad'); return; }
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  // สร้างทีมศัตรูจากธาตุยิม + เอนไปทางระดับหายากตาม tierBias (ยิมสูง = ศัตรูแรงจริง ไม่ใช่สุ่มมั่วๆ)
  const typePool = g.type ? MONSTERS.filter(m => m.types.includes(g.type)) : MONSTERS.filter(m => m._tier === 'superrare' || m._tier === 'legendary');
  const tierPool = (g.tierBias && g.tierBias.length) ? typePool.filter(m => g.tierBias.includes(m._tier)) : typePool;
  const pool = tierPool.length ? tierPool : (typePool.length ? typePool : MONSTERS);
  const queue = [];
  for (let i = 0; i < g.count; i++) {
    const isAce = i === g.count - 1;
    const mon = pick(pool);
    const lv = clamp(g.lvl + rand(-2, 3) + (isAce ? 6 : 0), 1, 100);   // เอซ (ตัวสุดท้าย) เลเวลสูง+สเตตัสบูสต์ 25%+ไอเทมถือ
    queue.push(makeFoeDef(mon, lv, isAce ? 1.25 : 1.0, isAce));
  }
  const team = buildBattleTeam(members);
  battleState = {
    mode: 'trainer', isBoss: false, gym: g, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
    msg: `${g.emoji} ${g.name} — ศัตรู ${g.count} ตัว! เลือกท่าโจมตี`,
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
  const count = 3;
  const queue = [];
  for (let i = 0; i < count; i++) {
    const isAce = i === count - 1;
    const mon = pick(pool);
    const lv = clamp(rivalLvl + rand(-2, 3) + (isAce ? 5 : 0), 1, 100);
    queue.push(makeFoeDef(mon, lv, isAce ? 1.2 : 1.0, isAce));
  }
  const team = buildBattleTeam(members);
  const rivalGym = { id: 'rival', name: `คู่แข่ง ${RIVAL_NAME}`, emoji: '🔥', reward: 300 + tl * 50, items: [['ultra', 2], ['candy', 2]] };
  battleState = {
    mode: 'trainer', isBoss: false, isRival: true, gym: rivalGym, foeQueue: queue, foeIdx: 0,
    foeMon: queue[0].mon, foeLevel: queue[0].level, foeStats: queue[0].stats, foeMaxHp: queue[0].maxHp, foeHp: queue[0].maxHp, foeHeld: queue[0].held || null,
    team, activeIdx: 0, over: false, lost: false, foe: { status: null, sleepT: 0, stages: freshStages() },
    usedMega: false, usedDynamax: false,
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
  box.innerHTML = `<div class="preset-row"><span class="pr-name">🔥 ${RIVAL_NAME} · Lv.~${clamp(10 + tl * 3, 10, 100)} · ชนะ ${state.rival.wins || 0} แพ้ ${state.rival.losses || 0}</span>
    <div class="pr-actions"><button class="claim-btn" id="btnRival" ${left > 0 ? 'disabled' : ''}>${left > 0 ? `รอ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'ท้าดวล'}</button></div></div>`;
  const btn = $('#btnRival'); if (btn) btn.onclick = startRivalBattle;
}
function updateRivalCd() {
  if (!$('#rivalBox') || currentView !== 'menu') return;
  renderRival();
}

// ================================================================
//  หอคอยไต่ระดับ (Battle Tower) — ยิ่งสูงยิ่งยาก ของยิ่งดี
//  ไม่ฮีลระหว่างชั้น (HP ค้างจากชั้นก่อน) · แพ้ = รีเซ็ตกลับชั้น 1 · ทุก 5 ชั้นเจอบอส
//  ชั้นสูงพอ: บอสอาจเป็นเมก้า/ไดนาแม็กซ์ (เฉพาะสายพันธุ์ที่มีร่างจริงเท่านั้น)
// ================================================================
const TOWER_BOSS_EVERY = 5;
const TOWER_MEGA_FLOOR = 20, TOWER_GMAX_FLOOR = 12;   // ต้องขึ้นสูงพอสมควรถึงจะเจอบอสร่างพิเศษ
function towerFoeDef(floor) {
  const lvl = clamp(18 + floor * 4, 18, 100);
  let tierPool;
  if (floor < 5) tierPool = ['common', 'uncommon'];
  else if (floor < 10) tierPool = ['uncommon', 'rare'];
  else if (floor < 20) tierPool = ['rare', 'superrare'];
  else tierPool = ['superrare', 'legendary'];
  const pool = MONSTERS.filter(m => tierPool.includes(m._tier));
  const mon = pick(pool.length ? pool : MONSTERS);
  const isBossFloor = floor % TOWER_BOSS_EVERY === 0;
  let special = null;
  if (isBossFloor) {
    if (floor >= TOWER_MEGA_FLOOR && megaFormsFor(mon.id) && Math.random() < 0.7) special = 'mega';
    else if (floor >= TOWER_GMAX_FLOOR && gmaxFormFor(mon.id) && Math.random() < 0.7) special = 'gmax';
    else special = 'elite';
  }
  const held = isBossFloor ? pick(FOE_HELD_POOL) : null;   // ชั้นบอสถือไอเทมด้วย ท้าทายขึ้นจริง
  return { mon, lvl, isBossFloor, special, held };
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
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน', 'bad'); return; }
  const floor = state.tower.floor || 1;
  const def = towerFoeDef(floor);
  const team = buildBattleTeam(members);
  battleState = {
    mode: 'tower', isBoss: false, team, activeIdx: 0, over: false, lost: false,
    foeQueue: [{ mon: def.mon }], foeIdx: 0, usedMega: false, usedDynamax: false,
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
  applyDailyLogin();
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
  $('#dexSearch').addEventListener('input', renderDex);
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
  applyReduceMotion();
  window.addEventListener('beforeunload', () => { state.lastSeen = Date.now(); save(); });

  if (!state.tutorialDone) setTimeout(showTutorial, 400);
  if (state.settings.music) document.addEventListener('pointerdown', () => startMusic(), { once: true });

  initCloud();   // เชื่อมคลาวด์ (ถ้าตั้งค่าไว้)
}
document.addEventListener('DOMContentLoaded', init);
