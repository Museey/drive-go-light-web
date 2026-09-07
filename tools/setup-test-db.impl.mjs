#!/usr/bin/env node
/**
 * เตรียมฐานข้อมูลสำหรับชุดทดสอบ ให้เหมือนเครื่องจริงในจุดที่สำคัญที่สุด
 *
 *   SUPER_URL='postgresql://postgres:x@localhost:5433/postgres' node tools/setup-test-db.mjs
 *
 * **ทำไมต้องมี** — บริการ Postgres แบบ managed ทุกเจ้าให้ role ที่ **ไม่ใช่ superuser**
 * มาเป็นเจ้าของฐานข้อมูล ส่วนฐานทดสอบทั่วไปมีเจ้าของเป็น postgres ซึ่งเป็น superuser
 *
 * ความต่างนี้ไม่ใช่รายละเอียดหยุมหยิม — **superuser ข้าม Row Level Security ได้เอง**
 * ฟังก์ชัน SECURITY DEFINER จึงทำงานคนละแบบบนสองฐาน และเคยทำให้เจ้าของอู่
 * ล็อกอินไม่ได้เลยบนเครื่องจริง ทั้งที่ชุดทดสอบ 430 ข้อเขียวหมด
 * (ดู db/012_auth_rls.sql)
 *
 * ตัวนี้สร้าง role ธรรมดาขึ้นมาเป็นเจ้าของฐานทดสอบ แล้วพิมพ์ URL ที่ต้องใช้
 * ชุดทดสอบมีข้อที่ปฏิเสธไม่ยอมรันถ้า DATABASE_URL ยังชี้ไปที่ superuser
 */
import pg from 'pg';
import { emitSecret } from './secret-out.mjs';

const OWNER = process.env.TEST_OWNER ?? 'dgl_test_owner';
const PASSWORD = process.env.TEST_OWNER_PASSWORD ?? 'testowner';
const DB = process.env.TEST_DB ?? 'dgl';

const superUrl = process.env.SUPER_URL || process.env.ADMIN_URL || process.env.DATABASE_URL;
if (!superUrl) {
  console.error(
    'ต้องตั้ง SUPER_URL ให้ชี้ไปที่ superuser ของ Postgres ในเครื่องพัฒนา\n'
    + "เช่น  SUPER_URL='postgresql://postgres:x@localhost:5433/postgres'",
  );
  process.exit(2);
}

/* ต่อที่ฐาน postgres เสมอ — จะได้ drop ฐานทดสอบได้โดยไม่ติดว่าตัวเองใช้อยู่ */
const root = new URL(superUrl);
root.pathname = '/postgres';
const client = new pg.Client({ connectionString: root.toString() });

/**
 * เครื่องมือนี้ **ลบฐานข้อมูลทิ้ง** จึงต้องกันไม่ให้เผลอชี้ไปที่เครื่องจริง
 * ยอมให้รันได้เฉพาะเครื่องตัวเอง เว้นแต่จะยืนยันด้วย --i-know-what-im-doing
 */
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
if (!LOCAL.has(root.hostname) && !process.argv.includes('--i-know-what-im-doing')) {
  console.error(
    `SUPER_URL ชี้ไปที่ ${root.hostname} ซึ่งไม่ใช่เครื่องตัวเอง\n`
    + 'เครื่องมือนี้ลบฐานข้อมูลทิ้งเพื่อสร้างใหม่ — ใช้กับฐานทดสอบเท่านั้น',
  );
  process.exit(2);
}

