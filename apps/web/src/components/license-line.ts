import { thDate } from '@/lib/format';

/** สถานะการใช้งานที่แถบเมนูต้องรู้ — ตัดมาจาก LicenseStatus เฉพาะที่ใช้แสดง */
export type LicenseBrief = { mode: string; until: string; daysLeft: number };

/**
 * ข้อความนับถอยหลังบรรทัดสอง ใต้ "ชื่อ · บทบาท" บนแถบเมนูทุกหน้า
 *
 * ใช้ได้ = เขียว · ใกล้หมด (≤30 วัน) = อำพัน · หมดแล้ว = แดงกะพริบ (ผู้ใช้กำหนด) — ผู้ใช้เห็นโดยไม่ต้องเข้า 08 ลิขสิทธิ์
 * แยกจาก React เพื่อให้ทดสอบข้อความได้ตรง ๆ
 */
export function licenseLine(l: LicenseBrief): { text: string; tone: '' | 'warn' | 'due' } {
  if (l.mode === 'expired' || l.daysLeft < 0) {
    return { text: `หมดอายุแล้ว ${Math.abs(l.daysLeft)} วัน · ต่ออายุที่ 08 ลิขสิทธิ์`, tone: 'due' };
  }
  const head = l.mode === 'trial' ? 'ทดลองใช้ เหลือ' : 'ใช้ได้อีก';
  return {
    text: `${head} ${l.daysLeft} วัน (ถึง ${thDate(l.until)})`,
    tone: l.daysLeft <= 30 ? 'warn' : '',
  };
}
