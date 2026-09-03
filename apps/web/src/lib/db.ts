import 'server-only';
import pg from 'pg';
import { SHOP_TZ, today } from '@drivegolight/core';

/**
 * คอลัมน์ date (oid 1082) ต้องกลับมาเป็นสตริง 'YYYY-MM-DD'
 *
 * ค่าตั้งต้นของ pg คือแปลงเป็น JS Date ที่เที่ยงคืนตามเวลาเครื่อง พอเรียก
 * toISOString() ต่อจะได้วันที่ก่อนหน้า 1 วันเสมอในเขตเวลาไทย (UTC+7)
 * วันครบกำหนดชำระและวันที่บนเอกสารจะเพี้ยนทั้งระบบ
 *
 * เป็นบั๊กเดียวกับที่โปรแกรมรุ่นเดิมเคยเจอ — ดูคอมเมนต์เหนือ iso() ใน legacy/
 */
pg.types.setTypeParser(1082, (v) => v);

/** numeric (oid 1700) กลับมาเป็นสตริงตามค่าตั้งต้นอยู่แล้ว — แปลงเองตอนใช้ ห้ามให้ pg ปัดให้ */

declare global {
  // eslint-disable-next-line no-var
  var __dglPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var __dglRlsChecked: boolean | undefined;
  // eslint-disable-next-line no-var
  var __dglTzChecked: boolean | undefined;
}

function makePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('ยังไม่ได้ตั้งตัวแปรแวดล้อม DATABASE_URL — ดู apps/web/.env.example');
  }
  return new pg.Pool({ connectionString, max: 10 });
}

/** dev server รีโหลดโมดูลบ่อย — เก็บ pool ไว้บน globalThis กัน connection รั่ว */
const pool: pg.Pool = globalThis.__dglPool ?? (globalThis.__dglPool = makePool());

/**
 * ตรวจว่า role ที่ต่ออยู่ไม่ข้าม Row Level Security
 *
 * superuser และ role ที่มี BYPASSRLS จะมองเห็นข้อมูลทุกอู่โดยไม่มีอาการผิดปกติ
 * ให้เห็นเลย — แอปจะดูเหมือนทำงานได้ปกติจนกว่าจะมีอู่ที่สอง แล้วข้อมูลรั่วข้ามกัน
 * ยอมให้พังตั้งแต่ต้นดีกว่าปล่อยให้เงียบ
 */
async function assertRlsEnforced(client: pg.PoolClient): Promise<void> {
  if (globalThis.__dglRlsChecked) return;

  const { rows } = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const role = rows[0];
  if (role?.rolsuper || role?.rolbypassrls) {
    throw new Error(
      'แอปต่อฐานข้อมูลด้วย role ที่ข้าม Row Level Security ได้ ' +
      '(superuser หรือมี BYPASSRLS) — ข้อมูลจะรั่วข้ามอู่โดยไม่มีอาการให้เห็น\n' +
      'สร้าง role สำหรับแอปด้วย db/app-role.sql แล้วเปลี่ยน DATABASE_URL ไปใช้ role นั้น',
    );
  }
  globalThis.__dglRlsChecked = true;
}

/**
 * ตรวจว่าฐานข้อมูลกับแอปเห็นวันที่ตรงกัน
 *
 * ค่าตั้งต้นของหลายคอลัมน์เป็น current_date และรายงานหลายตัวเทียบกับ current_date
 * ส่วนแอปคิดวันที่ตามเวลาไทยเสมอ ถ้าฐานข้อมูลตั้งเป็น UTC (ค่าตั้งต้นของ Docker
 * และเซิร์ฟเวอร์ส่วนใหญ่) ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าสองฝั่งจะต่างกันหนึ่งวัน
 * แล้วเอกสารกับการเคลื่อนไหวสต๊อกของงานเดียวกันจะลงคนละวัน โดยไม่มีอาการให้เห็น
 *
 * แก้ด้วย db/app-role.sql ซึ่งตั้ง timezone ให้ role ของแอปไว้แล้ว
 */
