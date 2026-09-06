/**
 * คอนโซลผู้ให้บริการ — ด่านตรวจสิทธิ์
 *
 * ข้อที่สำคัญที่สุดคือ **ด่านอยู่ในฐานข้อมูล ไม่ใช่ในโค้ดแอป**
 * ทางที่ง่ายกว่าคือให้โค้ดแอปเรียก requireOperator() ก่อนเสมอ ซึ่งแปลว่า
 * ความปลอดภัยทั้งหมดขึ้นอยู่กับว่าไม่มีใครลืมเรียก — เป็นข้อผิดพลาดแบบเดียวกับ
 * ที่รุ่น 6.4 เรียก stampEdit() ด้วยมือทุกจุดแล้วลืมจุดเดียวประวัติหาย
 *
 * เทสต์ในไฟล์นี้จึงเรียกฟังก์ชันตรงจากฐานข้อมูล ไม่ผ่านโค้ดแอปเลย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const APP = resolve(here, '../src/app');
const DB_URL = process.env.DATABASE_URL;

const sha = (b: Buffer) => createHash('sha256').update(b).digest();

/* ------------------------------------------------------------------
   ตรวจจากไฟล์จริง — ไม่ต้องต่อฐานข้อมูล
   ------------------------------------------------------------------ */

function walk(dir: string, hit: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, hit));
    else if (hit(p)) out.push(p);
  }
  return out;
}

describe('หน้าจอของคอนโซล', () => {
  const OPS = join(APP, 'ops');

  it('ทุกหน้าใต้ /ops เรียก requireOperator() — ยกเว้นหน้าที่ต้องเข้าได้ก่อนล็อกอิน', () => {
    /* ยกเว้นได้เฉพาะสามหน้านี้ เพิ่มเข้ารายการต้องมีเหตุผลกำกับเสมอ
         login   หน้าล็อกอินเอง
         setup   ตั้งรหัสผ่านครั้งแรก — ยังไม่มี session ให้ตรวจ ใช้โทเคนแทน
         logout  ออกจากระบบต้องทำได้เสมอ แม้ session พังไปแล้ว */
    const EXEMPT = ['/ops/login/page.tsx', '/ops/setup/[token]/page.tsx', '/ops/logout/route.ts'];

    const pages = walk(OPS, (p) => p.endsWith('page.tsx') || p.endsWith('route.ts'));
    expect(pages.length).toBeGreaterThan(5);

    const missing = pages
      .map((p) => p.slice(APP.length).replace(/\\/g, '/'))
      .filter((rel) => !EXEMPT.includes(rel))
      .filter((rel) => !readFileSync(join(APP, rel), 'utf8').includes('requireOperator('));

    expect(missing, 'หน้าเหล่านี้ยังไม่ได้พาไปหน้าล็อกอิน').toEqual([]);
  });

  it('ทุก action ของคอนโซลเรียก requireOperator()', () => {
    const src = readFileSync(join(OPS, 'actions.ts'), 'utf8');
    const fns = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(fns.length).toBeGreaterThan(4);

    /* ตัดหัวไฟล์ทิ้งแล้วดูว่าแต่ละฟังก์ชันมี requireOperator() อยู่ในตัวมันเอง */
    for (const fn of fns) {
      const start = src.indexOf(`export async function ${fn}`);
      const next = fns
        .map((f) => src.indexOf(`export async function ${f}`))
        .filter((i) => i > start)
        .sort((a, b) => a - b)[0] ?? src.length;
      expect(src.slice(start, next), `${fn} ไม่ได้เรียก requireOperator()`)
        .toContain('requireOperator(');
    }
  });

  it('คุกกี้ของคอนโซลเป็นคนละตัวกับของอู่ และไม่ถูกส่งไปกับหน้าอู่', () => {
    const ops = readFileSync(resolve(here, '../src/lib/ops-auth.ts'), 'utf8');
    const shop = readFileSync(resolve(here, '../src/lib/auth.ts'), 'utf8');

    const nameOf = (s: string) => /const COOKIE = '([^']+)'/.exec(s)?.[1];
    expect(nameOf(ops)).not.toBe(nameOf(shop));
    expect(ops, "path=/ops ทำให้คุกกี้ไม่ถูกส่งไปกับ request ของหน้าอู่เลย")
      .toContain("path: '/ops'");
  });
});

