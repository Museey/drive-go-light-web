import type pg from 'pg';
import { csvNumber, csvText } from './csv';
import { ensureCsvRoomWith } from './product-limit';

/**
 * นำเข้าสินค้าจาก CSV — ตัวที่รับ client ที่ตั้ง tenant แล้ว (เทสต์เรียกได้ตรง ๆ)
 * ตัวที่ผูกกับ session และสิทธิ์อยู่ใน products-csv.ts
 */

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function importProductsCsvWith(
  c: Pick<pg.ClientBase, 'query'>, userId: string, rows: string[][], map: Record<string, number>,
): Promise<CsvImportResult> {
  const result: CsvImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  /* สินค้าที่ใช้งานไม่เกิน 3,000 — นับทั้งไฟล์ก่อนเขียนแถวแรก เกินแล้วไม่นำเข้าเลย (ผู้ใช้เลือก)
     ถ้าตรวจระหว่างวน ผู้ใช้จะได้ไฟล์ที่แก้ราคาไปครึ่งเดียวแล้วต้องมานั่งไล่ว่าแถวไหนเข้าแล้ว */
  await ensureCsvRoomWith(c, rows.slice(1).map((row) => ({
    code: csvText(row, map.code), name: csvText(row, map.name),
  })));

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
}
