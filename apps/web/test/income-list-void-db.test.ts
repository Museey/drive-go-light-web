/**
 * ใบที่ยกเลิกแล้วต้องหาเจอ
 *
 * ก่อนหน้านี้ `listIncomeDocs()` มี `d.status <> 'void'` ตายตัว ใบที่ยกเลิกจึงหาย
 * จากรายการและค้นหาไม่เจอ **ทำให้ปุ่ม "คัดลอกใบใหม่" ที่ทำไว้ในช่วงที่ 8
 * เดินไปถึงไม่ได้เลย** ต้องรู้ id ของเอกสารเท่านั้น — ปุ่มที่ไปไม่ถึงเท่ากับไม่มี
 *
 * หน้ารายจ่าย ใบซื้อ ใบวางบิล ใบเคลม ของเราแสดงใบที่ยกเลิกอยู่แล้ว
 * หน้ารายรับจึงไม่ตรงกับทั้งรุ่น 6.4 และกับหน้าอื่นของเราเอง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

/**
 * เงื่อนไขเดียวกับที่ listIncomeDocs() ประกอบขึ้น
 *
 * ทดสอบตรงนี้เพราะ queries.ts มี `server-only` เรียกจากชุดทดสอบไม่ได้
 * ถ้าเงื่อนไขในโค้ดจริงเปลี่ยน เทสต์นี้จะไม่รู้ — จึงมีเทสต์อีกข้อข้างล่าง
 * ที่อ่านไฟล์จริงมาตรวจว่ายังใช้รูปแบบเดียวกันอยู่
 */
function whereFor(opts: { search?: string; includeVoid?: boolean }) {
  const where: string[] = [`d.kind in ('QT','IV','IVT','RC')`];
  const params: unknown[] = [];
  let sIdx = 0;
  if (opts.search) { params.push(`%${opts.search}%`); sIdx = params.length; }
  if (!opts.includeVoid) {
    where.push(sIdx ? `(d.status <> 'void' or d.doc_no ilike $${sIdx})` : `d.status <> 'void'`);
  }
  if (sIdx) {
    where.push(`(d.doc_no ilike $${sIdx} or d.party_name ilike $${sIdx}
                 or d.vehicle_plate ilike $${sIdx})`);
  }
  return { sql: where.join(' and '), params };
}

describe.skipIf(!DB_URL)('รายการรายรับกับใบที่ยกเลิก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

  const addDoc = async (no: string, party: string, status = 'issued') => {
    await app.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name, vat_mode, status, voided_at)
       values (current_tenant_id(), 'IVT', $1, current_date, $2, 'ex', $3::doc_status,
               case when $3::text = 'void' then now() else null end)`,
      [no, party, status]);
  };

  const listed = async (opts: { search?: string; includeVoid?: boolean }) => {
    const { sql, params } = whereFor(opts);
    const { rows } = await app.query(
      `select d.doc_no from documents d where ${sql} order by d.doc_no`, params);
    return rows.map((r) => r.doc_no as string);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบใบยกเลิก') returning id`);
    tenantId = t.rows[0].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    await app.query('delete from documents');
    await addDoc('IVT-001', 'ลูกค้าปกติ');
    await addDoc('IVT-002', 'ลูกค้ายกเลิก', 'void');
  });

  it('ปริยาย — ไม่เห็นใบที่ยกเลิก', async () => {
    expect(await listed({})).toEqual(['IVT-001']);
  });

  it('ติ๊กรวมใบที่ยกเลิก — เห็นทั้งสองใบ', async () => {
    expect(await listed({ includeVoid: true })).toEqual(['IVT-001', 'IVT-002']);
  });

  /*
   * ข้อสำคัญที่สุดของไฟล์นี้ — คนที่พิมพ์เลขที่ใบมาค้น รู้อยู่แล้วว่าจะหาใบไหน
   * การซ่อนคือการตอบว่า "ไม่มีใบนี้" ซึ่งไม่จริง และเป็นเหตุผลเดียวที่ทำให้
   * ปุ่มคัดลอกใบใหม่เดินไปถึงไม่ได้
   */
  it('ค้นด้วยเลขที่เอกสาร — เจอใบที่ยกเลิก แม้ไม่ได้ติ๊กตัวเลือก', async () => {
    expect(await listed({ search: 'IVT-002' })).toEqual(['IVT-002']);
  });

  it('ค้นด้วยชื่อลูกค้า — ยังไม่เห็นใบที่ยกเลิกถ้าไม่ได้ติ๊ก', async () => {
    expect(await listed({ search: 'ลูกค้ายกเลิก' })).toEqual([]);
  });

  it('ค้นด้วยชื่อลูกค้าพร้อมติ๊กตัวเลือก — เจอ', async () => {
    expect(await listed({ search: 'ลูกค้ายกเลิก', includeVoid: true })).toEqual(['IVT-002']);
  });

  it('ค้นด้วยชื่อที่ตรงกับใบปกติ — ไม่ถูกกระทบ', async () => {
    expect(await listed({ search: 'ลูกค้าปกติ' })).toEqual(['IVT-001']);
  });
});

describe('โค้ดจริงยังใช้เงื่อนไขแบบเดียวกับที่เทสต์ไว้', () => {
  /*
   * เทสต์ข้างบนจำลองเงื่อนไขเอง เพราะ queries.ts เรียกตรง ๆ ไม่ได้
   * ข้อนี้กันไม่ให้ทั้งสองฝั่งเดินห่างกันโดยไม่มีใครรู้
   */
  it('listIncomeDocs ยังยอมให้ค้นเลขที่เจอใบที่ยกเลิก', () => {
    const src = readFileSync(resolve(here, '../src/lib/queries.ts'), 'utf8');
    expect(src).toContain(`(d.status <> 'void' or d.doc_no ilike $`);
    expect(src).toContain('includeVoid');
  });
});
