/**
 * ยืนยันตัวตนต้องทำงานบนฐานที่ **เจ้าของไม่ใช่ superuser**
 *
 * นี่คือความต่างที่ทำให้ระบบพังบนเครื่องจริงทั้งที่เครื่องพัฒนาเขียวหมด —
 * ฐานทดสอบทั่วไปมีเจ้าของเป็น postgres ซึ่งเป็น superuser และ **superuser
 * ข้าม Row Level Security ได้เอง** ฟังก์ชัน SECURITY DEFINER จึงทำงานได้
 * ส่วนบริการ Postgres แบบ managed ทุกเจ้าให้ role ที่ไม่ใช่ superuser มาเป็นเจ้าของ
 * `force row level security` จึงมีผลกับฟังก์ชันพวกนั้นด้วย แล้วทุกอย่างที่ต้อง
 * มองข้ามอู่ก็คืนแถวว่างเงียบ ๆ
 *
 * ผลจริงที่เกิดขึ้น — เจ้าของอู่ล็อกอินไม่ได้เลย และลิงก์ตั้งรหัสผ่านขึ้นว่า
 * "ลิงก์ใช้ไม่ได้แล้ว" ตั้งแต่วินาทีแรกที่ออกลิงก์
 *
 * เทสต์นี้จึงสร้างฐานข้อมูลที่มีเจ้าของเป็น role ธรรมดาขึ้นมาใหม่ทั้งใบ
 * ให้เหมือนของจริงที่สุด
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from '../../../tools/migrate.impl.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

const DB = 'dgl_managed_test';
const OWNER = 'dgl_managed_owner';
const APP = 'dgl_managed_app';
const PW = 'managedpass';

const sha = (b: Buffer) => createHash('sha256').update(b).digest();
const quiet = () => {};

describe.skipIf(!DB_URL)('ฐานที่เจ้าของไม่ใช่ superuser', () => {
  let root: pg.Client;
  let owner: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    root = new pg.Client({ connectionString: DB_URL });
    await root.connect();

    await root.query(`drop database if exists ${DB}`);
    await root.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = '${APP}') then
          execute 'drop role ${APP}';
        end if;
        if not exists (select 1 from pg_roles where rolname = '${OWNER}') then
          execute 'create role ${OWNER} login password ''${PW}'' createrole';
        end if;
      end $$;
      -- ต้องเป็นสมาชิกถึงจะสร้างฐานข้อมูลที่มี role นี้เป็นเจ้าของได้
      -- (สิทธิ์สร้าง role อย่างเดียวไม่พอ ถ้าคนรันไม่ใช่ superuser)
      grant ${OWNER} to current_user with admin option;
    `);
    await root.query(`create database ${DB} owner ${OWNER}`);

    const url = (user: string) => {
      const u = new URL(DB_URL!);
      u.username = user;
      u.password = PW;
      u.pathname = `/${DB}`;
      return u.toString();
    };

    owner = new pg.Client({ connectionString: url(OWNER) });
    await owner.connect();

    /* ยืนยันว่าเจ้าของไม่ใช่ superuser จริง ไม่งั้นเทสต์นี้ไม่ได้ทดสอบอะไรเลย */
    const who = await owner.query(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
    expect(who.rows[0], 'เจ้าของต้องเป็น role ธรรมดา').toMatchObject({
      rolsuper: false, rolbypassrls: false,
    });

    /* รันไมเกรชันในนามเจ้าของ เหมือน preDeployCommand ของเครื่องจริง */
    await migrate(owner, { mode: 'fresh', log: quiet });

    /* ตั้ง role ของแอปแบบเดียวกับ tools/setup-db.mjs ทำบนบริการแบบ managed */
    await owner.query(`create role ${APP} login password '${PW}'`);
    await owner.query(`grant usage on schema public to ${APP}`);
    await owner.query(
      `grant select, insert, update, delete on all tables in schema public to ${APP}`);
    await owner.query(`grant execute on all functions in schema public to ${APP}`);
    await owner.query(`grant usage on schema auth to ${APP}`);
    await owner.query(`grant execute on all functions in schema auth to ${APP}`);
    await owner.query(`select ops.grant_app('${APP}')`);

    app = new pg.Client({ connectionString: url(APP) });
    await app.connect();
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await root?.query(`drop database if exists ${DB}`).catch(() => {});
    await root?.query(`drop role if exists ${APP}`).catch(() => {});
    await root?.end();
  });

  /** เปิดอู่หนึ่งอู่ผ่านคอนโซล แล้วคืนโทเคนตั้งรหัสผ่านที่ได้ */
  async function openShop(email: string) {
    const op = await owner.query(
      `insert into ops.operators (email, password_hash)
       values ($1, 'x') returning id`, [`op-${email}`]);
    const session = sha(randomBytes(32));
    await owner.query(
      `select ops.create_session($1, $2, now() + interval '1 day', null)`,
      [op.rows[0].id, session]);

    const token = randomBytes(32);
    const hash = sha(token);
    await app.query(
      `select ops.open_shop($1,'อู่ทดสอบ','081',$2,'สมชาย',$3, now() + interval '7 days')`,
      [session, email, hash]);
    return hash;
  }

  it('เปิดอู่ผ่านคอนโซลได้', async () => {
    await openShop('a@example.com');
    const { rows } = await owner.query(
      `select count(*)::int as n from users where email = 'a@example.com'`);
    expect(rows[0].n).toBe(1);
  });

  /** ข้อที่พังจริงบนเครื่องจริง */
  it('ลิงก์ตั้งรหัสผ่านเปิดได้ ทั้งที่ยังไม่ได้ล็อกอิน', async () => {
    const hash = await openShop('b@example.com');
    const { rows } = await app.query(
      'select * from auth.peek_setup_token($1)', [hash]);
    expect(rows, 'ตอนเปิดลิงก์ยังไม่มี tenant — ฟังก์ชันต้องมองข้ามอู่ได้')
      .toHaveLength(1);
    expect(String(rows[0].email)).toBe('b@example.com');
  });

  it('เจ้าของอู่ล็อกอินได้ — หาผู้ใช้จากอีเมลข้ามทุกอู่', async () => {
    await openShop('c@example.com');
    const { rows } = await app.query(
      `select * from auth.find_user_for_signin('c@example.com')`);
    expect(rows, 'ตอนล็อกอินยังไม่รู้ว่าเป็นอู่ไหน — ฟังก์ชันต้องมองข้ามอู่ได้')
      .toHaveLength(1);
  });

  it('ตั้งรหัสผ่านผ่านลิงก์ได้จริง', async () => {
    const hash = await openShop('d@example.com');
    const { rows } = await app.query(
      `select auth.consume_setup_token($1, 'scrypt$1$1$1$AA==$AA==') as id`, [hash]);
    expect(rows[0].id).not.toBeNull();

    const after = await owner.query(
      `select password_hash is not null as ok from users where email = 'd@example.com'`);
    expect(after.rows[0].ok).toBe(true);
  });

  /** และการปิด force ต้องไม่ทำให้ role ของแอปอ่านข้ามอู่ได้ */
  it('role ของแอปยังอ่านข้ามอู่ไม่ได้ ทั้ง users และ tenants', async () => {
    await openShop('e@example.com');
    await openShop('f@example.com');

    const all = await owner.query('select count(*)::int as n from tenants');
    expect(all.rows[0].n, 'ต้องมีหลายอู่ให้ทดสอบจริง').toBeGreaterThan(1);

    /* ไม่ตั้ง tenant = ต้องไม่เห็นอะไรเลย */
    for (const t of ['tenants', 'users']) {
      const { rows } = await app.query(`select count(*)::int as n from ${t}`);
      expect(rows[0].n, `${t} รั่วให้ role ของแอป`).toBe(0);
    }

    /* ตั้ง tenant หนึ่ง = เห็นเฉพาะของอู่นั้น */
    const one = await owner.query('select id from tenants order by name limit 1');
    await app.query('begin');
    try {
      await app.query(`select set_config('app.tenant_id', $1, true)`, [one.rows[0].id]);
      const seen = await app.query('select count(*)::int as n from tenants');
      expect(seen.rows[0].n).toBe(1);
    } finally {
      await app.query('rollback');
    }
  });

  it('ตารางข้อมูลธุรกิจยังคง force ไว้เหมือนเดิม', async () => {
    const { rows } = await owner.query(`
      select c.relname as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relrowsecurity and not c.relforcerowsecurity
       order by c.relname`);
    expect(rows.map((r) => r.t), 'ปิด force ได้เฉพาะสองตารางที่ auth ต้องใช้')
      .toEqual(['tenants', 'users']);
  });
});
