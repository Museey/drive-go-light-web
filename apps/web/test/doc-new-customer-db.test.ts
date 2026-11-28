/**
 * ออกเอกสารให้ลูกค้าที่ยังไม่มีในทะเบียน แล้วบันทึกลูกค้าลงทะเบียนไปพร้อมกัน (26 พ.ย. 2569)
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureCustomerForDocWith, worthSavingCustomer, type NewCustomerInput } from '../src/lib/doc-new-customer';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

const walkIn = (over: Partial<NewCustomerInput> = {}): NewCustomerInput => ({
  partyType: 'person', partyName: 'สมหมาย หน้าร้าน', partyTaxId: '', partyTel: '081-234-5678',
  partyEmail: '', partyAddr: {}, partyAddrText: '99/1 ถนนสุขุมวิท กรุงเทพฯ 10110', creditDays: 0,
  vehicle: { plateA: '1กก', plateB: '1234', plateProv: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Vios' },
  ...over,
});

describe('ค่าตั้งต้นของช่องติ๊กบันทึกลูกค้าใหม่', () => {
  const base = { partyName: 'สมหมาย', partyTel: '', partyTaxId: '', partyAddrText: '', vehicle: null };

  it('ชื่ออย่างเดียวไม่ติ๊กให้ — "เงินสด" ไม่ควรกลายเป็นลูกค้าในทะเบียน', () => {
    expect(worthSavingCustomer(base)).toBe(false);
    expect(worthSavingCustomer({ ...base, partyName: 'เงินสด' })).toBe(false);
  });

  it('มีเบอร์ เลขผู้เสียภาษี ที่อยู่ หรือทะเบียนรถ อย่างใดอย่างหนึ่ง — ติ๊กให้', () => {
    expect(worthSavingCustomer({ ...base, partyTel: '0812345678' })).toBe(true);
    expect(worthSavingCustomer({ ...base, partyTaxId: '1234567890123' })).toBe(true);
    expect(worthSavingCustomer({ ...base, partyAddrText: '99/1 สุขุมวิท' })).toBe(true);
    expect(worthSavingCustomer({ ...base, vehicle: { plateB: '1234' } })).toBe(true);
  });

  it('ไม่มีชื่อ หรือเบอร์พิมพ์ไม่ครบ — ไม่ติ๊ก', () => {
    expect(worthSavingCustomer({ ...base, partyName: '  ', partyTel: '0812345678' })).toBe(false);
    expect(worthSavingCustomer({ ...base, partyTel: '081' })).toBe(false);
  });
});

describe.skipIf(!DB_URL)('บันทึกลูกค้าใหม่จากหน้าออกเอกสาร', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let theirs: string;

  const as = (t: string) => app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
  /* ตัวสร้างใช้ advisory lock ระดับทรานแซกชัน — เรียกในทรานแซกชันเหมือนตอนถูกเรียกจาก mutate() */
  const ensure = async (input: NewCustomerInput) => {
    await app.query('begin');
    try {
      const r = await ensureCustomerForDocWith(app, input);
      await app.query('commit');
      return r;
    } catch (err) {
      await app.query('rollback');
      throw err;
    }
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`do $$ begin
      if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
    end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    mine = (await admin.query(`insert into tenants (name) values ('อู่ลูกค้าใหม่') returning id`)).rows[0].id;
    theirs = (await admin.query(`insert into tenants (name) values ('อู่อื่น') returning id`)).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await as(mine);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    await admin.query(`delete from vehicles`);
    await admin.query(`delete from contacts`);
    await as(mine);
  });

  it('สร้างลูกค้าและรถจากข้อมูลบนใบ — รหัสต่อจากเลขล่าสุด', async () => {
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, first_name) values ($1,'CUS-0007','customer','person','คนเดิม')`, [mine]);

    const r = await ensure(walkIn());
    expect(r.created).toBe(true);
    expect(r.code).toBe('CUS-0008');

    const k = (await admin.query(
      `select kind::text as kind, type::text as type, first_name, org_name, tel, addr_text, tax_id, tenant_id
         from contacts where id = $1`, [r.contactId])).rows[0];
    expect(k).toMatchObject({
      kind: 'customer', type: 'person', first_name: 'สมหมาย หน้าร้าน', org_name: '',
      tel: '081-234-5678', addr_text: '99/1 ถนนสุขุมวิท กรุงเทพฯ 10110', tax_id: null, tenant_id: mine,
    });

    const v = (await admin.query(
      `select contact_id, plate_a, plate_b, plate_province, brand, model from vehicles where id = $1`, [r.vehicleId])).rows[0];
    expect(v).toMatchObject({
      contact_id: r.contactId, plate_a: '1กก', plate_b: '1234', plate_province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Vios',
    });
  });

  it('นิติบุคคล — ชื่อลงช่องชื่อกิจการ และเก็บเลขผู้เสียภาษี 13 หลัก', async () => {
    const r = await ensure(walkIn({
      partyType: 'company', partyName: 'บริษัท ขนส่งใหม่ จำกัด', partyTaxId: '0-1055-12345-67-8', vehicle: null,
    }));
    const k = (await admin.query(`select type::text as type, first_name, org_name, tax_id from contacts where id = $1`, [r.contactId])).rows[0];
    expect(k).toEqual({ type: 'company', first_name: '', org_name: 'บริษัท ขนส่งใหม่ จำกัด', tax_id: '0105512345678' });
    expect(r.vehicleId, 'ไม่มีทะเบียนบนใบ ไม่สร้างรถเปล่า').toBeNull();
  });

  it('มีรายเดิมที่เลขผู้เสียภาษีตรงกัน — ผูกรายเดิม ไม่สร้างซ้ำ', async () => {
    const first = await ensure(walkIn({ partyTaxId: '1234567890123' }));
    const again = await ensure(walkIn({ partyName: 'พิมพ์ชื่อไม่เหมือนเดิม', partyTel: '', partyTaxId: '1234567890123' }));
    expect(again.created).toBe(false);
    expect(again.contactId).toBe(first.contactId);
    expect((await admin.query(`select count(*)::int as n from contacts where tenant_id = $1`, [mine])).rows[0].n).toBe(1);
  });

  it('ชื่อกับเบอร์ตรงกัน — ผูกรายเดิม และรถคันเดิมไม่ถูกสร้างซ้ำ แม้พิมพ์ทะเบียนเว้นวรรคต่างกัน', async () => {
    const first = await ensure(walkIn());
    const again = await ensure(walkIn({
      partyTel: '0812345678', vehicle: { plateA: '1 กก', plateB: '-1234' },
    }));
    expect(again.created).toBe(false);
    expect(again.contactId).toBe(first.contactId);
    expect(again.vehicleId).toBe(first.vehicleId);
    expect((await admin.query(`select count(*)::int as n from vehicles where tenant_id = $1`, [mine])).rows[0].n).toBe(1);
  });

  it('ชื่อตรงกันอย่างเดียว (เบอร์ต่างกันหรือไม่มีเบอร์) — ถือเป็นคนละคน สร้างรายใหม่', async () => {
    const first = await ensure(walkIn());
    const other = await ensure(walkIn({ partyTel: '089-999-0000', vehicle: null }));
    const noTel = await ensure(walkIn({ partyTel: '', vehicle: null }));
    expect(other.created).toBe(true);
    expect(noTel.created).toBe(true);
    expect(new Set([first.contactId, other.contactId, noTel.contactId]).size).toBe(3);
  });

  it('ลูกค้าเดิมมาด้วยรถคันใหม่ — เพิ่มรถให้รายเดิม', async () => {
    const first = await ensure(walkIn());
    const again = await ensure(walkIn({ vehicle: { plateA: '2ขข', plateB: '5678' } }));
    expect(again.contactId).toBe(first.contactId);
    expect(again.vehicleId).not.toBe(first.vehicleId);
    expect((await admin.query(`select count(*)::int as n from vehicles where contact_id = $1`, [first.contactId])).rows[0].n).toBe(2);
  });

  it('ลูกค้าของอู่อื่นที่เลขผู้เสียภาษีตรงกัน ไม่ถูกผูกข้ามอู่', async () => {
    await admin.query(
      `insert into contacts (tenant_id, code, kind, type, first_name, tax_id)
       values ($1,'CUS-0001','customer','person','ลูกค้าอู่อื่น','1234567890123')`, [theirs]);
    const r = await ensure(walkIn({ partyTaxId: '1234567890123' }));
    expect(r.created).toBe(true);
    expect((await admin.query(`select tenant_id from contacts where id = $1`, [r.contactId])).rows[0].tenant_id).toBe(mine);
  });

  it('ไม่มีชื่อ — ไม่สร้างอะไร', async () => {
    await expect(ensure(walkIn({ partyName: '   ' }))).rejects.toThrow('ต้องระบุชื่อลูกค้า');
    expect((await admin.query(`select count(*)::int as n from contacts`)).rows[0].n).toBe(0);
  });
});
