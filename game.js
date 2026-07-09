/* ================================================================
   PokePP — เกมจับมอนสเตอร์สไตล์ PokeMeow + แผนที่สไตล์ PokeRogue
   ปาบอล (ไม่พิมพ์ชื่อ) · ระดับความหายาก · โปเกมอนรายตัว (nature/เพศ/IV)
   ================================================================ */
'use strict';

// ---------- config ----------
const SAVE_KEY = 'pokepp_save_v2';
const SP = {
  gif:   id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${id}.gif`,
  shiny: id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/shiny/${id}.gif`,
  art:   id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  png:   id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
};
const SPAWN_MIN = 9000, SPAWN_MAX = 16000;
const FLEE_MS = 45000;
const SHINY_CHANCE = 1 / 380;

// รางวัลเงิน/XP ตามระดับ
const TIER_COIN = { common: 10, uncommon: 22, rare: 55, superrare: 130, legendary: 320 };
const TIER_XP   = { common: 14, uncommon: 26, rare: 55, superrare: 110, legendary: 240 };
const TIER_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
const TIER_ORDER = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];

// น้ำหนักการสุ่มระดับ ตาม "rarityBoost" ของเขต
const TIER_WEIGHTS = {
  0: { common: 56, uncommon: 27, rare: 12, superrare: 4, legendary: 1 },
  1: { common: 42, uncommon: 29, rare: 18, superrare: 8,  legendary: 3 },
  2: { common: 28, uncommon: 27, rare: 23, superrare: 15, legendary: 7 },
};

// ชนิดบอล — บางลูกมีโบนัสตามเงื่อนไข (cond)
const BALLS = {
  poke:   { name: 'Poké Ball',  emoji: '🔴', mult: 1.0, add: 0.00, price: 20, hint: 'พื้นฐาน' },
  great:  { name: 'Great Ball', emoji: '🔵', mult: 1.7, add: 0.03, price: 65, hint: '×1.7' },
  ultra:  { name: 'Ultra Ball', emoji: '🟡', mult: 2.6, add: 0.09, price: 160, hint: '×2.6' },
  net:    { name: 'Net Ball',   emoji: '🕸️', mult: 1.0, add: 0.00, price: 110, hint: '×3.3 ธาตุน้ำ/แมลง',
           cond: ctx => ctx.mon.types.some(t => t === 'water' || t === 'bug') ? { mult: 3.3 } : {} },
  dusk:   { name: 'Dusk Ball',  emoji: '🌑', mult: 1.0, add: 0.00, price: 110, hint: '×3.3 กลางคืน/ถ้ำ',
           cond: ctx => (ctx.time === 'night' || ctx.region.id === 'cave') ? { mult: 3.3 } : {} },
  quick:  { name: 'Quick Ball', emoji: '⚡', mult: 1.0, add: 0.00, price: 130, hint: '×4 ลูกแรก',
           cond: ctx => ctx.throws === 0 ? { mult: 4.0 } : {} },
  master: { name: 'Master Ball', emoji: '🟣', mult: 999, add: 1,    price: 9000, hint: '100%' },
};
const BALL_ORDER = ['poke', 'great', 'ultra', 'net', 'dusk', 'quick', 'master'];

// สภาพอากาศ (สุ่มต่อเขต) + กลางวัน/กลางคืน + อีเวนต์
const WEATHERS = {
  clear: { name: 'แจ่มใส', emoji: '☀️', boost: [] },
  rain:  { name: 'ฝนตก', emoji: '🌧️', boost: ['water', 'electric'] },
  snow:  { name: 'หิมะโปรย', emoji: '🌨️', boost: ['ice'] },
  sand:  { name: 'พายุทราย', emoji: '🏜️', boost: ['rock', 'ground', 'steel'] },
  fog:   { name: 'หมอกหนา', emoji: '🌫️', boost: ['ghost', 'dark', 'poison'] },
};
const NIGHT_BOOST = ['dark', 'ghost', 'psychic', 'fairy'];
const DAY_BOOST = ['normal', 'grass', 'bug', 'flying', 'fire'];
const WEATHER_MS = 7 * 60000;   // อากาศเปลี่ยนทุก ~7 นาที

// เบอร์รี่ (โยนก่อนปาบอลเพื่อเพิ่มโอกาสจับ)
const BERRIES = {
  razz:   { name: 'Razz Berry', emoji: '🍓', add: 0.13, price: 45 },
  golden: { name: 'Golden Razz', emoji: '🥭', add: 0.32, price: 170 },
};
const BERRY_ORDER = ['razz', 'golden'];

const EGG_PRICE = 450, STONE_PRICE = 600, EGG_HATCH_CATCHES = 15;

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

