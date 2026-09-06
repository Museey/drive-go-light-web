/**
 * นำเข้าทะเบียนลูกค้าและผู้ขายลงฐานข้อมูลจริง
 *
 * สามข้อที่ต้องพิสูจน์หนักที่สุด
 * 1. **นำเข้าไฟล์เดิมซ้ำต้องไม่สร้างใครเพิ่ม** — คนกดพลาดสองครั้งเป็นเรื่องปกติ
 * 2. **ช่องว่างในไฟล์ไม่ทับข้อมูลเดิม** — คนแก้เบอร์โทร 20 ราย ไม่ควรเสียที่อยู่ทั้ง 20 ราย
 * 3. **ไม่ลบรถของลูกค้าทิ้ง** — ไฟล์ส่งรถมาทีละคัน ถ้าเผลอใช้ทางเดียวกับหน้าแก้ไข
 *    ลูกค้าที่มีสามคันจะเหลือคันเดียวโดยไม่มีใครรู้
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importContactsWith } from '../src/lib/contacts-csv';
import { CUST_CSV_HEADERS, CUST_FIELDS, VEND_CSV_HEADERS, VEND_FIELDS } from '../src/lib/csv';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

/** สร้างไฟล์ CSV จากค่าที่สนใจ ช่องที่ไม่ระบุเว้นว่าง */
function csv(kind: 'customer' | 'vendor', rows: Record<string, string>[]): string {
  const headers = kind === 'vendor' ? VEND_CSV_HEADERS : CUST_CSV_HEADERS;
  const fields = kind === 'vendor' ? VEND_FIELDS : CUST_FIELDS;
  const line = (o: Record<string, string>) =>
    fields.map((f) => {
      const v = o[f] ?? '';
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',');
  return [headers.join(','), ...rows.map(line)].join('\n');
}

describe.skipIf(!DB_URL)('นำเข้าผู้ติดต่อจาก CSV', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

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
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ทดสอบนำเข้า') returning id`);
    tenantId = t.rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from vehicles where tenant_id = $1', [tenantId]);
    await admin.query('delete from contacts where tenant_id = $1', [tenantId]);
  });

  const one = (code: string) =>
    app.query('select * from contacts where code = $1', [code]).then((r) => r.rows[0]);

  const carsOf = (contactId: string) =>
    app.query('select * from vehicles where contact_id = $1 order by plate_b', [contactId])
      .then((r) => r.rows);

  /* ---------------------------------------------------------------- */

  it('เพิ่มลูกค้าใหม่พร้อมรถ และออกรหัสให้เอง', async () => {
    const r = await importContactsWith(app, 'customer', csv('customer', [
      { type: 'บุคคล', prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี',
        tel: '081-234-5678', a_no: '88/12', a_province: 'กรุงเทพมหานคร',
        v_brand: 'Toyota', v_plateA: 'กข', v_plateB: '1234' },
    ]));

    expect(r).toMatchObject({ created: 1, updated: 0, vehicles: 1, skipped: 0 });

    const c = await one('CUS-0001');
    expect(c.first_name).toBe('สมชาย');
    expect(c.tel).toBe('081-234-5678');
    expect(c.addr).toEqual({ no: '88/12', province: 'กรุงเทพมหานคร' });

    const cars = await carsOf(c.id);
    expect(cars).toHaveLength(1);
    expect(cars[0].brand).toBe('Toyota');
  });

  it('ลูกค้าหนึ่งรายสามแถวสามคัน ได้ลูกค้าหนึ่งรายรถสามคัน', async () => {
    const rows = ['1111', '2222', '3333'].map((b) => ({
      firstName: 'สมปอง', lastName: 'มีสุข', v_plateA: 'กข', v_plateB: b,
    }));
    const r = await importContactsWith(app, 'customer', csv('customer', rows));

    expect(r).toMatchObject({ created: 1, vehicles: 3 });
    const c = await one('CUS-0001');
    expect(await carsOf(c.id)).toHaveLength(3);
  });

  /** ข้อสำคัญที่สุด */
  it('นำเข้าไฟล์เดิมซ้ำ ต้องไม่สร้างใครเพิ่มและรถไม่เพิ่ม', async () => {
    const text = csv('customer', [
      { firstName: 'สมชาย', lastName: 'ใจดี', v_plateA: 'กข', v_plateB: '1234' },
      { firstName: 'สมชาย', lastName: 'ใจดี', v_plateA: 'กข', v_plateB: '5678' },
      { type: 'นิติบุคคล', orgName: 'บริษัท ก จำกัด', taxId: '0105551234567' },
    ]);

    const first = await importContactsWith(app, 'customer', text);
    expect(first).toMatchObject({ created: 2, updated: 0, vehicles: 2 });

    const second = await importContactsWith(app, 'customer', text);
    expect(second).toMatchObject({ created: 0, updated: 2, vehicles: 0 });

    const { rows } = await app.query('select count(*)::int as n from contacts');
    expect(rows[0].n).toBe(2);
    const v = await app.query('select count(*)::int as n from vehicles');
    expect(v.rows[0].n).toBe(2);
  });

  it('ช่องที่เว้นว่างในไฟล์ ต้องไม่ทับข้อมูลเดิม', async () => {
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'สมชาย', lastName: 'ใจดี', tel: '081-111-1111',
        tel2: '02-000-0000', note: 'ลูกค้าประจำ', a_no: '88/12', a_province: 'กรุงเทพมหานคร' },
    ]));

    /* ไฟล์รอบสองแก้แค่เบอร์โทร ช่องอื่นเว้นว่างหมด */
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'สมชาย', lastName: 'ใจดี', tel: '089-999-9999' },
    ]));

    const c = await one('CUS-0001');
    expect(c.tel).toBe('089-999-9999');
    expect(c.tel2, 'เบอร์สำรองเว้นว่างในไฟล์ ต้องคงของเดิม').toBe('02-000-0000');
    expect(c.note).toBe('ลูกค้าประจำ');
    expect(c.addr, 'ที่อยู่เว้นว่างทั้งหมด ต้องคงของเดิมครบทุกช่อง')
      .toEqual({ no: '88/12', province: 'กรุงเทพมหานคร' });
  });

  it('ที่อยู่ที่กรอกมาบางช่อง รวมกับของเดิม ไม่ล้างช่องที่เหลือ', async () => {
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข', a_no: '1', a_road: 'สุขุมวิท',
        a_province: 'กรุงเทพมหานคร' },
    ]));
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข', a_zip: '10110' },
    ]));

    const c = await one('CUS-0001');
    expect(c.addr).toEqual({
      no: '1', road: 'สุขุมวิท', province: 'กรุงเทพมหานคร', zip: '10110',
    });
  });

  it('นำเข้ารถคันเดิมด้วยเลขตัวถังเดิม ปรับปรุงคันเดิม ไม่เพิ่มคันใหม่', async () => {
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข',
        v_plateA: 'กข', v_plateB: '1234', v_chassisNo: 'MR0FR22G8L1234567', v_color: 'ขาว' },
    ]));
    /* ทะเบียนเปลี่ยน แต่เลขตัวถังเดิม = คันเดิม */
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข',
        v_plateA: 'คง', v_plateB: '9999', v_chassisNo: 'MR0FR22G8L1234567' },
    ]));

    const c = await one('CUS-0001');
    const cars = await carsOf(c.id);
    expect(cars).toHaveLength(1);
    expect(cars[0].plate_b).toBe('9999');
    expect(cars[0].color, 'สีเว้นว่างในไฟล์รอบสอง ต้องคงของเดิม').toBe('ขาว');
  });

  it('เพิ่มรถคันใหม่ให้ลูกค้าเดิม ต้องไม่ลบคันเก่า', async () => {
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข', v_plateA: 'กข', v_plateB: '1111' },
    ]));
    await importContactsWith(app, 'customer', csv('customer', [
      { code: 'CUS-0001', firstName: 'ก', lastName: 'ข', v_plateA: 'กข', v_plateB: '2222' },
    ]));

    const c = await one('CUS-0001');
    const cars = await carsOf(c.id);
    expect(cars.map((v: any) => v.plate_b), 'คันเก่าต้องยังอยู่').toEqual(['1111', '2222']);
  });

  it('จับคู่ด้วยเลขผู้เสียภาษีเมื่อไม่มีรหัส', async () => {
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name, tax_id)
       values ($1,'CUS-0009','customer','company','บริษัท เดิม จำกัด','0105551234567')`,
      [tenantId]);

    const r = await importContactsWith(app, 'customer', csv('customer', [
      { type: 'นิติบุคคล', orgName: 'บริษัท ชื่อใหม่ จำกัด', taxId: '0105551234567',
        tel: '02-123-4567' },
    ]));

    expect(r).toMatchObject({ created: 0, updated: 1 });
    const c = await one('CUS-0009');
    expect(c.org_name).toBe('บริษัท ชื่อใหม่ จำกัด');
    expect(c.tel).toBe('02-123-4567');
  });

  it('จับคู่ด้วยชื่อได้ ถึงจะมีคำนำหน้าอยู่ — จุดที่ต้นฉบับทำไม่ได้', async () => {
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, prefix, first_name, last_name)
       values ($1,'CUS-0005','customer','person','นาย','สมชาย','ใจดี')`, [tenantId]);

    const r = await importContactsWith(app, 'customer', csv('customer', [
      { firstName: 'สมชาย', lastName: 'ใจดี', tel: '081-000-0000' },
    ]));

    expect(r, 'custName() ของ 6.4 ใส่คำนำหน้าตอนเทียบ แต่ recName() ไม่ใส่ จึงไม่มีวันตรงกัน')
      .toMatchObject({ created: 0, updated: 1 });
    expect((await one('CUS-0005')).tel).toBe('081-000-0000');
  });

  it('ชื่อซ้ำสองราย ข้ามแถวนั้นและไม่แตะใครเลย', async () => {
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, first_name, last_name)
       values ($1,'CUS-0001','customer','person','สมชาย','ใจดี'),
              ($1,'CUS-0002','customer','person','สมชาย','ใจดี')`, [tenantId]);

    const r = await importContactsWith(app, 'customer', csv('customer', [
      { firstName: 'สมชาย', lastName: 'ใจดี', tel: '081-000-0000' },
    ]));

    expect(r).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(r.errors[0]).toMatch(/มากกว่าหนึ่งราย/);
    const { rows } = await app.query('select tel from contacts order by code');
    expect(rows.every((x: any) => x.tel === ''), 'ต้องไม่แตะใครเลย').toBe(true);
  });

  it('ผู้ขายที่กรอกแต่ชื่อร้าน บันทึกได้โดยไม่ผิดเงื่อนไขของตาราง', async () => {
    const r = await importContactsWith(app, 'vendor', csv('vendor', [
      { type: 'บุคคล', orgName: 'ร้านอะไหล่เจ๊แดง', tel: '081-222-3333' },
    ]));
    expect(r).toMatchObject({ created: 1 });

    const v = await one('VEN-0001');
    expect(v.kind).toBe('vendor');
    expect(v.type).toBe('company');
    expect(v.org_name).toBe('ร้านอะไหล่เจ๊แดง');
  });

  it('ลูกค้ากับผู้ขายที่ชื่อเหมือนกันเป็นคนละราย ไม่จับคู่ข้ามทะเบียน', async () => {
    await importContactsWith(app, 'customer', csv('customer', [
      { type: 'นิติบุคคล', orgName: 'บริษัท ก จำกัด' },
    ]));
    const r = await importContactsWith(app, 'vendor', csv('vendor', [
      { type: 'นิติบุคคล', orgName: 'บริษัท ก จำกัด' },
    ]));
    expect(r).toMatchObject({ created: 1 });

    const { rows } = await app.query('select kind, code from contacts order by code');
    expect(rows.map((x: any) => x.kind)).toEqual(['customer', 'vendor']);
  });

  it('ออกรหัสให้หลายรายในไฟล์เดียวโดยไม่ซ้ำกัน', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      firstName: `ลูกค้า${i}`, lastName: 'ทดสอบ',
    }));
    await importContactsWith(app, 'customer', csv('customer', rows));

    const { rows: got } = await app.query('select code from contacts order by code');
    expect(got.map((r: any) => r.code))
      .toEqual(['CUS-0001', 'CUS-0002', 'CUS-0003', 'CUS-0004', 'CUS-0005']);
  });

  it('เกินเพดานต่อไฟล์ ต้องปฏิเสธทั้งไฟล์ ไม่ใช่นำเข้าครึ่งเดียว', async () => {
    const rows = Array.from({ length: 3001 }, (_, i) => ({
      firstName: `ค${i}`, lastName: 'ทดสอบ',
    }));
    await expect(importContactsWith(app, 'customer', csv('customer', rows)))
      .rejects.toThrow(/เกินครั้งละ/);

    const { rows: got } = await app.query('select count(*)::int as n from contacts');
    expect(got[0].n).toBe(0);
  }, 30_000);

  it('แถวที่ไม่มีชื่อถูกข้าม แต่แถวอื่นในไฟล์เดียวกันยังเข้า', async () => {
    const r = await importContactsWith(app, 'customer', csv('customer', [
      { firstName: 'สมชาย', lastName: 'ใจดี' },
      { tel: '081-000-0000' },
      { firstName: 'สมหญิง', lastName: 'ดีใจ' },
    ]));
    expect(r).toMatchObject({ created: 2, skipped: 1 });
    expect(r.errors[0]).toMatch(/บรรทัดที่ 3/);
  });

  it('ไม่แตะข้อมูลของอู่อื่น', async () => {
    const other = await admin.query(
      `insert into tenants (name) values ('อู่อื่น') returning id`);
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, first_name, last_name)
       values ($1,'CUS-0001','customer','person','สมชาย','ใจดี')`, [other.rows[0].id]);

    const r = await importContactsWith(app, 'customer', csv('customer', [
      { firstName: 'สมชาย', lastName: 'ใจดี', tel: '081-000-0000' },
    ]));
    expect(r, 'ชื่อตรงกับลูกค้าของอู่อื่น ต้องมองไม่เห็นและสร้างใหม่').toMatchObject({ created: 1 });

    const { rows } = await admin.query(
      'select tel from contacts where tenant_id = $1', [other.rows[0].id]);
    expect(rows[0].tel).toBe('');

    await admin.query('delete from contacts where tenant_id = $1', [other.rows[0].id]);
    await admin.query('delete from tenants where id = $1', [other.rows[0].id]);
  });
});
