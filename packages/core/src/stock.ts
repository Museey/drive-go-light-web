import { num } from './num.js';
import type { Numeric } from './types.js';

/**
 * สถานะสต๊อก — กติกาสีของทะเบียนสินค้า
 *
 * พอร์ตจาก flagsOf() ของรุ่น 3.6 แต่ใส่เงื่อนไข "ตั้งค่าไว้แล้วเท่านั้น" เพิ่ม
 * ของเดิมเทียบ qty > max ตรง ๆ ซึ่งค่า max ตั้งต้นเป็น 0 แปลว่าสินค้าทุกตัวที่มีของ
 * จะถูกตีว่าเกินระดับสูงสุดทันที ทั้งที่อู่ยังไม่ได้ตั้งค่าอะไรเลย
 * ตรงนั้นเป็นข้อบกพร่องของเดิม ไม่ยกมา
 */

export type StockFlag = 'min' | 'max' | 'dead';

export const STOCK_FLAG_LABEL: Record<StockFlag, string> = {
  min: 'ถึงจุดสั่งซื้อ (Min)',
  max: 'เกินระดับสูงสุด (Max)',
  dead: 'ไม่เคลื่อนไหว ≥ 6 เดือน',
};

/** ไม่เคลื่อนไหวกี่เดือนถึงนับว่าเป็นของค้างสต๊อก */
export const DEAD_MONTHS = 6;

/**
 * จำนวนเดือนเต็มนับจากวันที่ที่ให้มาถึงวันอ้างอิง
 * ไม่มีวันที่ = ไม่เคยเคลื่อนไหวเลย คืนค่าสูง ๆ ให้ถือว่าเก่ามาก (ตามของเดิม)
 */
export function monthsSince(dateIso: string | null | undefined, todayIso: string): number {
  if (!dateIso) return 999;
  const d = new Date(dateIso + 'T00:00:00');
  const n = new Date(todayIso + 'T00:00:00');
  return (
    (n.getFullYear() - d.getFullYear()) * 12 +
    (n.getMonth() - d.getMonth()) -
    (n.getDate() < d.getDate() ? 1 : 0)
  );
}

export interface StockFlagInput {
  qtyOnHand: Numeric;
  qtyMin: Numeric;
  qtyMax: Numeric;
  lastMoveOn: string | null | undefined;
}

/**
 * ป้ายสถานะของสินค้าหนึ่งรายการ
 *
 * ถึงจุดสั่งซื้อใช้ <= ตามของเดิม — คงเหลือเท่ากับ Min พอดีถือว่าถึงจุดสั่งซื้อแล้ว
 * ไม่ใช่ต้องต่ำกว่าถึงจะเตือน เพราะกว่าจะสั่งของมาถึงก็ขาดมือไปแล้ว
 */
export function stockFlags(p: StockFlagInput, todayIso: string): StockFlag[] {
  const qty = num(p.qtyOnHand);
  const min = num(p.qtyMin);
  const max = num(p.qtyMax);
  const f: StockFlag[] = [];

  if (min > 0 && qty <= min) f.push('min');
  if (max > 0 && qty > max) f.push('max');
  if (monthsSince(p.lastMoveOn, todayIso) >= DEAD_MONTHS) f.push('dead');

  return f;
}

/**
 * จำนวนที่ควรสั่งเพิ่มให้เต็มระดับสูงสุด — ยกจาก renderHome() ของเดิม
 * ยังไม่ได้ตั้ง Max ก็สั่งอย่างน้อยหนึ่งหน่วย
 */
export function reorderQty(p: { qtyOnHand: Numeric; qtyMax: Numeric }): number {
  return Math.max(1, num(p.qtyMax) - num(p.qtyOnHand));
}
