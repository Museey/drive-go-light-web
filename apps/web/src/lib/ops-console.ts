import 'server-only';
import { withoutTenant } from './db';
import {
  computeLicense, isoOf, renewalWindow, todayIso, type LicenseStatus,
} from './license-window';
import type { OperatorSession } from './ops-auth';

/**
 * งานของคอนโซลผู้ให้บริการ
 *
 * ทุกฟังก์ชันส่ง `session.token` ต่อเข้าไปในฐานข้อมูลเสมอ — ฝั่งฐานข้อมูลตรวจเอง
 * ถ้าโทเคนใช้ไม่ได้ ฟังก์ชันจะโยน error ไม่ว่าโค้ดที่นี่จะเรียกอย่างไร
 *
 * สถานะลิขสิทธิ์คำนวณที่นี่ด้วย computeLicense() ตัวเดียวกับที่หน้าอู่ใช้
 * ฐานข้อมูลคืนแค่ข้อเท็จจริงดิบ — ตรรกะช่วงทดลองใช้กับวันหมดอายุจึงมีที่อยู่ที่เดียว
 */

export interface ShopRow {
  tenantId: string;
  name: string;
  createdOn: string;
  userCount: number;
  maxUsers: number | null;
  license: LicenseStatus;
}

const iso = (v: unknown): string =>
  v instanceof Date ? isoOf(v) : String(v ?? '').slice(0, 10);

export async function listShops(s: OperatorSession): Promise<ShopRow[]> {
  /* วันนี้ตามเวลาไทย — ฐานข้อมูลกับแอปตั้งเขตเวลาไว้ตรงกันแล้ว ดู assertClockAgrees() */
  const today = todayIso();
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.list_shops($1)`, [s.token]);
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      name: r.name,
      createdOn: iso(r.created_on),
      userCount: Number(r.user_count),
      maxUsers: r.max_users === null ? null : Number(r.max_users),
      license: computeLicense({
        today,
        tenantCreated: iso(r.created_on),
        latestExpiry: r.expires_on ? iso(r.expires_on) : null,
        plan: r.plan ?? null,
      }),
    }));
  });
}

export async function getShop(s: OperatorSession, tenantId: string): Promise<ShopRow | null> {
  const all = await listShops(s);
  return all.find((x) => x.tenantId === tenantId) ?? null;
}

export interface OpenShopInput {
  name: string;
  tel: string;
  ownerEmail: string;
  ownerName: string;
}

export async function openShop(
  s: OperatorSession, input: OpenShopInput, tokenHash: Buffer, expiresAt: Date,
): Promise<string> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select ops.open_shop($1,$2,$3,$4,$5,$6,$7) as id`,
      [s.token, input.name, input.tel, input.ownerEmail.trim().toLowerCase(),
       input.ownerName, tokenHash, expiresAt],
    );
    return rows[0].id as string;
  });
}

export async function issueOwnerReset(
  s: OperatorSession, tenantId: string, tokenHash: Buffer, expiresAt: Date,
): Promise<string> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select ops.issue_owner_reset($1,$2,$3,$4) as email`,
      [s.token, tenantId, tokenHash, expiresAt],
    );
    return String(rows[0].email);
  });
}

export async function recordRenewal(
  s: OperatorSession,
  input: { tenantId: string; plan: string; from: string; to: string; amount: number | null; note: string },
): Promise<void> {
  await withoutTenant((c) => c.query(
    `select ops.record_renewal($1,$2,$3,$4,$5,$6,$7)`,
    [s.token, input.tenantId, input.plan, input.from, input.to, input.amount, input.note],
  ));
}

export async function setMaxUsers(
  s: OperatorSession, tenantId: string, max: number | null,
): Promise<void> {
  await withoutTenant((c) => c.query(
    `select ops.set_max_users($1,$2,$3)`, [s.token, tenantId, max],
  ));
}

/** ช่วงต่ออายุที่แนะนำ — ต่อจากวันหมดอายุเดิม ไม่ใช่จากวันนี้ */
export const suggestRenewal = (license: LicenseStatus, years = 1) =>
  renewalWindow(license, todayIso(), years);

export interface OperatorRow {
  id: string;
  email: string;
  name: string;
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
}

export async function listOperators(s: OperatorSession): Promise<OperatorRow[]> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.list_operators($1)`, [s.token]);
    return rows.map((r) => ({
      id: r.id, email: String(r.email), name: r.name, active: r.active,
      hasPassword: r.has_password,
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
    }));
  });
}

export async function addOperator(
  s: OperatorSession, email: string, name: string, tokenHash: Buffer, expiresAt: Date,
): Promise<string> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select ops.add_operator($1,$2,$3,$4,$5) as id`,
      [s.token, email.trim().toLowerCase(), name, tokenHash, expiresAt],
    );
    return rows[0].id as string;
  });
}

export async function setOperatorActive(
  s: OperatorSession, operatorId: string, active: boolean,
): Promise<void> {
  await withoutTenant((c) => c.query(
    `select ops.set_operator_active($1,$2,$3)`, [s.token, operatorId, active],
  ));
}

export interface ErrorRow {
  id: string; at: string; kind: string; message: string;
  tenantId: string | null; digest: string | null;
}

export async function listErrors(s: OperatorSession, limit = 100): Promise<ErrorRow[]> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.list_errors($1,$2)`, [s.token, limit]);
    return rows.map((r) => ({
      id: String(r.id), at: new Date(r.at).toISOString(), kind: r.kind,
      message: r.message, tenantId: r.tenant_id, digest: r.digest,
    }));
  });
}

export interface AuditRow {
  id: string; at: string; operatorEmail: string; action: string;
  tenantId: string | null; detail: Record<string, unknown>;
}

export async function listAudit(s: OperatorSession, limit = 200): Promise<AuditRow[]> {
  return withoutTenant(async (c) => {
    const { rows } = await c.query(`select * from ops.list_audit($1,$2)`, [s.token, limit]);
    return rows.map((r) => ({
      id: String(r.id), at: new Date(r.at).toISOString(), operatorEmail: r.operator_email,
      action: r.action, tenantId: r.tenant_id, detail: r.detail ?? {},
    }));
  });
}

export const AUDIT_LABEL: Record<string, string> = {
  signin: 'เข้าสู่ระบบ',
  signin_failed: 'กรอกรหัสผ่านผิด',
  password_set: 'ตั้งรหัสผ่าน',
  open_shop: 'เปิดอู่ใหม่',
  issue_owner_reset: 'ออกลิงก์ตั้งรหัสผ่านให้เจ้าของอู่',
  record_renewal: 'บันทึกการต่ออายุ',
  set_max_users: 'ปรับจำนวนที่นั่งพนักงาน',
  add_operator: 'เพิ่มบัญชีผู้ให้บริการ',
  enable_operator: 'เปิดบัญชีผู้ให้บริการ',
  disable_operator: 'ปิดบัญชีผู้ให้บริการ',
};
