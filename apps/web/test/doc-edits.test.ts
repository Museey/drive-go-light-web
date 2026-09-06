/**
 * ประวัติการบันทึกเอกสาร
 *
 * ข้อที่สำคัญที่สุดคือ **ไม่มีทางข้าม** — 6.4 เรียก stampEdit() ด้วยมือทุกจุดที่บันทึก
 * ซึ่งลืมจุดเดียวคือประวัติหายโดยไม่มีอาการ เราจึงเขียนด้วย trigger
 * เทสต์นี้พิสูจน์ด้วยการเขียนเอกสารผ่าน SQL ตรง ๆ โดยไม่ผ่านโค้ดแอปเลยแม้แต่บรรทัดเดียว
 *
 * และประวัติเป็นของที่ **ย้อนหลังไม่ได้** — ทุกวันที่ยังไม่ลง คือเอกสารอีกกอง
 * ที่จะไม่มีวันรู้ว่าใครแก้
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { listDocEdits } from '../src/lib/doc-edits';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ประวัติการบันทึกเอกสาร', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let somchai: string;
  let somying: string;

  const newDoc = async (c: pg.Client, no: string) => {
    const { rows } = await c.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date)
       values (current_tenant_id(), 'QT', $1, current_date) returning id`, [no]);
    return rows[0].id as string;
  };

  const editsOf = (id: string) => listDocEdits(app, id);

  /** ทำงานในนามของผู้ใช้คนหนึ่ง — เลียนแบบสิ่งที่ withTenant() ทำให้ */
  const asUser = async (userId: string | null, fn: () => Promise<void>) => {
    await app.query('begin');
    await app.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
    await app.query(`select set_config('app.user_id', $1, true)`, [userId ?? '']);
    try { await fn(); await app.query('commit'); }
    catch (e) { await app.query('rollback'); throw e; }
    /* นอกทรานแซกชันแล้ว ต้องตั้ง tenant กลับให้อ่านต่อได้ */
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query(
      'drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
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
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ทดสอบประวัติ') returning id`);
    tenantId = t.rows[0].id;

    const u = await admin.query(
      `insert into users (tenant_id, code, name, role)
       values ($1,'OWNER','สมชาย เจ้าของ','owner'),
              ($1,'ST01','สมหญิง ช่าง','staff')
       returning id, code`, [tenantId]);
    somchai = u.rows.find((r) => r.code === 'OWNER').id;
    somying = u.rows.find((r) => r.code === 'ST01').id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from doc_edits where tenant_id = $1', [tenantId]);
    await admin.query('delete from documents where tenant_id = $1', [tenantId]);
  });

  /* ---------------------------------------------------------------- */

  it('สร้างเอกสารแล้วได้ประวัติหนึ่งแถว พร้อมชื่อผู้บันทึก', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-001'); });

    const edits = await editsOf(id);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ action: 'create', by: 'สมชาย เจ้าของ' });
  });

  it('แก้แล้วบันทึกได้ประวัติเพิ่ม เรียงใหม่สุดขึ้นก่อน', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-001'); });
    await asUser(somying, async () => {
      await app.query(`update documents set note = 'เพิ่มหมายเหตุ' where id = $1`, [id]);
    });

    const edits = await editsOf(id);
    expect(edits.map((e) => [e.action, e.by]))
      .toEqual([['update', 'สมหญิง ช่าง'], ['create', 'สมชาย เจ้าของ']]);
  });

  /** กดบันทึกโดยไม่แก้อะไร ไม่ควรรกประวัติ */
  it('บันทึกโดยไม่เปลี่ยนอะไรเลย ต้องไม่มีแถวเพิ่ม', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-001'); });

    await asUser(somchai, async () => {
      /* เขียนค่าเดิมทับ — updated_at จะขยับเพราะ trigger อีกตัว แต่ไม่นับว่าแก้ */
      await app.query(`update documents set note = note, doc_no = doc_no where id = $1`, [id]);
    });

    expect(await editsOf(id), 'updated_at ที่ขยับเองต้องไม่ถูกนับว่าเป็นการแก้')
      .toHaveLength(1);
  });

  it('ยกเลิกเอกสารบันทึกเป็น void ไม่ใช่ update', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-001'); });
    await asUser(somchai, async () => {
      await app.query(
        `update documents set status = 'void', voided_at = now(), voided_reason = 'ลูกค้ายกเลิก'
         where id = $1`, [id]);
    });

    const edits = await editsOf(id);
    expect(edits[0]!.action).toBe('void');
  });

  it('แก้เอกสารที่ยกเลิกไปแล้ว บันทึกเป็น update ไม่ใช่ void ซ้ำ', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-001'); });
    await asUser(somchai, async () => {
      await app.query(
        `update documents set status='void', voided_at=now(), voided_reason='ก' where id=$1`, [id]);
    });
    await asUser(somchai, async () => {
      await app.query(`update documents set voided_reason = 'ข' where id = $1`, [id]);
    });

    expect((await editsOf(id)).map((e) => e.action)).toEqual(['update', 'void', 'create']);
  });

  /** ข้อสำคัญที่สุด */
  it('เขียนเอกสารผ่าน SQL ตรง ๆ โดยไม่ผ่านแอปเลย ก็ยังได้ประวัติ', async () => {
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date)
       values ($1,'QT','QT-999',current_date) returning id`, [tenantId]);

    const { rows: e } = await admin.query(
      'select action, user_id, user_name from doc_edits where document_id = $1', [rows[0].id]);
    expect(e, 'trigger ต้องทำงานแม้ผู้ดูแลเขียนเองด้วย psql').toHaveLength(1);
    expect(e[0].action).toBe('create');
    expect(e[0].user_id, 'ไม่รู้ว่าใครทำ ต้องเป็น null ไม่ใช่พัง').toBeNull();
  });

  it('ไม่ได้ตั้ง app.user_id ก็บันทึกเอกสารได้ปกติ', async () => {
    let id = '';
    await asUser(null, async () => { id = await newDoc(app, 'QT-002'); });

    const edits = await editsOf(id);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.by, 'ว่างไว้ ให้ฝั่งแสดงผลเรียกว่า "ระบบ"').toBe('');
  });

  it('แก้ 105 ครั้ง เหลือ 100 แถวล่าสุด', async () => {
    let id = '';
    await asUser(somchai, async () => {
      id = await newDoc(app, 'QT-003');
      for (let i = 1; i <= 104; i++) {
        await app.query(`update documents set note = $2 where id = $1`, [id, `แก้ครั้งที่ ${i}`]);
      }
    });

    const edits = await editsOf(id);
    expect(edits).toHaveLength(100);
    expect(edits.every((e) => e.action === 'update'), 'แถว create ที่เก่าที่สุดต้องถูกตัดทิ้ง')
      .toBe(true);
  }, 60_000);

  it('ลบบัญชีพนักงาน ประวัติยังอยู่และชื่อยังอ่านได้', async () => {
    let id = '';
    await asUser(somying, async () => { id = await newDoc(app, 'QT-004'); });

    await admin.query('delete from users where id = $1', [somying]);

    const edits = await editsOf(id);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.by, 'ชื่อ ณ ตอนนั้นถูกเก็บไว้ต่างหาก จึงไม่หายไปกับบัญชี')
      .toBe('สมหญิง ช่าง');

    /* คืนบัญชีให้เทสต์ข้ออื่น */
    const back = await admin.query(
      `insert into users (tenant_id, code, name, role) values ($1,'ST01','สมหญิง ช่าง','staff')
       returning id`, [tenantId]);
    somying = back.rows[0].id;
  });

  it('ลบเอกสาร ประวัติหายตาม ไม่ค้างเป็นแถวกำพร้า', async () => {
    let id = '';
    await asUser(somchai, async () => { id = await newDoc(app, 'QT-005'); });
    await admin.query('delete from documents where id = $1', [id]);

    const { rows } = await admin.query(
      'select count(*)::int as n from doc_edits where document_id = $1', [id]);
    expect(rows[0].n).toBe(0);
  });

  it('อู่หนึ่งมองไม่เห็นประวัติของอีกอู่', async () => {
    const other = await admin.query(
      `insert into tenants (name) values ('อู่อื่น') returning id`);
    const od = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date)
       values ($1,'QT','QT-ของอู่อื่น',current_date) returning id`, [other.rows[0].id]);

    expect(await editsOf(od.rows[0].id)).toHaveLength(0);

    const { rows } = await admin.query(
      'select count(*)::int as n from doc_edits where document_id = $1', [od.rows[0].id]);
    expect(rows[0].n, 'ผู้ดูแลเห็น แปลว่ามีอยู่จริง แค่ RLS กันไว้').toBe(1);

    await admin.query('delete from documents where tenant_id = $1', [other.rows[0].id]);
    await admin.query('delete from tenants where id = $1', [other.rows[0].id]);
  });
});
