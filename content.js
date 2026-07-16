/* ================================================================
   PokePP — content.js
   ตารางข้อมูลคงที่ (pure data) ที่ไม่มี logic/อ้าง state — แยกจาก game.js
   เพื่อสุขภาพโค้ด: ไฟล์หลักเล็กลง หาแก้ข้อมูลง่ายขึ้น
   นำเข้าโดย game.js (ES module). ห้ามอ้างฟังก์ชัน/ตัวแปรใน game.js ที่นี่
   ================================================================ */

// ---------- ระดับความหายาก ----------
export const TIER_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
export const TIER_ORDER = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];
export const TIER_EMOJI = { common: '⚪', uncommon: '🟢', rare: '🔵', superrare: '🟣', legendary: '🟡' };
// เลเวลตามระดับความหายาก (แบบ PokeMeow) — ตัวหายาก = เลเวลสูง = ออกยากขึ้น
export const TIER_LEVEL = {
  common:    [1, 20],
  uncommon:  [12, 38],
  rare:      [28, 58],
  superrare: [50, 80],
  legendary: [70, 100],
};
// น้ำหนักการสุ่มระดับ ตาม "rarityBoost" ของเขต
export const TIER_WEIGHTS = {
  0: { common: 56, uncommon: 27, rare: 12, superrare: 4, legendary: 1 },
  1: { common: 42, uncommon: 29, rare: 18, superrare: 8,  legendary: 3 },
  2: { common: 28, uncommon: 27, rare: 23, superrare: 15, legendary: 7 },
};

// ---------- ธาตุ (อีโมจิ + ชื่อไทย) ----------
export const TYPE_EMOJI = {
  normal: '⭐', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️',
  fighting: '🥊', poison: '☠️', ground: '⛰️', flying: '🕊️', psychic: '🔮', bug: '🐛',
  rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '🧚',
};
// ชื่อธาตุภาษาไทย (บางคนดูสีแล้วแยกธาตุไม่ออก เลยโชว์ชื่อกำกับด้วย)
export const TYPE_TH = {
  normal: 'ปกติ', fire: 'ไฟ', water: 'น้ำ', electric: 'ไฟฟ้า', grass: 'พืช', ice: 'น้ำแข็ง',
  fighting: 'ต่อสู้', poison: 'พิษ', ground: 'ดิน', flying: 'บิน', psychic: 'จิต', bug: 'แมลง',
  rock: 'หิน', ghost: 'ผี', dragon: 'มังกร', dark: 'มืด', steel: 'เหล็ก', fairy: 'แฟรี่',
};

// ---------- สภาพอากาศ + บูสต์ธาตุตามเวลา ----------
// dotImmune = ธาตุที่ไม่โดนดาเมจจากสภาพอากาศตอนจบเทิร์น (พายุทราย/หิมะ — 1/16 ของ HP สูงสุด)
export const WEATHERS = {
  clear: { name: 'แจ่มใส', emoji: '☀️', boost: [] },
  rain:  { name: 'ฝนตก', emoji: '🌧️', boost: ['water', 'electric'] },
  snow:  { name: 'หิมะโปรย', emoji: '🌨️', boost: ['ice'], dotImmune: ['ice'] },
  sand:  { name: 'พายุทราย', emoji: '🏜️', boost: ['rock', 'ground', 'steel'], dotImmune: ['rock', 'ground', 'steel'] },
  fog:   { name: 'หมอกหนา', emoji: '🌫️', boost: ['ghost', 'dark', 'poison'] },
};
export const NIGHT_BOOST = ['dark', 'ghost', 'psychic', 'fairy'];
export const DAY_BOOST = ['normal', 'grass', 'bug', 'flying', 'fire'];

// ---------- ชื่อ Z-Move ตามธาตุ ----------
export const Z_MOVES = {
  normal: 'Breakneck Blitz', fire: 'Inferno Overwhelming', water: 'Hydro Vortex', electric: 'Gigavolt Havoc',
  grass: 'Bloom Doom', ice: 'Subzero Slammer', fighting: 'All-Out Pummeling', poison: 'Acid Downpour',
  ground: 'Tectonic Rage', flying: 'Supersonic Skystrike', psychic: 'Shattered Psyche', bug: 'Savage Spin-Out',
  rock: 'Continental Crush', ghost: 'Never-Ending Nightmare', dragon: 'Devastating Drake', dark: 'Black Hole Eclipse',
  steel: 'Corkscrew Crash', fairy: 'Twinkle Tackle',
};

// ---------- แรงก์ PvP (บนลงล่าง: สูง→ต่ำ) ----------
export const PVP_TIERS = [
  { min: 2000, name: 'Master', emoji: '👑' }, { min: 1750, name: 'Diamond', emoji: '💎' },
  { min: 1500, name: 'Platinum', emoji: '💠' }, { min: 1250, name: 'Gold', emoji: '🥇' },
  { min: 1050, name: 'Silver', emoji: '🥈' }, { min: 0, name: 'Bronze', emoji: '🥉' },
];
