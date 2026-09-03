import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import {
  licenseStatusWith, renewalWindow, todayIso, TRIAL_DAYS, type LicenseStatus,
} from './license-window';

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

/**
 * บันทึกการต่ออายุ
 *
 * ตอนนี้อู่โอนเงินมาแล้วเราบันทึกให้ ยังไม่มีการรับชำระออนไลน์
 * (ต้องมีบัญชีร้านค้ากับผู้ให้บริการรับชำระเงินก่อน ซึ่งเป็นเรื่องนอกโค้ด)
 * ต่ออายุจากวันหมดอายุเดิมถ้ายังไม่หมด ไม่ใช่จากวันนี้ — จะได้ไม่เสียวันที่จ่ายไปแล้ว
 */
export async function recordRenewal(input: {
  years: number;
  amount: number | null;
  note: string;
}): Promise<{ expiresOn: string }> {
  return mutate('settings', async (c) => {
    const status = await licenseStatusWith(c);
    const { startedOn, expiresOn } = renewalWindow(status, todayIso(), input.years);

    await c.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on, amount, note)
       values (current_tenant_id(), $1, $2, $3, $4, $5)`,
      ['light-yearly', startedOn, expiresOn,
       input.amount === null ? null : input.amount.toFixed(2), input.note],
    );

    return { expiresOn };
  }, { sub: 'shop', allowExpired: true });
}