async function assertClockAgrees(client: pg.PoolClient): Promise<void> {
  if (globalThis.__dglTzChecked) return;

  const { rows } = await client.query<{ db_date: string; tz: string }>(
    `select current_date::text as db_date, current_setting('timezone') as tz`,
  );
  const dbDate = rows[0]?.db_date;
  const appDate = today();

  if (dbDate !== appDate) {
    throw new Error(
      `ฐานข้อมูลกับแอปเห็นวันที่ไม่ตรงกัน — ฐานข้อมูลว่า ${dbDate} แอปว่า ${appDate} ` +
      `(เขตเวลาของฐานข้อมูลคือ ${rows[0]?.tz} แอปใช้ ${SHOP_TZ})
` +
      'เอกสารกับการเคลื่อนไหวสต๊อกจะลงคนละวัน แก้ด้วยการรัน db/app-role.sql ' +
      `หรือสั่ง alter role dgl_app set timezone = '${SHOP_TZ}';`,
    );
  }
  globalThis.__dglTzChecked = true;
}

/**
 * รัน query ในนามของอู่หนึ่งราย
 *
 * ทุกการอ่านเขียนข้อมูลต้องผ่านฟังก์ชันนี้ ห้ามเรียก pool.query() ตรง ๆ
 * เพราะ app.tenant_id ตั้งแบบ local ซึ่งมีผลเฉพาะในทรานแซกชัน ถ้าไม่มีทรานแซกชัน
 * RLS จะกรองทุกแถวออกหมด (หรือแย่กว่านั้นคือใช้ค่าที่ค้างจาก request ก่อน)
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await assertRlsEnforced(client);
    await assertClockAgrees(client);
    await client.query('begin');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    await noteFailure(client, err, tenantId);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * บันทึกข้อผิดพลาดที่หลุดออกจากการทำงานกับฐานข้อมูล
 *
 * ที่นี่คือจุดคอขวดที่แคบที่สุดของฝั่งเซิร์ฟเวอร์ — ทุกหน้า ทุก action
 * และทุก route ที่ทำงานจริงต้องผ่านทางนี้ ดักที่เดียวจึงครอบคลุมเกือบทั้งหมด
 * โดยไม่ต้องไปแก้ทุกจุดแล้วลืมจุดใดจุดหนึ่ง
 *
 * (เคยลองใช้ instrumentation.ts ของ Next ซึ่งเป็นที่ที่ควรใช้ที่สุด แต่ไฟล์นั้น
 *  ถูกรวมเข้าไปในทุก runtime ที่ Next รองรับ การ import ตัวต่อฐานข้อมูลจึงทำให้
 *  ทั้งแอป bundle ไม่ผ่าน เพราะ pg ต้องการโมดูล fs ที่ runtime อื่นไม่มี)
 *
 * ห้ามโยนต่อไม่ว่าเกิดอะไรขึ้น — ตัวบันทึกที่พังแล้วกลบข้อผิดพลาดตัวจริงทิ้ง
 * คือของที่ทำให้ไล่ปัญหาไม่ได้เลย
 */
async function noteFailure(
  client: pg.PoolClient, err: unknown, tenantId: string | null,
): Promise<void> {
  try {
    const { recordErrorWith } = await import('./ops-core');
    const e = err as Error & { digest?: string };
    await recordErrorWith(client, {
      kind: 'server',
      message: e?.message ?? String(err),
      stack: e?.stack ?? null,
      digest: e?.digest ?? null,
      tenantId,
    });
  } catch {
    /* เงียบไว้ */
  }
}

/**
 * query ที่ไม่ผูกกับอู่ใดอู่หนึ่ง — ใช้ได้เฉพาะตอนเข้าสู่ระบบและงานดูแลระบบ
 * ตาราง tenants มี RLS อยู่ด้วย จึงอ่านได้เฉพาะคอลัมน์ที่นโยบายอนุญาต
 */
export async function withoutTenant<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await assertRlsEnforced(client);
    await assertClockAgrees(client);
    return await fn(client);
  } finally {
    client.release();
  }
}

export type { PoolClient } from 'pg';
