/**
 * ฟังก์ชันในฐานข้อมูลต้องไม่ได้เป็นของ superuser
 *
 * **นี่คือข้อที่ทำให้ชุดทดสอบทั้งชุดมีความหมาย**
 *
 * ฟังก์ชัน SECURITY DEFINER ทำงานในนาม *เจ้าของฟังก์ชัน* และเจ้าของคือใครก็ตาม
 * ที่รัน create function ถ้าชุดทดสอบสร้างสคีมาในนาม superuser ฟังก์ชันทั้งหมด
 * ก็เป็นของ superuser ซึ่ง **ข้าม Row Level Security ได้เอง** — ชุดทดสอบจะทำงาน
 * คนละแบบกับเครื่องจริงในจุดที่สำคัญที่สุด แล้วเขียวทั้งที่ของจริงพัง
 *
 * เกิดขึ้นจริงมาแล้ว — เจ้าของอู่ล็อกอินไม่ได้เลยบนเครื่องจริง ทั้งที่เทสต์ 430 ข้อ
 * ผ่านหมด สาเหตุคือ force row level security มีผลกับเจ้าของตารางด้วย
 * และบริการ Postgres แบบ managed ให้ role ที่ไม่ใช่ superuser มาเป็นเจ้าของ
 * (ดู db/012_auth_rls.sql)
 *
 * เทสต์นี้ตรวจ *คุณสมบัติจริงของฐานข้อมูล* ไม่ใช่ตรวจว่าโค้ดเรียกฟังก์ชันถูกไหม
 * ถ้าวันหนึ่งมีคนรันไฟล์สคีมาด้วย superuser อีก ข้อนี้จะแดงทันที
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema, TEST_OWNER } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('เจ้าของฟังก์ชันในฐานข้อมูล', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, [
      'db/001_init.sql', 'db/002_auth.sql', 'db/008_ops.sql', 'db/011_ops_console.sql',
    ]);
  }, 120_000);

  afterAll(async () => { await admin?.end(); });

  it(`role ที่ใช้สร้างสคีมา (${TEST_OWNER}) ไม่ใช่ superuser และไม่มี BYPASSRLS`, async () => {
    const { rows } = await admin.query(
      'select rolsuper, rolbypassrls from pg_roles where rolname = $1', [TEST_OWNER]);
    expect(rows[0], `ไม่มี role ${TEST_OWNER} — รัน tools/setup-test-db.mjs ก่อน`).toBeTruthy();
    expect(rows[0].rolsuper, 'ถ้าเป็น superuser ชุดทดสอบจะไม่มีวันเจอบั๊กเรื่อง RLS')
      .toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  /** ข้อสำคัญที่สุดของไฟล์นี้ */
  it('ไม่มีฟังก์ชัน SECURITY DEFINER ตัวไหนเป็นของ role ที่ข้าม RLS ได้', async () => {
    const { rows } = await admin.query(`
      select n.nspname || '.' || p.proname as fn,
             pg_get_userbyid(p.proowner) as owner,
             r.rolsuper, r.rolbypassrls
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_roles r on r.oid = p.proowner
       where n.nspname in ('public', 'auth', 'ops')
         and p.prosecdef
       order by fn`);

    expect(rows.length, 'ต้องมีฟังก์ชัน SECURITY DEFINER ให้ตรวจจริง').toBeGreaterThan(10);

    const bad = rows.filter((r) => r.rolsuper || r.rolbypassrls)
      .map((r) => `${r.fn} เป็นของ ${r.owner}`);
    expect(bad, 'ฟังก์ชันพวกนี้จะข้าม RLS ได้ ซึ่งต่างจากเครื่องจริง').toEqual([]);
  });

  it('ทุกตารางและวิวก็เป็นของ role เดียวกัน', async () => {
    const { rows } = await admin.query(`
      select c.relname, pg_get_userbyid(c.relowner) as owner
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'auth', 'ops') and c.relkind in ('r', 'v')
       order by c.relname`);

    const others = rows.filter((r) => r.owner !== TEST_OWNER)
      .map((r) => `${r.relname} เป็นของ ${r.owner}`);
    expect(others, 'วิวประเมินสิทธิ์ด้วยเจ้าของวิว เจ้าของที่ต่างกันทำให้ผลต่างกัน')
      .toEqual([]);
  });

  /**
   * ไล่จากไฟล์จริง — เทสต์ใหม่ที่สร้างสคีมาเองโดยไม่ผ่าน freshSchema()
   * จะทำให้ฟังก์ชันเป็นของ superuser อีก ซึ่งเป็นวิธีที่บั๊กเดิมหลุดมาได้
   */
  it('ไม่มีไฟล์เทสต์ไหนรันไฟล์สคีมาเอง', () => {
    const dirs = [join(ROOT, 'apps/web/test'), join(ROOT, 'packages/importer/test')];
    const bad: string[] = [];

    for (const dir of dirs) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.test.ts')) continue;
        const src = readFileSync(join(dir, name), 'utf8');

        /* ยกเว้นสองไฟล์ที่สร้างฐานข้อมูลของตัวเองเพื่อทดสอบตัวรันไมเกรชันโดยเฉพาะ
           ทั้งคู่ไม่ได้ทดสอบพฤติกรรมที่ขึ้นกับ RLS */
        if (name === 'migrations.test.ts' || name === 'migrate-runner.test.ts') continue;
        /* ไฟล์นี้สร้างฐานที่เจ้าของเป็น role ธรรมดาขึ้นมาเองอยู่แล้ว */
        if (name === 'auth-managed-db.test.ts') continue;

        /* จับเฉพาะตอน **รัน** ไฟล์สคีมา ไม่ใช่ตอนอ่านมาตรวจข้อความในไฟล์
           (perms-db.test.ts อ่าน 007_perms.sql มาดูว่าเขียนถูกไหม ซึ่งไม่เกี่ยวกัน) */
        if (/query\(\s*readFileSync\([^)]*db[/'`,\s]+0?0\d/.test(src)
            || /query\(readFileSync\(SCHEMA/.test(src)) {
          bad.push(name);
        }
      }
    }
    expect(bad, 'ให้ใช้ freshSchema() จาก tools/test-schema.mjs แทน').toEqual([]);
  });
});
