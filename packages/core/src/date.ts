import { num } from './num.js';
import type { Numeric } from './types.js';

/**
 * แปลง Date เป็น 'YYYY-MM-DD' โดยใช้เวลาท้องถิ่น
 *
 * ห้ามใช้ toISOString() แทน — toISOString() แปลงเป็น UTC ก่อนเสมอ
 * เขตเวลาไทย (UTC+7) จะได้วันที่ก่อนหน้า 1 วันทุกครั้ง
 * (บั๊กนี้เคยเกิดจริงกับระบบออกรหัสลิขสิทธิ์ของรุ่นเดิม)
 */
export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * เขตเวลาของกิจการ
 *
 * โปรแกรมนี้ใช้ในไทยที่เดียว วันที่บนเอกสารคือวันที่ตามเวลาไทยเสมอ
 * ไม่ใช่วันที่ตามเครื่องที่รันอยู่ — เซิร์ฟเวอร์ส่วนใหญ่ตั้งเป็น UTC
 * ถ้าปล่อยให้ใช้เวลาเครื่อง ใบที่ออกตอนตีหนึ่งจะลงวันที่ของเมื่อวาน
 * ซึ่งเป็นวันที่ผิดบนเอกสารภาษี ไม่ใช่แค่เรื่องความสวยงาม
 */
export const SHOP_TZ = 'Asia/Bangkok';

const TZ_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** วันที่ตามเวลาไทยของช่วงเวลาที่ให้มา ไม่ขึ้นกับเขตเวลาของเครื่อง */
export function isoInShopTz(d: Date): string {
  const part: Record<string, string> = {};
  for (const p of TZ_PARTS.formatToParts(d)) part[p.type] = p.value;
  return `${part.year}-${part.month}-${part.day}`;
}

export const today = (): string => isoInShopTz(new Date());

/** บวกวันเข้ากับวันที่รูปแบบ 'YYYY-MM-DD' */
export function addDays(s: string, n: Numeric): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + num(n));
  return iso(d);
}

/** จำนวนวันจาก a ถึง b (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
  );
}

/** คีย์งวดภาษีจากวันที่ — 'YYYY-MM' */
export const monthKey = (dateIso: string): string => dateIso.slice(0, 7);

/** วันที่อยู่ในช่วงหรือไม่ — ช่องว่างแปลว่าไม่จำกัด */
export function inRange(d: string, from?: string, to?: string): boolean {
  return (!from || d >= from) && (!to || d <= to);
}

/**
 * บวกเดือนจากวันที่ — ใช้เติมวันหมดอายุจากอายุการเก็บของสินค้า
 *
 * **ตกวันที่ไม่มีจริงให้เลื่อนมาเป็นวันสุดท้ายของเดือนนั้น** เช่น 31 มกราคม + 1 เดือน
 * ได้ 28 กุมภาพันธ์ ไม่ใช่ 3 มีนาคม แบบที่ Date ของ JS ทำเอง
 *
 * เรื่องนี้สำคัญกับวันหมดอายุ — ของที่ซื้อสิ้นเดือนไม่ควรได้วันหมดอายุ
 * ที่ข้ามไปเดือนถัดไปโดยไม่มีใครตั้งใจ
 *
 * `months` เป็นศูนย์หรือว่าง = ไม่มีวันหมดอายุ คืน null
 */
export function addMonths(dateIso: string, months: number | null | undefined): string | null {
  if (!months) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return null;

  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
