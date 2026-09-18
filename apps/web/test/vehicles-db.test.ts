/**
 * ค้นด้วยทะเบียนรถ → การ์ดรถ → ประวัติของรถคันนั้น (ผู้ใช้กำหนด 19 ก.ย. 2569)
 *
 * หน้าเคาน์เตอร์จำ "4 ตัวท้าย" เป็นหลัก ลูกค้าคันเดียวกันกลับมาซ่อมซ้ำ
 * สิ่งที่อยากเห็นคือใบเสร็จของรถคันนั้น ไม่ใช่รายชื่อลูกค้า
 *
 * เอกสารที่นำเข้าจากโปรแกรมเดิมไม่มี vehicle_id — ผูกได้ทางเดียวคือเทียบทะเบียน
 * ประวัติรถจึงต้องหาเจอทั้งสองทาง ไม่งั้นอู่ที่ย้ายข้อมูลมาจะเห็นประวัติว่างเปล่า
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { searchVehiclesWith, vehicleHistoryWith } from '../src/lib/vehicles';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ค้นทะเบียนรถและประวัติรถ', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;
  let custId: string;
  let vehA: string;
  let vehB: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`do $$ begin
      if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
    end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    const t = await admin.query(`insert into tenants (name) values ('อู่ทะเบียน'), ('อู่ข้างบ้าน') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of [tenantId, otherTenant]) {
      await admin.query(`delete from payments where tenant_id = $1`, [t]);
      await admin.query(`delete from documents where tenant_id = $1`, [t]);
      await admin.query(`delete from vehicles where tenant_id = $1`, [t]);
      await admin.query(`delete from contacts where tenant_id = $1`, [t]);
    }
    custId = (await admin.query(
      `insert into contacts (tenant_id, code, kind, type, prefix, first_name, last_name)
       values ($1,'CUS-1','customer','person','นาย','สมชาย','ใจดี') returning id`, [tenantId])).rows[0].id;
    vehA = (await admin.query(
      `insert into vehicles (tenant_id, contact_id, brand, model, color, plate_a, plate_b, plate_province)
       values ($1,$2,'Toyota','Revo','ขาว','กข','5466','กรุงเทพมหานคร') returning id`, [tenantId, custId])).rows[0].id;
    vehB = (await admin.query(
      `insert into vehicles (tenant_id, contact_id, brand, model, color, plate_a, plate_b, plate_province)
       values ($1,$2,'Isuzu','D-Max','เทา','กค','3279','กรุงเทพมหานคร') returning id`, [tenantId, custId])).rows[0].id;
  });

  /** เอกสารขายที่ผูกรถด้วยทะเบียน (แบบข้อมูลที่นำเข้ามา) หรือด้วย vehicle_id (แบบที่ออกในเว็บ) */
  const doc = async (no: string, plate: string, opts: { vehicleId?: string; kind?: string; total?: number; tenant?: string } = {}) => {
    const total = opts.total ?? 1000;
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name, vat_mode,
                              vehicle_id, vehicle_plate, subtotal, net_amount, grand_total, payable)
       values ($1,$2,$3,current_date,'issued',$4,'นาย สมชาย ใจดี','none',$5,$6,$7,$7,$7,$7) returning id`,
      [opts.tenant ?? tenantId, opts.kind ?? 'RC', no, opts.tenant ? null : custId,
       opts.vehicleId ?? null, plate, total]);
    return rows[0].id as string;
  };

  describe('ค้นด้วยทะเบียน', () => {
    it('พิมพ์ 4 ตัวท้ายแล้วเจอรถคันนั้น พร้อมเจ้าของและยี่ห้อ/รุ่น', async () => {
      const hits = await searchVehiclesWith(app, '5466');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        id: vehA, plate: 'กข 5466', brand: 'Toyota', model: 'Revo', ownerName: 'นาย สมชาย ใจดี', ownerId: custId,
      });
    });

    it('นับจำนวนใบและยอดค้างของรถคันนั้น', async () => {
      const d1 = await doc('RC-1', 'กข 5466');
      await doc('RC-2', 'กข 5466', { total: 500 });
      await doc('RC-9', 'กค 3279');
      await admin.query(
        `insert into payments (tenant_id, doc_id, paid_on, method, amount) values ($1,$2,current_date,'เงินสด',400)`,
        [tenantId, d1]);

      const [hit] = await searchVehiclesWith(app, '5466');
      expect(hit.docCount, 'สองใบของคันนี้').toBe(2);
      expect(hit.outstanding, '1,000 − 400 + 500').toBe(1100);
    });

    it('ค้นด้วยหมวดอักษรก็เจอ · คำที่ไม่ใช่ทะเบียนไม่คืนอะไร', async () => {
      expect((await searchVehiclesWith(app, 'กค')).map((v) => v.id)).toEqual([vehB]);
      expect(await searchVehiclesWith(app, 'สมชาย')).toEqual([]);
      expect(await searchVehiclesWith(app, '')).toEqual([]);
    });

    it('รถของอู่อื่นไม่โผล่มา', async () => {
      const other = (await admin.query(
        `insert into contacts (tenant_id, code, kind, type, org_name) values ($1,'C-X','customer','company','อู่อื่น') returning id`,
        [otherTenant])).rows[0].id;
      await admin.query(
        `insert into vehicles (tenant_id, contact_id, plate_a, plate_b) values ($1,$2,'กข','5466')`,
        [otherTenant, other]);
      expect((await searchVehiclesWith(app, '5466')).map((v) => v.id)).toEqual([vehA]);
    });
  });

  describe('ประวัติของรถคันนั้น', () => {
    it('เอกสารที่ผูกด้วยทะเบียน (ข้อมูลที่นำเข้ามา) ขึ้นครบ และไม่ปนคันอื่น', async () => {
      await doc('RC-1', 'กข 5466');
      await doc('IV-1', 'กข 5466', { kind: 'IV' });   /* IVT ต้องมี VAT เสมอตามสคีมา ใช้ IV แทน */
      await doc('RC-9', 'กค 3279');

      const h = await vehicleHistoryWith(app, vehA);
      expect(h?.vehicle.plate).toBe('กข 5466');
      expect(h?.docs.map((d) => d.docNo).sort()).toEqual(['IV-1', 'RC-1']);
    });

    it('เอกสารที่ผูกด้วย vehicle_id (ออกในเว็บ) ก็ขึ้น แม้ทะเบียนบนใบจะถูกแก้ภายหลัง', async () => {
      await doc('RC-5', 'กข 9999', { vehicleId: vehA });
      const h = await vehicleHistoryWith(app, vehA);
      expect(h?.docs.map((d) => d.docNo)).toEqual(['RC-5']);
    });

    it('ใบที่ยกเลิกยังอยู่ในประวัติ แต่ใบที่ลบถาวรหายไป', async () => {
      const keep = await doc('RC-VOID', 'กข 5466');
      const gone = await doc('RC-PURGED', 'กข 5466');
      await admin.query(`update documents set status='void', voided_at=now() where id=$1`, [keep]);
      await admin.query(`update documents set status='void', voided_at=now(), purged_at=now() where id=$1`, [gone]);

      const h = await vehicleHistoryWith(app, vehA);
      expect(h?.docs.map((d) => d.docNo)).toEqual(['RC-VOID']);
      expect(h?.docs[0].status).toBe('void');
    });

    it('เรียงใบที่บันทึกล่าสุดไว้บนสุด', async () => {
      const first = await doc('RC-เก่า', 'กข 5466');
      await admin.query(`update documents set created_at = now() - interval '2 days' where id = $1`, [first]);
      await doc('RC-ใหม่', 'กข 5466');

      const h = await vehicleHistoryWith(app, vehA);
      expect(h?.docs.map((d) => d.docNo)).toEqual(['RC-ใหม่', 'RC-เก่า']);
    });

    it('รถที่ไม่มีอยู่ (หรือของอู่อื่น) คืนค่าว่าง ไม่ใช่ข้อมูลของคนอื่น', async () => {
      expect(await vehicleHistoryWith(app, '00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });
});