try {
  await client.connect();

  const me = await client.query('select rolsuper from pg_roles where rolname = current_user');
  if (!me.rows[0]?.rolsuper) {
    console.error('SUPER_URL ต้องเป็น superuser — ตัวนี้สร้าง role กับฐานข้อมูลให้');
    process.exit(2);
  }

  /**
   * ล้างของเก่าให้หมดก่อน
   *
   * ฐานทดสอบที่เคยมีเจ้าของเป็น superuser จะทิ้งสคีมาและ role ที่ role ใหม่แตะไม่ได้ไว้
   * (`must be owner of schema auth`, `permission denied to drop objects`)
   * ล้างทีเดียวให้สะอาดง่ายกว่าไล่แก้สิทธิ์ทีละอย่าง
   */
  const { rows: dbs } = await client.query(
    `select datname from pg_database where datname = $1 or datname like 'dgl\\_%'`, [DB]);
  for (const d of dbs) {
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`, [d.datname]);
    await client.query(`drop database if exists ${d.datname}`);
    console.log(`  ✓ ลบฐานข้อมูลเก่า ${d.datname}`);
  }

  /* role ที่ชุดทดสอบสร้างขึ้นมาเอง — ลบทิ้งเพื่อให้ role ใหม่เป็นคนสร้างแทน
     จะได้มีสิทธิ์จัดการมันในรอบถัดไป */
  for (const r of ['dgl_app', 'dgl_managed_app', 'dgl_managed_owner']) {
    const has = await client.query('select 1 from pg_roles where rolname = $1', [r]);
    if (!has.rowCount) continue;
    await client.query(`drop owned by ${r}`);
    await client.query(`drop role ${r}`);
    console.log(`  ✓ ลบ role เก่า ${r}`);
  }

  /**
   * role เจ้าของฐานทดสอบ — **ไม่ใช่ superuser และไม่มี BYPASSRLS** โดยตั้งใจ
   * แต่ต้อง createdb (ชุดทดสอบสร้างฐานชั่วคราวเทียบสคีมา)
   * และ createrole (ชุดทดสอบสร้าง dgl_app เอง)
   */
  const exists = await client.query('select 1 from pg_roles where rolname = $1', [OWNER]);
  if (exists.rowCount) {
    await client.query(`alter role ${OWNER} login createdb createrole nosuperuser nobypassrls`);
    await client.query(`alter role ${OWNER} password $1`.replace('$1', `'${PASSWORD}'`));
    console.log(`  ✓ ปรับ role ${OWNER} ที่มีอยู่แล้ว`);
  } else {
    await client.query(
      `create role ${OWNER} login createdb createrole password '${PASSWORD}'`);
    console.log(`  ✓ สร้าง role ${OWNER}`);
  }

  /* ฐานทดสอบต้องมี role นี้เป็นเจ้าของ ไม่งั้นฟังก์ชันที่สร้างจะเป็นของ superuser
     แล้วชุดทดสอบจะไม่มีวันเจอบั๊กที่เกิดจาก force row level security */
  await client.query(`create database ${DB} owner ${OWNER}`);
  console.log(`  ✓ สร้างฐานข้อมูล ${DB} โดยมี ${OWNER} เป็นเจ้าของ`);

  /**
   * สร้าง role ของแอปไว้ให้เลย แล้ว **ให้เจ้าของฐานเป็นสมาชิกของมัน**
   *
   * ชุดทดสอบสั่ง `drop owned by dgl_app` ตอนล้างฐานทุกครั้ง ซึ่งต้องเป็นสมาชิก
   * ของ role นั้นถึงจะทำได้ — การมีสิทธิ์สร้าง role อย่างเดียวไม่พอ
   *
   * รหัสผ่านตรงกับที่ db/app-role.sql ใส่ไว้ ชุดทดสอบจะได้ต่อได้เหมือนเดิม
   */
  await client.query(`create role dgl_app login password 'apppass'`);
  await client.query(`grant dgl_app to ${OWNER} with admin option`);
  console.log('  ✓ สร้าง role dgl_app และให้เจ้าของฐานเป็นสมาชิก');

  /* สคีมา public ต้องเป็นของ role นี้ด้วย ไม่งั้นสร้างตารางไม่ได้ */
  const inDb = new URL(root.toString());
  inDb.pathname = `/${DB}`;
  const dbc = new pg.Client({ connectionString: inDb.toString() });
  await dbc.connect();
  await dbc.query(`alter schema public owner to ${OWNER}`);
  await dbc.query(`grant all on schema public to ${OWNER}`);
  await dbc.end();
  console.log('  ✓ ให้สคีมา public เป็นของ role เดียวกัน');

  const url = new URL(root.toString());
  url.username = OWNER;
  url.password = PASSWORD;
  url.pathname = `/${DB}`;

  emitSecret(url.toString(), {
    title: 'ตั้ง DATABASE_URL ของชุดทดสอบเป็นค่านี้',
    show: process.argv.includes('--show'),
  });
  console.log('  รหัสผ่านเป็นค่าตายตัวสำหรับเครื่องพัฒนาเท่านั้น ไม่ใช่ความลับอะไร');
  console.log('  ใส่ไว้ใน apps/web/.env.local หรือส่งเป็นตัวแปรตอนรัน npm test\n');
} catch (err) {
  console.error(`\nเตรียมฐานทดสอบไม่สำเร็จ`);
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
