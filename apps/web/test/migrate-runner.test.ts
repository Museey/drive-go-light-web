/**
 * ตัวรันไมเกรชัน
 *
 * ย้ายจาก bash + psql มาเป็น Node + pg เพราะอิมเมจของแพลตฟอร์มที่รัน Node
 * ส่วนใหญ่ไม่มี Postgres client — ถ้าไม่ย้ายก็รันไมเกรชันบนนั้นไม่ได้เลย
 *
 * ข้อที่ต้องพิสูจน์หนักที่สุดคือ **ไฟล์ที่ขึ้นเครื่องจริงแล้วถูกแก้ ต้องหยุดทันที**
 * เพราะนั่นแปลว่าโค้ดกับฐานข้อมูลไม่ตรงกันโดยไม่มีใครรู้
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from '../../../tools/migrate.mjs';
import { splitStatements } from '../../../tools/sql-statements.mjs';
import { EXPECTED_MIGRATIONS } from '../src/lib/migrations.generated';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const quiet = () => {};

describe('ตัวแยกคำสั่ง SQL', () => {
  it('แยกที่ ; ปกติ', () => {
    expect(splitStatements('select 1; select 2;')).toHaveLength(2);
  });

  it('ไม่ตัดที่ ; ในสตริง', () => {
    expect(splitStatements("select ';' as x; select 2;")).toHaveLength(2);
  });

  it('ไม่ตัดที่ ; ในตัวฟังก์ชัน $$ ... $$', () => {
    const sql = `create function f() returns int language plpgsql as $$
      begin
        perform 1;
        return 1;
      end;
    $$;
    select 1;`;
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it('ไม่ตัดที่ ; ในคอมเมนต์ทั้งสองแบบ', () => {
    expect(splitStatements('-- a; b\nselect 1;')).toHaveLength(1);
    expect(splitStatements('/* a; b */ select 1;')).toHaveLength(1);
  });

  it('ไม่ตัดที่ ; ในชื่อที่ใส่เครื่องหมายคำพูด', () => {
    expect(splitStatements('select "a;b" from t;')).toHaveLength(1);
  });

  it('ทิ้งคำสั่งว่าง', () => {
    expect(splitStatements(';;\n\n;')).toEqual([]);
  });
});

describe('รายชื่อไมเกรชันที่ฝังไว้', () => {
  /**
   * ฝังไว้ตอน build แทนการอ่านโฟลเดอร์ตอน runtime — เทสต์นี้คือสิ่งที่ทำให้
   * ยังมีคุณสมบัติ "เพิ่มไฟล์แล้วรู้เอง" อยู่ ไม่งั้นจะลืมสร้างใหม่แล้วไม่มีใครรู้
   */
  it('ตรงกับไฟล์จริงในโฟลเดอร์ db/', () => {
    const actual = readdirSync(resolve(ROOT, 'db'))
      .filter((f) => /^\d+.*\.sql$/.test(f)).sort();
    expect(
      [...EXPECTED_MIGRATIONS],
      'เพิ่มไฟล์ไมเกรชันแล้วต้องรัน  node tools/gen-migrations.mjs',
    ).toEqual(actual);
  });
});

