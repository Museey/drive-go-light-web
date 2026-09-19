import type pg from 'pg';
import { checkPasswordStrength, hashPassword } from './password';

/**
 * งานจัดการพนักงานที่ต้องระวังเป็นพิเศษ — โอนสิทธิ์เจ้าของ ลบพนักงาน และตั้งรหัสผ่านให้
 * (ผู้ใช้แจ้ง 19 ก.ย. 2569: ปุ่ม "ตั้งเป็นเจ้าของ" ถูกเผลอกดจนกลายเป็นเจ้าของกันทั้งอู่)
 *
 * แยกไฟล์นี้ออกจาก settings.ts เพราะ settings.ts ผูกกับ session ผ่าน mutate()
 * ชุดทดสอบจึงเรียกไม่ได้ — ที่นี่รับ client เข้ามาเอง เหมือน sales-void.ts และ ar-ap.ts
 */

type Client = pg.PoolClient | pg.Client;

const OWNER_PERMS = {
  menus: { customer: true, income: true, expense: true, stock: true, finance: true, settings: true },
};

/**
 * โอนสิทธิ์เจ้าของกิจการ — **อู่มีเจ้าของได้คนเดียว** (ผู้ใช้เลือก 19 ก.ย. 2569)
 *
 * คนเก่าลดเป็นพนักงานโดย**ไม่แตะสิทธิ์เมนูที่มีอยู่** — เสียตำแหน่ง ไม่ใช่เสียการเข้าถึง
 * ทั้งหมดอยู่ในคำสั่งเดียวกัน ถ้าล้มกลางทางจะไม่มีวินาทีที่อู่ไม่มีเจ้าของ
 */
export async function transferOwnershipWith(c: Client, userId: string): Promise<void> {
  const { rows } = await c.query(
    `select active, role::text as role from users where id = $1`, [userId]);
  const target = rows[0];
  if (!target) throw new Error('ไม่พบพนักงานที่จะตั้งเป็นเจ้าของกิจการ');
  if (!target.active) {
    throw new Error('พนักงานคนนี้ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อนจึงจะโอนสิทธิ์เจ้าของกิจการได้');
  }

  await c.query(
    `update users set role = 'staff' where role = 'owner' and id <> $1`, [userId]);
  await c.query(
    `update users set role = 'owner', perms = $2::jsonb where id = $1`,
    [userId, JSON.stringify(OWNER_PERMS)]);
}

/**
 * ลบพนักงานออกจากระบบจริง ๆ (ผู้ใช้เลือก 19 ก.ย. 2569)
 *
 * ประวัติไม่หายไปด้วย: `doc_edits` เก็บ**ชื่อ**ไว้เป็นข้อความอยู่แล้ว ส่วนเอกสารอ้างถึงบัญชี
 * แบบ `on delete set null` ตามสคีมาเดิม — ใบเก่ายังอยู่ครบ แค่ไม่ผูกกับบัญชีที่ถูกลบ
 */
export async function deleteStaffWith(c: Client, userId: string, currentUserId: string): Promise<void> {
  if (userId === currentUserId) throw new Error('ลบบัญชีของตัวเองไม่ได้');

  const { rows } = await c.query(`select role::text as role, name from users where id = $1`, [userId]);
  const user = rows[0];
  if (!user) throw new Error('ไม่พบพนักงานที่จะลบ');
  if (user.role === 'owner') {
    throw new Error('ลบเจ้าของกิจการไม่ได้ — โอนสิทธิ์เจ้าของให้คนอื่นก่อน');
  }

  /* session และลิงก์ตั้งรหัสที่ค้างอยู่หายตามเอง — ทั้งสองตารางอ้าง users แบบ on delete cascade
     (บทบาทของเว็บแตะตาราง auth.* ตรง ๆ ไม่ได้อยู่แล้ว ต้องผ่านฟังก์ชันเท่านั้น) */
  await c.query(`delete from users where id = $1`, [userId]);
}

/**
 * เจ้าของกิจการตั้งรหัสผ่านให้พนักงานโดยตรง — ไม่ต้องส่งลิงก์ (ผู้ใช้เลือก 19 ก.ย. 2569)
 *
 * **ตรวจสิทธิ์ที่ผู้เรียก** (เฉพาะ role เจ้าของ) — ที่นี่ดูแลเรื่องรหัสผ่านอย่างเดียว
 * ใช้เกณฑ์ตัวเดียวกับหน้าตั้งรหัสผ่านของพนักงานเอง จะได้ไม่มีทางลัดให้ตั้งรหัสอ่อน ๆ
 */
export async function setStaffPasswordWith(c: Client, userId: string, plain: string): Promise<void> {
  const problem = checkPasswordStrength(plain);
  if (problem) throw new Error(problem);

  await c.query(`select auth.set_password($1, $2)`, [userId, await hashPassword(plain)]);
}
