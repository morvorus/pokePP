import { describe, it, expect } from 'vitest';
import { clamp, typeEffect, movePP, tierOf, isoWeekNumber, UB_LEGENDARY_IDS } from './logic.js';

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