describe.skipIf(!DB_URL)('รันไมเกรชันจริง', () => {
  let admin: pg.Client;
  let c: pg.Client;

  const fresh = async (name: string): Promise<pg.Client> => {
    await admin.query(`drop database if exists ${name}`);
    await admin.query(`create database ${name}`);
    const u = new URL(DB_URL!);
    u.pathname = `/${name}`;
    const cl = new pg.Client({ connectionString: u.toString() });
    await cl.connect();
    return cl;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
  }, 30_000);

  afterAll(async () => {
    await c?.end().catch(() => {});
    await admin?.query('drop database if exists dgl_mig_test').catch(() => {});
    await admin?.end();
  });

  beforeEach(async () => {
    await c?.end().catch(() => {});
    c = await fresh('dgl_mig_test');
  }, 30_000);

  it('ติดตั้งใหม่แล้วจดครบทุกไฟล์ แต่รันจริงเฉพาะไฟล์ฐาน', async () => {
    await migrate(c, { mode: 'fresh', log: quiet });

    const { rows } = await c.query('select filename from ops.migrations order by filename');
    expect(rows.map((r) => r.filename)).toEqual([...EXPECTED_MIGRATIONS]);

    /* ตารางของช่วงหลัง ๆ ต้องมีจริง เพราะ 001 รวมไว้แล้ว */
    const t = await c.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name in ('billnotes','claims','stock_counts')`,
    );
    expect(t.rows[0].n).toBe(3);
  }, 60_000);

  it('รันซ้ำแล้วไม่ทำอะไรเลย', async () => {
    await migrate(c, { mode: 'fresh', log: quiet });
    const again = await migrate(c, { mode: 'run', log: quiet });
    expect(again.pending).toBe(0);
  }, 60_000);

  it('--fresh บนฐานที่มีตารางแล้ว ต้องปฏิเสธ', async () => {
    await migrate(c, { mode: 'fresh', log: quiet });
    await expect(migrate(c, { mode: 'fresh', log: quiet }))
      .rejects.toThrow(/มีตารางอยู่แล้ว/);
  }, 60_000);

  /** ข้อสำคัญที่สุด */
  it('ไฟล์ที่รันไปแล้วถูกแก้เนื้อหา ต้องหยุดและบอกชื่อไฟล์', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'create table a (id int);');
    writeFileSync(join(dir, '002_auth.sql'), 'create table b (id int);');

    await migrate(c, { mode: 'run', dir, log: quiet });

    writeFileSync(join(dir, '001_init.sql'), 'create table a (id int); -- แก้ทีหลัง');
    await expect(migrate(c, { mode: 'run', dir, log: quiet }))
      .rejects.toThrow(/001_init\.sql/);
  }, 60_000);

  it('ไฟล์ใหม่ที่เพิ่มทีหลังถูกรันและถูกจด', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'create table a (id int);');
    await migrate(c, { mode: 'run', dir, log: quiet });

    writeFileSync(join(dir, '002_more.sql'), 'create table b (id int);');
    const r = await migrate(c, { mode: 'run', dir, log: quiet });
    expect(r.pending).toBe(1);

    const t = await c.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name = 'b'`);
    expect(t.rows[0].n).toBe(1);
  }, 60_000);

  it('--dry-run ไม่แตะฐานข้อมูล', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'create table a (id int);');

    const r = await migrate(c, { mode: 'dry', dir, log: quiet });
    expect(r.pending).toBe(1);

    const { rows } = await c.query('select count(*)::int as n from ops.migrations');
    expect(rows[0].n).toBe(0);
  }, 60_000);

  it('--mark-only จดโดยไม่รัน', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'create table ห้ามสร้าง (id int);');

    await migrate(c, { mode: 'mark', dir, log: quiet });

    const { rows } = await c.query('select count(*)::int as n from ops.migrations');
    expect(rows[0].n).toBe(1);
    const t = await c.query(
      `select count(*)::int as n from information_schema.tables
       where table_name = 'ห้ามสร้าง'`);
    expect(t.rows[0].n).toBe(0);
  }, 60_000);

  /** enum ที่เพิ่มค่าแล้วใช้ทันทีในไฟล์เดียวกัน — เหตุผลที่ต้องแยกคำสั่งแต่แรก */
  it('เพิ่มค่า enum แล้วใช้ค่านั้นในไฟล์เดียวกันได้', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), `
      create type สี as enum ('แดง');
      alter type สี add value if not exists 'เขียว';
      create table t (c สี not null default 'เขียว');
    `);
    await expect(migrate(c, { mode: 'run', dir, log: quiet })).resolves.toBeTruthy();
  }, 60_000);
});
