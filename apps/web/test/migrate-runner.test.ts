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
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from '../../../tools/migrate.impl.mjs';
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

  /**
   * enum ที่เพิ่มค่าแล้วใช้ทันทีในไฟล์เดียวกัน — เคยทำได้ ตอนนี้ทำไม่ได้แล้ว
   *
   * แลกมากับการที่หนึ่งไฟล์เป็นหนึ่งทรานแซกชัน ซึ่งคุ้มกว่ามากเมื่อฐานมีข้อมูลจริง
   * ของอู่อยู่ข้างใน ไฟล์จริงของเรา (003 และ 005) แยกไว้แบบนี้ตั้งแต่แรกอยู่แล้ว
   *
   * สิ่งที่เทสต์นี้คุ้มไว้คือ **ข้อความบอกทางแก้** ไม่ใช่แค่ว่ามันพัง
   */
  it('เพิ่มค่า enum แล้วใช้ในไฟล์เดียวกัน ต้องพังพร้อมบอกทางแก้', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), `
      create type สี as enum ('แดง');
      alter type สี add value if not exists 'เขียว';
      create table t (c สี not null default 'เขียว');
    `);
    await expect(migrate(c, { mode: 'run', dir, log: quiet }))
      .rejects.toThrow(/แยก `alter type \.\.\. add value` ออกไปเป็นไฟล์ไมเกรชันของตัวเอง/);
  }, 60_000);

  it('แยกค่า enum ไปอีกไฟล์แล้วใช้ได้', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), `
      create type สี as enum ('แดง');
      alter type สี add value if not exists 'เขียว';
    `);
    writeFileSync(join(dir, '002_use.sql'), `create table t (c สี not null default 'เขียว');`);
    await expect(migrate(c, { mode: 'run', dir, log: quiet })).resolves.toBeTruthy();
  }, 60_000);

  /* ---------------------------------------------------------------
     หนึ่งไฟล์คือหนึ่งทรานแซกชัน — ข้อสำคัญที่สุดตั้งแต่ขึ้นเครื่องจริง
     --------------------------------------------------------------- */

  it('ไฟล์ที่พังกลางคัน ต้องไม่ทิ้งอะไรไว้เลย', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), `
      create table เกิดได้ (id int);
      create table ห้ามเหลือ (id int);
      นี่ไม่ใช่ SQL;
    `);

    await expect(migrate(c, { mode: 'run', dir, log: quiet })).rejects.toThrow(/001_init\.sql/);

    /* ตารางที่คำสั่งก่อนหน้าสร้างไว้แล้วต้องหายไปด้วย */
    const t = await c.query(
      `select count(*)::int as n from information_schema.tables
       where table_name in ('เกิดได้','ห้ามเหลือ')`);
    expect(t.rows[0].n, 'คำสั่งที่ผ่านไปแล้วก่อนจุดที่พัง ต้องถูกย้อนกลับด้วย').toBe(0);
  }, 60_000);

  it('ไฟล์ที่พังต้องไม่ถูกจดว่ารันแล้ว และรันใหม่ได้ทันทีหลังแก้', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    const file = join(dir, '001_init.sql');
    writeFileSync(file, 'create table a (id int); นี่ไม่ใช่ SQL;');

    await expect(migrate(c, { mode: 'run', dir, log: quiet })).rejects.toThrow();

    const after = await c.query('select count(*)::int as n from ops.migrations');
    expect(after.rows[0].n, 'ไฟล์ที่ยังไม่สำเร็จห้ามถูกจด').toBe(0);

    /* แก้แล้วรันใหม่ต้องผ่านเลย ไม่ติดว่า "ตารางมีอยู่แล้ว" และไม่ติดเรื่อง checksum */
    writeFileSync(file, 'create table a (id int);');
    await expect(migrate(c, { mode: 'run', dir, log: quiet })).resolves.toBeTruthy();

    const t = await c.query(
      `select count(*)::int as n from information_schema.tables where table_name = 'a'`);
    expect(t.rows[0].n).toBe(1);
  }, 60_000);

  it('ไฟล์ก่อนหน้าที่สำเร็จแล้วยังอยู่ ถึงไฟล์ถัดไปจะพัง', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgl-mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'create table ต้องอยู่ (id int);');
    writeFileSync(join(dir, '002_bad.sql'), 'นี่ไม่ใช่ SQL;');

    await expect(migrate(c, { mode: 'run', dir, log: quiet })).rejects.toThrow(/002_bad\.sql/);

    const t = await c.query(
      `select count(*)::int as n from information_schema.tables where table_name = 'ต้องอยู่'`);
    expect(t.rows[0].n).toBe(1);
    const { rows } = await c.query('select filename from ops.migrations');
    expect(rows.map((r) => r.filename)).toEqual(['001_init.sql']);
  }, 60_000);
});

/**
 * ไฟล์ SQL จริงต้องรันในทรานแซกชันได้ทุกไฟล์
 *
 * ไม่ต้องต่อฐานข้อมูลก็ตรวจได้ และไฟล์ใหม่ที่ละเมิดจะแดงเองโดยไม่ต้องมีใครนึกออก
 */
describe('ไฟล์ไมเกรชันจริง', () => {
  const dir = resolve(ROOT, 'db');
  const files = readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();

  it('ไม่มีคำสั่งที่รันในทรานแซกชันไม่ได้', () => {
    /* ตัดคอมเมนต์ทิ้งก่อน — ไฟล์ 003 กับ 005 พูดถึงข้อจำกัดนี้ไว้ในคอมเมนต์ */
    const forbidden = /\bconcurrently\b|\bvacuum\b|\balter\s+system\b|\bcreate\s+database\b/i;
    for (const f of files) {
      const sql = readFileSync(resolve(dir, f), 'utf8')
        .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
      expect(forbidden.test(sql), `${f} มีคำสั่งที่รันในทรานแซกชันไม่ได้`).toBe(false);
    }
  });

  it('ไม่มีไฟล์ไหนห่อ begin/commit เอง — ตัวรันห่อให้แล้ว', () => {
    for (const f of files) {
      const sql = readFileSync(resolve(dir, f), 'utf8')
        .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
      expect(/^\s*(begin|commit|rollback)\s*;/im.test(sql), `${f} ห่อทรานแซกชันเอง`).toBe(false);
    }
  });
});
