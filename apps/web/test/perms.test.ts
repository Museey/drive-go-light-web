/**
 * สิทธิ์การใช้งาน — ฟังก์ชันล้วน
 *
 * ที่นี่พิสูจน์ "กติกา" ส่วนการพิสูจน์ว่า **ไม่มีทางลอด** อยู่ใน perms-db.test.ts
 * ซึ่งไล่ทุกเส้นทางที่ส่งข้อมูลออกจริง ๆ
 */
import { describe, expect, it } from 'vitest';
import {
  canCost, canEdit, canExport, canHomeReport, canMenu, canTab,
  permsFromLegacy, seatsLeft, type PermKey, type PermSubject, type Perms,
} from '../src/lib/perms';

const staff = (perms: Perms): PermSubject => ({ role: 'staff', perms });
const owner = (perms: Perms = {}): PermSubject => ({ role: 'owner', perms });

const SUBS: Record<string, string[]> = {
  customer: ['customer', 'vendor'],
  income: ['quote', 'invoice', 'receipt', 'billing'],
  expense: ['purchase', 'expense'],
  stock: ['list', 'pending', 'claim', 'vclaim', 'count'],
  finance: ['sales', 'ar', 'ap', 'pl'],
  settings: ['shop', 'staff', 'import'],
};
const subsOf = (m: PermKey) => SUBS[m] ?? [];

describe('เมนูหลัก', () => {
  it('ไม่ติ๊กเมนู = เข้าไม่ได้', () => {
    expect(canMenu(staff({ menus: { stock: true } }), 'stock')).toBe(true);
    expect(canMenu(staff({ menus: { stock: true } }), 'finance')).toBe(false);
    expect(canMenu(staff({}), 'stock')).toBe(false);
  });

  it('เจ้าของผ่านทุกด่านแม้ perms ว่างเปล่า', () => {
    const o = owner();
    expect(canMenu(o, 'settings')).toBe(true);
    expect(canTab(o, 'finance', 'pl')).toBe(true);
    expect(canEdit(o, 'stock', 'list')).toBe(true);
    expect(canExport(o, 'stock', 'list')).toBe(true);
    expect(canCost(o)).toBe(true);
    expect(canHomeReport(o)).toBe(true);
  });
});

describe('เมนูย่อย', () => {
  const base: Perms = { menus: { stock: true } };

  it('ยังไม่เคยตั้งละเอียด = เข้าได้ทุกแท็บของเมนูที่ติ๊กไว้', () => {
    expect(canTab(staff(base), 'stock', 'list')).toBe(true);
    expect(canTab(staff(base), 'stock', 'count')).toBe(true);
  });

  it('ตั้งละเอียดแล้ว แท็บที่ไม่มีคีย์ถือว่าห้าม', () => {
    const s = staff({ ...base, tabs: { 'stock.list': true } });
    expect(canTab(s, 'stock', 'list')).toBe(true);
    expect(canTab(s, 'stock', 'count')).toBe(false);
  });

  it('กติกานี้แยกกันรายเมนู — ตั้งละเอียดที่ stock ไม่กระทบ income', () => {
    const s = staff({
      menus: { stock: true, income: true },
      tabs: { 'stock.list': true },
    });
    expect(canTab(s, 'stock', 'count')).toBe(false);
    expect(canTab(s, 'income', 'receipt')).toBe(true);
  });

  it('ไม่ติ๊กเมนูหลัก ต่อให้ติ๊กแท็บไว้ก็เข้าไม่ได้', () => {
    const s = staff({ menus: {}, tabs: { 'stock.list': true } });
    expect(canTab(s, 'stock', 'list')).toBe(false);
  });
});

describe('ต้นทุนกับหน้ากำไรขาดทุน', () => {
  it('ไม่ได้ตั้ง = เห็นต้นทุน', () => {
    expect(canCost(staff({ menus: { stock: true } }))).toBe(true);
  });

  /**
   * กฎของรุ่น 6.4 ที่ต้องอยู่ในที่เดียว ไม่ใช่ให้แต่ละหน้าจำเอง
   */
  it('ซ่อนต้นทุน = เข้าหน้ากำไรขาดทุนไม่ได้ แม้ติ๊กแท็บไว้ชัดเจน', () => {
    const s = staff({
      menus: { finance: true },
      tabs: { 'finance.pl': true, 'finance.ar': true },
      cost: false,
    });
    expect(canTab(s, 'finance', 'pl')).toBe(false);
    expect(canTab(s, 'finance', 'ar')).toBe(true);
  });

  it('เจ้าของเห็นต้นทุนเสมอ แม้ perms เขียน cost:false ไว้', () => {
    expect(canCost(owner({ cost: false }))).toBe(true);
    expect(canTab(owner({ cost: false }), 'finance', 'pl')).toBe(true);
  });
});

