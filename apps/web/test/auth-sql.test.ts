/**
 * ฟังก์ชันยืนยันตัวตนในฐานข้อมูล — ทดสอบด้วย role ของแอปจริง ไม่ใช่ superuser
 *
 * ประเด็นที่ต้องพิสูจน์: role ของแอปต้องแตะตารางในสคีมา auth ตรง ๆ ไม่ได้เลย
 * ทำได้แค่เรียกฟังก์ชันที่เขียนไว้ให้ ถ้าข้อนี้พัง การแยกข้อมูลระหว่างอู่ก็ไม่มีความหมาย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

const hashToken = (t: string) => createHash('sha256').update(t).digest();

describe.skipIf(!DB_URL)('ฟังก์ชันยืนยันตัวตนในฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    await admin.query(`
      -- role อยู่ระดับคลัสเตอร์ จึงค้างข้ามการรันเทสต์และอาจถูกใช้โดยฐานข้อมูลอื่นอยู่
      -- ล้างเฉพาะสิทธิ์ในฐานข้อมูลนี้ แล้วให้ app-role.sql สร้างกลับ (รันซ้ำได้)
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    tenantId = (await admin.query(
      `insert into tenants (name, vat_rate) values ('อู่ทดสอบ', 7) returning id`,
    )).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('role ของแอปแตะตารางในสคีมา auth ตรง ๆ ไม่ได้', async () => {
    await expect(app.query('select * from auth.sessions')).rejects.toThrow(/permission denied|ไม่มีสิทธิ/i);
    await expect(app.query('select * from auth.setup_tokens')).rejects.toThrow(/permission denied|ไม่มีสิทธิ/i);
    await expect(app.query(`insert into auth.sessions (token_hash, user_id, tenant_id, expires_at)
                            values ('\\x00', gen_random_uuid(), gen_random_uuid(), now())`))
      .rejects.toThrow(/permission denied|ไม่มีสิทธิ/i);
  });

  it('สร้างบัญชีเจ้าของกิจการได้ครั้งเดียวต่ออู่', async () => {
    const first = await app.query(`select auth.create_owner($1, $2, $3) as id`,
      [tenantId, 'owner@test.local', 'เจ้าของ']);
    ownerId = first.rows[0].id;
    expect(ownerId).toBeTruthy();

    const second = await app.query(`select auth.create_owner($1, $2, $3) as id`,
      [tenantId, 'other@test.local', 'อีกคน']);
    expect(second.rows[0].id).toBeNull();
  });

  it('เจ้าของกิจการได้สิทธิ์ครบทุกเมนู', async () => {
    const { rows } = await admin.query(`select role, perms from users where id = $1`, [ownerId]);
    expect(rows[0].role).toBe('owner');
    expect(rows[0].perms.sort()).toEqual(
      ['customer', 'expense', 'finance', 'income', 'settings', 'stock'],
    );
  });

  it('หาผู้ใช้จากอีเมลได้แม้ยังไม่รู้ว่าอยู่อู่ไหน (ข้อจำกัดของ RLS)', async () => {
    // อ่าน users ตรง ๆ ด้วย role ของแอปโดยไม่ตั้ง tenant → ไม่เจอ ซึ่งถูกต้อง
    const direct = await app.query(`select count(*)::int as c from users`);
    expect(direct.rows[0].c).toBe(0);

    // แต่ฟังก์ชันสำหรับล็อกอินหาเจอ
    const { rows } = await app.query(`select * from auth.find_user_for_signin($1)`, ['owner@test.local']);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantId);
    expect(rows[0].tenant_name).toBe('อู่ทดสอบ');
  });

  it('อีเมลไม่ตรงตัวพิมพ์ใหญ่เล็กก็หาเจอ', async () => {
    const { rows } = await app.query(`select * from auth.find_user_for_signin($1)`, ['OWNER@Test.Local']);
    expect(rows).toHaveLength(1);
  });

  it('กรอกรหัสผ่านผิดครบ 5 ครั้งแล้วถูกล็อก 15 นาที', async () => {
    for (let i = 0; i < 4; i++) {
      await app.query(`select auth.record_failed_signin($1)`, [ownerId]);
    }
    let u = await admin.query(`select failed_attempts, locked_until from users where id = $1`, [ownerId]);
    expect(u.rows[0].failed_attempts).toBe(4);
    expect(u.rows[0].locked_until).toBeNull();

    await app.query(`select auth.record_failed_signin($1)`, [ownerId]);
    u = await admin.query(`select failed_attempts, locked_until from users where id = $1`, [ownerId]);
    expect(u.rows[0].failed_attempts).toBe(5);
    expect(new Date(u.rows[0].locked_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('ล็อกอินสำเร็จล้างตัวนับและปลดล็อก', async () => {
    const token = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() + interval '14 days', 'test')`,
      [ownerId, hashToken(token)]);

    const u = await admin.query(
      `select failed_attempts, locked_until, last_login_at from users where id = $1`, [ownerId]);
    expect(u.rows[0].failed_attempts).toBe(0);
    expect(u.rows[0].locked_until).toBeNull();
    expect(u.rows[0].last_login_at).toBeTruthy();

    const s = await app.query(`select * from auth.load_session($1)`, [hashToken(token)]);
    expect(s.rows[0].user_id).toBe(ownerId);
    expect(s.rows[0].tenant_id).toBe(tenantId);
  });

  it('ฐานข้อมูลเก็บแค่ hash ของ token ไม่เก็บตัว token', async () => {
    const token = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() + interval '1 day')`,
      [ownerId, hashToken(token)]);

    const { rows } = await admin.query(
      `select encode(token_hash, 'hex') as h from auth.sessions where token_hash = $1`,
      [hashToken(token)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].h).not.toContain(token);
    expect(rows[0].h).toHaveLength(64);   // sha256 = 32 ไบต์
  });

  it('session ที่หมดอายุใช้ไม่ได้', async () => {
    const token = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() - interval '1 second')`,
      [ownerId, hashToken(token)]);
    const { rows } = await app.query(`select * from auth.load_session($1)`, [hashToken(token)]);
    expect(rows).toHaveLength(0);
  });

  it('ผู้ใช้ที่ถูกปิดการใช้งาน session ใช้ไม่ได้ทันที', async () => {
    const token = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() + interval '1 day')`,
      [ownerId, hashToken(token)]);
    expect((await app.query(`select * from auth.load_session($1)`, [hashToken(token)])).rows).toHaveLength(1);

    await admin.query(`update users set active = false where id = $1`, [ownerId]);
    expect((await app.query(`select * from auth.load_session($1)`, [hashToken(token)])).rows).toHaveLength(0);

    await admin.query(`update users set active = true where id = $1`, [ownerId]);
  });

  it('ลิงก์ตั้งรหัสผ่านใช้ได้ครั้งเดียว และไล่ session เดิมออกทั้งหมด', async () => {
    const live = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() + interval '1 day')`,
      [ownerId, hashToken(live)]);

    const setup = randomBytes(32).toString('base64url');
    await app.query(`select auth.issue_setup_token($1, $2, 'initial', now() + interval '7 days')`,
      [ownerId, hashToken(setup)]);

    const peek = await app.query(`select * from auth.peek_setup_token($1)`, [hashToken(setup)]);
    expect(peek.rows[0].email).toBe('owner@test.local');
    expect(peek.rows[0].purpose).toBe('initial');

    const used = await app.query(`select auth.consume_setup_token($1, $2) as id`,
      [hashToken(setup), 'scrypt$1$2$3$aa$bb']);
    expect(used.rows[0].id).toBe(ownerId);

    // ครั้งที่สองใช้ไม่ได้
    const again = await app.query(`select auth.consume_setup_token($1, $2) as id`,
      [hashToken(setup), 'scrypt$9$9$9$cc$dd']);
    expect(again.rows[0].id).toBeNull();

    // session เดิมถูกไล่ออก
    expect((await app.query(`select * from auth.load_session($1)`, [hashToken(live)])).rows).toHaveLength(0);

    // และรหัสผ่านถูกเปลี่ยนจริง
    const u = await admin.query(`select password_hash from users where id = $1`, [ownerId]);
    expect(u.rows[0].password_hash).toBe('scrypt$1$2$3$aa$bb');
  });

  it('ออกลิงก์ใหม่ทำให้ลิงก์เก่าที่ยังไม่ถูกใช้ใช้ไม่ได้', async () => {
    const first = randomBytes(32).toString('base64url');
    await app.query(`select auth.issue_setup_token($1, $2, 'reset', now() + interval '7 days')`,
      [ownerId, hashToken(first)]);
    const second = randomBytes(32).toString('base64url');
    await app.query(`select auth.issue_setup_token($1, $2, 'reset', now() + interval '7 days')`,
      [ownerId, hashToken(second)]);

    expect((await app.query(`select * from auth.peek_setup_token($1)`, [hashToken(first)])).rows).toHaveLength(0);
    expect((await app.query(`select * from auth.peek_setup_token($1)`, [hashToken(second)])).rows).toHaveLength(1);
  });

  it('อีเมลซ้ำข้ามอู่ไม่ได้ — ไม่งั้นตอนล็อกอินไม่รู้ว่าหมายถึงใคร', async () => {
    const other = (await admin.query(
      `insert into tenants (name) values ('อู่อื่น') returning id`)).rows[0].id;

    await expect(
      admin.query(`insert into users (tenant_id, code, name, email, role)
                   values ($1, 'OWNER', 'ซ้ำ', 'owner@test.local', 'owner')`, [other]),
    ).rejects.toThrow(/duplicate key|users_email_global_uidx/i);
  });

  it('ออกจากระบบลบเฉพาะ session ของเครื่องนั้น', async () => {
    const a = randomBytes(32).toString('base64url');
    const b = randomBytes(32).toString('base64url');
    await app.query(`select auth.create_session($1, $2, now() + interval '1 day')`, [ownerId, hashToken(a)]);
    await app.query(`select auth.create_session($1, $2, now() + interval '1 day')`, [ownerId, hashToken(b)]);

    await app.query(`select auth.delete_session($1)`, [hashToken(a)]);

    expect((await app.query(`select * from auth.load_session($1)`, [hashToken(a)])).rows).toHaveLength(0);
    expect((await app.query(`select * from auth.load_session($1)`, [hashToken(b)])).rows).toHaveLength(1);
  });
});
