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

export const today = (): string => iso(new Date());

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
