/**
 * สถานะการใช้งานอ่านจากฐานข้อมูลจริง
 *
 * ตัวคำนวณวันมีชุดทดสอบแยกอยู่แล้วที่ license-window.test.ts
 * ไฟล์นี้พิสูจน์อีกครึ่งหนึ่ง คือ SQL ที่ดึงวันเปิดอู่กับวันหมดอายุมาให้ถูกอู่
 * และอ่านผ่าน role ของแอปที่มี Row Level Security บังคับอยู่
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { licenseStatusWith, TRIAL_DAYS, addDays, todayIso } from '../src/lib/license-window';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('สถานะการใช้งานจากฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let other: string;

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

    /* อู่ที่เพิ่งเปิดวันนี้ กับอู่อื่นที่จ่ายเงินไว้ยาว ๆ ใช้ดูว่าไม่หยิบข้ามอู่ */
    const a = await admin.query(`insert into tenants (name) values ('อู่ทดสอบ') returning id`);
    mine = a.rows[0].id;
    const b = await admin.query(`insert into tenants (name) values ('อู่อื่น') returning id`);
    other = b.rows[0].id;
    await admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, 'light-yearly', current_date, current_date + 3650)`,
      [other],
    );

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [mine]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('อู่ที่เพิ่งเปิดได้ทดลองใช้ ไม่หยิบวันหมดอายุของอู่อื่นมาใช้', async () => {
    const s = await licenseStatusWith(app);
    expect(s.mode).toBe('trial');
    expect(s.everPaid).toBe(false);
    expect(s.daysLeft).toBe(TRIAL_DAYS);
    expect(s.until).toBe(addDays(todayIso(), TRIAL_DAYS));
  });

  it('บันทึกการต่ออายุแล้วกลายเป็นใช้งานอยู่', async () => {
    await admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, 'light-yearly', current_date, current_date + 365)`,
      [mine],
    );
    const s = await licenseStatusWith(app);
    expect(s.mode).toBe('active');
    expect(s.everPaid).toBe(true);
    expect(s.daysLeft).toBe(365);
  });

  it('ถือวันหมดอายุที่ไกลที่สุด ไม่ใช่แถวที่บันทึกล่าสุด', async () => {
    /* ต่ออายุย้อนหลังให้ครบเอกสาร วันหมดอายุต้องไม่ถอยกลับมาสั้นลง */
    await admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, 'light-yearly', current_date - 400, current_date - 35)`,
      [mine],
    );
    const s = await licenseStatusWith(app);
    expect(s.mode).toBe('active');
    expect(s.daysLeft).toBe(365);
  });

  it('หมดอายุแล้วยังบอกว่าเคยจ่าย เพื่อให้ขึ้นข้อความว่าขาดต่ออายุ', async () => {
    await admin.query(`delete from subscriptions where tenant_id = $1`, [mine]);
    await admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, 'light-yearly', current_date - 400, current_date - 1)`,
      [mine],
    );
    const s = await licenseStatusWith(app);
    expect(s.mode).toBe('expired');
    expect(s.everPaid).toBe(true);
    expect(s.daysLeft).toBe(-1);
  });
});

/**
 * การลบข้อมูลตามคำขอ
 *
 * ลบแถวเดียวใน tenants แล้วต้องไม่เหลือเศษข้อมูลค้างที่ไหนเลย
 * ถ้าเหลือ แปลว่าเราบอกลูกค้าว่าลบให้แล้วทั้งที่ยังไม่ได้ลบ
 */
describe.skipIf(!DB_URL)('ลบข้อมูลของอู่', () => {
  let admin: pg.Client;
  let victim: string;
  let bystander: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    /* ชุดนี้ใช้สิทธิ์ผู้ดูแลอย่างเดียว แต่ให้สิทธิ์ role ของแอปกลับไว้ด้วย
       ไม่งั้นฐานข้อมูลที่ใช้รันเทสต์จะเปิดแอปต่อไม่ได้หลังเทสต์จบ */
    await admin.query(`
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

    const mk = async (name: string) => {
      const t = await admin.query(`insert into tenants (name) values ($1) returning id`, [name]);
      const id = t.rows[0].id;
      const u = await admin.query(
        `insert into users (tenant_id, code, name, email, role, perms)
         values ($1, 'U01', 'เจ้าของ', $2, 'owner', array['settings']) returning id`,
        [id, `${name}@example.com`],
      );
      const ct = await admin.query(
        `insert into contacts (tenant_id, code, kind, first_name)
         values ($1, 'CUS-0001', 'customer', 'ลูกค้า') returning id`, [id],
      );
      const d = await admin.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, party_id, party_name,
                                subtotal, discount, net_amount, vat_mode, vat_rate, vat_amount,
                                grand_total, wht_rate, wht_amount, payable)
         values ($1, 'IVT', $2, current_date, $3, 'ลูกค้า',
                 100, 0, 100, 'ex', 7, 7, 107, 0, 0, 107) returning id`,
        [id, `IVT-${name}-0001`, ct.rows[0].id],
      );
      await admin.query(
        `insert into doc_items (tenant_id, doc_id, line_no, name, qty, unit_price)
         values ($1, $2, 1, 'ค่าแรง', 1, 100)`, [id, d.rows[0].id],
      );
      await admin.query(
        `insert into payments (tenant_id, doc_id, paid_on, method, amount)
         values ($1, $2, current_date, 'เงินสด', 107)`, [id, d.rows[0].id],
      );
      await admin.query(
        `select auth.create_session($1, decode(md5($2), 'hex'), now() + interval '1 day', 'test')`,
        [u.rows[0].id, name],
      );
      await admin.query(
        `insert into subscriptions (tenant_id, plan, started_on, expires_on)
         values ($1, 'light-yearly', current_date, current_date + 365)`, [id],
      );
      return id;
    };

    victim = await mk('อู่ที่ขอลบ');
    bystander = await mk('อู่ข้างเคียง');
  }, 60_000);

  afterAll(async () => { await admin?.end(); });

  it('ลบแถวเดียวใน tenants แล้วข้อมูลของอู่นั้นหายหมดทุกตาราง รวมถึง session', async () => {
    await admin.query(`delete from tenants where id = $1`, [victim]);

    const { rows } = await admin.query(
      `select
         (select count(*) from users        where tenant_id = $1)::int as users,
         (select count(*) from contacts     where tenant_id = $1)::int as contacts,
         (select count(*) from documents    where tenant_id = $1)::int as documents,
         (select count(*) from doc_items    where tenant_id = $1)::int as items,
         (select count(*) from payments     where tenant_id = $1)::int as payments,
         (select count(*) from subscriptions where tenant_id = $1)::int as subs,
         (select count(*) from auth.sessions where tenant_id = $1)::int as sessions`,
      [victim],
    );
    expect(rows[0]).toEqual({
      users: 0, contacts: 0, documents: 0, items: 0, payments: 0, subs: 0, sessions: 0,
    });
  });

  it('อู่อื่นไม่กระทบ', async () => {
    const { rows } = await admin.query(
      `select
         (select count(*) from documents     where tenant_id = $1)::int as documents,
         (select count(*) from payments      where tenant_id = $1)::int as payments,
         (select count(*) from auth.sessions where tenant_id = $1)::int as sessions`,
      [bystander],
    );
    expect(rows[0]).toEqual({ documents: 1, payments: 1, sessions: 1 });
  });
});
