/**
 * สมัครใช้บริการออนไลน์ + แนบสลิป — ฝั่งฐานข้อมูล (ไมเกรชัน 038)
 *
 * เรียกฟังก์ชันในนาม role ของแอปจริง (dgl_app) ไม่ผ่านโค้ดแอป — ด่านต้องอยู่ในฐานข้อมูล
 * แบบเดียวกับ ops-console.test.ts
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema, grantAppRole } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const DB_URL = process.env.DATABASE_URL;
const sha = (b: Buffer) => createHash('sha256').update(b).digest();

/** JPEG เล็กที่สุดที่หัวไฟล์ถูก — ฐานข้อมูลไม่ได้ถอดรูป แค่เก็บไบต์ */
const SLIP = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const SIGNUP = (over: Record<string, unknown> = {}) => ({
  ctype: 'juristic',
  vat_registered: true,
  bill_name: 'บริษัท แสงทองแอร์ จำกัด',
  tax_id: '0105550000015',
  branch_no: '00000',
  bill_addr: { no: '12', sub: 'ในเมือง', dist: 'เมืองขอนแก่น', prov: 'ขอนแก่น', zip: '40000' },
  bill_addr_text: 'เลขที่ 12 ตำบลในเมือง อำเภอเมืองขอนแก่น จังหวัดขอนแก่น 40000',
  bill_email: 'acc@saengthong.example',
  wht: true,
  shop_name: 'แสงทองแอร์',
  shop_province: 'ขอนแก่น',
  contact_name: 'สมชาย ใจดี',
  contact_pos: 'เจ้าของร้าน',
  contact_tel: '0812345678',
  owner_email: 'owner@saengthong.example',
  amount_paid: '3744.00',
  paid_at: '2026-11-25T10:12:00+07:00',
  ...over,
});

