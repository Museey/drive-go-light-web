import type pg from 'pg';

/**
 * แพ็กเกจของอู่ — Light หรือ Light Plus
 *
 * **ที่เดียวที่ตัดสินว่าอู่ไหนเป็น Plus** — อ่านจาก subscriptions.plan ของแถวที่หมดอายุช้าที่สุด
 * (แถวเดียวกับที่ license-window.ts ใช้คิดวันหมดอายุ) ขึ้นต้นด้วย 'plus' = Light Plus
 * ผู้ให้บริการเลือกแพ็กเกจตอนบันทึกการต่ออายุในคอนโซล (/ops/shop/[id])
 *
 * อู่ที่ยังทดลองใช้ (ไม่มีแถว subscriptions) เป็น Light — อยากให้ลอง Plus
 * ให้บันทึกแถว 'plus-yearly' ช่วงสั้น ๆ จากคอนโซล
 *
 * ไม่มี server-only — รับ client ที่ตั้ง app.tenant_id แล้ว เทสต์เรียกกับฐานจริงได้ (plus-db.test.ts)
 */

type Db = Pick<pg.ClientBase, 'query'>;

export const PLAN_LIGHT = 'light-yearly';
export const PLAN_PLUS = 'plus-yearly';

/** แพ็กเกจที่คอนโซลผู้ให้บริการเลือกได้ตอนต่ออายุ */
export const PLAN_CHOICES = [
  { value: PLAN_LIGHT, label: 'DriveGo Light! (รายปี)' },
  { value: PLAN_PLUS, label: 'DriveGo Light Plus (รายปี)' },
] as const;

export const isPlusPlan = (plan: string | null | undefined): boolean =>
  typeof plan === 'string' && plan.trim().toLowerCase().startsWith('plus');

/** ชื่อแพ็กเกจที่แสดงให้ผู้ใช้ — null = ยังทดลองใช้ */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return 'ทดลองใช้';
  return isPlusPlan(plan) ? 'Light Plus' : 'Light!';
}

export const PLUS_REQUIRED_MESSAGE =
  'ส่วนนี้เป็นฟีเจอร์ของแพ็กเกจ DriveGo Light Plus — ติดต่อผู้ให้บริการเพื่ออัปเกรดแพ็กเกจ';

/** ข้อความสำหรับผู้ใช้อยู่ใน message แล้ว */
export class PlusRequiredError extends Error {
  constructor() { super(PLUS_REQUIRED_MESSAGE); }
}

export async function planWith(c: Db): Promise<string | null> {
  const { rows } = await c.query(`select plan from subscriptions order by expires_on desc limit 1`);
  return (rows[0]?.plan as string | undefined) ?? null;
}

export async function plusWith(c: Db): Promise<boolean> {
  return isPlusPlan(await planWith(c));
}

/**
 * ปิดประตูฝั่งเขียนและฝั่งอ่านข้อมูลของฟีเจอร์ Plus — เรียกในทรานแซกชันเดียวกับงานจริง
 *
 * หน้าจอของ Light แสดงการ์ดชวนอัปเกรดแทนเนื้อหา แต่นั่นไม่ใช่การป้องกัน
 * action และ route เรียกได้ตรง ๆ เสมอ ทุกตัวจึงต้องผ่านตัวนี้
 */
export async function assertPlusWith(c: Db): Promise<void> {
  if (!(await plusWith(c))) throw new PlusRequiredError();
}
