import { createHash, randomBytes } from 'node:crypto';
import type { SqlClient } from './import.js';

/**
 * สร้างบัญชีเจ้าของกิจการและออกลิงก์ตั้งรหัสผ่านครั้งแรก
 *
 * ตัวนำเข้าไม่สร้างบัญชีเจ้าของให้เองตอน import เพราะไฟล์เดิมเก็บรหัสผ่าน
 * เป็นข้อความธรรมดา เอามาใช้ต่อไม่ได้ และเราไม่รู้อีเมลของเจ้าของอู่
 *
 * token ที่คืนออกไปคือค่าดิบสำหรับประกอบเป็นลิงก์ ฐานข้อมูลเก็บแค่ SHA-256 ของมัน
 * ต้องตรงกับวิธีที่ apps/web ใช้ (ดู hashToken ใน apps/web/src/lib/auth.ts)
 */
const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

export interface CreateOwnerResult {
  /** null = อู่นี้มีบัญชีเจ้าของอยู่แล้ว */
  userId: string | null;
  setupToken: string | null;
  expiresAt: Date | null;
}

export async function createOwner(
  client: SqlClient,
  tenantId: string,
  email: string,
  name = '',
  setupTokenDays = 7,
): Promise<CreateOwnerResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    throw new Error(`อีเมล "${email}" ไม่ถูกต้อง`);
  }

  await client.query('begin');
  try {
    const created = await client.query(
      `select auth.create_owner($1, $2, $3) as user_id`,
      [tenantId, clean, name],
    );
    const userId: string | null = created.rows[0]?.user_id ?? null;

    if (!userId) {
      await client.query('rollback');
      return { userId: null, setupToken: null, expiresAt: null };
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + setupTokenDays * 86400_000);

    await client.query(
      `select auth.issue_setup_token($1, $2, 'initial', $3)`,
      [userId, hashToken(token), expiresAt],
    );

    await client.query('commit');
    return { userId, setupToken: token, expiresAt };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }
}

/** ออกลิงก์ตั้งรหัสผ่านใหม่ให้ผู้ใช้ที่มีอยู่แล้ว — ลิงก์เก่าที่ยังไม่ถูกใช้จะถูกยกเลิก */
export async function issueSetupLink(
  client: SqlClient,
  userId: string,
  purpose: 'initial' | 'reset' = 'reset',
  days = 7,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await client.query(
    `select auth.issue_setup_token($1, $2, $3, $4)`,
    [userId, hashToken(token), purpose, expiresAt],
  );
  return { token, expiresAt };
}

export const setupUrl = (appUrl: string, token: string): string =>
  `${appUrl.replace(/\/+$/, '')}/setup/${token}`;
