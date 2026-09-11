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

export type StockFlag = 'min' | 'max' | 'dead' | 'expiring' | 'expired';

export const STOCK_FLAG_LABEL: Record<StockFlag, string> = {
  min: 'ถึงจุดสั่งซื้อ (Min)',
  max: 'เกินระดับสูงสุด (Max)',
  dead: 'ไม่เคลื่อนไหว ≥ 6 เดือน',
  expiring: 'ใกล้หมดอายุ',
  expired: 'หมดอายุแล้ว',
};

/**
 * คำย่อของป้าย สำหรับที่ที่แคบจริง ๆ เช่นบนกระดาษที่พิมพ์
 *
 * แยกจากคำเต็มเพราะกระดาษมีที่จำกัด แต่ยังต้องอ่านออกว่าเป็นป้ายอะไร —
 * ก่อนหน้านี้หน้าพิมพ์เขียนเงื่อนไขเองว่า "ไม่ใช่ Min ไม่ใช่ Max ก็ค้าง"
 * ซึ่งพอมีป้ายที่สี่เข้ามา ของที่หมดอายุจะถูกพิมพ์ว่าค้างสต๊อกทันทีโดยไม่มีใครรู้
 */
export const STOCK_FLAG_SHORT: Record<StockFlag, string> = {
  min: 'Min',
  max: 'Max',
  dead: 'ค้าง',
  expiring: 'ใกล้หมด',
  expired: 'หมดอายุ',
};

/**
 * ป้ายทั้งหมดที่มี เรียงตามลำดับที่แสดงบนหน้าจอ
 *
 * มาจากตารางคำแปลโดยตรง ไม่ได้พิมพ์รายชื่อซ้ำ — ป้ายใหม่ที่เพิ่มเข้ามาวันหลัง
 * จึงโผล่ในแถบกรองของทุกหน้าเอง ไม่ใช่โผล่เฉพาะหน้าที่มีคนนึกได้ว่าต้องไปแก้
 */
export const STOCK_FLAGS = Object.keys(STOCK_FLAG_LABEL) as StockFlag[];

/** อ่านชื่อป้ายจาก query string — ค่าที่ไม่รู้จักคือไม่กรอง */
export const toStockFlag = (v: string | undefined | null): StockFlag | undefined =>
  STOCK_FLAGS.find((f) => f === v);

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
  /**
   * วันหมดอายุที่ใกล้ที่สุดของล็อตที่**ยังมีของเหลืออยู่** — ว่าง = ไม่มีของที่หมดอายุได้
   *
   * ต้องเป็นล็อตที่ยังเหลือจริงเท่านั้น ล็อตที่ตัดหมดไปแล้วไม่ควรทำให้ขึ้นป้ายเตือน
   * ทั้งที่ของที่หมดอายุนั้นออกจากคลังไปนานแล้ว
   */
  nearestExpiry?: string | null;
}

/**
 * ป้ายสถานะของสินค้าหนึ่งรายการ
 *
 * ถึงจุดสั่งซื้อใช้ <= ตามของเดิม — คงเหลือเท่ากับ Min พอดีถือว่าถึงจุดสั่งซื้อแล้ว
 * ไม่ใช่ต้องต่ำกว่าถึงจะเตือน เพราะกว่าจะสั่งของมาถึงก็ขาดมือไปแล้ว
 */
export function stockFlags(
  p: StockFlagInput,
  todayIso: string,
  expiryWarnDays = EXPIRY_WARN_DAYS,
): StockFlag[] {
  const qty = num(p.qtyOnHand);
  const min = num(p.qtyMin);
  const max = num(p.qtyMax);
  const f: StockFlag[] = [];

  if (min > 0 && qty <= min) f.push('min');
  if (max > 0 && qty > max) f.push('max');
  if (monthsSince(p.lastMoveOn, todayIso) >= DEAD_MONTHS) f.push('dead');

  /* หมดอายุแล้วกับใกล้หมดอายุเป็นคนละป้าย ไม่ขึ้นพร้อมกัน —
     ของที่เลยวันไปแล้วต้องอ่านออกทันทีว่าต่างจากของที่ใกล้จะถึง */
  if (p.nearestExpiry) {
    const left = daysUntil(p.nearestExpiry, todayIso);
    if (left < 0) f.push('expired');
    else if (left <= expiryWarnDays) f.push('expiring');
  }

  return f;
}

/** ค่าปริยายของเกณฑ์เตือนใกล้หมดอายุ ตั้งใหม่ได้ที่หน้าตั้งค่าร้าน */
export const EXPIRY_WARN_DAYS = 60;

/**
 * เหลืออีกกี่วันถึงวันที่ที่ให้มา — ติดลบแปลว่าเลยมาแล้ว
 *
 * นับเป็นวันปฏิทิน ไม่ใช่ชั่วโมง ของที่หมดอายุ "วันนี้" จึงได้ 0 ไม่ใช่ -1
 * ซึ่งตรงกับที่คนอ่านว่ายังไม่หมด
 */
export function daysUntil(dateIso: string, todayIso: string): number {
  const d = Date.parse(dateIso + 'T00:00:00Z');
  const n = Date.parse(todayIso + 'T00:00:00Z');
  return Math.round((d - n) / 86_400_000);
}

/**
 * จำนวนที่ควรสั่งเพิ่มให้เต็มระดับสูงสุด — ยกจาก renderHome() ของเดิม
 * ยังไม่ได้ตั้ง Max ก็สั่งอย่างน้อยหนึ่งหน่วย
 */
export function reorderQty(p: { qtyOnHand: Numeric; qtyMax: Numeric }): number {
  return Math.max(1, num(p.qtyMax) - num(p.qtyOnHand));
}

/** บรรทัดเอกสารเท่าที่ตรงนี้สนใจ — ผูกกับทะเบียนสินค้าหรือเปล่าเท่านั้น */
export interface LineWithProduct {
  productId?: string | null;
}

export interface ExpiredLine<T> {
  /** ลำดับบรรทัดตามที่อยู่ในเอกสาร นับจาก 0 */
  index: number;
  item: T;
  expiresOn: string;
}

/**
 * บรรทัดในเอกสารที่จะไปตัดของซึ่ง**หมดอายุไปแล้ว**
 *
 * ดูจากล็อตที่จะถูกตัดก่อนของสินค้าตัวนั้น เพราะระบบตัดแบบหมดอายุก่อนออกก่อน
 * บรรทัดที่ไม่ได้ผูกกับทะเบียนสินค้า (ค่าแรง บรรทัดพิมพ์เอง) ไม่มีล็อตให้ตัด
 *
 * ตอบเฉพาะที่**เลยวันไปแล้ว** ไม่รวมของที่ใกล้หมดอายุ — ของที่ยังไม่หมดอายุ
 * ขายได้ตามปกติ ป้ายเตือนรายบรรทัดบอกไปแล้วว่าเหลืออีกกี่วัน
 * แถบเตือนหัวตารางจึงควรเก็บไว้ให้เรื่องที่ต้องตัดสินใจจริง ๆ
 */
export function expiredLines<T extends LineWithProduct>(
  items: T[],
  nearestExpiry: Record<string, string>,
  todayIso: string,
): ExpiredLine<T>[] {
  const out: ExpiredLine<T>[] = [];
  items.forEach((item, index) => {
    const on = item.productId ? nearestExpiry[item.productId] : undefined;
    if (on && daysUntil(on, todayIso) < 0) out.push({ index, item, expiresOn: on });
  });
  return out;
}
