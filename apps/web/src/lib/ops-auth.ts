import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type pg from 'pg';
import { withoutTenant } from './db';
import { hashPassword, verifyPassword } from './password';

/**
 * ล็อกอินของคอนโซลผู้ให้บริการ — แยกจากระบบล็อกอินของอู่ทุกชั้น
 *
 * คุกกี้คนละชื่อ ตาราง session คนละใบ ตัวตนคนละตาราง
 * session ของอู่ใช้เป็น session ผู้ให้บริการไม่ได้ และกลับกันก็ไม่ได้
 *
 * **ด่านตรวจสิทธิ์จริงอยู่ในฐานข้อมูล** ทุกฟังก์ชัน ops.* รับ session hash เข้าไป
 * แล้วตรวจเอง ตัว requireOperator() ที่นี่มีไว้พาไปหน้าล็อกอินให้ถูก ไม่ใช่เพื่อกันของ
 */

const COOKIE = 'dgl_ops';

/**
 * session อายุ 1 วัน ไม่ใช่ 14 วันเหมือนของอู่
 * บัญชีอู่ที่หลุดคืออู่เดียว บัญชีผู้ให้บริการที่หลุดคือทุกอู่
 */
const SESSION_HOURS = 24;

/** รหัสผ่านขั้นต่ำ — ยาวกว่าของอู่ (10 ตัว) ด้วยเหตุผลเดียวกัน */
export const OPS_MIN_PASSWORD = 14;

const SETUP_DAYS = 7;

const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

export interface OperatorSession {
  operatorId: string;
  email: string;
  name: string;
  /** ส่งต่อให้ฟังก์ชันในฐานข้อมูลทุกครั้ง — ไม่มีตัวนี้ทำอะไรไม่ได้เลย */
  token: Buffer;
}

export type OpsSignInResult = { ok: true } | { ok: false; message: string };

export async function opsSignIn(
  email: string, password: string, userAgent?: string,
): Promise<OpsSignInResult> {
  const clean = email.trim().toLowerCase();
  /** ข้อความเดียวกันหมดไม่ว่าจะพลาดตรงไหน — ไม่บอกว่าอีเมลนี้มีอยู่จริงหรือไม่ */
  const wrong = { ok: false as const, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select * from ops.find_operator_for_signin($1)`, [clean],
    );
    const op = rows[0];

    if (!op) {
      /* คำนวณ hash ทิ้งเปล่า ๆ ให้เวลาตอบใกล้เคียงกรณีที่มีบัญชีจริง */
      await verifyPassword(password,
        'scrypt$32768$8$2$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      return wrong;
    }
    if (!op.active) return wrong;

    if (op.locked_until && new Date(op.locked_until) > new Date()) {
      return {
        ok: false as const,
        message: 'กรอกรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก 15 นาทีแล้วลองใหม่',
      };
    }
    if (!op.password_hash) {
      return { ok: false as const, message: 'บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — ใช้ลิงก์ที่ได้รับ' };
    }
    if (!(await verifyPassword(password, op.password_hash))) {
      await c.query(`select ops.record_failed_signin($1)`, [op.operator_id]);
      return wrong;
    }

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);

    await c.query(`select ops.create_session($1, $2, $3, $4)`,
      [op.operator_id, hashToken(token), expires, userAgent?.slice(0, 300) ?? null]);

    const jar = await cookies();
    jar.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      /**
       * ใช้ path '/' เหมือนคุกกี้ของหน้าอู่
       *
       * เคยตั้งเป็น '/ops' เพื่อไม่ให้คุกกี้ผู้ให้บริการถูกส่งไปกับ request ของหน้าอู่
       * ซึ่งเป็นการกันชั้นพิเศษ แต่บนเครื่องจริงเบราว์เซอร์ไม่เก็บคุกกี้นั้นเลย
       * ล็อกอินแล้วหน้าแรกขึ้น (เพราะ Next เรนเดอร์ปลายทางในคำตอบเดียวกับ action)
       * แต่กดลิงก์ถัดไปก็เด้งกลับหน้าล็อกอินทุกครั้ง
       *
       * **การจำกัด path ไม่ใช่ด่านที่กันของจริง** — ด่านจริงคือฟังก์ชันในฐานข้อมูล
       * ที่ตรวจโทเคนทุกครั้งที่ถูกเรียก ต่อให้คุกกี้ถูกส่งไปทุกหน้า ก็ไม่ได้สิทธิ์อะไรเพิ่ม
       * สิ่งที่กันไม่ให้สองระบบสับสนกันคือ **ชื่อคุกกี้คนละตัวและตาราง session คนละใบ**
       * ซึ่งยังอยู่ครบ
       */
      path: '/',
      expires,
    });

    return { ok: true as const };
  });
}

export async function opsSignOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await withoutTenant((c) => c.query(`select ops.delete_session($1)`, [hashToken(token)]));
  }
  jar.delete({ name: COOKIE, path: '/' });
}

export async function currentOperator(): Promise<OperatorSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const hash = hashToken(token);
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.load_session($1)`, [hash]);
    const r = rows[0];
    if (!r) return null;
    return { operatorId: r.operator_id, email: String(r.email), name: r.name, token: hash };
  });
}

