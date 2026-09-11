/**
 * ทางติดตั้งใหม่กับทางอัปเกรด ต้องได้ฐานข้อมูลเหมือนกันทุกประการ
 *
 * เราแก้ 001_init.sql กับเขียนไฟล์ไมเกรชันคู่กันมาห้าช่วง โดยไม่เคยพิสูจน์
 * ว่าสองทางให้ผลตรงกัน ถ้าไม่ตรง อู่ที่ย้ายมาก่อนกับอู่ที่เปิดใหม่จะได้ฐานคนละแบบ
 * แล้วจะมีบางหน้าที่พังเฉพาะกับอู่กลุ่มเดียว ซึ่งไล่หายากที่สุด
 *
 * ทางติดตั้งใหม่   001 (ปัจจุบัน) + 002 + 008
 * ทางอัปเกรด      001 + 002 ของรุ่นก่อนมี FIFO แล้วรัน 003 → 008 ต่อ
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { FRESH_FILES, migrationFiles } from '../../../tools/migrate.impl.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

/** สร้างฐานชั่วคราวชื่อหนึ่ง แล้วคืน client ที่ต่อไปที่นั่น */
async function makeDb(admin: pg.Client, name: string): Promise<pg.Client> {
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  const u = new URL(DB_URL!);
  u.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}

const sql = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');

/**
 * ลายนิ้วมือของโครงสร้างฐานข้อมูล
 *
 * อ่านจาก catalog จริง ไม่ใช่จากไฟล์ SQL — สิ่งที่ต้องตรงกันคือผลลัพธ์
 * ไม่ใช่วิธีเขียน · เรียงลำดับให้แน่นอนเพื่อให้เทียบกันได้ตรง ๆ
 */
