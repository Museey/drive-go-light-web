/**
 * อู่หนึ่งต้องมองไม่เห็นข้อมูลของอีกอู่เลย — ทุกตาราง ทุกคำสั่ง
 *
 * นี่คือเทสต์ที่สำคัญที่สุดของระบบหลายอู่ ถ้า RLS หายไปจากตารางเดียว
 * หรือเขียนนโยบายผิดข้อเดียว ข้อมูลจะรั่วข้ามอู่โดยไม่มีอาการให้เห็น
 * และอู่ที่เป็นคู่แข่งกันจะเห็นราคาและลูกค้าของกันและกัน
 *
 * ตั้งใจไล่ตารางจาก information_schema ไม่ใช่เขียนรายชื่อไว้ตายตัว
 * ตารางใหม่ที่ลืมเปิด RLS จะทำให้เทสต์นี้แดงเองโดยไม่ต้องมีใครนึกออก
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('การแยกข้อมูลระหว่างอู่', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let theirs: string;
  let tables: string[] = [];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
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

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    /* สองอู่ที่มีข้อมูลครบทุกตารางเท่ากัน นำเข้าจากไฟล์ชุดทดสอบชุดเดียวกัน */
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    mine = (await importBackup(app, fixture, {
      tenantName: 'อู่ของเรา', openingStockDate: '2026-08-28',
    })).tenantId;
    theirs = (await importBackup(app, fixture, {
      tenantName: 'อู่คู่แข่ง', openingStockDate: '2026-08-28',
    })).tenantId;

    for (const t of [mine, theirs]) {
      await admin.query(
        `insert into subscriptions (tenant_id, plan, started_on, expires_on)
         values ($1, 'light-yearly', current_date, current_date + 365)`, [t],
      );
      await admin.query(
        `insert into ignored_item_names (tenant_id, name_norm) values ($1, 'ค่าส่ง')`, [t],
      );
      /* ตารางใบวางบิลที่เพิ่มในช่วงที่ 3 ต้องถูกทดสอบการแยกอู่ด้วย */
      const bn = await admin.query(
        `insert into billnotes (tenant_id, no, bill_date, party_name)
         values ($1, 'BN-202603-001', '2026-03-31', 'ลูกค้าองค์กร') returning id`, [t],
      );
      await admin.query(
        /* ตัวนำเข้าลงแถวตัวนับให้แล้ว — ที่นี่แค่ตั้งค่าให้แน่ว่าไม่ใช่ศูนย์ */
        `insert into billnote_sequences (tenant_id, period, last_no) values ($1, '', 1)
         on conflict (tenant_id, period) do update set last_no = 1`, [t],
      );
      const someDoc = await admin.query(
        `select id from documents where tenant_id = $1 and kind = 'IVT' limit 1`, [t],
      );
      if (someDoc.rows[0]) {
        await admin.query(
          `insert into billnote_docs (tenant_id, billnote_id, doc_id) values ($1,$2,$3)`,
          [t, bn.rows[0].id, someDoc.rows[0].id],
        );
      }

      /* ตารางใบเคลมที่เพิ่มในช่วงที่ 4 */
      const cl = await admin.query(
        `insert into claims (tenant_id, no, side, kind, claim_date, party_name, reason)
         values ($1,'CL-202603-001','customer','warranty','2026-03-15','ลูกค้าเคลม','รับประกัน')
         returning id`, [t],
      );
      const someProduct = await admin.query(
        `select id from products where tenant_id = $1 limit 1`, [t],
      );
      await admin.query(
        `insert into claim_items (tenant_id, claim_id, line_no, product_id, name, qty, unit_cost)
         values ($1,$2,1,$3,'อะไหล่ที่เคลม',1,100)`,
        [t, cl.rows[0].id, someProduct.rows[0]?.id ?? null],
      );

      /* ตารางใบตรวจนับที่เพิ่มในช่วงที่ 5 */
      const ct = await admin.query(
        `insert into stock_counts (tenant_id, no, count_date, note)
         values ($1,'CT-202603-001','2026-03-20','ตรวจนับประจำเดือน') returning id`, [t],
      );
      await admin.query(
        `insert into stock_count_items (tenant_id, count_id, line_no, product_id, counted_qty)
         values ($1,$2,1,$3,5)`,
        [t, ct.rows[0].id, someProduct.rows[0].id],
      );
      await admin.query(
        `insert into stock_count_sequences (tenant_id, period, last_no) values ($1,'',1)
         on conflict (tenant_id, period) do update set last_no = 1`, [t],
      );
    }

    /* ทุกตารางที่มีคอลัมน์ tenant_id — ไล่เอาจากฐานข้อมูลจริง ไม่ใช่รายชื่อที่พิมพ์ไว้ */
    const { rows } = await admin.query(
      `select c.relname as t
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = c.relname
                         and column_name = 'tenant_id')
        order by c.relname`,
    );
    tables = rows.map((r) => r.t);

    /* เปิดสวมรอยเป็นอู่ของเรา */
    await app.query(`select set_config('app.tenant_id', $1, false)`, [mine]);
  }, 240_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /**
   * ตารางที่ปิด force ไว้โดยตั้งใจ
   *
   * force มีผลกับ *เจ้าของตาราง* ด้วย และฟังก์ชัน auth.* ซึ่งเป็น SECURITY DEFINER
   * ต้องหาผู้ใช้จากอีเมลข้ามทุกอู่ตอนล็อกอิน — ทำไม่ได้ถ้า force เปิดอยู่
   * บนฐานที่เจ้าของไม่ใช่ superuser (ซึ่งคือบริการ Postgres แบบ managed ทุกเจ้า)
   *
   * ดู db/012_auth_rls.sql · การเพิ่มชื่อเข้ารายการนี้ต้องมีเหตุผลกำกับเสมอ
   * และต้องมีเทสต์ยืนยันว่า role ของแอปยังอ่านข้ามอู่ไม่ได้
   *
   * (tenants ก็ปิดเหมือนกัน แต่ไม่อยู่ในรายการนี้เพราะมันไม่มีคอลัมน์ tenant_id
   *  ตรวจแยกไว้ในข้อถัดไป)
   */
  const NO_FORCE = ['users'];

  it('มีตารางที่ผูกกับอู่ให้ตรวจจริง และทุกตารางเปิด RLS แบบบังคับ', async () => {
    expect(tables.length).toBeGreaterThanOrEqual(10);

    const { rows } = await admin.query(
      `select c.relname as t, c.relrowsecurity as on, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [tables],
    );

    const noRls = rows.filter((r) => !r.on).map((r) => r.t);
    expect(noRls, 'ทุกตารางต้องเปิด RLS ไม่มีข้อยกเว้น').toEqual([]);

    const noForce = rows.filter((r) => !r.forced).map((r) => r.t).sort();
    expect(noForce, 'ปิด force ได้เฉพาะตารางที่ auth ต้องใช้ข้ามอู่')
      .toEqual([...NO_FORCE].sort());
  });

  it('ตาราง tenants เปิด RLS แต่ไม่ force ด้วยเหตุผลเดียวกัน', async () => {
    const { rows } = await admin.query(
      `select c.relrowsecurity as on, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'tenants'`,
    );
    expect(rows[0].on, 'ต้องเปิด RLS').toBe(true);
    expect(rows[0].forced, 'ต้องไม่ force — auth.find_user_for_signin join ตารางนี้')
      .toBe(false);
  });

  /**
   * ข้อที่พิสูจน์ว่าการปิด force ไม่ได้ทำให้ข้อมูลรั่ว
   *
   * force บังคับ RLS กับเจ้าของตารางเท่านั้น — role ที่ไม่ใช่เจ้าของโดน RLS กรอง
   * เต็มที่เสมอไม่ว่า force จะเปิดหรือปิด แอปต่อด้วย dgl_app ซึ่งไม่ใช่เจ้าของ
   * การแยกข้อมูลของอู่จึงไม่เปลี่ยน
   */
  it('ตารางที่ปิด force ไว้ role ของแอปก็ยังอ่านข้ามอู่ไม่ได้', async () => {
    /* ใส่ผู้ใช้ให้ทั้งสองอู่ก่อน — ไม่มีข้อมูลก็พิสูจน์อะไรไม่ได้ */
    for (const [t, code] of [[mine, 'MINE'], [theirs, 'THEIRS']] as const) {
      await admin.query(
        `insert into users (tenant_id, code, name, email, role)
         values ($1, $2, 'ทดสอบ', $3, 'owner')
         on conflict (tenant_id, code) do nothing`,
        [t, code, `${code.toLowerCase()}@example.com`],
      );
    }

    for (const [t, col] of [['users', 'tenant_id'], ['tenants', 'id']] as const) {
      const leak = await app.query(
        `select count(*)::int as n from ${t} where ${col} <> $1`, [mine]);
      expect(leak.rows[0].n, `${t} รั่วข้ามอู่`).toBe(0);

      const own = await app.query(
        `select count(*)::int as n from ${t} where ${col} = $1`, [mine]);
      expect(own.rows[0].n, `${t} ของตัวเองต้องเห็น ไม่ใช่กรองจนไม่เหลืออะไร`)
        .toBeGreaterThan(0);

      /* ผู้ดูแลเห็นของอู่อื่น แปลว่ามีอยู่จริง ไม่ใช่ตารางว่าง */
      const real = await admin.query(
        `select count(*)::int as n from ${t} where ${col} = $1`, [theirs]);
      expect(real.rows[0].n, `${t} ของอู่อื่นต้องมีอยู่จริง`).toBeGreaterThan(0);
    }
  });

  it('อ่านข้อมูลของอู่อื่นไม่เห็นสักแถวเดียว ทุกตาราง', async () => {
    const leaked: string[] = [];

    for (const t of tables) {
      const { rows } = await app.query(
        `select count(*)::int as c from ${t} where tenant_id = $1`, [theirs],
      );
      if (rows[0].c > 0) leaked.push(`${t} (${rows[0].c} แถว)`);
    }

    expect(leaked).toEqual([]);
  });

  it('ข้อมูลของอู่ตัวเองยังเห็นครบ — ไม่ใช่ว่ากรองจนไม่เหลืออะไรเลย', async () => {
    const empty: string[] = [];

    for (const t of tables) {
      const { rows } = await app.query(`select count(*)::int as c from ${t}`);
      if (rows[0].c === 0) empty.push(t);
    }

    /* users ว่างได้เพราะการนำเข้าไม่สร้างผู้ใช้ ที่เหลือต้องมีข้อมูล */
    expect(empty.filter((t) => t !== 'users')).toEqual([]);
  });

  it('แก้ข้อมูลของอู่อื่นไม่ได้ — RLS ต้องกันฝั่งเขียนด้วย ไม่ใช่แค่ฝั่งอ่าน', async () => {
    const res = await app.query(
      `update contacts set first_name = 'ถูกแก้โดยอู่อื่น' where tenant_id = $1`, [theirs],
    );
    expect(res.rowCount).toBe(0);

    const check = await admin.query(
      `select count(*)::int as c from contacts
        where tenant_id = $1 and first_name = 'ถูกแก้โดยอู่อื่น'`, [theirs],
    );
    expect(check.rows[0].c).toBe(0);
  });

  it('ลบข้อมูลของอู่อื่นไม่ได้', async () => {
    const before = await admin.query(
      `select count(*)::int as c from documents where tenant_id = $1`, [theirs],
    );
    const res = await app.query(`delete from payments where tenant_id = $1`, [theirs]);
    expect(res.rowCount).toBe(0);

    const after = await admin.query(
      `select count(*)::int as c from documents where tenant_id = $1`, [theirs],
    );
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it('แทรกข้อมูลใส่ชื่ออู่อื่นไม่ได้ — WITH CHECK ต้องปฏิเสธ', async () => {
    await expect(
      app.query(
        `insert into contacts (tenant_id, code, kind, first_name)
         values ($1, 'CUS-แอบใส่', 'customer', 'แทรกข้ามอู่')`, [theirs],
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('ไม่ตั้งรหัสอู่เลยก็ไม่เห็นอะไรทั้งนั้น — กันกรณีลืมเปิดทรานแซกชัน', async () => {
    const bare = new pg.Client({
      connectionString: (() => {
        const u = new URL(DB_URL!);
        u.username = 'dgl_app';
        u.password = 'apppass';
        return u.toString();
      })(),
    });
    await bare.connect();
    try {
      for (const t of ['documents', 'contacts', 'products', 'payments']) {
        const { rows } = await bare.query(`select count(*)::int as c from ${t}`);
        expect(`${t}=${rows[0].c}`).toBe(`${t}=0`);
      }
    } finally {
      await bare.end();
    }
  });

  it('เปลี่ยนรหัสอู่กลางคันแล้วเห็นของอีกอู่ทันที — พิสูจน์ว่าที่ไม่เห็นคือ RLS ไม่ใช่ข้อมูลไม่มี', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [theirs]);
    const { rows } = await app.query(`select count(*)::int as c from documents`);
    expect(rows[0].c).toBeGreaterThan(700);

    await app.query(`select set_config('app.tenant_id', $1, false)`, [mine]);
  });
});
