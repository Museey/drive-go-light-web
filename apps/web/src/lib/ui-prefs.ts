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

/**
 * คอลัมน์ทั้งหมดของทะเบียนสินค้า เรียงตามที่แสดง (รหัส → เคลื่อนไหวล่าสุด)
 * ผู้ใช้ติ๊กเลือกได้ทุกคอลัมน์จาก "การ์ดตั้งค่าการแสดงผล" — ข้อมูลยังเก็บครบทุกช่องเหมือนเดิม
 * รหัสและชื่อสินค้าแสดงเสมอ (ติ๊กออกไม่ได้ ไม่งั้นตารางอ่านไม่รู้เรื่อง)
 */
export const STOCK_COLS = [
  ['code', 'รหัสสินค้า'],
  ['oem', 'รหัส OEM'],
  ['name', 'ชื่อสินค้า'],
  ['cat', 'หมวดหมู่'],
  ['qty', 'คงเหลือ'],
  ['min', 'จุดสั่ง'],
  ['max', 'สูงสุด'],
  ['cost', 'ราคาซื้อล่าสุด'],
  ['pA', 'ราคา A'],
  ['pB', 'ราคา B'],
  ['pC', 'ราคา C'],
  ['move', 'เคลื่อนไหวล่าสุด'],
] as const;

export type StockCol = (typeof STOCK_COLS)[number][0];

/** คอลัมน์ที่ปิดไม่ได้ */
export const STOCK_COLS_FIXED: readonly StockCol[] = ['code', 'name'];
/** พื้นฐาน (ผู้ใช้กำหนด): รหัส · ชื่อ · คงเหลือ · ราคา A — ที่เหลือซ่อนจนกว่าจะติ๊กเปิด */
export const STOCK_COLS_DEFAULT_SHOWN: readonly StockCol[] = ['code', 'name', 'qty', 'pA'];

const ALL: string[] = STOCK_COLS.map(([k]) => k);

export async function getStockHiddenCols(): Promise<StockCol[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select ui_prefs from tenants where id = current_tenant_id()`,
    );
    const hide = rows[0]?.ui_prefs?.stockHide;
    /* ยังไม่เคยตั้ง → ใช้พื้นฐาน 4 คอลัมน์ · ตั้งแล้วเคารพที่ตั้งไว้ (รวมกรณีเลือกโชว์ทั้งหมด = []) */
    if (!Array.isArray(hide)) return ALL.filter((k) => !STOCK_COLS_DEFAULT_SHOWN.includes(k as StockCol)) as StockCol[];
    return hide.filter((k: string) => ALL.includes(k) && !STOCK_COLS_FIXED.includes(k as StockCol)) as StockCol[];
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
