/**
 * ช่วงเวลาการใช้งาน — การคำนวณวันหมดอายุ และการอ่านสถานะจาก client ที่ส่งเข้ามา
 *
 * แยกออกมาจาก subscription.ts ซึ่งผูกกับ session ของผู้ใช้และมี server-only ติดมาด้วย
 * ที่นี่ไม่มี จึงเรียกจากชุดทดสอบได้ตรง ๆ
 * เรื่องวันหมดอายุเถียงกับลูกค้าไม่ได้ ต้องมีชุดทดสอบยืนยัน
 */
import type pg from 'pg';

/** ทดลองใช้ฟรีกี่วัน — ยกมาจากโปรแกรมเดิม */
export const TRIAL_DAYS = 15;

export type LicenseMode = 'trial' | 'active' | 'expired';

export interface LicenseStatus {
  mode: LicenseMode;
  /** วันหมดอายุ 'YYYY-MM-DD' */
  until: string;
  /** เหลือกี่วัน ติดลบคือเลยมาแล้ว */
  daysLeft: number;
  /** เคยจ่ายเงินแล้วหรือยัง ใช้แยกข้อความระหว่าง "หมดทดลอง" กับ "ขาดต่ออายุ" */
  everPaid: boolean;
  plan: string | null;
}

export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayIso = (): string => isoOf(new Date());

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000,
  );
}

/**
 * สรุปสถานะจากข้อมูลดิบ
 *
 * วันหมดอายุนับแบบ "ถึงสิ้นวันนั้น" — วันสุดท้ายยังใช้งานได้เต็มวัน
 * ไม่ใช่หมดตอนเที่ยงคืนที่เข้าสู่วันนั้น ลูกค้าเข้าใจแบบนี้และเป็นฝ่ายได้เปรียบ
 */
export function computeLicense(input: {
  today: string;
  /** วันที่เปิดอู่ในระบบ ใช้ตั้งต้นช่วงทดลอง */
  tenantCreated: string;
  /** วันหมดอายุของการสมัครล่าสุด ถ้ายังไม่เคยสมัครให้เป็น null */
  latestExpiry: string | null;
  plan: string | null;
}): LicenseStatus {
  if (input.latestExpiry) {
    const daysLeft = daysBetween(input.today, input.latestExpiry);
    return {
      mode: daysLeft >= 0 ? 'active' : 'expired',
      until: input.latestExpiry,
      daysLeft,
      everPaid: true,
      plan: input.plan,
    };
  }

  const until = addDays(input.tenantCreated, TRIAL_DAYS);
  const daysLeft = daysBetween(input.today, until);
  return { mode: daysLeft >= 0 ? 'trial' : 'expired', until, daysLeft, everPaid: false, plan: null };
}

/**
 * ต่ออายุแล้วหมดวันไหน
 *
 * ถ้ายังไม่หมดอายุให้ต่อจากวันหมดอายุเดิม ไม่ใช่จากวันนี้
 * ลูกค้าที่ต่อล่วงหน้าจะได้ไม่เสียวันที่จ่ายไปแล้ว
 * ส่วนที่หมดอายุไปแล้วเริ่มนับใหม่จากวันนี้ ไม่ต้องจ่ายชดเชยวันที่ไม่ได้ใช้
 */
export function renewalWindow(
  status: LicenseStatus,
  today: string,
  years: number,
): { startedOn: string; expiresOn: string } {
  const startFrom = status.mode === 'active' ? status.until : today;
  return { startedOn: today, expiresOn: addDays(startFrom, Math.round(365 * years)) };
}

/**
 * อ่านสถานะจาก client ที่ตั้งรหัสอู่ไว้แล้ว
 *
 * แยกจาก getLicenseStatus() เพื่อให้ mutate() เรียกได้ในทรานแซกชันเดียวกับการเขียนข้อมูล
 * ถ้าอ่านคนละทรานแซกชัน อู่ที่หมดอายุพอดีระหว่างนั้นอาจแทรกงานเข้ามาได้
 */
export async function licenseStatusWith(c: pg.PoolClient | pg.Client): Promise<LicenseStatus> {
  const { rows } = await c.query(
    `select
       (select to_char(created_at, 'YYYY-MM-DD') from tenants
         where id = current_tenant_id()) as tenant_created,
       (select expires_on::text from subscriptions
         order by expires_on desc limit 1) as latest_expiry,
       (select plan from subscriptions order by expires_on desc limit 1) as plan`,
  );

  const today = todayIso();
  return computeLicense({
    today,
    tenantCreated: rows[0]?.tenant_created ?? today,
    latestExpiry: rows[0]?.latest_expiry ?? null,
    plan: rows[0]?.plan ?? null,
  });
}
