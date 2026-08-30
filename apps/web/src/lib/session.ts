import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import pg from 'pg';
import { withTenant } from './db';

const COOKIE = 'dgl_tenant';

/**
 * ⚠ ยังไม่มีระบบเข้าสู่ระบบจริง
 *
 * ตอนนี้ session เก็บแค่ tenant_id ใน cookie เพื่อให้เดินหน้าต่อได้ระหว่างพัฒนา
 * ยังไม่มีการยืนยันตัวตน ใครแก้ cookie ก็สลับอู่ได้
 *
 * ของจริงต้องเป็น: ผู้ใช้กรอกอีเมล+รหัสผ่าน → หา users ด้วยฟังก์ชัน SECURITY DEFINER
 * (เพราะ users มี RLS จึงหาไม่เจอถ้ายังไม่รู้ว่าอยู่อู่ไหน) → ตรวจรหัสผ่านด้วย argon2
 * → ออก session ที่ผูกทั้ง user_id และ tenant_id
 *
 * ห้ามนำโค้ดนี้ขึ้น production ตามสภาพ
 */
export async function currentTenantId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function requireTenantId(): Promise<string> {
  const id = await currentTenantId();
  if (!id) redirect('/login');
  return id;
}

/** รัน query ในนามของอู่ที่เลือกไว้ใน session */
export async function query<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withTenant(await requireTenantId(), fn);
}

export async function setTenant(id: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export async function clearTenant(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * รายชื่ออู่ทั้งหมดสำหรับหน้าสลับอู่ตอนพัฒนา
 *
 * ตาราง tenants มี RLS อยู่ จึงอ่านรายชื่อด้วย role ของแอปไม่ได้ (ถูกต้องแล้ว)
 * หน้านี้จึงต้องใช้ connection ของผู้ดูแลระบบ และเปิดเฉพาะตอนพัฒนาเท่านั้น
 */
export async function listTenantsForDev(): Promise<{ id: string; name: string }[]> {
  if (process.env.NODE_ENV === 'production') return [];

  const url = process.env.DEV_ADMIN_DATABASE_URL;
  if (!url) return [];

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; name: string }>(
      `select id, name from tenants order by created_at`,
    );
    return rows;
  } finally {
    await client.end();
  }
}
