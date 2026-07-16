import { describe, it, expect } from 'vitest';
import { clamp, typeEffect, movePP, tierOf, isoWeekNumber, UB_LEGENDARY_IDS,
  catchChance, statsForBase, rarityFromRoll, damageCore, runMigrations,
  statStageMult, comboMult, xpToTier, tierForRating,
  xpForLevel, levelFromXp, tmPrice, ivRerollPrice,
  ivPercentOf, contestBaseScore, rivalBaseScore } from './logic.js';

describe('clamp', () => {
  it('จำกัดค่าอยู่ในช่วง', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('typeEffect (ตัวคูณธาตุ)', () => {
  it('ได้เปรียบ ×2', () => {
    expect(typeEffect('water', ['fire'])).toBe(2);
    expect(typeEffect('fighting', ['normal'])).toBe(2);
  });
  it('เสียเปรียบ ×0.5', () => {
    expect(typeEffect('fire', ['water'])).toBe(0.5);
  });
  it('ไม่มีผล ×0 (immunity)', () => {
    expect(typeEffect('normal', ['ghost'])).toBe(0);
    expect(typeEffect('ground', ['flying'])).toBe(0);
    expect(typeEffect('electric', ['ground'])).toBe(0);
  });
  it('ธาตุคู่ คูณสะสม (×4 / ×0.25)', () => {
    expect(typeEffect('rock', ['fire', 'flying'])).toBe(4);   // 2 × 2
    expect(typeEffect('grass', ['fire', 'flying'])).toBe(0.25); // 0.5 × 0.5
  });
  it('ธาตุปกติ ×1', () => {
    expect(typeEffect('normal', ['normal'])).toBe(1);
  });
});

describe('movePP (PP ตามพลังท่า)', () => {
  it('ท่าแรงยิ่ง PP น้อย', () => {
    expect(movePP(120)).toBe(5);
    expect(movePP(100)).toBe(8);
    expect(movePP(80)).toBe(12);
    expect(movePP(40)).toBe(20);
  });
  it('ขอบเขตพอดี', () => {
    expect(movePP(110)).toBe(5);
    expect(movePP(90)).toBe(8);
    expect(movePP(70)).toBe(12);
    expect(movePP(69)).toBe(20);
  });
});

describe('tierOf (ระดับความหายาก)', () => {
  it('legendary จากแท็ก rarity', () => {
    expect(tierOf({ id: 150, rarity: 'legendary', _bst: 680 })).toBe('legendary');
  });
  it('Ultra Beasts เป็น legendary (แม้แท็ก rare)', () => {
    expect(tierOf({ id: 793, rarity: 'rare', _bst: 570 })).toBe('legendary');
    expect(tierOf({ id: 806, rarity: 'rare', _bst: 570 })).toBe('legendary');
  });
  it('จัดระดับตาม BST', () => {
    expect(tierOf({ id: 1, rarity: 'common', _bst: 600 })).toBe('superrare');
    expect(tierOf({ id: 1, rarity: 'common', _bst: 450 })).toBe('rare');
    expect(tierOf({ id: 1, rarity: 'common', _bst: 350 })).toBe('uncommon');
    expect(tierOf({ id: 1, rarity: 'common', _bst: 200 })).toBe('common');
  });
  it('UB set มีครบ 11 ตัว', () => {
    expect(UB_LEGENDARY_IDS.size).toBe(11);
  });
});

describe('isoWeekNumber', () => {
  it('คำนวณเลขสัปดาห์ ISO ถูกต้อง', () => {
    expect(isoWeekNumber(new Date('2026-01-05'))).toBe(2);   // จันทร์สัปดาห์ที่ 2
    expect(isoWeekNumber(new Date('2026-07-11'))).toBe(28);
  });
  it('สัปดาห์เดียวกันได้เลขเดียวกัน (deterministic)', () => {
    expect(isoWeekNumber(new Date('2026-07-06'))).toBe(isoWeekNumber(new Date('2026-07-12')));
  });
});

describe('catchChance', () => {
  const poke = { mult: 1, add: 0 };
  it('master ball การันตี 100%', () => {
    expect(catchChance({ captureRate: 3 }, 80, { mult: 999, add: 1 })).toBe(1);
  });
  it('อัตราจับสูง จับง่ายกว่า', () => {
    const easy = catchChance({ captureRate: 255 }, 5, poke, {});
    const hard = catchChance({ captureRate: 45 }, 5, poke, {});
    expect(easy).toBeGreaterThan(hard);
  });
  it('เลเวลสูง จับยากขึ้น', () => {
    const low = catchChance({ captureRate: 120 }, 5, poke, {});
    const high = catchChance({ captureRate: 120 }, 80, poke, {});
    expect(high).toBeLessThan(low);
  });
  it('จำกัดขอบเขต 0.02–0.96', () => {
    expect(catchChance({ captureRate: 3 }, 80, poke, {})).toBeGreaterThanOrEqual(0.02);
    expect(catchChance({ captureRate: 255 }, 1, { mult: 3, add: 0.5 }, {})).toBeLessThanOrEqual(0.96);
  });
  it('Catch Charm เพิ่มโอกาส', () => {
    expect(catchChance({ captureRate: 100 }, 10, poke, { catchMult: 1.5 }))
      .toBeGreaterThan(catchChance({ captureRate: 100 }, 10, poke, {}));
  });
});

describe('statsForBase', () => {
  it('คำนวณ HP/ATK ตามสูตร (IV 16)', () => {
    const s = statsForBase({ hp: 100, atk: 100, def: 100, spatk: 100, spdef: 100, spd: 100 }, 50);
    expect(s.hp).toBe(168);   // floor(216*0.5)+50+10
    expect(s.atk).toBe(113);  // floor(216*0.5)+5
  });
  it('เลเวลสูงสเตตัสมากกว่า', () => {
    const base = { hp: 80, atk: 80, def: 80, spatk: 80, spdef: 80, spd: 80 };
    expect(statsForBase(base, 100).atk).toBeGreaterThan(statsForBase(base, 20).atk);
  });
});

describe('rarityFromRoll', () => {
  it('luck 0: แบ่งช่วงถูกต้อง', () => {
    expect(rarityFromRoll(0, 1)).toBe('superrare');   // <3
    expect(rarityFromRoll(0, 10)).toBe('rare');        // 3–30
    expect(rarityFromRoll(0, 45)).toBe('uncommon');    // 30–60
    expect(rarityFromRoll(0, 80)).toBe('common');      // 60+
  });
  it('luck สูง ดันโอกาสตัวหายาก', () => {
    // luck 3: srP=12 → roll 10 เป็น superrare (ที่ luck 0 เป็น rare)
    expect(rarityFromRoll(3, 10)).toBe('superrare');
    expect(rarityFromRoll(0, 10)).toBe('rare');
  });
});

describe('damageCore (แกนดาเมจ)', () => {
  const atk = { atk: 120, spatk: 60 };   // physical attacker
  const def = { def: 80, spdef: 80 };
  const fireMon = { types: ['fire'] };
  const grassMon = { types: ['grass'] };
  const move = { type: 'fire', pow: 90 };
  it('ธาตุได้เปรียบ eff=2 + STAB', () => {
    const r = damageCore(fireMon, atk, 50, grassMon, def, move, null, {}, false, 0.5, 0.99);
    expect(r.eff).toBe(2);
    expect(r.crit).toBe(false);
    expect(r.dmg).toBeGreaterThan(0);
  });
  it('คริติคอลเมื่อ critRand ต่ำ', () => {
    const noCrit = damageCore(fireMon, atk, 50, grassMon, def, move, null, {}, false, 0.5, 0.99);
    const crit = damageCore(fireMon, atk, 50, grassMon, def, move, null, {}, false, 0.5, 0);
    expect(crit.crit).toBe(true);
    expect(crit.dmg).toBeGreaterThan(noCrit.dmg);
  });
  it('อากาศบูสต์เพิ่มดาเมจ', () => {
    const normal = damageCore(fireMon, atk, 50, grassMon, def, move, null, {}, false, 0.5, 0.99);
    const boosted = damageCore(fireMon, atk, 50, grassMon, def, move, null, {}, true, 0.5, 0.99);
    expect(boosted.dmg).toBeGreaterThan(normal.dmg);
  });
  it('ภูมิคุ้มกันธาตุ (Levitate) eff=0 แต่ดาเมจอย่างน้อย 1', () => {
    const r = damageCore({ types: ['ground'] }, atk, 50, { types: ['flying'] }, def,
      { type: 'ground', pow: 100 }, null, { defAbility: { immuneType: 'ground' } }, false, 0.5, 0.99);
    expect(r.eff).toBe(0);
    expect(r.dmg).toBe(1);
  });
});

describe('statStageMult (ตัวคูณ stat stage)', () => {
  it('stage 0 = ×1', () => { expect(statStageMult(0)).toBe(1); });
  it('บวกเพิ่มขึ้น: +1 = ×1.5, +2 = ×2, +6 = ×4', () => {
    expect(statStageMult(1)).toBe(1.5);
    expect(statStageMult(2)).toBe(2);
    expect(statStageMult(6)).toBe(4);
  });
  it('ลบลดลง: -1 = ×2/3, -2 = ×0.5, -6 = ×0.25', () => {
    expect(statStageMult(-1)).toBeCloseTo(2 / 3);
    expect(statStageMult(-2)).toBe(0.5);
    expect(statStageMult(-6)).toBe(0.25);
  });
  it('จำกัดขอบเขต -6..+6 (เกินถือว่าตัน)', () => {
    expect(statStageMult(99)).toBe(statStageMult(6));
    expect(statStageMult(-99)).toBe(statStageMult(-6));
  });
});

describe('comboMult (ตัวคูณ shiny จากคอมโบ)', () => {
  it('คอมโบน้อยเพิ่มทีละนิด', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(1)).toBeCloseTo(1.08);
    expect(comboMult(4)).toBeCloseTo(1.32);
  });
  it('ขั้นบันไดที่ 5/10/20/30', () => {
    expect(comboMult(5)).toBe(1.5);
    expect(comboMult(10)).toBe(2.2);
    expect(comboMult(20)).toBe(3.5);
    expect(comboMult(30)).toBe(5);
  });
  it('เกิน 30 ตันที่ ×5', () => { expect(comboMult(999)).toBe(5); });
  it('ไม่ลดลงเมื่อคอมโบเพิ่ม (monotonic)', () => {
    for (let n = 1; n < 40; n++) expect(comboMult(n)).toBeGreaterThanOrEqual(comboMult(n - 1));
  });
});

describe('xpToTier (XP → ระดับบัตร)', () => {
  it('หารลงตาม perTier', () => {
    expect(xpToTier(0, 120, 20)).toBe(0);
    expect(xpToTier(119, 120, 20)).toBe(0);
    expect(xpToTier(120, 120, 20)).toBe(1);
    expect(xpToTier(650, 120, 20)).toBe(5);
  });
  it('จำกัดไม่เกิน max', () => {
    expect(xpToTier(999999, 120, 20)).toBe(20);
  });
  it('xp ว่าง/undefined ถือเป็น 0', () => {
    expect(xpToTier(undefined, 120, 20)).toBe(0);
  });
});

describe('tierForRating (คะแนน → แรงก์)', () => {
  const tiers = [
    { min: 2000, name: 'Master' }, { min: 1500, name: 'Platinum' },
    { min: 1050, name: 'Silver' }, { min: 0, name: 'Bronze' },
  ];
  it('คืนแรงก์แรกที่คะแนนถึง min', () => {
    expect(tierForRating(2100, tiers).name).toBe('Master');
    expect(tierForRating(1500, tiers).name).toBe('Platinum');
    expect(tierForRating(1049, tiers).name).toBe('Bronze');
  });
  it('คะแนน 0/undefined = แรงก์ต่ำสุด', () => {
    expect(tierForRating(0, tiers).name).toBe('Bronze');
    expect(tierForRating(undefined, tiers).name).toBe('Bronze');
  });
});

describe('xpForLevel (XP ต่อเลเวลโปเกมอน)', () => {
  it('เพิ่มขึ้นตามเลเวล', () => {
    expect(xpForLevel(1)).toBe(52);
    expect(xpForLevel(50)).toBe(1130);
    expect(xpForLevel(100)).toBe(2230);
  });
  it('monotonic เพิ่มเสมอ', () => {
    for (let l = 1; l < 100; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });
});

describe('levelFromXp (เลเวลเทรนเนอร์จาก XP)', () => {
  it('XP 0 = เลเวล 1', () => { expect(levelFromXp(0)).toBe(1); });
  it('undefined ถือเป็น 0', () => { expect(levelFromXp(undefined)).toBe(1); });
  it('โค้งรากที่สอง (ยิ่งสูงยิ่งช้า)', () => {
    expect(levelFromXp(60)).toBe(2);     // sqrt(1)=1 → +1
    expect(levelFromXp(240)).toBe(3);    // sqrt(4)=2 → +1
    expect(levelFromXp(540)).toBe(4);    // sqrt(9)=3 → +1
  });
  it('monotonic ไม่ลดลง', () => {
    let prev = 0;
    for (let xp = 0; xp <= 100000; xp += 500) { const lv = levelFromXp(xp); expect(lv).toBeGreaterThanOrEqual(prev); prev = lv; }
  });
});

describe('tmPrice (ราคาแผ่นสกิลจากพลังท่า)', () => {
  it('ยิ่งแรงยิ่งแพง', () => {
    expect(tmPrice(60)).toBe(60);    // round(30)+30
    expect(tmPrice(150)).toBe(105);  // round(75)+30
  });
  it('ไม่มี pow ใช้ค่าตั้งต้น 60', () => {
    expect(tmPrice(undefined)).toBe(60);
  });
});

describe('ivRerollPrice (ราคาสุ่ม IV ตามช่องที่ล็อก)', () => {
  it('ไม่ล็อก = base', () => { expect(ivRerollPrice(100000, 0)).toBe(100000); });
  it('ยิ่งล็อกยิ่งแพงเป็นขั้น', () => {
    expect(ivRerollPrice(100000, 1)).toBe(200000);
    expect(ivRerollPrice(100000, 5)).toBe(600000);
  });
  it('lockedCount undefined ถือเป็น 0', () => {
    expect(ivRerollPrice(100000, undefined)).toBe(100000);
  });
});

describe('ivPercentOf (%IV รวม)', () => {
  const perfect = { hp: 31, atk: 31, def: 31, spatk: 31, spdef: 31, spd: 31 };
  const zero = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
  it('IV เต็ม = 100%', () => { expect(ivPercentOf(perfect)).toBe(100); });
  it('IV ศูนย์ = 0%', () => { expect(ivPercentOf(zero)).toBe(0); });
  it('ครึ่งทาง ~50%', () => {
    expect(ivPercentOf({ hp: 16, atk: 16, def: 16, spatk: 15, spdef: 15, spd: 15 })).toBe(50);  // 93/186
  });
});

describe('contestBaseScore (คะแนนคอนเทสต์ deterministic)', () => {
  it('พื้นฐาน = %IV', () => {
    expect(contestBaseScore({ ivPct: 80, typeMatch: false, natureMatch: false, shiny: false, level: 0 })).toBe(80);
  });
  it('บวกโบนัสตามเงื่อนไข (ธาตุ+25, นิสัย+15, shiny+10)', () => {
    expect(contestBaseScore({ ivPct: 50, typeMatch: true, natureMatch: true, shiny: true, level: 0 })).toBe(100);
  });
  it('เลเวลช่วยแต่ตันที่ +20', () => {
    expect(contestBaseScore({ ivPct: 0, typeMatch: false, natureMatch: false, shiny: false, level: 50 })).toBe(10);
    expect(contestBaseScore({ ivPct: 0, typeMatch: false, natureMatch: false, shiny: false, level: 500 })).toBe(20);
  });
});

describe('rivalBaseScore (คะแนนพื้นฐานคู่แข่ง)', () => {
  it('เพิ่มตามเลเวลเทรนเนอร์', () => {
    expect(rivalBaseScore(0)).toBe(30);
    expect(rivalBaseScore(10)).toBe(42);
  });
});

describe('runMigrations (ไมเกรชันเซฟ)', () => {
  it('ไล่รันไมเกรชันตามลำดับจาก _v เดิมถึง target', () => {
    const order = [];
    const migrations = { 2: () => order.push(2), 3: () => order.push(3), 4: () => order.push(4) };
    const save = { _v: 1 };
    runMigrations(save, 4, migrations);
    expect(order).toEqual([2, 3, 4]);
    expect(save._v).toBe(4);
  });
  it('เซฟไม่มี _v ถือเป็น v1', () => {
    const applied = [];
    runMigrations({}, 3, { 2: (s) => { s.twoRan = true; applied.push(2); }, 3: () => applied.push(3) });
    expect(applied).toEqual([2, 3]);
  });
  it('ข้ามไมเกรชันที่ไม่มีฟังก์ชัน + ไม่รันซ้ำถ้า _v ถึง target แล้ว', () => {
    let count = 0;
    const save = { _v: 3 };
    runMigrations(save, 3, { 3: () => count++ });
    expect(count).toBe(0);          // _v ถึงแล้ว ไม่รัน
    expect(save._v).toBe(3);
  });
  it('แก้ข้อมูลจริง (migration แก้ save ในตัว)', () => {
    const save = { _v: 2, coins: 0 };
    runMigrations(save, 3, { 3: (s) => { s.coins = 100; } });
    expect(save.coins).toBe(100);
    expect(save._v).toBe(3);
  });
});
