/**
 * ตั้งค่าพนักงาน — โอนสิทธิ์เจ้าของ · ลบพนักงาน · ตำแหน่งงาน · เจ้าของตั้งรหัสผ่านให้
 * (ผู้ใช้แจ้ง 19 ก.ย. 2569 — ปุ่ม "ตั้งเป็นเจ้าของ" ถูกเผลอกดจนกลายเป็นเจ้าของกันหมด)
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { deleteStaffWith, setStaffPasswordWith, transferOwnershipWith } from '../src/lib/staff-admin';
import { verifyPassword } from '../src/lib/password';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ตั้งค่าพนักงาน', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let ownerId: string;
  let staffId: string;

  const STAFF_PERMS = { menus: { income: true, stock: true } };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`do $$ begin
      if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
    end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ตั้งค่าพนักงาน') returning id`)).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    await admin.query(`delete from auth.sessions where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from users where tenant_id = $1`, [tenantId]);
    ownerId = (await admin.query(
      `insert into users (tenant_id, code, name, email, role, perms, job_title)
       values ($1,'U01','เจ้าของอู่','owner@example.com','owner',
               '{"menus":{"customer":true,"income":true,"expense":true,"stock":true,"finance":true,"settings":true}}'::jsonb,
               'เจ้าของกิจการ') returning id`, [tenantId])).rows[0].id;
    staffId = (await admin.query(
      `insert into users (tenant_id, code, name, email, role, perms, job_title)
       values ($1,'U02','ช่างเอ','a@example.com','staff',$2::jsonb,'ช่างหัวหน้า') returning id`,
      [tenantId, JSON.stringify(STAFF_PERMS)])).rows[0].id;
  });

  const roleOf = async (id: string) =>
    (await admin.query(`select role::text as r from users where id = $1`, [id])).rows[0]?.r ?? null;

  describe('โอนสิทธิ์เจ้าของกิจการ', () => {
    it('ตั้งคนใหม่เป็นเจ้าของแล้วคนเก่าเป็นพนักงาน — เหลือเจ้าของคนเดียวเสมอ', async () => {
      await transferOwnershipWith(app, staffId);

      expect(await roleOf(staffId)).toBe('owner');
      expect(await roleOf(ownerId), 'เจ้าของคนเก่าลดเป็นพนักงาน').toBe('staff');
      const { rows } = await admin.query(
        `select count(*)::int as n from users where tenant_id = $1 and role = 'owner'`, [tenantId]);
      expect(rows[0].n).toBe(1);
    });

    it('เจ้าของคนเดิมยังเข้าเมนูเดิมได้ — เสียแค่ตำแหน่ง ไม่ใช่เสียสิทธิ์ทั้งหมด', async () => {
      await transferOwnershipWith(app, staffId);
      const { rows } = await admin.query(`select perms from users where id = $1`, [ownerId]);
      expect(rows[0].perms.menus.settings, 'ยังเข้าหน้าตั้งค่าร้านได้').toBe(true);
    });

    it('คนใหม่ได้สิทธิ์ครบทุกเมนู', async () => {
      await transferOwnershipWith(app, staffId);
      const { rows } = await admin.query(`select perms from users where id = $1`, [staffId]);
      expect(rows[0].perms.menus).toMatchObject({ settings: true, finance: true, expense: true });
    });

    it('โอนให้คนที่ปิดใช้งานอยู่ไม่ได้ — อู่จะไม่มีเจ้าของที่เข้าระบบได้', async () => {
      await admin.query(`update users set active = false where id = $1`, [staffId]);
      await expect(transferOwnershipWith(app, staffId)).rejects.toThrow(/ปิดใช้งาน/);
      expect(await roleOf(ownerId), 'ของเดิมไม่ถูกแตะ').toBe('owner');
    });

    it('โอนให้คนที่เป็นเจ้าของอยู่แล้ว ไม่ทำให้อู่ไม่มีเจ้าของ', async () => {
      await transferOwnershipWith(app, ownerId);
      expect(await roleOf(ownerId)).toBe('owner');
      const { rows } = await admin.query(
        `select count(*)::int as n from users where tenant_id = $1 and role = 'owner'`, [tenantId]);
      expect(rows[0].n).toBe(1);
    });
  });

  describe('ลบพนักงาน', () => {
    it('ลบแล้วแถวหายจริง และ session ของคนนั้นถูกตัด', async () => {
      await admin.query(
        `insert into auth.sessions (token_hash, user_id, tenant_id, expires_at)
         values (decode('aa','hex'), $1, $2, now() + interval '1 day')`, [staffId, tenantId]);

      await deleteStaffWith(app, staffId, ownerId);

      const left = await admin.query(`select count(*)::int as n from users where id = $1`, [staffId]);
      expect(left.rows[0].n).toBe(0);
      const s = await admin.query(`select count(*)::int as n from auth.sessions where user_id = $1`, [staffId]);
      expect(s.rows[0].n).toBe(0);
    });

    it('ประวัติการแก้เอกสารยังเก็บชื่อคนทำไว้ และเอกสารไม่หายตามไปด้วย', async () => {
      const doc = (await admin.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode,
                                subtotal, net_amount, grand_total, payable, created_by)
         values ($1,'RC','RC-DEL-1',current_date,'issued','ลูกค้า','none',100,100,100,100,$2) returning id`,
        [tenantId, staffId])).rows[0].id;
      /* ทริกเกอร์เขียนแถวประวัติของตัวเองไปแล้วตอน insert เอกสาร — เติมแถวที่ผูกกับช่างเอไว้ด้วย */
      const edit = (await admin.query(
        `insert into doc_edits (tenant_id, document_id, user_id, user_name, action)
         values ($1,$2,$3,'ช่างเอ','update') returning id`, [tenantId, doc, staffId])).rows[0].id;

      await deleteStaffWith(app, staffId, ownerId);

      const e = await admin.query(`select user_id, user_name from doc_edits where id = $1`, [edit]);
      expect(e.rows[0].user_name, 'ชื่อในประวัติยังอยู่').toBe('ช่างเอ');
      expect(e.rows[0].user_id, 'ตัวเชื่อมกับบัญชีที่ถูกลบกลายเป็นว่าง').toBeNull();

      const d = await admin.query(`select created_by from documents where id = $1`, [doc]);
      expect(d.rows[0].created_by).toBeNull();
    });

    it('ลบตัวเองไม่ได้ · ลบเจ้าของกิจการไม่ได้', async () => {
      await expect(deleteStaffWith(app, ownerId, ownerId)).rejects.toThrow(/ตัวเอง/);
      await admin.query(`update users set role = 'owner' where id = $1`, [staffId]);
      await expect(deleteStaffWith(app, staffId, ownerId)).rejects.toThrow(/เจ้าของกิจการ/);
      expect(await roleOf(staffId)).toBe('owner');
    });
  });

  describe('เจ้าของตั้งรหัสผ่านให้พนักงาน', () => {
    it('ตั้งแล้วพนักงานใช้รหัสนั้นได้ทันที', async () => {
      await setStaffPasswordWith(app, staffId, 'ChangMai-2569!');
      const { rows } = await admin.query(`select password_hash from users where id = $1`, [staffId]);
      expect(await verifyPassword('ChangMai-2569!', rows[0].password_hash)).toBe(true);
      expect(await verifyPassword('รหัสอื่น-2569!', rows[0].password_hash)).toBe(false);
    });

    it('เครื่องที่เคยเข้าไว้ถูกไล่ออก และลิงก์ตั้งรหัสที่ค้างอยู่ใช้ไม่ได้อีก', async () => {
      await admin.query(
        `insert into auth.sessions (token_hash, user_id, tenant_id, expires_at)
         values (decode('bb','hex'), $1, $2, now() + interval '1 day')`, [staffId, tenantId]);
      await admin.query(
        `insert into auth.setup_tokens (token_hash, user_id, purpose, expires_at)
         values (decode('cc','hex'), $1, 'initial', now() + interval '7 days')`, [staffId]);

      await setStaffPasswordWith(app, staffId, 'ChangMai-2569!');

      const s = await admin.query(`select count(*)::int as n from auth.sessions where user_id = $1`, [staffId]);
      expect(s.rows[0].n, 'session เดิมต้องถูกไล่ออก').toBe(0);
      const t = await admin.query(`select count(*)::int as n from auth.setup_tokens where user_id = $1`, [staffId]);
      expect(t.rows[0].n, 'ลิงก์ที่ยังไม่ได้ใช้ต้องถูกลบ ไม่งั้นมีสองทางเข้า').toBe(0);
    });

    it('รหัสที่อ่อนเกินเกณฑ์ถูกปฏิเสธ และไม่ไปแตะรหัสเดิม', async () => {
      await setStaffPasswordWith(app, staffId, 'ChangMai-2569!');
      await expect(setStaffPasswordWith(app, staffId, 'สั้นไป')).rejects.toThrow(/อย่างน้อย 10/);
      const { rows } = await admin.query(`select password_hash from users where id = $1`, [staffId]);
      expect(await verifyPassword('ChangMai-2569!', rows[0].password_hash), 'รหัสเดิมยังใช้ได้').toBe(true);
    });

    it('ตั้งให้คนที่ถูกล็อกเพราะใส่รหัสผิดหลายครั้ง แล้วล็อกถูกปลด', async () => {
      await admin.query(
        `update users set failed_attempts = 5, locked_until = now() + interval '1 hour' where id = $1`, [staffId]);
      await setStaffPasswordWith(app, staffId, 'ChangMai-2569!');
      const { rows } = await admin.query(
        `select failed_attempts, locked_until from users where id = $1`, [staffId]);
      expect(Number(rows[0].failed_attempts)).toBe(0);
      expect(rows[0].locked_until).toBeNull();
    });
  });
});