/**
 * พาไปหน้าล็อกอินถ้ายังไม่ได้เข้า
 *
 * **ไม่ใช่ด่านความปลอดภัย** — ด่านจริงคือฟังก์ชันในฐานข้อมูลที่ตรวจโทเคนเอง
 * ตัวนี้มีไว้ให้ผู้ใช้เจอหน้าที่ถูกต้อง แทนที่จะเจอ error จากฐานข้อมูล
 */
export async function requireOperator(): Promise<OperatorSession> {
  const session = await currentOperator();
  /* บอกหน้าล็อกอินว่ามาจากการถูกเด้ง ไม่ใช่เปิดเองตั้งแต่ต้น —
     ไม่งั้นคนที่ session หมดอายุกลางทางจะงงว่าทำไมอยู่ ๆ ก็หลุด */
  if (!session) redirect('/ops/login?expired=1');
  return session;
}

/* =====================================================================
   ลิงก์ตั้งรหัสผ่านของผู้ให้บริการ
   ===================================================================== */

export interface OpsSetupInfo {
  operatorId: string;
  email: string;
  name: string;
}

export async function peekOpsSetupToken(token: string): Promise<OpsSetupInfo | null> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.peek_setup_token($1)`, [hashToken(token)]);
    const r = rows[0];
    return r ? { operatorId: r.operator_id, email: String(r.email), name: r.name } : null;
  });
}

export async function consumeOpsSetupToken(
  token: string, password: string,
): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  if (password.length < OPS_MIN_PASSWORD) {
    return { ok: false, message: `รหัสผ่านต้องยาวอย่างน้อย ${OPS_MIN_PASSWORD} ตัวอักษร` };
  }
  const info = await peekOpsSetupToken(token);
  if (!info) return { ok: false, message: 'ลิงก์นี้ใช้ไปแล้วหรือหมดอายุแล้ว' };

  const hash = await hashPassword(password);
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select ops.consume_setup_token($1, $2) as id`, [hashToken(token), hash],
    );
    if (!rows[0]?.id) return { ok: false as const, message: 'ลิงก์นี้ใช้ไปแล้วหรือหมดอายุแล้ว' };
    return { ok: true as const, email: info.email };
  });
}

/** สร้างโทเคนใหม่หนึ่งชุด — คืนทั้งตัวที่ใส่ใน URL และ hash ที่เก็บลงฐาน */
export function newSetupToken(): { token: string; hash: Buffer; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + SETUP_DAYS * 86400_000),
  };
}

/** ลิงก์ตั้งรหัสผ่านของ **ผู้ให้บริการ** */
export const opsSetupUrl = (base: string, token: string): string =>
  `${base.replace(/\/+$/, '')}/ops/setup/${token}`;

/** ลิงก์ตั้งรหัสผ่านของ **เจ้าของอู่** — คนละเส้นทางกัน อย่าสลับ */
export const shopSetupUrl = (base: string, token: string): string =>
  `${base.replace(/\/+$/, '')}/setup/${token}`;

/** ที่อยู่เว็บของระบบ ใช้ประกอบลิงก์ที่ส่งให้คนอื่น */
export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3100').replace(/\/+$/, '');
}

export type OpsClient = Pick<pg.PoolClient, 'query'>;