async function fingerprint(c: pg.Client) {
  const q = async (text: string) => (await c.query(text)).rows;

  return {
    columns: await q(`
      select table_schema || '.' || table_name || '.' || column_name as col,
             data_type, is_nullable, column_default, character_maximum_length,
             numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema in ('public', 'auth', 'ops')
      order by 1`),

    constraints: await q(`
      select n.nspname || '.' || rel.relname || '.' || con.conname as name,
             pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname in ('public', 'auth', 'ops')
      order by 1, 2`),

    indexes: await q(`
      select schemaname || '.' || indexname as name, indexdef
      from pg_indexes
      where schemaname in ('public', 'auth', 'ops')
      order by 1`),

    enums: await q(`
      select t.typname, e.enumlabel, e.enumsortorder
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      order by 1, 3`),

    /* RLS เปิดและ force ครบทุกตารางที่มี tenant_id — ข้อที่พลาดแล้วข้อมูลรั่วข้ามอู่ */
    rls: await q(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`),

    /*
     * วิว — ทั้งนิยามและ **ตัวเลือกของวิว**
     *
     * เดิมไม่ได้เทียบวิวเลย ซึ่งเป็นช่องโหว่ที่เงียบที่สุดของเทสต์นี้ —
     * `security_invoker` เป็นตัวเลือกของวิว ไม่ใช่คอลัมน์และไม่ใช่ constraint
     * ติดตั้งใหม่อาจได้ ส่วนฐานที่อัปเกรดมาอาจไม่ได้ แล้วไม่มีอะไรฟ้อง
     * ทั้งที่ผลคือฐานหนึ่งกันข้อมูลข้ามอู่ อีกฐานไม่กัน (ดู db/017_view_security.sql)
     */
    views: await q(`
      select c.relname,
             pg_get_viewdef(c.oid, true) as def,
             coalesce(array_to_string(c.reloptions, ','), '') as opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'auth', 'ops') and c.relkind = 'v'
      order by 1`),

    functions: await q(`
      select n.nspname || '.' || p.proname as name,
             pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'auth', 'ops')
      order by 1, 2`),
  };
}

describe.skipIf(!DB_URL)('ไมเกรชัน', () => {
  let admin: pg.Client;
  let fresh: pg.Client;
  let upgraded: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    /**
     * รายชื่อไฟล์อ่านจากโฟลเดอร์จริง ไม่ใช่รายการที่พิมพ์ไว้
     *
     * ไมเกรชันไฟล์ใหม่จะถูกดึงเข้ามาเองทั้งสองทาง — ถ้าเขียนไว้ตายตัว
     * ไฟล์ใหม่ที่ลืมเติมจะทำให้เทสต์เทียบสคีมาสองอันที่ไม่ครบทั้งคู่ แล้วเขียวทั้งที่ผิด
     */
    const all = migrationFiles(resolve(ROOT, 'db'));

    /* ทางติดตั้งใหม่ — เฉพาะไฟล์ฐาน ที่เหลือรวมอยู่ใน 001 แล้ว */
    fresh = await makeDb(admin, 'dgl_fresh_test');
    for (const f of all.filter((x) => FRESH_FILES.has(x))) {
      await fresh.query(sql(`db/${f}`));
    }

    /* ทางอัปเกรด — เริ่มจากสคีมารุ่นก่อนมี FIFO ที่ตรึงไว้เป็น fixture
       แล้วรันทุกไฟล์ที่มาหลังจากนั้น */
    upgraded = await makeDb(admin, 'dgl_upgraded_test');
    await upgraded.query(sql('apps/web/test/fixtures/001_init.baseline.sql'));
    await upgraded.query(sql('apps/web/test/fixtures/002_auth.baseline.sql'));
    for (const f of all.filter((x) => x !== '001_init.sql' && x !== '002_auth.sql')) {
      /* บางไฟล์มี alter type ... add value ซึ่งอยู่ในทรานแซกชันเดียวกับที่ใช้ค่านั้นไม่ได้
         node-postgres ส่งทั้งก้อนเป็นทรานแซกชันเดียว จึงต้องแยกทีละคำสั่งเหมือนที่ psql ทำ */
      await runStatements(upgraded, sql(`db/${f}`));
    }
  }, 180_000);

  afterAll(async () => {
    await fresh?.end();
    await upgraded?.end();
    await admin?.query('drop database if exists dgl_fresh_test');
    await admin?.query('drop database if exists dgl_upgraded_test');
    await admin?.end();
  });

  it('ทั้งสองทางให้คอลัมน์เหมือนกันทุกคอลัมน์', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.columns).toEqual(a.columns);
  });

  it('เงื่อนไขและกุญแจต่างประเทศเหมือนกัน', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.constraints).toEqual(a.constraints);
  });

  it('ดัชนีเหมือนกัน', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.indexes).toEqual(a.indexes);
  });

  it('ชนิดข้อมูลแบบ enum เหมือนกัน รวมลำดับของค่า', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.enums).toEqual(a.enums);
  });

  it('ฟังก์ชันเหมือนกัน', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.functions).toEqual(a.functions);
  });

  /**
   * วิวกับตัวเลือกของวิวเหมือนกัน
   *
   * `security_invoker` ไม่ใช่คอลัมน์และไม่ใช่ constraint จึงไม่มีข้อไหนข้างบนจับได้ —
   * ฐานที่ติดตั้งใหม่อาจกันข้อมูลข้ามอู่ ส่วนฐานที่อัปเกรดมาไม่กัน แล้วเงียบสนิท
   * (ดู db/017_view_security.sql และ view-rls.test.ts ที่พิสูจน์ผลจริงของตัวเลือกนี้)
   */
  it('วิวและตัวเลือกของวิวเหมือนกัน', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);

    expect(a.views.length, 'ต้องมีวิวให้เทียบจริง').toBeGreaterThan(0);
    expect(b.views, 'ติดตั้งใหม่กับอัปเกรดต้องได้วิวเหมือนกันเป๊ะ').toEqual(a.views);

    /* ระบุชื่อไว้ตรง ๆ ด้วย — วันที่วิวถูกลบทิ้งโดยไม่ตั้งใจ ข้อเทียบข้างบนจะยังเขียว
       เพราะทั้งสองฝั่งไม่มีเหมือนกัน */
    const stock = a.views.find((v: Record<string, unknown>) => v.relname === 'product_stock');
    expect(stock, 'ไม่มีวิว product_stock').toBeTruthy();
    expect(String(stock!.opts)).toContain('security_invoker=true');
  });

  /**
   * ข้อที่พลาดแล้วเจ็บที่สุด — ฐานที่อัปเกรดมาแล้ว RLS ไม่ติดคือรอยรั่วข้ามอู่
   * ที่ไม่มีอาการอะไรให้เห็นเลย
   */
  /**
   * users กับ tenants ปิด force ไว้โดยตั้งใจ ตั้งแต่ไมเกรชัน 012
   * เพราะฟังก์ชัน auth.* ต้องหาผู้ใช้จากอีเมลข้ามทุกอู่ตอนล็อกอิน
   * ดูเหตุผลเต็มที่ db/012_auth_rls.sql และเทสต์ auth-managed-db.test.ts
   */
  const NO_FORCE = ['tenants', 'users'];

  it('RLS เปิดและ force ครบเท่ากันทั้งสองทาง', async () => {
    const a = await fingerprint(fresh);
    const b = await fingerprint(upgraded);
    expect(b.rls, 'ติดตั้งใหม่กับอัปเกรดต้องได้สถานะ RLS เหมือนกันเป๊ะ').toEqual(a.rls);

    expect(a.rls.length).toBeGreaterThan(15);
    for (const t of a.rls) {
      expect(t.relrowsecurity, `${t.relname} ต้องเปิด RLS`).toBe(true);
      expect(
        t.relforcerowsecurity,
        `${t.relname} ${NO_FORCE.includes(t.relname) ? 'ต้องไม่ force' : 'ต้อง force RLS'}`,
      ).toBe(!NO_FORCE.includes(t.relname));
    }

    const off = a.rls.filter((t: any) => !t.relforcerowsecurity)
      .map((t: any) => t.relname).sort();
    expect(off, 'ปิด force ได้เฉพาะสองตารางนี้').toEqual([...NO_FORCE].sort());
  });
});

/** แยกคำสั่งด้วย ; ที่อยู่นอกสตริงและนอกบล็อก $$ แล้วรันทีละคำสั่ง */
async function runStatements(c: pg.Client, text: string): Promise<void> {
  const parts: string[] = [];
  let buf = '';
  let i = 0;
  let dollar: string | null = null;
  let quote: string | null = null;
  let line = false;
  let block = false;

  while (i < text.length) {
    const ch = text[i]!;
    const two = text.slice(i, i + 2);

    if (line) { buf += ch; if (ch === '\n') line = false; i++; continue; }
    if (block) { buf += ch; if (two === '*/') { buf += '/'; i += 2; block = false; } else i++; continue; }
    if (dollar) {
      if (text.startsWith(dollar, i)) { buf += dollar; i += dollar.length; dollar = null; }
      else { buf += ch; i++; }
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (two === '--') { buf += two; i += 2; line = true; continue; }
    if (two === '/*') { buf += two; i += 2; block = true; continue; }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; i++; continue; }

    const dm = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
    if (dm) { dollar = dm[0]; buf += dollar; i += dollar.length; continue; }

    if (ch === ';') { parts.push(buf); buf = ''; i++; continue; }
    buf += ch;
    i++;
  }
  if (buf.trim()) parts.push(buf);

  for (const p of parts) {
    if (!p.trim()) continue;
    await c.query(p);
  }
}
