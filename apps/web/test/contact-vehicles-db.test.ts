/**
 * รถของผู้ติดต่อตอนบันทึกฟอร์ม
 *
 * ฟอร์มผู้ขายไม่มีส่วนรถ (ผู้ใช้กำหนด) จึงส่งรายการรถว่างมาเสมอ
 * ถ้าซิงก์แบบลูกค้า รถของผู้ขายที่เคยมี (เช่นเคยบันทึกเป็นลูกค้ามาก่อน) จะถูกลบเงียบ ๆ ตอนกดบันทึก
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { syncVehiclesWith } from '../src/lib/contact-vehicles';
import type { Vehicle } from '../src/lib/contacts';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

const car = (plateB: string, id?: string): Vehicle => ({
  ...(id ? { id } : {}),
  brand: 'Toyota', model: 'Vios', year: '2560', color: 'ขาว',
  plateA: 'กข', plateB, plateProvince: 'กรุงเทพมหานคร',
  engineNo: '', chassisNo: '', mileage: '', other: '',
} as Vehicle);

describe.skipIf(!DB_URL)('รถของผู้ติดต่อตอนบันทึก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

  const contact = async (kind: 'customer' | 'vendor'): Promise<string> => {
    const { rows } = await app.query(
      `insert into contacts (tenant_id, kind, code, first_name)
       values (current_tenant_id(), $1, $2, 'ทดสอบ') returning id`,
      [kind, `${kind === 'vendor' ? 'VEN' : 'CUS'}-${Math.random().toString(36).slice(2, 8)}`]);
    return rows[0].id;
  };
  const plates = async (contactId: string): Promise<string[]> =>
    (await app.query(`select plate_b from vehicles where contact_id = $1 order by plate_b`, [contactId]))
      .rows.map((r) => r.plate_b);

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
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );
    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบรถผู้ติดต่อ') returning id`);
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
    for (const t of ['documents', 'vehicles', 'contacts']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
  });

  it('ผู้ขายที่มีรถอยู่แล้ว บันทึกด้วยรายการรถว่าง (ฟอร์มผู้ขายไม่มีส่วนรถ) → รถยังอยู่ครบ', async () => {
    const id = await contact('vendor');
    await syncVehiclesWith(app, id, 'customer', [car('1111'), car('2222')]);   /* เคยเป็นลูกค้า */
    expect(await plates(id)).toEqual(['1111', '2222']);

    await syncVehiclesWith(app, id, 'vendor', []);
    expect(await plates(id)).toEqual(['1111', '2222']);
  });

  it('ผู้ขายส่งรถมา (ไม่ควรเกิดจากฟอร์ม) → ไม่เพิ่มรถ', async () => {
    const id = await contact('vendor');
    await syncVehiclesWith(app, id, 'vendor', [car('3333')]);
    expect(await plates(id)).toEqual([]);
  });

  it('ลูกค้ายังซิงก์ตามเดิม — เอารถออกจากฟอร์มแล้วรถถูกลบ · แก้คันเดิม · เพิ่มคันใหม่', async () => {
    const id = await contact('customer');
    await syncVehiclesWith(app, id, 'customer', [car('1111'), car('2222')]);
    const { rows } = await app.query(`select id, plate_b from vehicles where contact_id = $1 order by plate_b`, [id]);
    const keep = rows[0].id as string;

    await syncVehiclesWith(app, id, 'customer', [car('1112', keep), car('4444')]);
    expect(await plates(id)).toEqual(['1112', '4444']);
  });

  it('ลูกค้า — คันที่มีเอกสารอ้างถึงไม่ถูกลบ แม้เอาออกจากฟอร์ม', async () => {
    const id = await contact('customer');
    await syncVehiclesWith(app, id, 'customer', [car('5555')]);
    const v = (await app.query(`select id from vehicles where contact_id = $1`, [id])).rows[0].id;
    await app.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_id, vehicle_id, vat_mode, payable, status)
       values (current_tenant_id(), 'QT', 'QT-TEST-1', current_date, $1, $2, 'ex', 0, 'issued')`, [id, v]);

    await syncVehiclesWith(app, id, 'customer', []);
    expect(await plates(id)).toEqual(['5555']);
  });
});
