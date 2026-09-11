/**
 * ไม่มีหน้าไหนกลับไปตีมูลค่าสต๊อกด้วย คงเหลือ × ทุนล่าสุด
 *
 * มูลค่าสต๊อกกับต้นทุนขายต้องคิดจากฐานเดียวกัน ไม่งั้นงบกำไรขาดทุนกระทบยอดไม่ได้ —
 * `คงเหลือ × ทุนล่าสุด` พองเกินจริงทุกครั้งที่ราคาซื้อขยับขึ้น และไม่มีอะไรฟ้อง
 * เพราะตัวเลขที่พองก็ยังดูสมเหตุสมผล
 *
 * เทสต์นี้อ่านซอร์สจริงแทนการเรียกฟังก์ชัน เพราะคิวรีพวกนี้ต้องมี session
 * จึงเรียกตรงจากชุดทดสอบไม่ได้ ส่วนสูตรถูกพิสูจน์ด้วยฐานข้อมูลจริงที่ fifo-db.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/**
 * `qty_on_hand * p.last_cost` หรือสลับข้าง — รูปแบบของการตีมูลค่าแบบเก่า
 *
 * ไม่จับ `need * last_cost` (เงินที่ต้องใช้สั่งของครั้งหน้า ซึ่งใช้ทุนล่าสุดถูกแล้ว)
 * และไม่จับ `last_cost` เดี่ยว ๆ ที่เป็นการแสดงราคาซื้อล่าสุดเฉย ๆ
 */
const OLD_VALUATION = /qty_on_hand\s*\*\s*\w*\.?last_cost|last_cost\s*\*\s*\w*\.?qty_on_hand/;

describe('การตีมูลค่าสต๊อก', () => {
  it('ไล่ไฟล์ได้จริง ไม่ใช่ลิสต์ว่าง', () => {
    expect(sources(SRC).length).toBeGreaterThan(50);
  });

  it('รูปแบบที่ใช้จับ ตรงกับคำสั่งที่ผิดจริง', () => {
    expect(OLD_VALUATION.test('sum(s.qty_on_hand * p.last_cost)')).toBe(true);
    expect(OLD_VALUATION.test('sum(bv.value)')).toBe(false);
    /* เงินที่ต้องใช้สั่งของครั้งหน้า — ใช้ทุนล่าสุดถูกแล้ว ต้องไม่โดนจับ */
    expect(OLD_VALUATION.test('money(r.need) * money(r.last_cost)')).toBe(false);
  });

  it('ไม่มีไฟล์ไหนคิดมูลค่าสต๊อกจาก คงเหลือ × ทุนล่าสุด', () => {
    const bad = sources(SRC)
      .filter((f) => OLD_VALUATION.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));
    expect(bad).toEqual([]);
  });

  /* ถ้าสูตรมีอยู่ที่เดียว การแก้ครั้งเดียวก็เปลี่ยนพร้อมกันทุกหน้า
     และชุดทดสอบที่เรียกผ่าน bookValueOf() ก็คุ้มถึงหน้าจอด้วย */
  it('ทุกที่ที่ต้องการมูลค่าสต๊อก ใช้ BOOK_VALUE_SQL ตัวเดียวกัน', () => {
    const users = sources(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('BOOK_VALUE_SQL'))
      .map((f) => f.slice(SRC.length + 1));

    expect(users).toContain('lib/stock-cost.ts');       /* ที่นิยามสูตร */
    expect(users).toContain('lib/products.ts');         /* ทะเบียนสินค้า + หน้าพิมพ์ */
    expect(users).toContain('lib/queries.ts');          /* เงินจมในชั้นวางบนหน้าแรก */
    expect(users).toContain('lib/stock-counts.ts');     /* มูลค่าส่วนต่างตรวจนับ */
  });
});
