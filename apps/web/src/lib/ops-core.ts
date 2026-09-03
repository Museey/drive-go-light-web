import type pg from 'pg';

/**
 * บันทึกข้อผิดพลาดและตรวจสุขภาพระบบ — ตรรกะล้วนที่รับ client เข้ามา
 *
 * แยกจาก ops.ts เพราะไฟล์นั้นผูกกับ pool และ session ชุดทดสอบจึงเรียกที่นี่ได้ตรง ๆ
 *
 * ตาราง ops.errors อยู่นอก RLS โดยตั้งใจ — ข้อผิดพลาดจำนวนมากเกิดก่อนที่จะรู้ว่า
 * เป็นอู่ไหน (ตอนล็อกอิน ตอนต่อฐานข้อมูลไม่ได้) และตอนไล่ปัญหาต้องอ่านข้ามอู่ได้
 */

type Client = pg.PoolClient | pg.Client;

export type ErrorKind = 'server' | 'client' | 'action' | 'job';

export interface ErrorRow {
  id: string;
  at: string;
  kind: ErrorKind;
  digest: string | null;
  message: string;
  stack: string | null;
  path: string | null;
  tenantId: string | null;
  userId: string | null;
  seen: boolean;
}

/**
 * คำที่บอกว่าค่าข้างหลังเป็นความลับ
 *
 * ที่เก็บ log คือที่ที่ความลับรั่วบ่อยที่สุด — ข้อความผิดพลาดจากไลบรารีฐานข้อมูล
 * มักมี connection string เต็ม ๆ ติดมา และ error จากการล็อกอินมักมีรหัสผ่านที่กรอกมา
 */
const SECRET_WORDS = [
  'password', 'passwd', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'cookie', 'session', 'password_hash', 'setup_token',
];

const SECRET_RE = new RegExp(
  /* คีย์ที่มีคำต้องห้าม → ตัวคั่น → คำนำหน้าแบบ Bearer/Basic ถ้ามี → ค่าจริง
     ต้องรับคำนำหน้าด้วย ไม่งั้น "Authorization: Bearer <token>" จะปิดแค่คำว่า Bearer
     แล้วปล่อย token ไว้ทั้งดุ้น ซึ่งเป็นกรณีที่อันตรายที่สุด */
  `(${SECRET_WORDS.join('|')})(\\s*[=:]\\s*|"\\s*:\\s*")((?:bearer|basic|token)\\s+)?([^\\s,;)"']+)`,
  'gi',
);

/** connection string ทั้งเส้น — postgres://user:pass@host/db */
const URL_RE = /([a-z+]+:\/\/[^:\s/]+):([^@\s]+)@/gi;

/**
 * ลบค่าที่ใช้สวมสิทธิ์ได้ออกจากข้อความก่อนบันทึก
 *
 * เก็บชื่อคีย์ไว้แต่แทนค่าด้วย ••• เพื่อให้ยังไล่ปัญหาได้ว่าพังตรงไหน
 * โดยไม่ต้องแลกกับการเก็บความลับไว้ในตารางที่ไม่ได้ป้องกันเท่ารหัสผ่านจริง
 */
export function scrub(text: string): string {
  return text
    .replace(URL_RE, '$1:•••@')
    .replace(SECRET_RE, (_m, key, sep, scheme, _v) => `${key}${sep}${scheme ?? ''}•••`);
}

/** ตัดข้อความยาวเกินจำเป็น — stack ของ Next ยาวได้เป็นหมื่นตัวอักษร */
const clip = (v: string | null | undefined, max: number): string | null => {
  if (!v) return null;
  const s = scrub(String(v));
  return s.length > max ? s.slice(0, max) + `\n… (ตัดที่ ${max} ตัวอักษร)` : s;
};

export interface RecordErrorInput {
  kind: ErrorKind;
  message: string;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}

/**
 * บันทึกข้อผิดพลาดหนึ่งรายการ
 *
 * **ห้ามโยนต่อไม่ว่าเกิดอะไรขึ้น** — ตัวบันทึกข้อผิดพลาดที่พังแล้วทำให้ทั้งคำขอพัง
 * คือของที่ทำให้เรื่องเล็กกลายเป็นเรื่องใหญ่ คืน null แทนแล้วปล่อยผ่าน
 */
