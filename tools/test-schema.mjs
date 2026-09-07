/**
 * สร้างสคีมาใหม่สำหรับชุดทดสอบ **ในนาม role ที่ไม่ใช่ superuser**
 *
 * ทำไมต้องมีไฟล์นี้ — ฟังก์ชัน SECURITY DEFINER ทำงานในนาม *เจ้าของฟังก์ชัน*
 * และเจ้าของคือใครก็ตามที่รัน create function ถ้าชุดทดสอบรันไฟล์สคีมาในนาม
 * superuser ฟังก์ชันทั้งหมดก็เป็นของ superuser ซึ่ง **ข้าม Row Level Security
 * ได้เอง** ผลคือชุดทดสอบทำงานคนละแบบกับเครื่องจริงในจุดที่สำคัญที่สุด
 *
 * เคยทำให้เจ้าของอู่ล็อกอินไม่ได้เลยบนเครื่องจริง ทั้งที่เทสต์ 430 ข้อเขียวหมด
 * (ดู db/012_auth_rls.sql)
 *
 * บริการ Postgres แบบ managed ทุกเจ้าให้ role ที่ไม่ใช่ superuser มาเป็นเจ้าของ
 * ตัวนี้จึงจำลองแบบเดียวกัน — ล้างสคีมาในนามผู้ที่ต่ออยู่ (ต้องมีสิทธิ์พอ)
 * แล้ว **สลับเป็น role ธรรมดาก่อนสร้างของใหม่ทั้งหมด**
 *
 * การหว่านข้อมูลทดสอบยังทำในนามเดิม (มัก superuser) จะได้ไม่ต้องตั้ง
 * app.tenant_id ทุกครั้งที่ insert — ที่ต้องเหมือนเครื่องจริงคือ *เจ้าของฟังก์ชัน*
 * ไม่ใช่คนหว่านข้อมูล
 *
 * เตรียม role ด้วย  SUPER_URL=... node tools/setup-test-db.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const TEST_OWNER = process.env.TEST_OWNER ?? 'dgl_test_owner';

/** สคีมาทั้งหมดที่โปรเจกต์นี้สร้าง — ล้างให้หมดทุกครั้ง ไม่งั้นของเก่าค้าง */
const SCHEMAS = ['ops', 'auth', 'public'];

async function assertOwnerExists(client) {
  const { rowCount } = await client.query(
    'select 1 from pg_roles where rolname = $1', [TEST_OWNER]);
  if (!rowCount) {
    throw new Error(
      `ไม่มี role ${TEST_OWNER} ในฐานข้อมูลนี้\n`
      + 'ชุดทดสอบต้องสร้างสคีมาในนาม role ที่ไม่ใช่ superuser ให้เหมือนเครื่องจริง\n'
      + "เตรียมด้วย  SUPER_URL='postgresql://postgres:x@localhost:5433/postgres' "
      + 'node tools/setup-test-db.mjs',
    );
  }
}

/**
 * ล้างแล้วสร้างสคีมาใหม่จากไฟล์ที่ระบุ
 *
 * @param client  connection ที่มีสิทธิ์ลบสคีมา (ปกติคือ superuser ของเครื่องพัฒนา)
 * @param files   ไฟล์ SQL เรียงตามลำดับ เช่น ['db/001_init.sql', 'db/002_auth.sql']
 */
export async function freshSchema(client, files) {
  await assertOwnerExists(client);

  await client.query(
    SCHEMAS.map((s) => `drop schema if exists ${s} cascade`).join('; '));

  /* ตั้งแต่บรรทัดนี้ไป ทุกอย่างที่สร้างขึ้นเป็นของ role ธรรมดา ไม่ใช่ superuser */
  await client.query(`set role ${TEST_OWNER}`);
  try {
    await client.query('create schema public');
    for (const f of files) {
      await client.query(readFileSync(resolve(ROOT, f), 'utf8'));
    }
  } finally {
    await client.query('reset role');
  }
}

/**
 * คืนสิทธิ์ของ role แอปแล้วสร้างใหม่ — เรียกหลัง freshSchema()
 * แยกจาก freshSchema เพราะบางเทสต์ตั้ง role เองด้วยรหัสผ่านของตัวเอง
 */
export async function grantAppRole(client, password = 'apppass') {
  await client.query(`
    do $$ begin
      if exists (select 1 from pg_roles where rolname = 'dgl_app') then
        execute 'drop owned by dgl_app';
      end if;
    end $$;
  `);
  await client.query(
    readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', password),
  );
}
