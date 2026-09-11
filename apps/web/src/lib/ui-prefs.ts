import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';

/**
 * ค่าที่จำไว้ให้ทั้งอู่ — ตรงกับ DB.ui ของรุ่น HTML และถูกส่งออกไปกับไฟล์สำรองด้วย
 *
 * ตอนนี้มีอย่างเดียวคือคอลัมน์ที่ซ่อนในตารางสินค้า
 * เก็บเป็นของอู่ ไม่ใช่ของผู้ใช้รายคน เหมือนรุ่นเดิม —
 * อู่ที่ไม่อยากให้ต้นทุนโผล่บนจอตอนลูกค้ามายืนดู ตั้งครั้งเดียวแล้วจบทุกเครื่อง
 */

/** คอลัมน์ที่ซ่อนได้ — ชุดเดียวกับ STOCK_COLS ของรุ่น 3.6 */
export const STOCK_COLS = [
  ['cost', 'ทุนล่าสุด'],
  ['pB', 'ราคา B'],
  ['pC', 'ราคา C'],
  ['qty', 'คงเหลือ'],
  ['min', 'จุดสั่ง'],
  ['max', 'สูงสุด'],
  ['move', 'เคลื่อนไหวล่าสุด'],
] as const;

export type StockCol = (typeof STOCK_COLS)[number][0];

const ALL: string[] = STOCK_COLS.map(([k]) => k);

export async function getStockHiddenCols(): Promise<StockCol[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select ui_prefs from tenants where id = current_tenant_id()`,
    );
    const hide = rows[0]?.ui_prefs?.stockHide;
    return (Array.isArray(hide) ? hide : []).filter((k: string) => ALL.includes(k)) as StockCol[];
  });
}

export async function setStockHiddenCols(cols: string[]): Promise<void> {
  const clean = [...new Set(cols.filter((k) => ALL.includes(k)))];
  return mutate('stock', async (c) => {
    await c.query(
      `update tenants
          set ui_prefs = jsonb_set(coalesce(ui_prefs, '{}'::jsonb), '{stockHide}', $1::jsonb, true)
        where id = current_tenant_id()`,
      [JSON.stringify(clean)],
    );
  }, { sub: 'list' });
}