describe('แก้ไขและส่งออก', () => {
  const base: Perms = { menus: { stock: true } };

  it('ไม่ได้ตั้ง = ทำได้', () => {
    expect(canEdit(staff(base), 'stock', 'list')).toBe(true);
    expect(canExport(staff(base), 'stock', 'list')).toBe(true);
  });

  it('ตั้ง false = ทำไม่ได้ แต่ยังเข้าดูได้', () => {
    const s = staff({ ...base, edit: { 'stock.list': false } });
    expect(canTab(s, 'stock', 'list')).toBe(true);
    expect(canEdit(s, 'stock', 'list')).toBe(false);
    expect(canExport(s, 'stock', 'list')).toBe(true);
  });

  it('เข้าดูไม่ได้ = แก้ไขและส่งออกไม่ได้ด้วย ไม่ว่าตั้งอะไรไว้', () => {
    const s = staff({
      menus: { stock: true },
      tabs: { 'stock.list': true },
      edit: { 'stock.count': true },
      export: { 'stock.count': true },
    });
    expect(canTab(s, 'stock', 'count')).toBe(false);
    expect(canEdit(s, 'stock', 'count')).toBe(false);
    expect(canExport(s, 'stock', 'count')).toBe(false);
  });

  it('ซ่อนต้นทุนแล้วส่งออกงบกำไรขาดทุนไม่ได้ตามไปด้วย', () => {
    const s = staff({ menus: { finance: true }, cost: false });
    expect(canExport(s, 'finance', 'pl')).toBe(false);
  });
});

describe('ที่นั่งพนักงาน', () => {
  it('null = ไม่จำกัด', () => {
    expect(seatsLeft(null, 99)).toBeNull();
  });

  it('นับเฉพาะพนักงาน เจ้าของไม่ถูกนับ', () => {
    expect(seatsLeft(3, 0)).toBe(3);
    expect(seatsLeft(3, 2)).toBe(1);
    expect(seatsLeft(3, 3)).toBe(0);
  });

  it('เกินโควตาแล้วไม่ติดลบ — ลดแพ็กเกจทีหลังต้องไม่ทำให้ตัวเลขเพี้ยน', () => {
    expect(seatsLeft(3, 5)).toBe(0);
  });
});

describe('แปลงสิทธิ์จากไฟล์รุ่นเดิม', () => {
  it('รูปแบบพื้นฐาน — เมนูที่ติ๊กไว้กลายเป็น menus', () => {
    const p = permsFromLegacy({ stock: true, income: true, settings: false }, subsOf);
    expect(p.menus).toEqual({ stock: true, income: true });
  });

  it('รูปแบบใหม่ tabs / editTabs / exportTabs', () => {
    const p = permsFromLegacy({
      stock: true,
      tabs: { 'stock.list': true, 'stock.count': false },
      editTabs: { 'stock.list': false },
      exportTabs: { 'stock.list': false },
    }, subsOf);

    expect(p.tabs!['stock.list']).toBe(true);
    expect(p.tabs!['stock.count']).toBe(false);
    expect(p.edit!['stock.list']).toBe(false);
    expect(p.export!['stock.list']).toBe(false);

    const s = staff(p);
    expect(canTab(s, 'stock', 'list')).toBe(true);
    expect(canTab(s, 'stock', 'count')).toBe(false);
    expect(canEdit(s, 'stock', 'list')).toBe(false);
  });

  /** รูปแบบเก่าของ 6.4 — จำกัดให้เข้าได้แท็บเดียว */
  it('รูปแบบเก่า sub[menu] กางเป็นรายแท็บให้ถูกต้อง', () => {
    const p = permsFromLegacy({ income: true, sub: { income: 'receipt' } }, subsOf);
    const s = staff(p);
    expect(canTab(s, 'income', 'receipt')).toBe(true);
    expect(canTab(s, 'income', 'quote')).toBe(false);
    expect(canTab(s, 'income', 'billing')).toBe(false);
  });

  /** รูปแบบเก่า — สวิตช์ส่งออกตัวเดียวทั้งระบบ */
  it('รูปแบบเก่า exportData:false ปิดการส่งออกทุกแท็บของเมนูที่ให้สิทธิ์', () => {
    const p = permsFromLegacy({ stock: true, income: true, exportData: false }, subsOf);
    const s = staff(p);
    expect(canExport(s, 'stock', 'list')).toBe(false);
    expect(canExport(s, 'income', 'receipt')).toBe(false);
    expect(canTab(s, 'stock', 'list')).toBe(true);          // ยังเข้าดูได้
  });

  it('exportTabs ที่ระบุไว้ชนะ exportData ตัวเก่า', () => {
    const p = permsFromLegacy({
      stock: true, exportData: false, exportTabs: { 'stock.list': true },
    }, subsOf);
    expect(canExport(staff(p), 'stock', 'list')).toBe(true);
    expect(canExport(staff(p), 'stock', 'count')).toBe(false);
  });

  it('cost / homeReport ตามมาด้วย', () => {
    const p = permsFromLegacy({ stock: true, cost: false, homeReport: false }, subsOf);
    expect(canCost(staff(p))).toBe(false);
    expect(canHomeReport(staff(p))).toBe(false);
  });

  it('ไฟล์ที่ไม่มี perms เลยไม่ทำให้พัง', () => {
    expect(permsFromLegacy(undefined, subsOf).menus).toEqual({});
    expect(permsFromLegacy(null, subsOf).menus).toEqual({});
    expect(permsFromLegacy('ข้อความ', subsOf).menus).toEqual({});
  });
});