export async function recordErrorWith(
  c: Client, input: RecordErrorInput,
): Promise<string | null> {
  try {
    const { rows } = await c.query(
      `insert into ops.errors (kind, digest, message, stack, path, tenant_id, user_id)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [
        input.kind,
        clip(input.digest, 100),
        clip(input.message, 2000) ?? 'ไม่มีข้อความ',
        clip(input.stack, 20000),
        clip(input.path, 500),
        input.tenantId ?? null,
        input.userId ?? null,
      ],
    );
    return String(rows[0].id);
  } catch {
    return null;
  }
}

export async function listErrorsWith(
  c: Client, opts: { limit?: number; onlyUnseen?: boolean } = {},
): Promise<ErrorRow[]> {
  const { rows } = await c.query(
    `select id, at, kind, digest, message, stack, path, tenant_id, user_id, seen
     from ops.errors
     ${opts.onlyUnseen ? 'where not seen' : ''}
     order by at desc
     limit $1`,
    [Math.min(opts.limit ?? 100, 500)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    kind: r.kind,
    digest: r.digest,
    message: r.message,
    stack: r.stack,
    path: r.path,
    tenantId: r.tenant_id,
    userId: r.user_id,
    seen: r.seen,
  }));
}

export async function markSeenWith(c: Client, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await c.query(`update ops.errors set seen = true where id = any($1::bigint[])`, [ids]);
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

/**
 * ตรวจสามอย่างที่เคยพังจริงในโปรเจกต์นี้
 *
 * ตัวตรวจสุขภาพที่ตอบ 200 เสมอไม่มีประโยชน์ — ต้องล้มเมื่อของที่แอปพึ่งพาไม่พร้อม
 * ไม่งั้นระบบเฝ้าระวังจะบอกว่าปกติในขณะที่ผู้ใช้เปิดหน้าไม่ได้เลย
 */
export async function healthChecksWith(
  c: Client, expectedMigrations: string[],
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  /* 1. role ต้องไม่ข้าม RLS ได้ — ถ้าข้ามได้ ทุกอู่เห็นข้อมูลของกันและกัน */
  try {
    const { rows } = await c.query(
      `select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    const bad = rows[0]?.rolbypassrls || rows[0]?.rolsuper;
    checks.push({
      name: 'db',
      ok: !bad,
      detail: bad ? 'role ที่แอปใช้ข้าม row level security ได้' : undefined,
    });
  } catch (err) {
    checks.push({ name: 'db', ok: false, detail: 'ต่อฐานข้อมูลไม่ได้' });
    return checks;      /* ตรวจต่อไม่ได้ถ้าต่อฐานไม่ได้ */
  }

  /* 2. เขตเวลาแอปกับฐานข้อมูลต้องเห็นวันเดียวกัน — เคยพังมาแล้ว */
  try {
    const { rows } = await c.query(`select current_date::text as d`);
    const dbDate = rows[0].d as string;
    const appDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    checks.push({
      name: 'clock',
      ok: dbDate === appDate,
      detail: dbDate === appDate ? undefined : `แอปเห็น ${appDate} ฐานข้อมูลเห็น ${dbDate}`,
    });
  } catch {
    checks.push({ name: 'clock', ok: false, detail: 'อ่านวันที่จากฐานข้อมูลไม่ได้' });
  }

  /* 3. ไมเกรชันที่โค้ดต้องการต้องรันครบแล้ว */
  try {
    const { rows } = await c.query(`select filename from ops.migrations`);
    const ran = new Set(rows.map((r) => r.filename as string));
    const missing = expectedMigrations.filter((f) => !ran.has(f));
    checks.push({
      name: 'migrations',
      ok: missing.length === 0,
      detail: missing.length ? `ยังไม่ได้รัน ${missing.join(', ')}` : undefined,
    });
  } catch {
    checks.push({ name: 'migrations', ok: false, detail: 'อ่านตาราง ops.migrations ไม่ได้' });
  }

  return checks;
}
