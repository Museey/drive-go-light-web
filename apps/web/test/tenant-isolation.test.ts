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

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
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

  it('มีตารางที่ผูกกับอู่ให้ตรวจจริง และทุกตารางเปิด RLS แบบบังคับ', async () => {
    expect(tables.length).toBeGreaterThanOrEqual(10);

    const { rows } = await admin.query(
      `select c.relname as t, c.relrowsecurity as on, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [tables],
    );
    const bad = rows.filter((r) => !r.on || !r.forced).map((r) => r.t);
    expect(bad).toEqual([]);
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