/* ------------------------------------------------------------------
   ฐานข้อมูลจริง
   ------------------------------------------------------------------ */

describe.skipIf(!DB_URL)('ด่านตรวจสิทธิ์ในฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let opId: string;
  let good: Buffer;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query(
      'drop schema if exists ops cascade; drop schema if exists auth cascade; '
      + 'drop schema if exists public cascade; create schema public;');
    for (const f of ['001_init.sql', '002_auth.sql', '008_ops.sql', '011_ops_console.sql']) {
      await admin.query(readFileSync(resolve(ROOT, 'db', f), 'utf8'));
    }
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

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
    await admin.query('delete from ops.audit');
    await admin.query('delete from ops.operators');
    await admin.query('delete from tenants');

    const r = await admin.query(
      `insert into ops.operators (email, name, password_hash)
       values ('ops@example.com', 'ผู้ดูแล', 'x') returning id`);
    opId = r.rows[0].id;

    good = sha(randomBytes(32));
    await admin.query(
      `select ops.create_session($1, $2, now() + interval '1 day', null)`, [opId, good]);
  });

  /** ทุกฟังก์ชันที่รับ session ต้องปฏิเสธเมื่อโทเคนใช้ไม่ได้ */
  const callWithBadToken = async (bad: Buffer) => {
    const t = randomBytes(32);
    const calls: [string, string, unknown[]][] = [
      ['list_shops', 'select * from ops.list_shops($1)', [bad]],
      ['open_shop',
        `select ops.open_shop($1,'อู่','0','a@example.com','ก',$2, now()+interval '7 days')`,
        [bad, t]],
      ['issue_owner_reset',
        `select ops.issue_owner_reset($1, gen_random_uuid(), $2, now()+interval '7 days')`,
        [bad, t]],
      ['record_renewal',
        `select ops.record_renewal($1, gen_random_uuid(), 'p', current_date, current_date + 1, 1, '')`,
        [bad]],
      ['set_max_users', 'select ops.set_max_users($1, gen_random_uuid(), 3)', [bad]],
      ['add_operator',
        `select ops.add_operator($1,'x@example.com','x',$2, now()+interval '7 days')`, [bad, t]],
      ['list_operators', 'select * from ops.list_operators($1)', [bad]],
      ['set_operator_active',
        'select ops.set_operator_active($1, gen_random_uuid(), false)', [bad]],
      ['list_errors', 'select * from ops.list_errors($1, 10)', [bad]],
      ['list_audit', 'select * from ops.list_audit($1, 10)', [bad]],
    ];

    /**
     * ต้อง **โยน error** เท่านั้น การคืนศูนย์แถวไม่นับว่าผ่าน
     *
     * ถ้ายอมรับศูนย์แถวด้วย เทสต์จะเขียวแม้ถอด require_session ออก —
     * เพราะนโยบาย RLS บังเอิญกรองให้อีกชั้น ซึ่งเป็นความปลอดภัยโดยบังเอิญ
     * ไม่ใช่โดยตั้งใจ และไม่มีชั้นนั้นสำหรับฟังก์ชันที่เขียนข้อมูล
     */
    const leaked: string[] = [];
    for (const [name, sql, params] of calls) {
      try {
        await app.query(sql, params as never[]);
        leaked.push(name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/ไม่มีสิทธิ์ใช้คอนโซล/.test(msg)) leaked.push(`${name} (${msg.slice(0, 40)})`);
      }
    }
    return leaked;
  };

  it('ไม่มีโทเคน — ทุกฟังก์ชันปฏิเสธ', async () => {
    expect(await callWithBadToken(randomBytes(32))).toEqual([]);
  });

  it('โทเคนหมดอายุ — ทุกฟังก์ชันปฏิเสธ', async () => {
    const old = sha(randomBytes(32));
    await admin.query(
      `insert into ops.sessions (token_hash, operator_id, expires_at)
       values ($1, $2, now() - interval '1 hour')`, [old, opId]);
    expect(await callWithBadToken(old)).toEqual([]);
  });

  it('บัญชีถูกปิด — โทเคนเดิมใช้ไม่ได้ทันที', async () => {
    await admin.query('update ops.operators set active = false where id = $1', [opId]);
    expect(await callWithBadToken(good)).toEqual([]);
  });

  /**
   * ไล่ชื่อฟังก์ชันจาก pg_proc ไม่ใช่รายการที่พิมพ์ไว้
   * ฟังก์ชันใหม่ที่ลืมรับ session จะแดงเอง
   */
  it('ทุกฟังก์ชันที่แอปเรียกได้ ต้องรับ session เข้าไปตรวจ', async () => {
    const { rows } = await admin.query(`
      select p.proname, pg_get_function_arguments(p.oid) as args
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'ops'
         and has_function_privilege('dgl_app', p.oid, 'execute')`);

    /* ยกเว้นได้เฉพาะตัวที่ไม่ทำอะไรกับข้อมูลของอู่หรือของคอนโซล
         find_operator_for_signin  ต้องเรียกได้ก่อนล็อกอิน — คืนแค่ hash ให้แอปตรวจ
         record_failed_signin      เรียกตอนล็อกอินผิด
         create_session            เรียกตอนล็อกอินสำเร็จ
         load_session / delete_session  รับ token อยู่แล้วในตัว
         peek_setup_token / consume_setup_token / issue_setup_token  ใช้โทเคนคนละชุด
         viewing / require_session  เป็นตัวด่านเอง
         prune_errors               งานตามเวลา ไม่ใช่ของคอนโซล */
    const EXEMPT = new Set([
      'find_operator_for_signin', 'record_failed_signin', 'create_session',
      'load_session', 'delete_session', 'peek_setup_token', 'consume_setup_token',
      'issue_setup_token', 'viewing', 'require_session', 'prune_errors', 'email_taken',
    ]);

    const missing = rows
      .filter((r) => !EXEMPT.has(r.proname))
      .filter((r) => !/p_session bytea/.test(r.args))
      .map((r) => r.proname);

    expect(missing, 'ฟังก์ชันเหล่านี้ไม่ได้รับ session เข้าไปตรวจ').toEqual([]);
  });

  it('แอปแตะตารางใน ops ตรง ๆ ไม่ได้', async () => {
    for (const t of ['operators', 'sessions', 'setup_tokens', 'audit']) {
      await expect(app.query(`select * from ops.${t}`), `ops.${t} ต้องอ่านไม่ได้`)
        .rejects.toThrow(/permission denied/);
    }
  });

  it('ขอบเขตข้อมูล — คอนโซลเห็นได้แค่ข้อมูลการเป็นลูกค้า', async () => {
    const t = randomBytes(32);
    await app.query(
      `select ops.open_shop($1,'อู่ ก','081','a@example.com','สมชาย',$2, now()+interval '7 days')`,
      [good, t]);

    const { fields } = await app.query('select * from ops.list_shops($1)', [good]);
    const cols = fields.map((f) => f.name);

    /* รายการที่อนุญาต — เพิ่มคอลัมน์ใหม่ต้องมาแก้ตรงนี้ ซึ่งเป็นจุดที่ตั้งใจให้สะดุด */
    expect(cols.sort()).toEqual([
      'created_on', 'ever_paid', 'expires_on', 'max_users', 'name', 'plan',
      'tenant_id', 'user_count',
    ]);

    /* และไม่มีอะไรที่ส่อว่าเป็นข้อมูลธุรกิจหลุดมา */
    const FORBIDDEN = /party|doc|amount|price|cost|invoice|customer|product|revenue/i;
    expect(cols.filter((c) => FORBIDDEN.test(c))).toEqual([]);
  });

  it('ถือ session จริงก็ยังอ่านตารางข้อมูลของอู่ไม่ได้', async () => {
    const tenant = await admin.query(`insert into tenants (name) values ('อู่ ข') returning id`);
    const tid = tenant.rows[0].id;
    /* ต้องมีข้อมูลจริงอยู่ในทุกตารางที่เช็ค ไม่งั้นเทสต์ผ่านเพราะตารางว่าง
       ไม่ใช่เพราะกันไว้ได้ */
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, first_name, last_name)
       values ($1,'CUS-0001','customer','person','สมชาย','ใจดี')`, [tid]);
    await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date)
       values ($1,'QT','QT-001',current_date)`, [tid]);
    await admin.query(
      `insert into products (tenant_id, code, name) values ($1,'P-1','อะไหล่')`, [tid]);
    await admin.query(
      `insert into users (tenant_id, code, name, email, role, password_hash)
       values ($1,'OWNER','เจ้าของ','secret@example.com','owner','ห้ามหลุด')`, [tid]);

    await app.query('begin');
    try {
      /* require_session ตั้งตัวแปรให้เอง — สภาพเดียวกับตอนอยู่กลางคอนโซล */
      await app.query('select * from ops.list_shops($1)', [good]);

      for (const tbl of ['contacts', 'documents', 'products', 'users']) {
        const { rows } = await app.query(`select * from ${tbl}`);
        expect(rows, `${tbl} ต้องมองไม่เห็นจากคอนโซล`).toEqual([]);
      }

      /* ยืนยันว่าข้อมูลมีอยู่จริง — เทสต์ข้างบนจะได้ไม่ผ่านเพราะตารางว่าง */
      const real = await admin.query(
        'select count(*)::int n from users where tenant_id = $1', [tid]);
      expect(real.rows[0].n, 'ผู้ดูแลเห็น แปลว่ามีอยู่จริง แค่คอนโซลถูกกันไว้').toBe(1);
    } finally {
      await app.query('rollback');
    }
  });

  it('ตั้งตัวแปร app.ops_session เป็นค่ามั่ว แล้วอ่าน tenants ไม่ได้', async () => {
    await admin.query(`insert into tenants (name) values ('อู่ลับ')`);
    await app.query('begin');
    try {
      await app.query(`select set_config('app.ops_session', 'deadbeef', true)`);
      const { rows } = await app.query('select * from tenants');
      expect(rows, 'ประตูคือการถือ session จริง ไม่ใช่แค่ตั้งตัวแปร').toEqual([]);
    } finally {
      await app.query('rollback');
    }
  });
});

