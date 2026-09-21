/**
 * กติกาการค้นหา/เลือกในตัวแก้ไขเอกสาร — ตามเอกสารเจ๊ก ข้อ 1, 2, 9, 13
 *
 *   ข้อ 1  พิมพ์แล้วขึ้นผลทันที ไม่ต้องกด Enter หรือปุ่มค้นหา
 *   ข้อ 2  เลือกแล้วช่องค้น+ผลค้นหาต้องหายไป · รายการในเอกสารเป็นคนละสีกับผลค้นหา
 *   ข้อ 9  ลบคำค้นจนว่างผลต้องหาย (อยู่ในแกน live-search — ทดสอบที่ live-search.test.ts)
 *   ข้อ 13 กดเลือกได้ทั้งแถว ไม่ใช่เฉพาะปุ่ม — ทำทั้งระบบ
 *
 * ทดสอบด้วยการอ่านโค้ดจริง เพราะชุดนี้ไม่มีตัวเรนเดอร์ React
 * ครอบทั้งใบขาย (doc-editor) และใบซื้อ (buy-editor) ให้เท่ากัน — "ทำทั้งระบบ"
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

const editors = {
  'ใบขาย doc-editor': read('../src/app/income/doc-editor.tsx'),
  'ใบซื้อ buy-editor': read('../src/app/expense/buy-editor.tsx'),
};
const css = read('../src/app/globals.css');

for (const [name, src] of Object.entries(editors)) {
  describe(name, () => {
    it('อ่านไฟล์ได้จริง', () => {
      expect(src.length).toBeGreaterThan(2000);
    });

    it('ข้อ 1 — ใช้ค้นหาสด ไม่มี Enter ที่สั่งค้นหา และไม่มีปุ่ม "ค้นหา" แล้ว', () => {
      expect(src).toContain('useLiveSearch(');
      /* Enter ในช่องค้นทำได้อย่างเดียวคือกันฟอร์มส่ง ห้ามผูกกับฟังก์ชันค้น */
      expect(src).not.toMatch(/e\.key === 'Enter'\)\s*\{\s*e\.preventDefault\(\);\s*search\w+\(\)/);
      expect(src).not.toMatch(/search(Cust|Part|Vendor)\s*=\s*\(\)\s*=>/);
      expect(src).not.toMatch(/>ค้นหา(อะไหล่|ลูกค้า|จากทะเบียนผู้ขาย)</);
    });

    it('ข้อ 13 — แถวผลค้นหากดได้ทั้งแถว และปุ่มในแถวไม่ทำให้เพิ่มซ้ำ', () => {
      const rows = src.match(/<tr key=\{\w+\.id\} className="pick"/g) ?? [];
      expect(rows.length, 'ต้องมีแถว .pick อย่างน้อยสองชุด (คู่ค้า + อะไหล่)').toBeGreaterThanOrEqual(2);
      /* ทุกแถว .pick ต้องกดด้วยคีย์บอร์ดได้ด้วย */
      expect(src).toMatch(/className="pick" role="button" tabIndex=\{0\}/);
      /* ถ้ายังมีปุ่ม "เพิ่ม/เลือก" ซ้อนในแถว ปุ่มนั้นต้องหยุด bubbling ไม่งั้นกดหนึ่งครั้ง = เพิ่มสองครั้ง
         (ฟอร์มใหม่ไม่มีปุ่มในแถวแล้ว — ทั้งแถวคือเป้า จึงเป็น 0 = 0) */
      /* stopPropagation ในไฟล์ตอนนี้ยังมีของ Enter-ในบรรทัด (กันตัวกลาง Enter-ไปช่องถัดไป) ด้วย
         จึงตรวจแค่ว่าปุ่มในแถว (ถ้ามี) มีตัวหยุด bubbling ไม่น้อยกว่าจำนวนปุ่ม */
      const stops = src.match(/e\.stopPropagation\(\)/g) ?? [];
      const rowBtns = src.match(/>(เพิ่ม|เลือก)<\/button>/g) ?? [];
      expect(stops.length).toBeGreaterThanOrEqual(rowBtns.length);
    });

    it('ข้อ 2 — เลือกแล้วล้างช่องค้นและผล', () => {
      /* แบบเดิม: addProduct ล้างช่องค้นด้านบน · แบบใหม่ (ค้นในบรรทัด): pick ล้าง query ของบรรทัด */
      const add = src.slice(src.indexOf('const addProduct'), src.indexOf('const addProduct') + 1200);
      const topClears = add.includes("setPartQuery('')") && add.includes('clearParts()');
      /* จับ "สิ่งที่ pick ต้องทำ" ไม่ใช่ลำดับคำต่อคำ — ตัวที่พินถ้อยคำเป๊ะจะแดงทุกครั้ง
         ที่มีงานอื่นเพิ่มเข้ามาในบรรทัดเดียวกัน (เช่น ล้างความจำรหัสของ line-link.ts) */
      const rowClears = /const pick = \(p: PickedProduct\) => \{[^}]*onPick\(p\);[^}]*setQuery\(''\);[^}]*clear\(\);[^}]*\}/.test(src);
      expect(topClears || rowClears).toBe(true);
    });

    it('ข้อ 2 — ตารางรายการในเอกสารใช้คลาส picked (คนละสีกับผลค้นหา)', () => {
      expect(src).toMatch(/className="tbl[^"]*\bpicked"/);
    });
  });
}

describe('สไตล์ที่รองรับ', () => {
  it('แถว .pick มี cursor: pointer และมีสีตอน hover/focus', () => {
    expect(css).toMatch(/table\.tbl tr\.pick \{[^}]*cursor: pointer/);
    expect(css).toMatch(/tr\.pick:hover/);
    expect(css).toMatch(/tr\.pick:focus-visible/);
  });
  it('ตาราง .picked มีพื้นหลังต่างจากตารางปกติ', () => {
    expect(css).toMatch(/table\.tbl\.picked tbody tr \{[^}]*background/);
  });
});
