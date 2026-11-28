import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { licenseStatusWith, TRIAL_DAYS, type LicenseStatus } from './license-window';

/**
 * สถานะการใช้งาน — ทดลองใช้ ใช้งานอยู่ หรือหมดอายุ
 *
 * ยกเงื่อนไขมาจากโปรแกรมเดิม: ทดลองใช้ฟรี 15 วันนับจากวันเปิดใช้ครั้งแรก
 * ต่างกันตรงที่ของเดิมตรวจในไฟล์ HTML ซึ่งแก้ได้จาก DevTools
 * ส่วนนี่ตรวจฝั่งเซิร์ฟเวอร์ทุกครั้งที่จะเขียนข้อมูล
 *
 * ตัวคำนวณวันอยู่ที่ ./license-window เพื่อให้ทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 */

export { TRIAL_DAYS, licenseStatusWith };
export type { LicenseMode, LicenseStatus } from './license-window';

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return query((c) => licenseStatusWith(c));
}

export interface RenewalRow {
  id: string;
  plan: string;
  startedOn: string;
  expiresOn: string;
  amount: number | null;
  note: string;
  createdAt: string;
}

export async function listRenewals(): Promise<RenewalRow[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, plan, started_on::text as started_on, expires_on::text as expires_on,
              amount, note, to_char(created_at, 'YYYY-MM-DD') as created_at
       from subscriptions order by expires_on desc`,
    );
    return rows.map((r) => ({
      id: r.id, plan: r.plan, startedOn: r.started_on, expiresOn: r.expires_on,
      amount: r.amount === null ? null : Number(r.amount),
      note: r.note ?? '', createdAt: r.created_at,
    }));
  });
}

export type RenewalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface RenewalRequestRow {
  id: string;
  years: number;
  amount: number;
  paidOn: string;
  note: string;
  status: RenewalRequestStatus;
  createdAt: string;
  /** เหตุผลจากผู้ให้บริการ — มีเมื่อไม่อนุมัติ */
  decidedNote: string;
}

export async function listRenewalRequests(): Promise<RenewalRequestRow[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, years, amount, paid_on::text as paid_on, note, status,
              to_char(created_at, 'YYYY-MM-DD') as created_at, decided_note
       from renewal_requests order by created_at desc limit 20`,
    );
    return rows.map((r) => ({
      id: r.id, years: Number(r.years), amount: Number(r.amount), paidOn: r.paid_on,
      note: r.note ?? '', status: r.status, createdAt: r.created_at,
      decidedNote: r.decided_note ?? '',
    }));
  });
}

/**
 * แจ้งชำระเงินเพื่อขอต่ออายุ — **ยังไม่ได้ต่ออายุ**
 *
 * เดิมฟังก์ชันตรงนี้เพิ่มแถวใน subscriptions ให้ทันที ใครเข้าเมนูตั้งค่าได้ก็ต่ออายุเองได้
 * 1–10 ปีโดยไม่ต้องจ่ายเงิน ตอนนี้อู่ทำได้แค่ส่งคำขอพร้อมรายละเอียดการโอน
 * ผู้ให้บริการตรวจยอดกับบัญชีธนาคารแล้วอนุมัติในคอนโซล (ops.approve_renewal_request)
 * วันใช้งานจึงเพิ่มได้ทางเดียวคือผ่านคนที่เห็นเงินเข้าจริง (db/039_renewal_requests.sql)
 */
export async function requestRenewal(input: {
  years: number;
  amount: number;
  paidOn: string;
  note: string;
}): Promise<void> {
  return mutate('settings', async (c, userId) => {
    const pending = await c.query(
      `select 1 from renewal_requests where status = 'pending' limit 1`);
    if (pending.rows[0]) {
      throw new Error('มีคำขอต่ออายุที่รอตรวจสอบอยู่แล้ว — รอผลก่อน หรือยกเลิกคำขอเดิมแล้วส่งใหม่');
    }
    await c.query(
      `insert into renewal_requests (tenant_id, years, amount, paid_on, note, requested_by)
       values (current_tenant_id(), $1, $2, $3, $4, $5)`,
      [input.years, input.amount.toFixed(2), input.paidOn, input.note, userId],
    );
  }, { sub: 'shop', allowExpired: true });
}

/** ยกเลิกคำขอที่ยังรอตรวจ — เช่น กรอกยอดผิด จะได้ส่งใหม่ได้ */
export async function cancelRenewalRequest(id: string): Promise<void> {
  return mutate('settings', async (c) => {
    const { rowCount } = await c.query(
      `update renewal_requests set status = 'cancelled', decided_at = now()
       where id = $1 and status = 'pending'`, [id],
    );
    if (!rowCount) throw new Error('คำขอนี้ถูกตรวจสอบไปแล้ว ยกเลิกไม่ได้');
  }, { sub: 'shop', allowExpired: true });
}