// ท่าโจมตีมาตรฐานต่อธาตุ (ใช้สร้าง moveset ให้แต่ละตัว)
const TYPE_MOVE = {
  normal: { name: 'Body Slam', pow: 60 }, fire: { name: 'Flamethrower', pow: 90 }, water: { name: 'Surf', pow: 90 },
  electric: { name: 'Thunderbolt', pow: 90 }, grass: { name: 'Energy Ball', pow: 85 }, ice: { name: 'Ice Beam', pow: 90 },
  fighting: { name: 'Close Combat', pow: 100 }, poison: { name: 'Sludge Bomb', pow: 90 }, ground: { name: 'Earthquake', pow: 100 },
  flying: { name: 'Air Slash', pow: 75 }, psychic: { name: 'Psychic', pow: 90 }, bug: { name: 'Bug Buzz', pow: 90 },
  rock: { name: 'Rock Slide', pow: 75 }, ghost: { name: 'Shadow Ball', pow: 80 }, dragon: { name: 'Dragon Pulse', pow: 85 },
  dark: { name: 'Dark Pulse', pow: 80 }, steel: { name: 'Iron Head', pow: 80 }, fairy: { name: 'Moonblast', pow: 95 },
};
function getMoves(id) {
  const m = MON_BY_ID[id];
  const moves = m.types.map(t => ({ type: t, name: TYPE_MOVE[t].name, pow: TYPE_MOVE[t].pow }));
  moves.push({ type: 'normal', name: 'Quick Attack', pow: 40 });   // ท่าติดตัว
  const seen = new Set();
  return moves.filter(mv => { if (seen.has(mv.name)) return false; seen.add(mv.name); return true; }).slice(0, 4);
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
const REGIONS = [
  { id: 'plains', name: 'ทุ่งหญ้าเริ่มต้น', emoji: '🌾', types: ['normal', 'grass', 'bug', 'flying'],
    lvl: [2, 14], boost: 0, deco: ['🌾', '🌿', '🦋', '☁️', '🌻'],
    bg: 'linear-gradient(180deg,#8fd0f0 0%,#87ceeb 42%,#7ec850 42%,#4a9e3f 100%)',
    desc: 'เขตมือใหม่ ปลอดภัย โปเกมอนธรรมดา' },
  { id: 'forest', name: 'ป่าลึกครึ้ม', emoji: '🌲', types: ['bug', 'grass', 'poison', 'flying'],
    lvl: [6, 22], boost: 0, deco: ['🌲', '🍄', '🌿', '🦋', '🕸️'],
    bg: 'linear-gradient(180deg,#3b6b2e 0%,#1f3d15 100%)', desc: 'ต้นไม้หนาทึบ เต็มไปด้วยแมลง' },
  { id: 'sea', name: 'ชายฝั่งทะเล', emoji: '🌊', types: ['water', 'ice', 'flying'],
    lvl: [8, 26], boost: 0, deco: ['🌊', '🐚', '⛵', '☀️', '🐠'],
    bg: 'linear-gradient(180deg,#7ec8f0 0%,#2b8fc9 45%,#12557f 100%)', desc: 'คลื่นซัดสาด โปเกมอนน้ำชุกชุม' },
  { id: 'cave', name: 'ถ้ำมืดใต้ดิน', emoji: '🪨', types: ['rock', 'ground', 'steel', 'dark', 'poison'],
    lvl: [12, 32], boost: 1, deco: ['🪨', '💎', '🦇', '🕳️'],
    bg: 'linear-gradient(180deg,#3a3a4a 0%,#161620 100%)', desc: 'อับแสง ระวังโปเกมอนหิน/ดิน', unlock: 8 },
  { id: 'volcano', name: 'ปล่องภูเขาไฟ', emoji: '🌋', types: ['fire', 'rock', 'ground'],
    lvl: [18, 40], boost: 1, deco: ['🌋', '🔥', '🪨', '💥'],
    bg: 'linear-gradient(180deg,#7a2b1a 0%,#3a0f08 100%)', desc: 'ร้อนระอุ โปเกมอนไฟดุร้าย', unlock: 12 },
  { id: 'power', name: 'โรงไฟฟ้าร้าง', emoji: '⚡', types: ['electric', 'steel', 'poison'],
    lvl: [15, 36], boost: 1, deco: ['⚡', '🔌', '💡', '🔋'],
    bg: 'linear-gradient(180deg,#4a4620 0%,#26240e 100%)', desc: 'กระแสไฟฟ้ารั่ว เต็มไปด้วยพลัง', unlock: 15 },
  { id: 'snow', name: 'ยอดเขาหิมะ', emoji: '❄️', types: ['ice', 'water', 'flying', 'rock'],
    lvl: [22, 44], boost: 2, deco: ['❄️', '🏔️', '🌨️', '⛄'],
    bg: 'linear-gradient(180deg,#dbeeff 0%,#9dc3e6 55%,#6f96c4 100%)', desc: 'หนาวเหน็บ ตัวหายากซ่อนอยู่', unlock: 25 },
  { id: 'mystic', name: 'ดินแดนลึกลับ', emoji: '🔮', types: ['psychic', 'ghost', 'dragon', 'fairy', 'dark'],
    lvl: [30, 60], boost: 2, deco: ['🔮', '✨', '🌌', '👻', '🐉'],
    bg: 'linear-gradient(180deg,#432a70 0%,#180830 100%)', desc: 'พลังลึกลับ โอกาสเจอเลเจนดารีสูง', unlock: 40 },
];
const REGION_BY_ID = {};
REGIONS.forEach(r => { REGION_BY_ID[r.id] = r; });

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
  const primary = shiny ? SP.shiny(id) : SP.gif(id);
  return `<img class="${cls || ''}" src="${primary}"
    onerror="this.onerror=null;this.src='${SP.art(id)}';this.onerror=function(){this.onerror=null;this.src='${SP.png(id)}';}" alt="">`;
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
    stones: 0,
    selBall: 'poke',
    region: 'plains',
    unlocked: { plains: true },
    weather: {},         // {regionId:{type,until}}
    dexRewards: {},      // {rewardId:true} รับรางวัลจบเดกซ์แล้ว
    badges: {},          // {regionId:true} ชนะบอสแล้ว
    caught: [],          // รายตัว: {uid,id,level,xp,tier,shiny,nature,gender,iv{},locked}
    seen: {},            // {id:true}
    party: [],           // [uid,...] ทีมสูงสุด 6 ตัว (party[0] = หัวหน้า/Buddy)
    buddyUid: null,      // เก็บไว้เผื่อ save เก่า (ใช้ party แทน)
    eggs: [],
    quests: [], questDate: '',
    achievements: {},    // {achId:true} รับรางวัลแล้ว
    settings: { sound: true, music: false, spawnSpeed: 'normal' },
    trainerXp: 0,
    streak: 0, lastLogin: '',
    lastSeen: Date.now(), playSec: 0,
    tutorialDone: false,
    _evolved: false,
    totalCaught: 0,
    createdAt: Date.now(),
  };
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { state = Object.assign(newSave(), JSON.parse(raw)); migrateSave(); return; }
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
  while (box.children.length > 8) box.lastChild.remove();
}
function showRareAlert(mon, tier, shiny) {
  const el = $('#rareAlert');
  const label = shiny ? '✨ SHINY!' : '⭐ ' + TIER_LABEL[tier];
  el.className = 'rare-alert' + (shiny ? ' shiny' : '');
  el.innerHTML = `<div class="ra-tier">${label}</div>พบ <b>${mon.name}</b> ในป่า!`;
  playSfx('rare');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 6000);
}
function hideRareAlert() { $('#rareAlert').classList.add('hidden'); }

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
function calcStats(ind) {
  const b = MON_BY_ID[ind.id].stats, iv = ind.iv, L = ind.level;
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
    img.src = (b.shiny ? SP.shiny : SP.gif)(b.id);
    img.onerror = function () { this.onerror = null; this.src = SP.png(b.id); };
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
  checkAchievements();
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
function levelFor(r, tier) {
  const [lo, hi] = r.lvl;
  const bump = { common: 0, uncommon: .12, rare: .3, superrare: .55, legendary: .8 }[tier];
  const mid = lo + (hi - lo) * bump;
  return clamp(Math.round(mid + rand(-2, 4)), lo, hi + 4);
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
function spawnBoostTypes() {
  const set = new Set();
  (WEATHERS[getWeather(state.region)].boost).forEach(t => set.add(t));
  (timeOfDay() === 'night' ? NIGHT_BOOST : DAY_BOOST).forEach(t => set.add(t));
  return set;
}
function shinyMultiplier() {
  let m = 1;
  if (isEventActive()) m *= 2;         // อีเวนต์สุดสัปดาห์ shiny ×2
  if (timeOfDay() === 'night') m *= 1.3;
  return m;
}
function doSpawn() {
  clearTimeout(spawnTimer);   // กัน spawn ซ้อน
  const r = region();
  let boost = r.boost + (isEventActive() ? 1 : 0);   // อีเวนต์ดันโอกาสตัวหายาก
  let tier = weightedTier(Math.min(2, boost));
  // ถ้าเขตนี้ไม่มีตัวระดับนั้น ลดระดับลงเรื่อยๆ
  let ti = TIER_ORDER.indexOf(tier);
  while (ti >= 0 && (!r._byTier[TIER_ORDER[ti]] || !r._byTier[TIER_ORDER[ti]].length)) ti--;
  tier = TIER_ORDER[Math.max(0, ti)];
  let pool = r._byTier[tier];
  if (!pool || !pool.length) pool = r._pool.length ? r._pool : MONSTERS;
  // เอนไปตามอากาศ/เวลา: 55% พยายามเลือกตัวธาตุที่ถูกบูสต์
  const boostTypes = spawnBoostTypes();
  let mon;
  if (boostTypes.size && Math.random() < 0.55) {
    const sub = pool.filter(m => m.types.some(t => boostTypes.has(t)));
    mon = sub.length ? pick(sub) : pick(pool);
  } else mon = pick(pool);
  const shiny = Math.random() < SHINY_CHANCE * shinyMultiplier();
  const level = levelFor(r, mon._tier);
  const maxHp = wildMaxHp(mon, level);

  currentSpawn = { mon, tier: mon._tier, shiny, level, throws: 0, deadline: Date.now() + FLEE_MS,
    maxHp, hp: maxHp, berry: null };
  state.seen[mon.id] = true;
  renderSpawn();

  if (shiny || mon._tier === 'rare' || mon._tier === 'superrare' || mon._tier === 'legendary') {
    showRareAlert(mon, mon._tier, shiny);
    logMsg(`${shiny ? '✨' : '⭐'} พบ <b>${mon.name}</b> (${shiny ? 'Shiny' : TIER_LABEL[mon._tier]}) Lv.${level}!`, 'big');
  }
  clearTimeout(despawnTimer);
  despawnTimer = setTimeout(fleeSpawn, FLEE_MS);
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
  const ev = isEventActive() ? ' · <b style="color:var(--accent)">✨อีเวนต์ x2</b>' : '';
  $('#rbLvl').innerHTML = `Lv.${r.lvl[0]}-${r.lvl[1]} · ${timeIco} · ${w.emoji}${w.name}${ev}`;
  const card = $('#spawnCard');
  card.style.background = r.bg;
  card.classList.toggle('night', timeOfDay() === 'night');
  $('#spawnDeco').innerHTML = r.deco.map((d, i) =>
    `<span style="left:${8 + i * 20}%;top:${10 + (i % 3) * 26}%;animation-delay:${i * .6}s">${d}</span>`).join('');
}
function renderSpawn() {
  const card = $('#spawnCard');
  card.classList.remove('rare-glow', 'legend-glow', 'shiny-glow');
  const throwBtn = $('#throwBtn'), battleBtn = $('#battleBtn');
  if (!currentSpawn) {
    card.classList.add('empty');
    $('#spawnTop').innerHTML = '';
    $('#spawnTags').innerHTML = '';
    $('#wildHp').innerHTML = '';
    $('#spawnTimer').innerHTML = '<div class="empty-msg">🔎 กำลังค้นหาโปเกมอนในเขตนี้...</div>';
    throwBtn.disabled = true;
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
    `<span class="lv-badge">Lv.${level}</span>` + (shiny ? '<span class="lv-badge">✨</span>' : '');
  $('#spawnTags').innerHTML =
    mon.types.map(t => `<span class="badge t-${t}">${t}</span>`).join('') +
    `<span class="badge rarity-${shiny ? 'shiny' : tier}">${shiny ? 'shiny' : TIER_LABEL[tier]}</span>`;
  renderWildHp();
  renderBerryBar();
  updateThrowBtn();
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
      <div class="be">${b.emoji}</div>
      <div class="bn">${b.name.replace(' Ball', '')}</div>
      <div class="bc">×${have}</div></div>`;
  }).join('');
  bar.querySelectorAll('.ball-opt').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.ball;
      if ((state.balls[k] || 0) <= 0) { toast('❌ บอลชนิดนี้หมด', 'bad'); return; }
      state.selBall = k; save(); renderBallBar(); updateThrowBtn();
    };
  });
}
function renderBerryBar() {
  const bar = $('#berryBar');
  if (!currentSpawn) { bar.innerHTML = ''; return; }
  if (currentSpawn.berry) {
    bar.innerHTML = `<div class="berry-active">${currentSpawn.berry.emoji} ใช้ ${currentSpawn.berry.name} แล้ว · โอกาสจับ +${Math.round(currentSpawn.berry.add * 100)}%</div>`;
    return;
  }
  bar.innerHTML = BERRY_ORDER.map(k => {
    const b = BERRIES[k], have = state.berries[k] || 0;
    return `<div class="berry-opt${have <= 0 ? ' disabled' : ''}" data-berry="${k}">
      <div class="be">${b.emoji}</div><div class="bn">${b.name.replace(' Berry', '')}</div>
      <div class="bc">×${have} +${Math.round(b.add * 100)}%</div></div>`;
  }).join('');
  bar.querySelectorAll('.berry-opt').forEach(el => el.onclick = () => throwBerry(el.dataset.berry));
}
function throwBerry(k) {
  if (!currentSpawn) return;
  if (currentSpawn.berry) { toast('❌ ใช้เบอร์รี่ไปแล้วกับตัวนี้', 'bad'); return; }
  if ((state.berries[k] || 0) <= 0) { toast('❌ ไม่มีเบอร์รี่นี้', 'bad'); return; }
  state.berries[k]--;
  const b = BERRIES[k];
  currentSpawn.berry = { add: b.add, name: b.name, emoji: b.emoji };
  toast(`${b.emoji} โยน ${b.name} · โอกาสจับเพิ่มขึ้น!`, 'good');
  logMsg(`${b.emoji} โยน ${b.name} ใส่ ${currentSpawn.mon.name}`, '');
  save(); renderBerryBar();
}
function updateThrowBtn() {
  const btn = $('#throwBtn');
  const have = state.balls[state.selBall] || 0;
  if (!currentSpawn) { btn.disabled = true; btn.textContent = 'ยังไม่มีโปเกมอน'; return; }
  if (have <= 0) { btn.disabled = true; btn.textContent = 'บอลหมด!'; return; }
  btn.disabled = false;
  btn.textContent = `ปา ${BALLS[state.selBall].emoji} ${BALLS[state.selBall].name}!`;
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
  let p = base * mult + add + (mods.berryAdd || 0);
  p *= (mods.hpBonus || 1);                       // โบนัสจากการสู้ทำ HP ลด
  p *= (1 - Math.min(level, 80) * 0.004);        // เลเวลสูง จับยากขึ้น
  return clamp(p, 0.02, 0.96);
}
let throwing = false;
function throwBall() {
  if (!currentSpawn || throwing) return;
  const k = state.selBall, have = state.balls[k] || 0;
  if (have <= 0) { toast('❌ บอลหมด', 'bad'); return; }
  throwing = true;
  const prevThrows = currentSpawn.throws;   // จำนวนก่อนขว้างครั้งนี้ (ใช้เช็ค Quick Ball)
  state.balls[k]--;
  currentSpawn.throws++;
  renderBallBar();

  const ctx = { mon: currentSpawn.mon, throws: prevThrows, time: timeOfDay(), region: region() };
  const mods = { berryAdd: currentSpawn.berry ? currentSpawn.berry.add : 0, hpBonus: hpBonusFor(currentSpawn), ctx };
  const p = catchChance(currentSpawn.mon, currentSpawn.level, BALLS[k], mods);
  const success = Math.random() < p;

  // แอนิเมชันปาบอล 3 จังหวะ: ขว้าง → ดูดเข้าบอล → สั่น 3 ครั้ง → รู้ผล
  const ball = $('#throwBall');
  const sprite = $('#spawnSprite');
  ball.textContent = BALLS[k].emoji;
  ball.className = 'throw-ball'; void ball.offsetWidth; ball.classList.add('animate');
  $('#throwBtn').disabled = true;
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
  state.caught.push(ind);
  state.seen[mon.id] = true;
  state.totalCaught++;

  const coins = Math.round(TIER_COIN[tier] * (1 + level / 40) * (shiny ? 3 : 1));
  const xp = Math.round(TIER_XP[tier] * (1 + level / 50));
  state.coins += coins;

  gainTrainerXp({ common: 3, uncommon: 6, rare: 12, superrare: 25, legendary: 60 }[tier] + (shiny ? 30 : 0));
  playSfx(shiny || tier === 'legendary' || tier === 'superrare' ? 'rare' : 'catch');
  toast(`🎉 จับ ${shiny ? '✨' : ''}<b>${mon.name}</b> Lv.${level} ได้! +${coins}🪙`, 'good');
  logMsg(`✅ จับ <b>${mon.name}</b> (${shiny ? 'Shiny' : TIER_LABEL[tier]}) Lv.${level} · IV ${ivPercent(ind)}% · +${coins}🪙`, 'good');
  gainXp(xp);
  updateQuestProgress(mon, tier);
  checkEggHatch();
  checkRegionUnlocks();
  checkAchievements();

  clearSpawn(); save(); renderTopbar(); renderCurrentView(); renderBallBar();
  scheduleSpawn();
}
function onCatchFail(ballKey) {
  const fledChance = 0.12 + currentSpawn.throws * 0.03;
  logMsg(`❌ <b>${currentSpawn.mon.name}</b> ดิ้นหลุด! (เสีย ${BALLS[ballKey].name})`, 'bad');
  save(); renderBallBar();
  if (Math.random() < fledChance) {
    toast(`💨 ${currentSpawn.mon.name} หนีไปแล้ว!`, 'bad');
    clearSpawn(); scheduleSpawn();
  } else {
    updateThrowBtn();
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

// ================================================================
//  MAP view
// ================================================================
function renderMap() {
  const owned = speciesOwnedCount();
  $('#mapGrid').innerHTML = REGIONS.map(r => {
    const locked = r.unlock && !state.unlocked[r.id];
    const active = state.region === r.id;
    const w = TIER_WEIGHTS[r.boost];
    const total = TIER_ORDER.reduce((s, t) => s + w[t], 0);
    const rates = TIER_ORDER.filter(t => r._byTier[t] && r._byTier[t].length)
      .map(t => `<span class="mc-rate rarity-${t}">${TIER_LABEL[t]} ${(w[t] / total * 100).toFixed(t === 'legendary' || t === 'superrare' ? 1 : 0)}%</span>`).join('');
    const beaten = state.badges[r.id];
    return `<div class="map-card${active ? ' active-region' : ''}${locked ? ' locked' : ''}" style="background:${r.bg}">
      <div class="mc-deco">${r.deco.map((d, i) => `<span style="position:absolute;left:${10 + i * 22}%;top:${12 + (i % 3) * 24}%">${d}</span>`).join('')}</div>
      ${beaten ? '<div class="mc-badge">🏅</div>' : ''}
      <div class="mc-body">
        <div class="mc-name" data-go="${r.id}">${r.emoji} ${r.name}</div>
        <div class="mc-lvl">Lv.${r.lvl[0]}–${r.lvl[1]} · ${r.desc}</div>
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
function renderDex() {
  const search = $('#dexSearch').value.trim().toLowerCase();
  const filter = $('#dexFilter').value;
  const grid = $('#dexGrid');
  const speciesOwned = speciesOwnedCount();
  const shinyCount = state.caught.filter(c => c.shiny).length;
  $('#dexStats').innerHTML =
    `จับได้ ${speciesOwned}/${MONSTERS.length} ชนิด · รวม ${state.totalCaught} ตัว · ✨ ${shinyCount} ตัว`;

  const list = MONSTERS.filter(m => {
    if (search && !m.name.toLowerCase().includes(search)) return false;
    if (filter === 'owned' && !speciesCount(m.id)) return false;
    if (filter === 'shiny' && !state.caught.some(c => c.id === m.id && c.shiny)) return false;
    if (filter.startsWith('tier:') && m._tier !== filter.slice(5)) return false;
    if (filter.startsWith('type:') && !m.types.includes(filter.slice(5))) return false;
    return true;
  });
  sortDexList(list);

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
      <div class="dname">${m.name}</div>
      <div class="dnum">#${String(m.id).padStart(3, '0')}</div></div>`;
  }).join('');
  grid.querySelectorAll('.dex-cell[data-id]').forEach(cell => {
    cell.onclick = () => { cnt(+cell.dataset.id); };
  });
  function cnt(id) { speciesCount(id) ? openSpeciesModal(id) : openDexEntry(id); }
}

// ---------- species modal: list individuals ----------
function openSpeciesModal(id) {
  const m = MON_BY_ID[id];
  const mine = state.caught.filter(c => c.id === id).sort((a, b) => ivPercent(b) - ivPercent(a));
  $('#modalBox').innerHTML = `
    <h3>${m.name} <span style="font-size:13px;color:var(--muted)">#${String(id).padStart(3, '0')}</span></h3>
    <div class="tags" style="justify-content:center;margin-bottom:6px">
      ${m.types.map(t => `<span class="badge t-${t}">${t}</span>`).join('')}
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
      <div class="ir-name">${ind.shiny ? '✨' : ''}${m.name} ${genderIcon(ind.gender)} ${isBuddy ? '⭐' : ''}</div>
      <div class="ir-sub">Lv.${ind.level} · ${ind.nature}</div>
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
      ${m.types.map(t => `<span class="badge t-${t}">${t}</span>`).join('')}
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
    <h3>${ind.shiny ? '✨' : ''}${m.name} ${genderIcon(ind.gender)}</h3>
    <div style="margin-bottom:8px">
      <span class="pill">Lv.${ind.level}</span>
      <span class="pill">${ind.nature} nature</span>
      <span class="pill rarity-${ind.shiny ? 'shiny' : ind.tier}" style="color:#fff">${ind.shiny ? 'Shiny' : TIER_LABEL[ind.tier]}</span>
      <span class="pill">IV ${ivPercent(ind)}%</span>
    </div>
    <div class="tags" style="justify-content:center;margin-bottom:12px">
      ${m.types.map(t => `<span class="badge t-${t}">${t}</span>`).join('')}</div>
    <div style="text-align:left">${ivRows}</div>
    <div class="moveset">
      <div class="ms-title">⚔️ ท่าโจมตี</div>
      ${getMoves(ind.id).map(mv => `<span class="pill t-${mv.type}" style="color:#fff">${mv.name} <b>${mv.pow}</b></span>`).join('')}
    </div>
    ${evoText(m)}
    <div class="modal-actions">
      <button class="btn-primary" id="mBuddy" ${isBuddy ? 'disabled' : ''}>${isBuddy ? '⭐ หัวหน้าทีม' : 'ตั้งเป็นหัวหน้า'}</button>
      ${inParty(uid)
        ? (isBuddy ? '' : `<button class="btn-ghost" id="mParty">➖ ออกจากทีม</button>`)
        : `<button class="btn-primary" id="mParty">➕ เข้าทีม (${state.party.length}/6)</button>`}
      ${(m.evolveItem && state.stones > 0) ? `<button class="btn-primary" id="mStone">💎 ใช้หินวิวัฒนาการ</button>` : ''}
      <button class="btn-ghost" id="mLock">${ind.locked ? '🔒 ล็อกอยู่' : '🔓 ล็อก'}</button>
      <button class="btn-danger" id="mRelease" ${ind.locked ? 'disabled' : ''}>ปล่อย</button>
      <button class="btn-ghost" id="mClose">ปิด</button>
    </div>`;
  openModal();
  $('#mClose').onclick = closeModal;
  const bb = $('#mBuddy'); if (bb && !isBuddy) bb.onclick = () => { setBuddy(uid); openIndividualModal(uid); renderCurrentView(); };
  const pt = $('#mParty'); if (pt) pt.onclick = () => { inParty(uid) ? removeFromParty(uid) : addToParty(uid); openIndividualModal(uid); renderCurrentView(); };
  const rl = $('#mRelease'); if (rl && !ind.locked) rl.onclick = () => releaseIndividual(uid);
  const lk = $('#mLock'); if (lk) lk.onclick = () => { ind.locked = !ind.locked; save(); openIndividualModal(uid); };
  const sn = $('#mStone'); if (sn) sn.onclick = () => {
    if ((state.stones || 0) <= 0) { toast('❌ ไม่มีหินวิวัฒนาการ', 'bad'); return; }
    state.stones--; doEvolve(ind, m.evolvesTo); save(); openIndividualModal(uid); renderCurrentView();
  };
}
function releaseIndividual(uid) {
  const idx = state.caught.findIndex(c => c.uid === uid);
  if (idx < 0) return;
  const ind = state.caught[idx];
  if (ind.locked) { toast('🔒 ตัวนี้ถูกล็อกอยู่', 'bad'); return; }
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
    { emoji: '🔴', name: 'Poké Ball ×5', desc: 'โอกาสจับพื้นฐาน', price: BALLS.poke.price * 5, act: () => addBalls('poke', 5, BALLS.poke.price * 5) },
    { emoji: '🔵', name: 'Great Ball ×3', desc: 'โอกาสจับ ×1.7', price: BALLS.great.price * 3, act: () => addBalls('great', 3, BALLS.great.price * 3) },
    { emoji: '🟡', name: 'Ultra Ball ×2', desc: 'โอกาสจับ ×2.6', price: BALLS.ultra.price * 2, act: () => addBalls('ultra', 2, BALLS.ultra.price * 2) },
    { emoji: '🕸️', name: 'Net Ball ×3', desc: '×3.3 กับธาตุน้ำ/แมลง', price: BALLS.net.price * 3, act: () => addBalls('net', 3, BALLS.net.price * 3) },
    { emoji: '🌑', name: 'Dusk Ball ×3', desc: '×3.3 ตอนกลางคืน/ในถ้ำ', price: BALLS.dusk.price * 3, act: () => addBalls('dusk', 3, BALLS.dusk.price * 3) },
    { emoji: '⚡', name: 'Quick Ball ×3', desc: '×4 ถ้าปาเป็นลูกแรก', price: BALLS.quick.price * 3, act: () => addBalls('quick', 3, BALLS.quick.price * 3) },
    { emoji: '🟣', name: 'Master Ball ×1', desc: 'จับติด 100% การันตี', price: BALLS.master.price, act: () => addBalls('master', 1, BALLS.master.price) },
    { emoji: '🍓', name: 'Razz Berry ×3', desc: 'โยนก่อนปา เพิ่มโอกาสจับ +13%', price: BERRIES.razz.price * 3, act: () => addBerries('razz', 3, BERRIES.razz.price * 3) },
    { emoji: '🥭', name: 'Golden Razz ×1', desc: 'เพิ่มโอกาสจับ +32%', price: BERRIES.golden.price, act: () => addBerries('golden', 1, BERRIES.golden.price) },
    { emoji: '🥚', name: 'ไข่ปริศนา', desc: `ฟักเมื่อจับครบ ${EGG_HATCH_CATCHES} ตัว`, price: EGG_PRICE, act: buyEgg },
    { emoji: '💎', name: 'หินวิวัฒนาการ', desc: 'วิวัฒนาการตัวที่ต้องใช้ไอเทม', price: STONE_PRICE, act: () => { if (spend(STONE_PRICE)) { state.stones = (state.stones || 0) + 1; toast('💎 +1 หินวิวัฒนาการ', 'good'); postBuy(); } } },
  ];
  $('#shopGrid').innerHTML =
    `<div class="dex-stats">มีหินวิวัฒนาการ: 💎 ${state.stones || 0} · บอล: ` +
    BALL_ORDER.map(k => `${BALLS[k].emoji}${state.balls[k] || 0}`).join(' ') + `</div>` +
    items.map((it, i) => `<div class="shop-item">
      <div class="emoji">${it.emoji}</div>
      <div class="si-body"><div class="si-name">${it.name}</div><div class="si-desc">${it.desc}</div></div>
      <button class="buy-btn" data-i="${i}" ${state.coins < it.price ? 'disabled' : ''}>${it.price}🪙</button></div>`).join('');
  $('#shopGrid').querySelectorAll('.buy-btn[data-i]').forEach(btn => btn.onclick = () => items[+btn.dataset.i].act());
}
function spend(n) { if (state.coins < n) { toast('❌ เงินไม่พอ', 'bad'); return false; } state.coins -= n; return true; }
function postBuy() { save(); renderTopbar(); renderShop(); renderBallBar(); updateThrowBtn(); }
function addBalls(k, n, price) { if (spend(price)) { state.balls[k] = (state.balls[k] || 0) + n; toast(`${BALLS[k].emoji} +${n} ${BALLS[k].name}`, 'good'); postBuy(); } }
function addBerries(k, n, price) { if (spend(price)) { state.berries[k] = (state.berries[k] || 0) + n; toast(`${BERRIES[k].emoji} +${n} ${BERRIES[k].name}`, 'good'); postBuy(); renderBerryBar(); } }
function buyEgg() { if (spend(EGG_PRICE)) { state.eggs.push({ progressStart: state.totalCaught }); toast(`🥚 ได้ไข่! จับอีก ${EGG_HATCH_CATCHES} ตัวเพื่อฟัก`, 'good'); postBuy(); } }

// ================================================================
//  EGGS
// ================================================================
function checkEggHatch() {
  let hatched = false;
  state.eggs = state.eggs.filter(egg => {
    if (state.totalCaught - egg.progressStart >= EGG_HATCH_CATCHES) {
      const tier = weightedTier(1);
      const pool = MONSTERS.filter(m => m._tier === tier);
      const mon = pick(pool.length ? pool : MONSTERS);
      const shiny = Math.random() < SHINY_CHANCE * 3;   // ไข่มีโอกาส shiny สูงกว่า
      const ind = makeIndividual(mon.id, rand(3, 12), mon._tier, shiny);
      state.caught.push(ind); state.seen[mon.id] = true; state.totalCaught++;
      toast(`🥚➡️ ไข่ฟักเป็น ${shiny ? '✨' : ''}<b>${mon.name}</b>!`, 'good');
      logMsg(`🥚 ไข่ฟักเป็น <b>${mon.name}</b> (${TIER_LABEL[mon._tier]})`, 'big');
      hatched = true; return false;
    }
    return true;
  });
  if (hatched) { save(); renderCurrentView(); }
}

// ================================================================
//  QUESTS
// ================================================================
function makeQuests() {
  const q = [];
  const n1 = rand(4, 8);
  q.push({ key: 'q1', type: 'catchAny', target: n1, progress: 0, name: `จับโปเกมอน ${n1} ตัว`, rewardCoins: 60 + n1 * 10, rewardBall: ['poke', 3], claimed: false });
  const t = pick(ALL_TYPES), n2 = rand(2, 4);
  q.push({ key: 'q2', type: 'catchType', typeName: t, target: n2, progress: 0, name: `จับธาตุ ${t} ${n2} ตัว`, rewardCoins: 90 + n2 * 15, rewardBall: ['great', 2], claimed: false });
  const n3 = rand(1, 3);
  q.push({ key: 'q3', type: 'catchRare', target: n3, progress: 0, name: `จับ Rare ขึ้นไป ${n3} ตัว`, rewardCoins: 200, rewardBall: ['ultra', 1], claimed: false });
  return q;
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
}
function renderEggs() {
  const box = $('#eggList');
  if (!state.eggs.length) {
    box.innerHTML = `<div class="egg-item"><div class="emoji">🥚</div><div class="eb">
      <div class="si-name">ยังไม่มีไข่</div><div class="si-desc">ซื้อได้ที่ร้านค้า</div></div></div>`; return;
  }
  box.innerHTML = state.eggs.map((egg, i) => {
    const prog = clamp(state.totalCaught - egg.progressStart, 0, EGG_HATCH_CATCHES);
    return `<div class="egg-item"><div class="emoji">🥚</div><div class="eb">
      <div class="si-name">ไข่ #${i + 1}</div>
      <div class="quest-bar"><div class="quest-fill" style="width:${prog / EGG_HATCH_CATCHES * 100}%"></div></div>
      <div class="si-desc">ฟักเมื่อจับครบ: ${prog}/${EGG_HATCH_CATCHES} ตัว</div></div></div>`;
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
      <div class="sr-label">⏱️ ความเร็วการปรากฏ<div class="sr-sub">ปรับเวลารอโปเกมอนใหม่</div></div>
      <select class="set-select" id="selSpeed">
        <option value="fast"${st.spawnSpeed === 'fast' ? ' selected' : ''}>เร็ว</option>
        <option value="normal"${st.spawnSpeed === 'normal' ? ' selected' : ''}>ปกติ</option>
        <option value="slow"${st.spawnSpeed === 'slow' ? ' selected' : ''}>ช้า</option>
      </select>
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
  state = Object.assign(newSave(), obj);
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
  const idleMin = Math.floor(idleMs / 60000);
  if (idleMin < 5) return;
  const coins = Math.min(idleMin * 2, 900);           // 2🪙/นาที สูงสุด 900
  const balls = Math.min(Math.floor(idleMin / 30), 10); // 1🔴 ต่อ 30 นาที สูงสุด 10
  state.coins += coins; state.balls.poke += balls;
  save();
  const hrs = Math.floor(idleMin / 60), mins = idleMin % 60;
  const timeStr = (hrs ? hrs + ' ชม. ' : '') + mins + ' นาที';
  $('#modalBox').innerHTML = `<div class="wb-box">
    <div class="wb-ico">🎁</div>
    <h3>ยินดีต้อนรับกลับ!</h3>
    <p style="color:var(--muted);font-size:13px">คุณหายไป ${timeStr} · ทีมเก็บของให้ระหว่างนั้น</p>
    <div style="font-size:16px;margin:14px 0;font-weight:800">+${coins} 🪙${balls ? ` · +${balls} 🔴` : ''}</div>
    <div class="modal-actions"><button class="btn-primary" id="wbOk">รับเลย!</button></div></div>`;
  openModal(); $('#wbOk').onclick = closeModal;
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
    <div style="margin-top:10px;font-size:12px;font-weight:700">👥 ทีม (${state.party.length}/6)</div>
    ${partyStrip}</div>`;
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
function statsForWild(mon, level) {
  const b = mon.stats, IV = 16;
  const s = key => Math.floor((2 * b[key] + IV) * level / 100) + 5;
  return { hp: wildMaxHp(mon, level), atk: s('atk'), def: s('def'), spatk: s('spatk'), spdef: s('spdef'), spd: s('spd') };
}
function gainXpTo(ind, amount) {
  if (!ind) return;
  ind.xp = (ind.xp || 0) + amount; let leveled = false;
  while (ind.xp >= xpForLevel(ind.level) && ind.level < 100) { ind.xp -= xpForLevel(ind.level); ind.level++; leveled = true; }
  if (leveled) { toast(`⬆️ <b>${MON_BY_ID[ind.id].name}</b> ขึ้น Lv.${ind.level}`, 'good'); tryEvolveByLevel(ind); }
  renderTopbar();
}
function gainTrainerXp(n) { state.trainerXp = (state.trainerXp || 0) + n; }
function trainerLevel() { return Math.floor(Math.pow((state.trainerXp || 0) / 60, 0.5)) + 1; }

function calcDamage(atkMon, atkStats, atkLevel, defMon, defStats, move) {
  const physical = atkStats.atk >= atkStats.spatk;
  const A = physical ? atkStats.atk : atkStats.spatk;
  const D = physical ? defStats.def : defStats.spdef;
  const moveType = move ? move.type : atkMon.types[0];
  const power = move ? move.pow : 55;
  const eff = typeEffect(moveType, defMon.types);
  const stab = atkMon.types.includes(moveType) ? 1.5 : 1;
  let dmg = (((2 * atkLevel / 5 + 2) * power * A / Math.max(1, D)) / 50 + 2);
  dmg = dmg * stab * eff * (0.85 + Math.random() * 0.15);
  return { dmg: Math.max(1, Math.floor(dmg)), eff };
}
function foeChooseMove(foeMon, defTypes) {
  const moves = getMoves(foeMon.id);
  let best = moves[0], score = -1;
  moves.forEach(mv => { const e = typeEffect(mv.type, defTypes) * (mv.pow / 100); if (e > score) { score = e; best = mv; } });
  return best;
}
function startBattle(isBoss, bossData) {
  const members = partyMembers();
  if (!members.length) { toast('❌ ต้องมีโปเกมอนในทีมก่อน (ตั้ง Buddy/เข้าทีมจากคลัง)', 'bad'); return; }
  let foeMon, foeLevel, foeStats, foeHp, foeMaxHp;
  if (isBoss) {
    foeMon = bossData.mon; foeLevel = bossData.level;
    const base = statsForWild(foeMon, foeLevel);
    foeStats = { atk: Math.floor(base.atk * 1.25), def: Math.floor(base.def * 1.25),
      spatk: Math.floor(base.spatk * 1.25), spdef: Math.floor(base.spdef * 1.25), spd: base.spd };
    foeMaxHp = Math.floor(base.hp * 1.3); foeHp = foeMaxHp;
  } else {
    if (!currentSpawn) return;
    foeMon = currentSpawn.mon; foeLevel = currentSpawn.level;
    foeStats = statsForWild(foeMon, foeLevel);
    foeMaxHp = currentSpawn.maxHp; foeHp = currentSpawn.hp;
  }
  const team = members.map(ind => { const s = calcStats(ind); return { ind, stats: s, hp: s.hp, maxHp: s.hp }; });
  battleState = {
    isBoss, bossData, foeMon, foeLevel, foeStats, foeHp, foeMaxHp,
    team, activeIdx: 0, over: false, lost: false,
    msg: isBoss ? `👑 บอส ${foeMon.name} ท้าดวล!` : `เจอ ${foeMon.name} ป่า — เลือกท่าโจมตี!`,
  };
  renderBattle();
  $('#battleModal').classList.remove('hidden');
}
function renderBattle() {
  const b = battleState; if (!b) return;
  const active = b.team[b.activeIdx];
  const mon = MON_BY_ID[active.ind.id];
  const hpCls = (hp, max) => { const p = hp / max * 100; return p <= 20 ? 'crit' : p <= 50 ? 'low' : ''; };
  const foePct = clamp(b.foeHp / b.foeMaxHp * 100, 0, 100);
  const myPct = clamp(active.hp / active.maxHp * 100, 0, 100);

  const teamStrip = b.team.map((t, i) => {
    const fainted = t.hp <= 0;
    return `<div class="team-chip${i === b.activeIdx ? ' active' : ''}${fainted ? ' fainted' : ''}" data-sw="${i}" title="${MON_BY_ID[t.ind.id].name} HP ${Math.ceil(t.hp)}/${t.maxHp}">
      ${spriteImg(t.ind.id, t.ind.shiny)}<span class="tc-hp">${Math.ceil(t.hp)}</span></div>`;
  }).join('');

  const moves = getMoves(active.ind.id);
  const moveBtns = moves.map((mv, i) => {
    const e = typeEffect(mv.type, b.foeMon.types);
    const tag = e > 1 ? '↑' : e < 1 ? '↓' : '';
    return `<button class="move-btn t-${mv.type}" data-mv="${i}">${mv.name} <b>${mv.pow}</b>${tag}</button>`;
  }).join('');

  $('#battleBox').innerHTML = `
    <div class="battle-arena">
      <div class="bt-side foe">
        <div class="bt-head"><span>${b.isBoss ? '👑 ' : ''}${b.foeMon.name} Lv.${b.foeLevel} ${b.foeMon.types.map(t => `<span class="badge t-${t}" style="font-size:9px;padding:1px 6px">${t}</span>`).join('')}</span>${spriteImg(b.foeMon.id, false)}</div>
        <div class="bt-hpbar"><div class="${hpCls(b.foeHp, b.foeMaxHp)}" style="width:${foePct}%"></div></div>
        <div class="hp-txt" style="text-align:left">HP ${Math.ceil(b.foeHp)}/${b.foeMaxHp}</div>
      </div>
      <div class="bt-side me">
        <div class="bt-head">${spriteImg(active.ind.id, active.ind.shiny)}<span>${mon.name} Lv.${active.ind.level} ${genderIcon(active.ind.gender)}</span></div>
        <div class="bt-hpbar"><div class="${hpCls(active.hp, active.maxHp)}" style="width:${myPct}%"></div></div>
        <div class="hp-txt" style="text-align:right">HP ${Math.ceil(active.hp)}/${active.maxHp}</div>
      </div>
    </div>
    <div class="team-strip">${teamStrip}</div>
    <div class="bt-log">${b.msg}</div>
    ${b.over
      ? `<div class="bt-actions"><button class="bt-flee" id="btDone">ปิด</button></div>`
      : `<div class="move-grid">${moveBtns}</div>
         <div class="bt-actions"><button class="bt-flee" id="btFlee">${b.isBoss ? 'ยอมแพ้' : 'หนี'}</button></div>`}`;

  if (b.over) $('#btDone').onclick = endBattle;
  else {
    $('#btFlee').onclick = endBattle;
    $('#battleBox').querySelectorAll('.move-btn[data-mv]').forEach(el => el.onclick = () => battleAttack(+el.dataset.mv));
    $('#battleBox').querySelectorAll('.team-chip[data-sw]').forEach(el => el.onclick = () => battleSwitch(+el.dataset.sw));
  }
}
function foeTurn(b) {
  const active = b.team[b.activeIdx];
  const aMon = MON_BY_ID[active.ind.id];
  const mv = foeChooseMove(b.foeMon, aMon.types);
  const dmg = calcDamage(b.foeMon, b.foeStats, b.foeLevel, aMon, active.stats, mv).dmg;
  active.hp = Math.max(0, active.hp - dmg);
  b.msg += ` · ${b.foeMon.name} ใช้ ${mv.name}! -${dmg}`;
  if (active.hp <= 0) {
    b.msg += ` · 😵 ${aMon.name} หมดแรง!`;
    const next = b.team.findIndex(t => t.hp > 0);
    if (next < 0) {
      b.over = true; b.lost = true;
      b.msg += b.isBoss ? ' · แพ้บอส! ลองใหม่' : ` · แต่โปเกมอนป่ายังเหลือ HP ${Math.ceil(b.foeHp)}`;
    } else {
      b.activeIdx = next;
      b.msg += ` ส่ง ${MON_BY_ID[b.team[next].ind.id].name} ลงสนาม!`;
    }
  }
}
function battleAttack(moveIdx) {
  const b = battleState; if (!b || b.over) return;
  const active = b.team[b.activeIdx];
  const mon = MON_BY_ID[active.ind.id];
  const mv = getMoves(active.ind.id)[moveIdx] || getMoves(active.ind.id)[0];
  const atk = calcDamage(mon, active.stats, active.ind.level, b.foeMon, b.foeStats, mv);
  b.foeHp = Math.max(b.isBoss ? 0 : 1, b.foeHp - atk.dmg);
  b.msg = `${mon.name} ใช้ ${mv.name}! -${atk.dmg}${atk.eff > 1 ? ' (ได้เปรียบ!)' : atk.eff < 1 ? ' (เสียเปรียบ)' : ''}`;
  if (!b.isBoss && currentSpawn) currentSpawn.hp = b.foeHp;

  if (b.foeHp <= 0) { onFoeDown(); save(); renderBattle(); return; }
  if (!b.isBoss && b.foeHp <= 1) {
    b.over = true;
    b.msg = `${b.foeMon.name} อ่อนแรงสุดขีด! รีบปาบอลเลย — จับง่ายสุด ✅`;
    gainXpTo(active.ind, Math.round(b.foeLevel)); gainTrainerXp(4);
    if (currentSpawn) renderSpawn();
    save(); renderBattle(); return;
  }
  foeTurn(b);
  if (!b.isBoss && currentSpawn) renderSpawn();
  save(); renderBattle();
}
function battleSwitch(idx) {
  const b = battleState; if (!b || b.over || idx === b.activeIdx) return;
  const t = b.team[idx];
  if (!t || t.hp <= 0) { toast('ตัวนี้หมดแรงแล้ว', 'bad'); return; }
  b.activeIdx = idx;
  b.msg = `สลับมา ${MON_BY_ID[t.ind.id].name}!`;
  foeTurn(b);                       // สลับตัวเสียเทิร์น ศัตรูโจมตีก่อน
  save(); renderBattle();
}
function onFoeDown() {
  const b = battleState; b.over = true;
  const active = b.team[b.activeIdx];
  if (b.isBoss) {
    state.badges[b.bossData.region.id] = true;
    const reward = 200 + b.foeLevel * 10;
    state.coins += reward;
    state.balls.ultra = (state.balls.ultra || 0) + 2;
    gainXpTo(active.ind, Math.round(b.foeLevel * 2.5)); gainTrainerXp(80);
    b.msg = `🏆 ชนะบอส ${b.foeMon.name}! ได้ 🏅 เหรียญตรา + ${reward}🪙 + Ultra Ball ×2`;
    logMsg(`🏆 ชนะบอสเขต <b>${b.bossData.region.name}</b>! +${reward}🪙`, 'big');
    playSfx('rare'); checkAchievements(); save(); renderTopbar();
  } else {
    const xp = Math.round(b.foeLevel * 2);
    gainXpTo(active.ind, xp); gainTrainerXp(8);
    b.msg = `${b.foeMon.name} หมดแรงและหนีไป! (+${xp} XP)`;
    clearSpawn(); scheduleSpawn();
  }
}
function endBattle() {
  const wasBoss = battleState && battleState.isBoss;
  battleState = null;
  $('#battleModal').classList.add('hidden');
  if (!wasBoss) { renderSpawn(); renderBerryBar(); }
  if (currentView === 'map') renderMap();
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

  $('#throwBtn').addEventListener('click', throwBall);
  $('#battleBtn').addEventListener('click', () => startBattle(false));
  $('#toMapBtn').addEventListener('click', () => switchView('map'));
  document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('#dexSearch').addEventListener('input', renderDex);
  $('#dexFilter').addEventListener('change', renderDex);
  $('#dexSort').addEventListener('change', renderDex);
  $('#buddyChip').addEventListener('click', () => switchView('dex'));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#battleModal').addEventListener('click', e => { if (e.target.id === 'battleModal' && battleState && battleState.over) endBattle(); });

  checkAchievements();
  scheduleSpawn(2200);
  logMsg('👋 ยินดีต้อนรับ! เลือกเขตในแผนที่ แล้วปาบอลจับโปเกมอนได้เลย', 'big');

  // นับเวลาเล่น + อัปเดต lastSeen + รีเฟรชอากาศ/เวลา
  setInterval(() => {
    state.playSec = (state.playSec || 0) + 20; save();
    if (currentView === 'home') renderRegionBanner();
  }, 20000);
  window.addEventListener('beforeunload', () => { state.lastSeen = Date.now(); save(); });

  if (!state.tutorialDone) setTimeout(showTutorial, 400);
  if (state.settings.music) document.addEventListener('pointerdown', () => startMusic(), { once: true });
}
document.addEventListener('DOMContentLoaded', init);
