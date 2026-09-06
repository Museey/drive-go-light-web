/**
 * หน้าพิมพ์ทั้งชุดที่เพิ่มในช่วงที่ 7
 *
 * สองหน้านี้เอาข้อมูลของอู่ออกจากระบบทั้งชุด จึงต้องกันด้วยสิทธิ์ส่งออก
 * ไม่ใช่แค่สิทธิ์ดู — เป็นกติกาเดียวกับหน้าพิมพ์อื่นที่ perms-db.test.ts คุมอยู่
 *
 * และตัวเลขบนกระดาษต้องมาจากฟังก์ชันเดียวกับที่ไฟล์ CSV ใช้
 * ถ้าคนละตัว วันหนึ่งจะไม่ตรงกันโดยไม่มีใครรู้ว่าอันไหนถูก
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../src/app');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

describe('หน้าพิมพ์รายรับรายจ่าย', () => {
  const src = read('/finance/print/page.tsx');

  it('กันด้วยสิทธิ์ส่งออกและสิทธิ์ต้นทุน เหมือน /finance/csv', () => {
    expect(src).toContain('requireExport(');
    expect(src, 'มีต้นทุนขายอยู่ในตัวเลข').toContain('requireCost(');
  });

  it('ใช้แหล่งข้อมูลเดียวกับไฟล์ CSV', () => {
    const csv = read('/finance/csv/route.ts');
    expect(src).toContain('getFinanceCsvRows');
    expect(csv).toContain('getFinanceCsvRows');
  });

  it('รับตัวกรองช่วงเวลาชุดเดียวกับ CSV', () => {
    for (const key of ['from', 'to']) {
      expect(src, `ต้องรับ ?${key}=`).toContain(key);
    }
  });
});

describe('หน้าพิมพ์ฉลากบาร์โค้ด', () => {
  const src = read('/stock/barcodes/page.tsx');

  it('กันด้วยสิทธิ์ส่งออก', () => {
    expect(src).toContain("requireExport('stock', 'list')");
  });

  it('รับตัวกรองชุดเดียวกับหน้าพิมพ์ทะเบียนสินค้า', () => {
    const list = read('/stock/print/page.tsx');
    for (const key of ['q', 'cat', 'reorder', 'all', 'flag']) {
      expect(src, `ตัวกรอง ${key} ต้องมีเหมือนหน้าพิมพ์ทะเบียน`).toContain(`${key}?: string`);
      expect(list).toContain(`${key}?: string`);
    }
  });

  it('ข้ามสินค้าที่ยังไม่มีบาร์โค้ด ไม่ใช่พิมพ์ฉลากเปล่า', () => {
    expect(src).toContain('p.barcode');
    expect(src, 'ต้องบอกผู้ใช้ด้วยว่าข้ามไปกี่รายการ').toMatch(/without/);
  });

  it('มีเพดานจำนวนดวงทั้งแผ่น', () => {
    expect(src, 'ไม่งั้น ?n= กับตัวกรองกว้าง ๆ ทำให้เครื่องพิมพ์พ่นกระดาษทั้งลัง')
      .toMatch(/MAX_LABELS\s*=\s*\d+/);
  });

  it('จำนวนดวงต่อสินค้าเลือกได้เฉพาะค่าในรายการ', () => {
    expect(src, 'ค่านอกรายการต้องถูกปัดกลับ ไม่ใช่เชื่อค่าที่ส่งมาใน URL')
      .toMatch(/PER_ITEM.*includes\(Number\(sp\.n\)\)/s);
  });
});
