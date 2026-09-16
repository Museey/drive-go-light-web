import { STOCK_FLAG_LABEL, STOCK_FLAG_SHORT, toStockFlag, type StockFlag } from '@drivegolight/core';

/**
 * แถวทะเบียนสินค้า → การ์ด (จอต่ำกว่า 1280 · ต้นแบบของทีม `a.mpcard`)
 *
 * **โมดูลบริสุทธิ์** — ไม่แตะฐานข้อมูลหรือ next/headers เพื่อให้เทสต์ด้วย vitest ได้
 *
 * การ์ดมีที่ให้น้อยกว่าตารางสิบกว่าคอลัมน์ จึงต้องเลือกว่าอะไรได้ไปต่อ:
 * รหัส · ชื่อ · ราคาขาย · คงเหลือ + ป้ายสถานะ — ที่เหลืออยู่ในหน้าสินค้าใบนั้น
 */

export interface StockCardChip {
  key: string;
  /** คำย่อบนชิป */
  label: string;
  /** คำเต็มไว้ใน title — ชิปย่อสั้นเกินกว่าจะอ่านออกเองว่าแปลว่าอะไร */
  title: string;
}

export interface StockCard {
  href: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  qty: number;
  /** ถึงจุดสั่งซื้อ — การ์ดแสดงคงเหลือเป็นสีแดง (ตารางใช้ชิปแดงที่คอลัมน์คงเหลือ) */
  low: boolean;
  chips: StockCardChip[];
}

export interface StockCardRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  priceA: number;
  qtyOnHand: number;
  active: boolean;
  needReorder: boolean;
  flags: StockFlag[];
}

export function stockCard(p: StockCardRow): StockCard {
  /* ปิดใช้งานมาก่อนป้ายอื่นเสมอ — ของที่ขายไม่ได้แล้วเป็นเรื่องที่ต้องเห็นก่อนว่าใกล้หมดอายุ */
  const chips: StockCardChip[] = p.active
    ? []
    : [{ key: 'off', label: 'ปิดใช้งาน', title: 'สินค้านี้ถูกปิดใช้งาน' }];

  for (const f of p.flags) {
    chips.push({ key: f, label: STOCK_FLAG_SHORT[f], title: STOCK_FLAG_LABEL[f] });
  }

  return {
    href: `/stock/${p.id}`,
    code: p.code,
    name: p.name,
    unit: p.unit,
    price: p.priceA,
    qty: p.qtyOnHand,
    low: p.needReorder,
    chips,
  };
}

/**
 * ข้อความบนแถบ "กรอง: …" ของจอแคบ — `null` คือไม่ได้กรองอะไร ไม่ต้องมีแถบ
 *
 * คนกดมาจากการ์ด "ต้องสั่งซื้อ" ของหน้าแรกเห็นรายการไม่ครบแล้วไม่รู้ว่าทำไม
 * บนเดสก์ท็อปไทล์ที่เลือกอยู่บอกอยู่แล้ว แต่จอแคบไทล์ไปอยู่หลังปุ่มสลับ
 */
export function filterLabel(sp: { reorder?: string; flag?: string; q?: string }): string | null {
  const parts: string[] = [];
  if (sp.reorder === '1') parts.push('สินค้าที่ต้องสั่งซื้อ');
  const flag = toStockFlag(sp.flag);
  if (flag) parts.push(STOCK_FLAG_LABEL[flag]);
  return parts.length ? parts.join(' · ') : null;
}
