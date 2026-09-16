import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { BOM, CSV_HEADERS, csvField, mapHeaders, parseCsv } from './csv';
import { importProductsCsvWith, type CsvImportResult } from './products-csv-core';

export { CSV_HEADERS, mapHeaders, parseCsv } from './csv';

/**
 * นำเข้า–ส่งออกทะเบียนสินค้าเป็น CSV
 *
 * ใช้ตอนเปิดร้านใหม่ที่มีรายการอะไหล่อยู่ใน Excel อยู่แล้ว
 * และตอนอยากแก้ราคาทีละมาก ๆ ซึ่งทำในตารางเร็วกว่ากดทีละตัวบนเว็บ
 */

const n = (v: unknown): number => Number(v ?? 0);

export async function exportProductsCsv(): Promise<string> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select p.code, p.oem, p.name, p.unit, coalesce(g.name, '') as cat,
              p.last_cost, p.price_a, p.price_b, p.price_c,
              p.qty_min, p.qty_max, coalesce(s.qty_on_hand, 0) as qty
       from products p
       left join product_categories g on g.id = p.category_id
       left join product_stock s on s.product_id = p.id
       where p.active
       order by p.code`,
    );

    const lines = [CSV_HEADERS.join(',')];
    for (const r of rows) {
      lines.push([
        r.code, r.oem, r.name, r.unit, r.cat,
        n(r.last_cost), n(r.price_a), n(r.price_b), n(r.price_c),
        n(r.qty_min), n(r.qty_max), n(r.qty),
      ].map(csvField).join(','));
    }
    /* BOM ให้ Excel บนวินโดวส์เปิดแล้วภาษาไทยไม่เพี้ยน */
    return BOM + lines.join('\r\n');
  });
}

export function productsCsvTemplate(): string {
  return BOM + [
    CSV_HEADERS.join(','),
    'BRK-001,04465-0K340,ผ้าเบรกหน้า Toyota Revo,ชุด,เบรก,780,1450,1300,1150,6,30,12',
  ].join('\r\n');
}

export type { CsvImportResult } from './products-csv-core';

/**
 * นำเข้าสินค้าจาก CSV
 *
 * รหัสสินค้าที่มีอยู่แล้วจะถูกแก้ ไม่ใช่สร้างซ้ำ — คนส่วนใหญ่ใช้ไฟล์นี้แก้ราคาทีละมาก ๆ
 * ยอดคงเหลือมีผลเฉพาะสินค้าที่สร้างใหม่ ของเดิมไม่แตะ
 * เพราะการเขียนทับสต๊อกจากไฟล์จะลบประวัติการเคลื่อนไหวที่สะสมมา
 */
export async function importProductsCsv(text: string): Promise<CsvImportResult> {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { created: 0, updated: 0, skipped: 0, errors: ['ไฟล์ว่างหรือมีแต่หัวตาราง'] };
  }

  const map = mapHeaders(rows[0]!);
  if (map.code === undefined || map.name === undefined) {
    return {
      created: 0, updated: 0, skipped: 0,
      errors: ['ไม่พบคอลัมน์ "รหัสสินค้า" หรือ "ชื่อสินค้า" — ดาวน์โหลดไฟล์ต้นแบบไปใช้เป็นแนวได้'],
    };
  }

  return mutate('stock', (c, userId) => importProductsCsvWith(c, userId, rows, map), { sub: 'list' });
}
