import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { BOM, CSV_HEADERS, csvField, csvNumber, csvText, mapHeaders, parseCsv } from './csv';

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

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

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

  return mutate('stock', async (c, userId) => {
    const result: CsvImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    const cats = await c.query(`select id, name from product_categories`);
    const catByName = new Map<string, string>(cats.rows.map((r) => [String(r.name).trim(), r.id]));

    const num = csvNumber;
    const str = csvText;

    for (const [lineNo, row] of rows.slice(1).entries()) {
      const code = str(row, map.code);
      const name = str(row, map.name);

      if (!code || !name) {
        result.skipped++;
        result.errors.push(`บรรทัดที่ ${lineNo + 2}: ไม่มีรหัสหรือชื่อสินค้า`);
        continue;
      }

      const catName = str(row, map.cat);
      let categoryId: string | null = null;
      if (catName) {
        categoryId = catByName.get(catName) ?? null;
        if (!categoryId) {
          const made = await c.query(
            `insert into product_categories (tenant_id, name, sort_order)
             values (current_tenant_id(), $1,
                     coalesce((select max(sort_order) + 1 from product_categories), 0))
             returning id`,
            [catName],
          );
          categoryId = made.rows[0].id;
          catByName.set(catName, categoryId!);
        }
      }

      const existing = await c.query(`select id from products where code = $1`, [code]);

      if (existing.rows[0]) {
        await c.query(
          `update products set oem=$2, name=$3, unit=$4, category_id=$5,
                  last_cost=$6, price_a=$7, price_b=$8, price_c=$9, qty_min=$10, qty_max=$11
           where id=$1`,
          [existing.rows[0].id, str(row, map.oem), name, str(row, map.unit), categoryId,
           num(row, map.cost), num(row, map.priceA), num(row, map.priceB), num(row, map.priceC),
           num(row, map.qtyMin), num(row, map.qtyMax)],
        );
        result.updated++;
      } else {
        const made = await c.query(
          `insert into products (tenant_id, code, oem, name, unit, category_id,
                                 last_cost, price_a, price_b, price_c, qty_min, qty_max)
           values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning id`,
          [code, str(row, map.oem), name, str(row, map.unit), categoryId,
           num(row, map.cost), num(row, map.priceA), num(row, map.priceB), num(row, map.priceC),
           num(row, map.qtyMin), num(row, map.qtyMax)],
        );

        const opening = num(row, map.qty);
        if (opening !== 0) {
          await c.query(
            `insert into stock_moves (tenant_id, product_id, qty_delta, unit_cost, cost_amount,
                                      reason, note, created_by)
             values (current_tenant_id(), $1, $2, $3, $4, 'set', 'ยอดยกมาจากไฟล์ CSV', $5)`,
            [
              made.rows[0].id, opening, num(row, map.cost),
              Math.round(opening * num(row, map.cost) * 100) / 100, userId,
            ],
          );
        }
        result.created++;
      }
    }

    return result;
  }, { sub: 'list' });
}
