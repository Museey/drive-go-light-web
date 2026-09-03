import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type pg from 'pg';
import { withoutTenant, withTenant } from './db';
import { verifyPassword } from './password';
import {
  canCost as canCostOf, canEdit as canEditOf, canExport as canExportOf,
  canHomeReport as canHomeReportOf, canMenu, canTab as canTabOf,
  type PermKey, type Perms,
} from './perms';

const COOKIE = 'dgl_session';
const SESSION_DAYS = 14;

/** ชื่อเดิมของ PermKey — โค้ดเก่าอ้างชื่อนี้อยู่หลายที่ */
export type Perm = PermKey;

export interface Session {
  userId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: 'owner' | 'staff';
  perms: Perms;
}

/**
 * token ที่ส่งให้เบราว์เซอร์เป็นค่าสุ่ม 32 ไบต์ ส่วนฐานข้อมูลเก็บแค่ SHA-256 ของมัน
 * ฐานข้อมูลรั่วก็เอาไปสวมสิทธิ์ไม่ได้ เพราะย้อนกลับเป็น token ไม่ได้
 * (ไม่ต้องใช้ salt เพราะ token สุ่ม 256 บิตอยู่แล้ว ไม่มีอะไรให้ brute-force)
 */
const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

/* =====================================================================
   เข้าสู่ระบบ
   ===================================================================== */

export type SignInResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signIn(email: string, password: string, userAgent?: string): Promise<SignInResult> {
  const clean = email.trim().toLowerCase();

  /** ข้อความเดียวกันหมดไม่ว่าจะพลาดตรงไหน — ไม่บอกว่าอีเมลนี้มีอยู่จริงหรือไม่ */
  const wrong = { ok: false as const, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select * from auth.find_user_for_signin($1)`, [clean],
    );
    const user = rows[0];

    if (!user) {
      // ยังคำนวณ hash ทิ้งเปล่า ๆ เพื่อให้เวลาตอบใกล้เคียงกรณีที่มีผู้ใช้จริง
      await verifyPassword(password, 'scrypt$32768$8$2$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      return wrong;
    }

    if (!user.active) return wrong;

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return {
        ok: false as const,
        message: 'กรอกรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก 15 นาทีแล้วลองใหม่',
      };
    }

    if (!user.password_hash) {
      return {
        ok: false as const,
        message: 'บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — ใช้ลิงก์ตั้งรหัสผ่านที่ได้รับจากเจ้าของกิจการ',
      };
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      await c.query(`select auth.record_failed_signin($1)`, [user.user_id]);
      return wrong;
    }

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);

    await c.query(
      `select auth.create_session($1, $2, $3, $4)`,
      [user.user_id, hashToken(token), expires, userAgent?.slice(0, 300) ?? null],
    );

    const jar = await cookies();
    jar.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires,
    });

    return { ok: true as const };
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await withoutTenant((c) => c.query(`select auth.delete_session($1)`, [hashToken(token)]));
  }
  jar.delete(COOKIE);
}

/* =====================================================================
   อ่าน session ปัจจุบัน
   ===================================================================== */

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from auth.load_session($1)`, [hashToken(token)]);
    const s = rows[0];
    if (!s) return null;
    return {
      userId: s.user_id,
      tenantId: s.tenant_id,
      tenantName: s.tenant_name,
      name: s.name,
      role: s.role,
      perms: (s.perms ?? {}) as Perms,
    };
  });
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect('/login');
  return s;
}

/** เจ้าของกิจการทำได้ทุกอย่าง คนอื่นดูตามสิทธิ์ที่ตั้งไว้ */
export function can(session: Session, perm: Perm): boolean {
  return canMenu(session, perm);
}

export const canTab = canTabOf;
export const canEdit = canEditOf;
export const canExport = canExportOf;
export const canCost = canCostOf;
export const canHomeReport = canHomeReportOf;

/**
 * ปิดประตูหน้าที่ต้องใช้สิทธิ์เฉพาะ
 *
 * ต้องเรียกในทุกหน้าและทุก action ที่แตะข้อมูลกลุ่มนั้น การซ่อนปุ่มในเมนู
 * ไม่ใช่การป้องกัน — ผู้ใช้พิมพ์ URL ตรงเข้ามาได้เสมอ
 */