/* ------------------------------------------------------------------
   พฤติกรรมของงานในคอนโซล
   ------------------------------------------------------------------ */

describe.skipIf(!DB_URL)('งานของคอนโซล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let opId: string;
  let good: Buffer;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from ops.audit');
    await admin.query('delete from ops.operators');
    await admin.query('delete from tenants');

    const r = await admin.query(
      `insert into ops.operators (email, name, password_hash)
       values ('ops@example.com', 'ผู้ดูแล', 'x') returning id`);
    opId = r.rows[0].id;
    good = sha(randomBytes(32));
    await admin.query(
      `select ops.create_session($1, $2, now() + interval '1 day', null)`, [opId, good]);
    await admin.query('delete from ops.audit');   /* ตัดแถว signin ออกให้นับง่าย */
  });

  const openShop = (name: string, email: string) =>
    app.query(
      `select ops.open_shop($1,$2,'081',$3,'สมชาย',$4, now()+interval '7 days') as id`,
      [good, name, email, randomBytes(32)]);

  it('เปิดอู่ได้ทั้งอู่ บัญชีเจ้าของ และลิงก์ตั้งรหัสผ่าน ในทีเดียว', async () => {
    const r = await openShop('อู่ใหม่', 'owner@example.com');
    const id = r.rows[0].id;

    const t = await admin.query('select name from tenants where id = $1', [id]);
    expect(t.rows[0].name).toBe('อู่ใหม่');

    const u = await admin.query(
      `select email, role from users where tenant_id = $1`, [id]);
    expect(u.rows[0]).toMatchObject({ email: 'owner@example.com', role: 'owner' });

    const tok = await admin.query(
      `select purpose from auth.setup_tokens s join users x on x.id = s.user_id
        where x.tenant_id = $1`, [id]);
    expect(tok.rows[0].purpose).toBe('initial');
  });

  it('อีเมลซ้ำกับผู้ใช้ของอู่อื่น ต้องปฏิเสธ และไม่มีอู่ค้าง', async () => {
    await openShop('อู่แรก', 'same@example.com');
    const before = await admin.query('select count(*)::int n from tenants');

    await expect(openShop('อู่สอง', 'same@example.com')).rejects.toThrow(/ถูกใช้กับอู่อื่น/);

    const after = await admin.query('select count(*)::int n from tenants');
    expect(after.rows[0].n, 'ล้มแล้วต้องไม่มีอู่ค้าง').toBe(before.rows[0].n);
  });

  it('ชื่ออู่ว่าง ต้องปฏิเสธ', async () => {
    await expect(openShop('   ', 'x@example.com')).rejects.toThrow(/ต้องกรอกชื่ออู่/);
  });

  it('ออกลิงก์ตั้งรหัสผ่านใหม่ — ลิงก์เก่าที่ยังไม่ได้ใช้ถูกยกเลิก', async () => {
    const id = (await openShop('อู่ ก', 'owner@example.com')).rows[0].id;
    const first = await admin.query(
      `select token_hash from auth.setup_tokens s join users x on x.id = s.user_id
        where x.tenant_id = $1`, [id]);

    const email = await app.query(
      `select ops.issue_owner_reset($1,$2,$3, now()+interval '7 days') as email`,
      [good, id, randomBytes(32)]);
    expect(String(email.rows[0].email)).toBe('owner@example.com');

    const now = await admin.query(
      `select token_hash, purpose from auth.setup_tokens s join users x on x.id = s.user_id
        where x.tenant_id = $1 and s.used_at is null`, [id]);
    expect(now.rows).toHaveLength(1);
    expect(now.rows[0].token_hash).not.toEqual(first.rows[0].token_hash);
    expect(now.rows[0].purpose).toBe('reset');
  });

  it('ต่ออายุแล้ววันหมดอายุถูกบันทึก', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await app.query(
      `select ops.record_renewal($1,$2,'light-yearly','2026-09-01','2027-09-01',3900,'โอนแล้ว')`,
      [good, id]);

    const s = await admin.query(
      'select expires_on, amount::float8 as amount from subscriptions where tenant_id = $1', [id]);
    expect(String(s.rows[0].expires_on).slice(0, 10)).toBe('2027-09-01');
    expect(s.rows[0].amount).toBe(3900);
  });

  it('วันหมดอายุก่อนวันเริ่ม ต้องปฏิเสธ', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await expect(app.query(
      `select ops.record_renewal($1,$2,'p','2027-01-01','2026-01-01',1,'')`, [good, id],
    )).rejects.toThrow(/หลังวันเริ่ม/);
  });

  it('ตั้งที่นั่งก่อนมีการสมัคร ต้องบอกให้บันทึกการต่ออายุก่อน', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await expect(app.query('select ops.set_max_users($1,$2,3)', [good, id]))
      .rejects.toThrow(/ยังไม่มีการสมัคร/);
  });

  it('ลดที่นั่งให้น้อยกว่าที่ใช้อยู่ได้ และไม่ล็อกใครออก', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await admin.query(
      `insert into users (tenant_id, code, name, email, role)
       values ($1,'ST01','ช่าง 1','s1@example.com','staff'),
              ($1,'ST02','ช่าง 2','s2@example.com','staff')`, [id]);
    await app.query(
      `select ops.record_renewal($1,$2,'p',current_date,current_date + 365,1,'')`, [good, id]);

    await expect(app.query('select ops.set_max_users($1,$2,1)', [good, id])).resolves.toBeTruthy();

    const u = await admin.query(
      'select count(*)::int n from users where tenant_id = $1 and active', [id]);
    expect(u.rows[0].n, 'บัญชีที่มีอยู่ต้องไม่ถูกปิด').toBe(3);
  });

  it('ปิดบัญชีตัวเองไม่ได้', async () => {
    await expect(app.query('select ops.set_operator_active($1,$2,false)', [good, opId]))
      .rejects.toThrow(/ตัวเอง/);
  });

  it('ปิดบัญชีคนอื่นแล้ว session ของเขาถูกไล่ออกทันที', async () => {
    const other = await admin.query(
      `insert into ops.operators (email) values ('two@example.com') returning id`);
    const otherToken = sha(randomBytes(32));
    await admin.query(
      `select ops.create_session($1,$2, now() + interval '1 day', null)`,
      [other.rows[0].id, otherToken]);

    await app.query('select ops.set_operator_active($1,$2,false)', [good, other.rows[0].id]);

    const left = await admin.query(
      'select count(*)::int n from ops.sessions where operator_id = $1', [other.rows[0].id]);
    expect(left.rows[0].n).toBe(0);
  });

  /* ---------------- บันทึกการใช้งาน ---------------- */

  it('ทุกงานที่เปลี่ยนแปลงข้อมูลถูกจดไว้', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await app.query(
      `select ops.issue_owner_reset($1,$2,$3, now()+interval '7 days')`,
      [good, id, randomBytes(32)]);
    await app.query(
      `select ops.record_renewal($1,$2,'p',current_date,current_date + 365,100,'')`, [good, id]);
    await app.query('select ops.set_max_users($1,$2,5)', [good, id]);
    await app.query(
      `select ops.add_operator($1,'new@example.com','ใหม่',$2, now()+interval '7 days')`,
      [good, randomBytes(32)]);

    const { rows } = await admin.query('select action from ops.audit order by id');
    expect(rows.map((r) => r.action)).toEqual([
      'open_shop', 'issue_owner_reset', 'record_renewal', 'set_max_users', 'add_operator',
    ]);
  });

  it('กรอกรหัสผ่านผิดถูกจดไว้ด้วย — ต่างจากฝั่งอู่', async () => {
    await app.query('select ops.record_failed_signin($1)', [opId]);
    const { rows } = await admin.query(
      `select count(*)::int n from ops.audit where action = 'signin_failed'`);
    expect(rows[0].n).toBe(1);
  });

  it('ผิด 5 ครั้งติดกันถูกล็อก', async () => {
    for (let i = 0; i < 5; i++) {
      await app.query('select ops.record_failed_signin($1)', [opId]);
    }
    const { rows } = await admin.query(
      'select locked_until from ops.operators where id = $1', [opId]);
    expect(rows[0].locked_until).not.toBeNull();
  });

  it('ลบบัญชีผู้ให้บริการ บันทึกยังอยู่และอ่านอีเมลได้', async () => {
    await openShop('อู่ ก', 'o@example.com');
    await admin.query('delete from ops.operators where id = $1', [opId]);

    const { rows } = await admin.query(
      `select operator_email, action from ops.audit where action = 'open_shop'`);
    expect(rows[0].operator_email).toBe('ops@example.com');
  });

  it('ลบอู่ บันทึกที่อ้างถึงอู่นั้นยังอยู่', async () => {
    const id = (await openShop('อู่ ก', 'o@example.com')).rows[0].id;
    await admin.query('delete from tenants where id = $1', [id]);

    const { rows } = await admin.query(
      'select count(*)::int n from ops.audit where tenant_id = $1', [id]);
    expect(rows[0].n, 'ไม่มี foreign key โดยตั้งใจ — บันทึกต้องอยู่ต่อ').toBe(1);
  });
});
