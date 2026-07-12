import { describe, it, expect } from 'vitest';
import { clamp, typeEffect, movePP, tierOf, isoWeekNumber, UB_LEGENDARY_IDS,
  catchChance, statsForBase, rarityFromRoll, damageCore } from './logic.js';

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