export async function requirePerm(perm: Perm): Promise<Session> {
  const s = await requireSession();
  if (!can(s, perm)) redirect('/?denied=' + perm);
  return s;
}

/**
 * ปิดประตูระดับเมนูย่อย — ใช้แทน requirePerm ในหน้าที่รู้ว่าตัวเองเป็นแท็บไหน
 * ตรวจเมนูหลักให้ในตัว จึงเรียกตัวนี้ตัวเดียวพอ
 */
export async function requireTab(menu: Perm, sub: string): Promise<Session> {
  const s = await requireSession();
  if (!canTabOf(s, menu, sub)) redirect(`/?denied=${menu}.${sub}`);
  return s;
}

/** ปิดประตูการเขียน — เรียกใน action ที่บันทึก ลบ หรือยกเลิกข้อมูล */
export async function requireEdit(menu: Perm, sub: string): Promise<Session> {
  const s = await requireSession();
  if (!canEditOf(s, menu, sub)) {
    throw new Error(
      'บัญชีของคุณเปิดดูส่วนนี้ได้อย่างเดียว แก้ไขข้อมูลไม่ได้ — ติดต่อเจ้าของกิจการ',
    );
  }
  return s;
}

/** ปิดประตูการพิมพ์ทั้งชุดและการดาวน์โหลดไฟล์ */
export async function requireExport(menu: Perm, sub: string): Promise<Session> {
  const s = await requireSession();
  if (!canExportOf(s, menu, sub)) redirect(`/?denied=export.${menu}.${sub}`);
  return s;
}

/**
 * ปิดประตูสิ่งที่เป็นต้นทุนล้วน — ไฟล์สำรองทั้งอู่ CSV สินค้า และรายงานการเงิน
 *
 * ข้อนี้รุ่น 6.4 ไม่ได้ทำ แต่เป็นรูรั่วที่เห็นทันทีเมื่อแยกสิทธิ์ต้นทุนออกมา
 * ไฟล์สำรองมีต้นทุนของสินค้าทุกตัวและทุกใบซื้ออยู่ในนั้น
 * ถ้ากันแค่หน้าจอแต่ปล่อยให้กดดาวน์โหลดได้ การซ่อนต้นทุนก็ไม่มีความหมายเลย
 */
export async function requireCost(): Promise<Session> {
  const s = await requireSession();
  if (!canCostOf(s)) redirect('/?denied=cost');
  return s;
}

/** รัน query ในนามของอู่ที่ผู้ใช้คนนี้สังกัด */
export async function query<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const s = await requireSession();
  return withTenant(s.tenantId, fn);
}

/* =====================================================================
   ลิงก์ตั้งรหัสผ่าน
   ===================================================================== */

export interface SetupTokenInfo {
  userId: string;
  email: string;
  name: string;
  tenantName: string;
  purpose: 'initial' | 'reset';
}

/** สร้าง token ใหม่ คืนค่าดิบไว้ประกอบเป็นลิงก์ (เก็บในฐานข้อมูลแค่ hash) */
export async function issueSetupToken(
  userId: string,
  purpose: 'initial' | 'reset',
  days = 7,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + days * 86400_000);
  await withoutTenant((c) =>
    c.query(`select auth.issue_setup_token($1, $2, $3, $4)`, [userId, hashToken(token), purpose, expires]),
  );
  return token;
}

export async function peekSetupToken(token: string): Promise<SetupTokenInfo | null> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from auth.peek_setup_token($1)`, [hashToken(token)]);
    const r = rows[0];
    if (!r) return null;
    return {
      userId: r.user_id, email: r.email, name: r.name,
      tenantName: r.tenant_name, purpose: r.purpose,
    };
  });
}

/** ตั้งรหัสผ่านตามลิงก์ — คืน false ถ้าลิงก์หมดอายุหรือถูกใช้ไปแล้ว */
export async function consumeSetupToken(token: string, passwordHash: string): Promise<boolean> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select auth.consume_setup_token($1, $2) as user_id`,
      [hashToken(token), passwordHash],
    );
    return rows[0]?.user_id != null;
  });
}

/** เทียบ token แบบ timing-safe — ใช้ตอนต้องเทียบสองค่าที่เป็นความลับ */
export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