describe.skipIf(!DB_URL)('ใบสมัครที่แนบสลิป', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let opId: string;
  let session: Buffer;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, [
      'db/001_init.sql', 'db/002_auth.sql', 'db/008_ops.sql', 'db/011_ops_console.sql',
      'db/013_ops_grants.sql', 'db/031_ops_owner_scope.sql', 'db/035_error_dedup.sql',
      'db/037_usage_activity.sql', 'db/038_payment_requests.sql',
      'db/043_signup_only_requests.sql',
    ]);
    await grantAppRole(admin);

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
  }, 90_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from ops.payment_requests');
    await admin.query('delete from ops.audit');
    await admin.query('delete from ops.operators');
    await admin.query('delete from tenants');

    const r = await admin.query(
      `insert into ops.operators (email, name, password_hash)
       values ('ops@example.com', 'สมศรี', 'x') returning id`);
    opId = r.rows[0].id;
    session = sha(randomBytes(32));
    await admin.query(
      `select ops.create_session($1, $2, now() + interval '1 day', null)`, [opId, session]);
  });

  const submit = (over: Record<string, unknown> = {}, ip = '203.0.113.9') =>
    app.query(
      `select ops.submit_signup($1, $2, 'image/jpeg', $3, null, null, $4) as id`,
      [JSON.stringify(SIGNUP(over)), 3744, SLIP, ip],
    ).then((r) => r.rows[0].id as string);

  const decide = (id: string, approve: boolean, reason: string | null = null, s = session) =>
    app.query(
      `select * from ops.decide_request($1, $2, $3, $4, $5, now() + interval '7 days')`,
      [s, id, approve, reason, approve ? sha(randomBytes(32)) : null],
    );

  it('ส่งได้โดยไม่ต้องล็อกอิน แต่แอปอ่านตารางตรงไม่ได้', async () => {
    const id = await submit();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await expect(app.query('select * from ops.payment_requests'))
      .rejects.toThrow(/permission denied/);
    await expect(app.query('select ops.prune_requests(0)'))
      .rejects.toThrow(/permission denied/);
    await expect(app.query(
      `select ops.open_shop_core($1, 'อู่', '', 'x@example.com', '', $2, now())`,
      [opId, sha(randomBytes(32))],
    )).rejects.toThrow(/permission denied/);
  });

  it('อ่านรายการ รายละเอียด และรูปสลิป ต้องมี session', async () => {
    const id = await submit();
    const bad = sha(randomBytes(32));

    for (const [sql, params] of [
      ['select * from ops.list_requests($1, null)', [bad]],
      ['select * from ops.get_request($1, $2)', [bad, id]],
      [`select * from ops.get_request_file($1, $2, 'slip')`, [bad, id]],
      ['select * from ops.decide_request($1, $2, false, $3, null, null)', [bad, id, 'x']],
    ] as const) {
      await expect(app.query(sql, [...params]), sql).rejects.toThrow(/ไม่มีสิทธิ์ใช้คอนโซล/);
    }

    const list = await app.query('select * from ops.list_requests($1, null)', [session]);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ status: 'pending', shop_name: 'แสงทองแอร์' });

    const file = await app.query(`select * from ops.get_request_file($1, $2, 'slip')`, [session, id]);
    expect(file.rows[0].mime).toBe('image/jpeg');
    expect(Buffer.compare(file.rows[0].bytes, SLIP)).toBe(0);
  });

  it('อีเมลซ้ำกับใบที่รอตรวจ หรือซ้ำกับผู้ใช้เดิม ส่งไม่ได้', async () => {
    await submit();
    await expect(submit()).rejects.toThrow(/รอตรวจอยู่แล้ว/);

    const id2 = await submit({ owner_email: 'second@example.com' });
    await decide(id2, true);
    await expect(submit({ owner_email: 'SECOND@example.com' })).rejects.toThrow(/ถูกใช้เข้าสู่ระบบอยู่แล้ว/);
  });

  it('รอตรวจเกิน 30 ใบ รับใบใหม่ไม่ได้', async () => {
    for (let i = 0; i < 30; i++) await submit({ owner_email: `o${i}@example.com` });
    await expect(submit({ owner_email: 'o30@example.com' })).rejects.toThrow(/รอตรวจจำนวนมาก/);
  });

  it('อนุมัติ — เปิดอู่ ตั้งค่าร้านตามใบสมัคร ลิขสิทธิ์ 1 ปี และบันทึกว่าใครอนุมัติ', async () => {
    const id = await submit({ vat_registered: false, branch_no: '' });
    const { rows } = await decide(id, true);
    expect(rows).toHaveLength(1);
    const tenantId = rows[0].tenant_id as string;
    expect(rows[0].owner_email).toBe('owner@saengthong.example');

    const shop = await admin.query(
      'select name, tel, vat_registered, tax_id, addr_text, owner_name from tenants where id = $1',
      [tenantId]);
    expect(shop.rows[0]).toMatchObject({
      name: 'แสงทองแอร์', tel: '0812345678', vat_registered: false,
      tax_id: '0105550000015', owner_name: 'สมชาย ใจดี',
    });
    expect(shop.rows[0].addr_text).toContain('ขอนแก่น');

    const sub = await admin.query(
      `select started_on, expires_on, amount, expires_on - started_on as days
         from subscriptions where tenant_id = $1`, [tenantId]);
    expect(sub.rows).toHaveLength(1);
    expect(sub.rows[0].days).toBe(365);
    expect(Number(sub.rows[0].amount)).toBe(3744);
    expect(rows[0].expires_on).toBe(sub.rows[0].expires_on);

    const owner = await admin.query(
      `select role, email from users where tenant_id = $1`, [tenantId]);
    expect(owner.rows).toEqual([{ role: 'owner', email: 'owner@saengthong.example' }]);

    const req = await app.query('select * from ops.get_request($1, $2)', [session, id]);
    expect(req.rows[0]).toMatchObject({ status: 'approved', tenant_id: tenantId, decided_by: 'สมศรี' });

    const audit = await admin.query(`select action from ops.audit where action <> 'signin'`);
    expect(audit.rows.map((r) => r.action).sort()).toEqual(['approve_request', 'open_shop']);
  });

  it('อนุมัติซ้ำไม่ได้ — กดสองครั้งต้องได้อู่เดียว', async () => {
    const id = await submit();
    await decide(id, true);
    await expect(decide(id, true)).rejects.toThrow(/อนุมัติไปแล้ว/);
    await expect(decide(id, false, 'สลิปปลอม')).rejects.toThrow(/อนุมัติไปแล้ว/);
    const n = await admin.query('select count(*)::int as n from tenants');
    expect(n.rows[0].n).toBe(1);
  });

  it('อนุมัติพร้อมกันสองคน — ได้อู่เดียว อีกคนเจอว่าอนุมัติไปแล้ว', async () => {
    const id = await submit();
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    const second = new pg.Client({ connectionString: url.toString() });
    await second.connect();
    try {
      const a = app.query('begin').then(() => decide(id, true));
      const results = await Promise.allSettled([
        a.then(async (r) => { await new Promise((res) => setTimeout(res, 300)); await app.query('commit'); return r; }),
        second.query(
          `select * from ops.decide_request($1, $2, true, null, $3, now() + interval '7 days')`,
          [session, id, sha(randomBytes(32))]),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(String(failed.reason)).toMatch(/อนุมัติไปแล้ว/);
    } finally {
      await app.query('rollback').catch(() => {});
      await second.end();
    }
    const n = await admin.query('select count(*)::int as n from tenants');
    expect(n.rows[0].n).toBe(1);
  });

  it('ปฏิเสธต้องมีเหตุผล และไม่เปิดอู่', async () => {
    const id = await submit();
    await expect(decide(id, false, '  ')).rejects.toThrow(/ต้องบอกเหตุผล/);
    await decide(id, false, 'ยังไม่พบยอดเข้าบัญชี');

    const req = await app.query('select status, reject_reason from ops.get_request($1, $2)', [session, id]);
    expect(req.rows[0]).toEqual({ status: 'rejected', reject_reason: 'ยังไม่พบยอดเข้าบัญชี' });
    const n = await admin.query('select count(*)::int as n from tenants');
    expect(n.rows[0].n).toBe(0);

    /* ถูกปฏิเสธแล้วส่งใหม่ด้วยอีเมลเดิมได้ */
    await expect(submit()).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it('เก็บกวาด — ใบที่ปฏิเสธลบทั้งแถว ใบที่อนุมัติเหลือยอดแต่รูปหาย', async () => {
    const rejected = await submit({ owner_email: 'r@example.com' });
    const approved = await submit({ owner_email: 'a@example.com' });
    const pending = await submit({ owner_email: 'p@example.com' });
    await decide(rejected, false, 'ยอดไม่ครบ');
    await decide(approved, true);
    await admin.query(`update ops.payment_requests set decided_at = now() - interval '91 days'
                        where status <> 'pending'`);

    const { rows } = await admin.query('select ops.prune_requests(90) as n');
    expect(rows[0].n).toBe(2);

    const left = await admin.query(
      `select id, status, slip_bytes is null as gone, amount_paid from ops.payment_requests order by status`);
    expect(left.rows.map((r) => [r.id, r.status, r.gone])).toEqual([
      [approved, 'approved', true],
      [pending, 'pending', false],
    ]);
  });

  /* การต่ออายุมีทางเดียวคือ renewal_requests (039) — ตารางนี้ต้องรับแถวต่ออายุไม่ได้แม้แต่จาก superuser
     ไม่งั้นวันหนึ่งคอนโซลจะมีคิวต่ออายุสองคิว และเงินก้อนเดียวถูกอนุมัติได้สองรอบ (043) */
  it('ตารางนี้รับเฉพาะใบสมัคร — แถวต่ออายุแทรกไม่ได้', async () => {
    const insert = (kind: string) => admin.query(
      `insert into ops.payment_requests (kind, amount_due, amount_paid, paid_at, slip_mime)
       values ($1, 3852, 3852, now(), 'image/jpeg')`, [kind]);
    await expect(insert('renewal')).rejects.toThrow(/payment_requests_kind_check/);
    /* ใบสมัครที่ขาดข้อมูลยังถูกเงื่อนไขของ 038 กันอยู่ — 043 ไม่ได้ทำให้เงื่อนไขอื่นหาย */
    await expect(insert('signup')).rejects.toThrow(/payment_requests_signup_complete/);
    await expect(submit()).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ops.open_shop เดิมยังทำงานเหมือนเดิม', async () => {
    const { rows } = await app.query(
      `select ops.open_shop($1, 'อู่ใหม่', '02', 'new@example.com', 'ก', $2, now() + interval '7 days') as id`,
      [session, sha(randomBytes(32))]);
    const shop = await admin.query('select name from tenants where id = $1', [rows[0].id]);
    expect(shop.rows[0].name).toBe('อู่ใหม่');
    const audit = await admin.query(`select operator_id, action from ops.audit where action <> 'signin'`);
    expect(audit.rows).toEqual([{ operator_id: opId, action: 'open_shop' }]);
  });
});
