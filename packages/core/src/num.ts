import type { Numeric } from './types.js';

/**
 * แปลงค่าเป็นตัวเลข — ตัดคอมมาออก และคืน 0 เมื่อแปลงไม่ได้
 * พอร์ตตรงจาก `num()` ในโปรแกรมเดิม ห้ามเปลี่ยนพฤติกรรม
 */
export const num = (v: Numeric): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};

/** ปัดเป็นทศนิยม 2 ตำแหน่ง — `Math.round(x*100)/100` แบบเดียวกับของเดิมทุกจุด */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * จัดรูปแบบเงินสำหรับแสดงผล — ตรงกับ `money()` เดิม
 * ใช้เฉพาะตอนแสดงผล ห้ามใช้ค่าที่ผ่านฟังก์ชันนี้ไปคำนวณต่อ
 */
export const money = (n: Numeric): string =>
  round2(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * ค่าความคลาดเคลื่อนที่ยอมรับได้ตอนเทียบยอดเงิน
 * ของเดิมใช้ 0.004 (ครึ่งสตางค์) ในการตัดสินว่า "ชำระครบแล้วหรือยัง"
 */
export const EPS = 0.004;
