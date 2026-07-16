/* ================================================================
   logic.js — ฟังก์ชันตรรกะบริสุทธิ์ (ไม่แตะ DOM/state/window)
   แยกออกมาเพื่อให้ทดสอบด้วย unit test ได้ และ import กลับเข้า game.js
   ================================================================ */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ตารางธาตุแพ้ทาง (attacker -> {defender: multiplier}) เฉพาะที่ไม่ใช่ 1x
export const TYPE_CHART = {
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
// ตัวคูณดาเมจธาตุ (attacker vs defender types)
export function typeEffect(atkType, defTypes) {
  let m = 1;
  const row = TYPE_CHART[atkType] || {};
  defTypes.forEach(d => { if (row[d] != null) m *= row[d]; });
  return m;
}

// PP ต่อท่า — ท่าแรงยิ่งใช้ได้น้อยครั้ง
export function movePP(pow) { return pow >= 110 ? 5 : pow >= 90 ? 8 : pow >= 70 ? 12 : 20; }

// Ultra Beasts เป็นระดับ Legendary แม้ในดาต้าติดแท็ก rare
export const UB_LEGENDARY_IDS = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]);
// จัดระดับความหายากจาก base stat total + แท็ก legendary/UB
export function tierOf(m) {
  if (m.rarity === 'legendary' || UB_LEGENDARY_IDS.has(m.id)) return 'legendary';
  if (m._bst >= 525) return 'superrare';
  if (m._bst >= 430) return 'rare';
  if (m._bst >= 320) return 'uncommon';
  return 'common';
}

// เลขสัปดาห์ ISO (ใช้กับอีเวนต์/เควส/ลีคประจำสัปดาห์)
export function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// โอกาสจับ (0.02–0.96) จากอัตราจับพื้นฐาน × บอล × โบนัส HP/charm − ปรับตามเลเวล
export function catchChance(mon, level, ball, mods) {
  mods = mods || {};
  if (ball.flatBase != null) return mods.shiny && ball.flatShiny != null ? ball.flatShiny : ball.flatBase;   // Premier: จับคงที่ 45% · Shiny 100%
  if (ball.mult >= 999) return 1;                // master ball การันตี
  let mult = ball.mult, add = ball.add;
  if (ball.cond && mods.ctx) {                    // บอลพิเศษ (Net/Dusk/Quick) โบนัสตามเงื่อนไข
    const c = ball.cond(mods.ctx);
    if (c.mult != null) mult = c.mult;
    if (c.add != null) add += c.add;
  }
  const base = mon.captureRate / 300;            // 0.01 – 0.85
  let p = base * mult + add;
  p *= (mods.hpBonus || 1);
  p *= (mods.catchMult || 1);
  p *= (1 - Math.min(level, 80) * 0.004);        // เลเวลสูง จับยากขึ้น
  return clamp(p, 0.02, 0.96);
}

// คำนวณสเตตัส NPC จาก base stats ใดก็ได้ (IV ปรับได้ ค่าเริ่มต้น 16 · บอสใช้ 31 = IV max)
export function statsForBase(b, level, iv = 16) {
  const s = key => Math.floor((2 * b[key] + iv) * level / 100) + 5;
  return { hp: Math.floor((2 * b.hp + iv) * level / 100) + level + 10, atk: s('atk'), def: s('def'), spatk: s('spatk'), spdef: s('spdef'), spd: s('spd') };
}

// จัดระดับความหายากจากค่าสุ่ม 0-100 (แยก pure เพื่อทดสอบขอบเขต — rollRarity ใน game.js เรียกด้วย Math.random)
export function rarityFromRoll(luck, roll) {
  const srP = 3 + luck * 3;        // super rare
  const raP = 27 + luck * 5;       // rare
  const unP = 30;                  // uncommon
  if (roll < srP) return 'superrare';
  if (roll < srP + raP) return 'rare';
  if (roll < srP + raP + unP) return 'uncommon';
  return 'common';
}

