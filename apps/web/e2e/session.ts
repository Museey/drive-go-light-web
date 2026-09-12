import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

/**
 * สร้างเซสชันตรงในฐานข้อมูลสำหรับเทสต์ — ไม่ผ่านหน้าล็อกอิน
 *
 * เทสต์ชุดนี้ตรวจเรื่องการวางเลย์เอาต์ ไม่ได้ตรวจการล็อกอิน การพิมพ์รหัสผ่าน
 * ในทุกเทสต์จึงเป็นการเพิ่มจุดที่พังได้โดยไม่ได้ทดสอบอะไรเพิ่ม
 * (และทำให้ต้องเก็บรหัสผ่านไว้ในไฟล์เทสต์ ซึ่งไม่ควรมีตั้งแต่ต้น)
 */
export async function makeSession(): Promise<string> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง DATABASE_URL ก่อนรันเทสต์เบราว์เซอร์');

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(
      `select id, tenant_id from users where role = 'owner' order by created_at limit 1`);
    if (!rows[0]) throw new Error('ไม่มีบัญชีเจ้าของในฐานข้อมูล — รัน tools/dev-seed.sh ก่อน');

    const token = randomBytes(32).toString('base64url');
    await c.query(
      `insert into auth.sessions (token_hash, user_id, tenant_id, expires_at, user_agent)
       values ($1, $2, $3, now() + interval '1 day', 'playwright')`,
      [createHash('sha256').update(token).digest(), rows[0].id, rows[0].tenant_id]);
    return token;
  } finally {
    await c.end();
  }
}
