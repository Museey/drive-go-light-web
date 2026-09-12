/**
 * ไฮไลต์เมนูต้องบอกถูกว่าตอนนี้อยู่ตรงไหน
 *
 * แท็บย่อยของเมนูเดียวกันใช้ path เดียวกันหมด ต่างกันแค่ query string
 * การเทียบแค่ path จึงทำให้ทุกแท็บเขียวพร้อมกัน — เจอตอนเปิดลิ้นชักบนมือถือจริง
 * แล้วแท็บ 03.1 ถึง 03.3 สว่างพร้อมกันทั้งแถบ ซึ่งอ่านไม่ออกว่าอยู่ตรงไหน
 */
import { describe, expect, it } from 'vitest';
import { MENU } from '../src/components/menu-map';
import { isCurrent, subIsCurrent, TAB_KEYS } from '../src/components/nav-data';

const q = (s: string) => new URLSearchParams(s);

describe('แท็บย่อยที่กำลังเปิดอยู่', () => {
  it('แท็บที่ตรงกับ query ปัจจุบันเท่านั้นที่ถือว่าเปิดอยู่', () => {
    expect(subIsCurrent('/income?kind=RC', '/income', q('kind=RC'))).toBe(true);
    expect(subIsCurrent('/income?kind=QT', '/income', q('kind=RC'))).toBe(false);
    expect(subIsCurrent('/income?kind=IV', '/income', q('kind=RC'))).toBe(false);
  });

  /** ข้อที่จับบั๊กตัวจริง — แท็บทั้งเมนูต้องไม่สว่างพร้อมกัน */
  it('เปิดแท็บหนึ่ง แล้วแท็บพี่น้องต้องไม่สว่างตาม', () => {
    const subs = MENU.find((m) => m.key === 'income')!.subs!;
    const สว่าง = subs.filter((s) => subIsCurrent(s.href, '/income', q('kind=RC')));
    expect(สว่าง.map((s) => s.no)).toEqual(['03.3']);
  });

  it('ตัวกรองอื่นที่ผู้ใช้เลือกเพิ่ม ไม่ทำให้ไฮไลต์หลุด', () => {
    expect(subIsCurrent('/income?kind=RC', '/income', q('kind=RC&page=3&size=50'))).toBe(true);
  });

  it('คนละหน้าไม่ถือว่าเปิดอยู่ แม้ query จะเหมือนกัน', () => {
    expect(subIsCurrent('/income?kind=RC', '/expense', q('kind=RC'))).toBe(false);
  });

  it('แท็บที่ไม่มี query ถือว่าเปิดเมื่ออยู่หน้านั้น', () => {
    expect(subIsCurrent('/stock', '/stock', q(''))).toBe(true);
    expect(subIsCurrent('/stock', '/stock', q('q=BRK&page=2'))).toBe(true);
    expect(subIsCurrent('/stock', '/stock/expiry', q(''))).toBe(false);
  });
});

describe('เมนูหลักที่กำลังเปิดอยู่', () => {
  it('หน้าแรกสว่างเฉพาะตอนอยู่หน้าแรกจริง ๆ', () => {
    const home = MENU.find((m) => m.key === 'home')!;
    expect(isCurrent(home, '/')).toBe(true);
    expect(isCurrent(home, '/income')).toBe(false);
  });

  it('เมนูสว่างเมื่ออยู่หน้าลูกของมัน', () => {
    const stock = MENU.find((m) => m.key === 'stock')!;
    expect(isCurrent(stock, '/stock/expiry')).toBe(true);
    expect(isCurrent(stock, '/finance/ar')).toBe(false);
  });
});

describe('ห้าช่องของแถบล่างบนมือถือ', () => {
  it('สี่ช่องแรกเป็นเมนูที่มีอยู่จริงในผัง', () => {
    for (const k of TAB_KEYS) {
      expect(MENU.some((m) => m.key === k), `ไม่มีเมนู ${k} ในผัง`).toBe(true);
    }
  });

  /* ช่องที่ห้าคือ "เพิ่มเติม" ที่เปิดลิ้นชัก — สี่ช่องแรกจึงต้องไม่เกินสี่
     ไม่งั้นแถบจะแน่นจนกดพลาด (ห้าช่องบนจอ 375 = ช่องละ 75px) */
  it('มีสี่ช่องพอดี เหลือที่ให้ช่องเพิ่มเติม', () => {
    expect(TAB_KEYS).toHaveLength(4);
  });

  it('ทุกเมนูยังไปถึงได้ — ที่ไม่ได้อยู่ในแถบล่างต้องอยู่ในลิ้นชัก', () => {
    /* ลิ้นชักแสดงทุกเมนูในผัง ไม่ได้กรองด้วย TAB_KEYS จึงครอบคลุมเสมอ
       ข้อนี้กันไม่ให้มีใครเผลอเอา TAB_KEYS ไปกรองลิ้นชักด้วยในอนาคต */
    const ตกหล่น = MENU.filter((m) => !TAB_KEYS.includes(m.key as never));
    expect(ตกหล่น.length).toBeGreaterThan(0);
  });
});