// รันไมเกรชันเซฟแบบเป็นขั้น: ใช้ migrations[v] ไล่จากเวอร์ชันเซฟปัจจุบันขึ้นไปจนถึง target
// migrations = { 2: fn(save), 3: fn(save), ... } (fn แก้ save ในตัว) · คืน save ที่อัปเดต _v แล้ว
export function runMigrations(save, targetVersion, migrations) {
  let v = save._v || 1;
  while (v < targetVersion) {
    v++;
    const fn = migrations[v];
    if (typeof fn === 'function') fn(save);
  }
  save._v = targetVersion;
  return save;
}

// ตัวคูณสเตตัสจาก stat stage (-6..+6) แบบเกมจริง
export function statStageMult(stage) {
  stage = clamp(stage || 0, -6, 6);
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// ตัวคูณโอกาส Shiny จากคอมโบจับตัวเดิมต่อเนื่อง (ยิ่งต่อยาวยิ่งดัน)
export function comboMult(n) {
  n = n || 0;
  if (n >= 30) return 5;
  if (n >= 20) return 3.5;
  if (n >= 10) return 2.2;
  if (n >= 5) return 1.5;
  return 1 + n * 0.08;
}

// แปลง XP สะสม → ระดับ (บัตรฤดูกาล) จำกัดไม่เกิน max
export function xpToTier(xp, perTier, max) {
  return Math.min(max, Math.floor((xp || 0) / perTier));
}

// XP ที่ต้องใช้เลื่อนจากเลเวลปัจจุบัน → เลเวลถัดไป (ของโปเกมอน)
export function xpForLevel(level) { return 30 + level * 22; }

// เลเวลเทรนเนอร์จาก XP สะสม (โค้งรากที่สอง — ยิ่งสูงยิ่งช้าลง)
export function levelFromXp(xp) { return Math.floor(Math.pow((xp || 0) / 60, 0.5)) + 1; }

// ราคาแผ่นสกิล TM จากพลังท่า (กลาง–ค่อนข้างแพง)
export function tmPrice(pow) { return Math.round((pow || 60) * 0.5) + 30; }

// ราคาสุ่ม IV ใหม่ — ยิ่งล็อกหลายช่องยิ่งแพง (base ต่อจำนวนช่องที่ล็อก)
export function ivRerollPrice(base, lockedCount) { return base * (1 + (lockedCount || 0)); }

// หาแรงก์จากคะแนน (tiers เรียงจากมากไปน้อยด้วย min) — คืน tier แรกที่ rating ถึง min
export function tierForRating(rating, tiers) {
  return tiers.find(t => (rating || 0) >= t.min) || tiers[tiers.length - 1];
}

// แกนคำนวณดาเมจ (pure) — รับความสุ่ม (rollRand/critRand) + weatherBoost เข้ามา เพื่อให้ deterministic ทดสอบได้
export function damageCore(atkMon, atkStats, atkLevel, defMon, defStats, move, held, opts, weatherBoost, rollRand, critRand) {
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
  if (isStab && opts.atkAbility && opts.atkAbility.fx === 'adaptability') stab = 2;
  if (opts.atkAbility && opts.atkAbility.boostType === moveType && opts.atkHpRatio != null && opts.atkHpRatio <= 1 / 3) power *= 1.5;
  if (physical && opts.atkAbility && opts.atkAbility.fx === 'guts' && opts.atkHasStatus) A = Math.floor(A * 1.5);
  const crit = critRand < (held === 'scope-lens' ? 4 / 16 : 1 / 16);
  let dmg = (((2 * atkLevel / 5 + 2) * power * A / Math.max(1, D)) / 50 + 2);
  dmg = dmg * stab * eff * (0.85 + rollRand * 0.15) * (crit ? 1.5 : 1) * (weatherBoost ? 1.2 : 1);
  if (held === 'life-orb') dmg *= 1.3;
  if (held === 'expert-belt' && eff > 1) dmg *= 1.2;
  if (opts.defAbility && opts.defAbility.fx === 'multiscale' && opts.defHpRatio != null && opts.defHpRatio >= 1) dmg *= 0.5;
  return { dmg: Math.max(1, Math.floor(dmg)), eff, crit, weather: weatherBoost };
}
