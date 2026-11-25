import { PRICE } from './vendor';

/**
 * ยอดที่ลูกค้าต้องโอน — หน้าสมัครแสดงตัวนี้ และฝั่งเซิร์ฟเวอร์คิดซ้ำด้วยตัวเดียวกันตอนรับใบ
 * ฐานข้อมูลเก็บยอดที่คิดได้ตอนส่ง ไม่ใช่ยอดที่หน้าเว็บส่งมา
 *
 * คิดเป็นสตางค์ (จำนวนเต็ม) ทั้งหมด — 3600 × 0.07 ในทศนิยมของ JavaScript ไม่ได้ 252 พอดี
 * ภาษีทั้งสองตัวคิดจากค่าบริการก่อน VAT ตามที่สรรพากรกำหนดสำหรับค่าบริการ
 */
export interface Quote {
  years: number;
  base: number;
  vat: number;
  /** ยอดที่หักไว้ — 0 ถ้าไม่หัก */
  wht: number;
  total: number;
}

const satang = (baht: number) => Math.round(baht * 100);
const pct = (s: number, rate: number) => Math.round((s * rate) / 100);

export function quote(opts: { years?: number; wht?: boolean } = {}): Quote {
  const years = Math.max(1, Math.trunc(opts.years ?? 1));
  const base = satang(PRICE.perYear) * years;
  const vat = pct(base, PRICE.vatRate);
  const wht = opts.wht ? pct(base, PRICE.whtRate) : 0;
  return { years, base: base / 100, vat: vat / 100, wht: wht / 100, total: (base + vat - wht) / 100 };
}

/** 3,852.00 — มีจุลภาคและทศนิยมสองตำแหน่งเสมอ ใช้ทั้งบนหน้าจอและในข้อความแจ้งทีม */
export const bahtText = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
