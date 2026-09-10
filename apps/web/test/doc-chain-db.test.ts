/**
 * การต่อสายเอกสารขาย และกระดานงานบนหน้าใบเสนอราคา
 *
 * ข้อที่สำคัญที่สุดคือ **ใบเสร็จที่ออกจากใบเสนอราคาซึ่งมีใบส่งมอบแล้ว ต้องต่อสาย
 * จากใบส่งมอบ** ไม่ใช่จากใบเสนอราคา ถ้าต่อผิดจะได้ใบส่งมอบกับใบเสร็จเป็นพี่น้องกัน
 * ใบส่งมอบจึงไม่มีอะไรมาปิดยอด ค้างเป็นลูกหนี้ตลอดไปทั้งที่เก็บเงินไปแล้ว
 *
 * เป็นความผิดพลาดที่ไม่มีอาการบนหน้าจอ — ยอดขายรวมยังถูก มีแต่ยอดลูกหนี้ที่บวม
 * ขึ้นเรื่อย ๆ จนกว่าจะมีคนสงสัย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  openDocsForWith, plateOf, quoteFollowUpsWith, receiptsOfWith, resolveSourceForNewWith,
  syncVehicleFromDocWith,
} from '../src/lib/doc-chain';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('การต่อสายเอกสารขาย', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;

  /**
   * ใส่เอกสารผ่าน role ของแอปเพื่อให้ RLS ทำงานจริงเหมือนตอนใช้งาน
   *
   * ต้องเคารพ CHECK ของสคีมาด้วย — IV บังคับไม่มี VAT · IVT บังคับมี ·
   * และเอกสารที่ยกเลิกต้องมีเวลายกเลิกกำกับ ไม่ใช่แค่เปลี่ยนสถานะ
   */
  const addDoc = async (
    kind: string, no: string, parent: string | null = null, status = 'issued',
  ): Promise<string> => {
    const vatMode = kind === 'IV' ? 'none' : kind === 'IVT' ? 'ex' : 'ex';
    const { rows } = await app.query(
      `insert into documents
         (tenant_id, kind, doc_no, doc_date, parent_doc_id, status, vat_mode, voided_at)
       values (current_tenant_id(), $1, $2, current_date, $3, $4::doc_status, $5,
               case when $4::text = 'void' then now() else null end)
       returning id`,
      [kind, no, parent, status, vatMode],
    );
    return rows[0].id as string;
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
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ทดสอบสายเอกสาร'), ('อู่ข้างบ้าน') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

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

  /*
   * ล้างผ่าน role ของแอปทีละอู่ ไม่ใช่ผ่าน admin
   *
   * `documents` เปิด force row level security ไว้ ซึ่งมีผลกับ**เจ้าของตาราง**ด้วย
   * admin จึงลบไม่ได้เลยสักแถวเพราะไม่มี app.tenant_id — และไม่ error ด้วย
   * ลบ 0 แถวเงียบ ๆ แล้วเทสต์ถัดไปไปชนกับเลขที่เอกสารเดิม
   */
  beforeEach(async () => {
    /* ล้างอู่ข้างบ้านก่อน — ใบลูกของอู่นั้นชี้มาที่ใบแม่ของเรา ลบใบแม่ก่อนจะติด FK */
    for (const t of [otherTenant, tenantId]) {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
      await app.query('delete from documents');
      await app.query('delete from vehicles');
      await app.query('delete from contacts');
    }
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  });

  /* ---------------- ต้นทางของใบเสร็จ ---------------- */

  it('ใบเสนอราคาที่ยังไม่มีใบส่งมอบ — ออกใบเสร็จต่อจากใบเสนอราคาตามเดิม', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const r = await resolveSourceForNewWith(app, qt, 'RC');
    expect(r.sourceId).toBe(qt);
    expect(r.movedTo).toBeNull();
  });

  it('ใบเสนอราคาที่มีใบส่งมอบแล้ว — ใบเสร็จต้องต่อจากใบส่งมอบ', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const ivt = await addDoc('IVT', 'IVT-001', qt);

    const r = await resolveSourceForNewWith(app, qt, 'RC');
    expect(r.sourceId).toBe(ivt);
    expect(r.movedTo).toEqual({ id: ivt, docNo: 'IVT-001' });
  });

  it('ใบส่งมอบแบบไม่มี VAT ก็นับเหมือนกัน', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const iv = await addDoc('IV', 'IV-001', qt);

    expect((await resolveSourceForNewWith(app, qt, 'RC')).sourceId).toBe(iv);
  });

  it('ใบส่งมอบที่ถูกยกเลิกไม่นับ — กลับไปต่อจากใบเสนอราคา', async () => {
    const qt = await addDoc('QT', 'QT-001');
    await addDoc('IVT', 'IVT-001', qt, 'void');

    const r = await resolveSourceForNewWith(app, qt, 'RC');
    expect(r.sourceId).toBe(qt);
    expect(r.movedTo).toBeNull();
  });

  it('ออกใบส่งมอบ (ไม่ใช่ใบเสร็จ) ไม่เปลี่ยนต้นทางไม่ว่ากรณีใด', async () => {
    const qt = await addDoc('QT', 'QT-001');
    await addDoc('IVT', 'IVT-001', qt);

    for (const kind of ['IVT', 'IV', 'QT']) {
      expect((await resolveSourceForNewWith(app, qt, kind)).sourceId).toBe(qt);
    }
  });

  it('ต้นทางที่ไม่ใช่ใบเสนอราคา ไม่ถูกเปลี่ยน — ออกใบเสร็จจากใบส่งมอบตรง ๆ', async () => {
    const ivt = await addDoc('IVT', 'IVT-001');
    expect((await resolveSourceForNewWith(app, ivt, 'RC')).sourceId).toBe(ivt);
  });

  /* ---------------- กระดานงาน ---------------- */

  it('ใบเสนอราคาที่ยังไม่ได้ออกอะไรเลย — ทั้งสองช่องว่าง', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const m = await quoteFollowUpsWith(app, [qt]);
    expect(m.get(qt)).toEqual({ invoice: null, receipt: null });
  });

  it('ใบเสร็จที่ต่อจากใบเสนอราคาตรง ๆ (ไม่เคยออกใบส่งมอบ) — เห็นในช่องใบเสร็จ', async () => {
    const qt = await addDoc('QT', 'QT-001');
    await addDoc('RC', 'RC-001', qt);

    const got = (await quoteFollowUpsWith(app, [qt])).get(qt);
    expect(got?.invoice).toBeNull();
    expect(got?.receipt?.docNo).toBe('RC-001');
  });

  /*
   * สายที่แอปสร้างจริง — resolveSourceForNewWith() ต่อใบเสร็จเข้ากับใบส่งมอบ
   * ไม่ใช่กับใบเสนอราคา กระดานจึงต้องมองข้ามชั้นไปหาให้เจอ
   *
   * เทสต์เดิมของข้อนี้สร้างทั้งสองใบเป็นลูกตรงของใบเสนอราคา ซึ่งเป็นรูปแบบที่
   * แอปไม่เคยสร้างเลยหลังแก้การต่อสาย เทสต์จึงเขียว ทั้งที่ของจริงพัง —
   * ผู้ใช้เจอว่าออกใบเสร็จแล้วแต่กระดานยังขึ้นว่ารอจัดทำ
   */
  it('สายจริงของแอป ใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ — เห็นครบทั้งสองช่อง', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const ivt = await addDoc('IVT', 'IVT-001', qt);
    await addDoc('RC', 'RC-001', ivt);

    const got = (await quoteFollowUpsWith(app, [qt])).get(qt);
    expect(got?.invoice?.docNo).toBe('IVT-001');
    expect(got?.receipt?.docNo).toBe('RC-001');
  });

  it('ใบเสร็จที่ต่อจากใบส่งมอบซึ่งถูกยกเลิกไปแล้ว ไม่นับเป็นใบเสร็จของใบเสนอราคา', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const ivt = await addDoc('IVT', 'IVT-001', qt, 'void');
    await addDoc('RC', 'RC-001', ivt);

    const got = (await quoteFollowUpsWith(app, [qt])).get(qt);
    expect(got?.invoice).toBeNull();
    expect(got?.receipt).toBeNull();
  });

  it('ใบเสร็จของใบส่งมอบอีกใบที่ไม่ได้มาจากใบเสนอราคานี้ ไม่โผล่มา', async () => {
    const qt = await addDoc('QT', 'QT-001');
    const other = await addDoc('IVT', 'IVT-อื่น');
    await addDoc('RC', 'RC-อื่น', other);

    expect((await quoteFollowUpsWith(app, [qt])).get(qt)?.receipt).toBeNull();
  });

  /*
   * ข้อนี้คือเหตุผลที่คิวรีต้องกรอง status — ถ้าไม่กรอง ใบเสนอราคาที่เคยออก
   * ใบส่งมอบแล้วยกเลิกไป จะดูเหมือนงานเสร็จแล้วตลอดกาล แล้วไม่มีใครกลับมาออกใหม่
   */
  it('ใบส่งมอบที่ถูกยกเลิก ต้องกลับไปขึ้นว่ายังไม่ได้ออก', async () => {
    const qt = await addDoc('QT', 'QT-001');
    await addDoc('IVT', 'IVT-001', qt, 'void');

    expect((await quoteFollowUpsWith(app, [qt])).get(qt)?.invoice).toBeNull();
  });

  it('ออกใบส่งมอบใหม่หลังจากยกเลิกใบเก่า — เห็นใบใหม่ ไม่ใช่ใบที่ยกเลิก', async () => {
    const qt = await addDoc('QT', 'QT-001');
    await addDoc('IVT', 'IVT-001', qt, 'void');
    await addDoc('IVT', 'IVT-002', qt);

    expect((await quoteFollowUpsWith(app, [qt])).get(qt)?.invoice?.docNo).toBe('IVT-002');
  });

  it('หลายใบในหน้าเดียว แต่ละใบได้ของตัวเอง ไม่ปนกัน', async () => {
    const a = await addDoc('QT', 'QT-001');
    const b = await addDoc('QT', 'QT-002');
    const c = await addDoc('QT', 'QT-003');
    await addDoc('IVT', 'IVT-001', a);
    await addDoc('RC', 'RC-002', b);

    const m = await quoteFollowUpsWith(app, [a, b, c]);
    expect(m.get(a)?.invoice?.docNo).toBe('IVT-001');
    expect(m.get(a)?.receipt).toBeNull();
    expect(m.get(b)?.invoice).toBeNull();
    expect(m.get(b)?.receipt?.docNo).toBe('RC-002');
    expect(m.get(c)).toEqual({ invoice: null, receipt: null });

    /* ใบเสร็จของ a ที่ห้อยใต้ใบส่งมอบ ต้องไม่ไปโผล่ที่ b หรือ c */
    await addDoc('RC', 'RC-001', m.get(a)!.invoice!.id);
    const m2 = await quoteFollowUpsWith(app, [a, b, c]);
    expect(m2.get(a)?.receipt?.docNo).toBe('RC-001');
    expect(m2.get(b)?.receipt?.docNo).toBe('RC-002');
    expect(m2.get(c)?.receipt).toBeNull();
  });

  it('รายการว่างไม่ยิงคิวรีและไม่พัง', async () => {
    expect((await quoteFollowUpsWith(app, [])).size).toBe(0);
  });

  /*
   * ใบของอู่อื่นต้องมองไม่เห็น แม้จะรู้ id ของใบแม่ก็ตาม
   * RLS ควรกันอยู่แล้ว แต่คิวรีนี้รับ id เป็นพารามิเตอร์จากภายนอก
   * จึงเป็นจุดที่ต้องมีเทสต์ยืนยัน ไม่ใช่เชื่อว่ากันอยู่
   */
  it('ใบลูกของอู่อื่นไม่โผล่มาในกระดานของเรา', async () => {
    const qt = await addDoc('QT', 'QT-001');

    await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
    await app.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, parent_doc_id)
       values (current_tenant_id(), 'IVT', 'IVT-เพื่อนบ้าน', current_date, $1)`, [qt]);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

    expect((await quoteFollowUpsWith(app, [qt])).get(qt)?.invoice).toBeNull();
  });

  /* ---------------- เลขไมล์กลับเข้าทะเบียนรถ ---------------- */

  describe('เขียนเลขไมล์กลับ', () => {
    let vehicleId: string;

    beforeEach(async () => {
      const ct = await app.query(
        `insert into contacts (tenant_id, kind, code, first_name, last_name)
         values (current_tenant_id(), 'customer', 'C001', 'สมชาย', 'ใจดี') returning id`);
      const v = await app.query(
        `insert into vehicles (tenant_id, contact_id, brand, model, color, plate_a, plate_b, mileage)
         values (current_tenant_id(), $1, 'Toyota', 'Vios', 'ขาว', '1กก', '1234', '50000')
         returning id`, [ct.rows[0].id]);
      vehicleId = v.rows[0].id;
    });

    const reg = async () => (await app.query(
      `select brand, model, color, mileage, last_service_on::text as last_service_on
         from vehicles where id = $1`, [vehicleId])).rows[0];

    it('เลขไมล์ใหม่เข้าทะเบียนรถ พร้อมวันที่บริการล่าสุด', async () => {
      await syncVehicleFromDocWith(app, {
        vehicleId, mileage: '86500', docDate: '2569-01-15'.replace('2569', '2026'),
      });
      const v = await reg();
      expect(v.mileage).toBe('86500');
      expect(v.last_service_on).toBe('2026-01-15');
    });

    /*
     * ข้อสำคัญที่สุดของกลุ่มนี้ — แก้ยี่ห้อบนเอกสารต้องไม่ไปแก้ทะเบียนรถ
     * เอกสารเก็บภาพนิ่งไว้ ถ้าเขียนกลับหมดทุกช่อง การพิมพ์ผิดบนใบเดียว
     * จะไปทับทะเบียนรถถาวร แล้วใบเก่าทุกใบก็ยังคงข้อความเดิมไว้ ไม่มีใครรู้ว่าอันไหนจริง
     */
    it('ยี่ห้อ รุ่น สี ที่แก้บนเอกสาร ไม่เขียนกลับ', async () => {
      await syncVehicleFromDocWith(app, { vehicleId, mileage: '90000', docDate: '2026-02-01' });
      const v = await reg();
      expect({ brand: v.brand, model: v.model, color: v.color })
        .toEqual({ brand: 'Toyota', model: 'Vios', color: 'ขาว' });
    });

    it('ออกใบย้อนหลัง ไม่ดึงวันที่บริการล่าสุดถอยกลับ', async () => {
      await syncVehicleFromDocWith(app, { vehicleId, mileage: '90000', docDate: '2026-06-01' });
      await syncVehicleFromDocWith(app, { vehicleId, mileage: '88000', docDate: '2026-01-01' });

      const v = await reg();
      expect(v.last_service_on).toBe('2026-06-01');
      /* เลขไมล์ยังทับ เพราะเป็นค่าที่คนกรอกล่าสุด ไม่ใช่ค่าที่เรียงตามเวลา */
      expect(v.mileage).toBe('88000');
    });

    it('ไม่ได้กรอกเลขไมล์ — ไม่แตะทะเบียนรถเลย', async () => {
      await syncVehicleFromDocWith(app, { vehicleId, mileage: '   ', docDate: '2026-03-01' });
      const v = await reg();
      expect(v.mileage).toBe('50000');
      expect(v.last_service_on).toBeNull();
    });

    it('รถขาจรที่ไม่ได้อยู่ในทะเบียน — ไม่มีอะไรให้เขียนกลับ ไม่พัง', async () => {
      await expect(syncVehicleFromDocWith(app, {
        vehicleId: null, mileage: '77000', docDate: '2026-03-01',
      })).resolves.toBeUndefined();
    });

    it('รถของอู่อื่นแก้ไม่ได้ แม้จะรู้ id', async () => {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
      await syncVehicleFromDocWith(app, { vehicleId, mileage: '999999', docDate: '2026-04-01' });
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

      expect((await reg()).mileage).toBe('50000');
    });
  });

  /* ---------------- ปุ่มออกใบเสร็จในแถวของหน้าใบส่งมอบ ---------------- */

  describe('ใบส่งมอบใบไหนออกใบเสร็จไปแล้ว', () => {
    it('ยังไม่มีใบเสร็จ — ไม่มีชื่ออยู่ในผลลัพธ์ ปุ่มจึงขึ้น', async () => {
      const ivt = await addDoc('IVT', 'IVT-001');
      expect((await receiptsOfWith(app, [ivt])).has(ivt)).toBe(false);
    });

    it('ออกใบเสร็จแล้ว — เจอ ปุ่มจึงต้องหายไป', async () => {
      const ivt = await addDoc('IVT', 'IVT-001');
      await addDoc('RC', 'RC-001', ivt);
      expect((await receiptsOfWith(app, [ivt])).get(ivt)?.docNo).toBe('RC-001');
    });

    /* งานที่ต้องทำใหม่ต้องกลับขึ้นกระดาน ไม่ใช่หายไปเพราะเคยออกแล้วครั้งหนึ่ง */
    it('ใบเสร็จที่ถูกยกเลิก ไม่นับว่าออกแล้ว', async () => {
      const ivt = await addDoc('IVT', 'IVT-001');
      await addDoc('RC', 'RC-001', ivt, 'void');
      expect((await receiptsOfWith(app, [ivt])).has(ivt)).toBe(false);
    });

    it('หลายใบในหน้าเดียว ไม่ปนกัน', async () => {
      const a = await addDoc('IVT', 'IVT-001');
      const b = await addDoc('IVT', 'IVT-002');
      await addDoc('RC', 'RC-001', a);

      const m = await receiptsOfWith(app, [a, b]);
      expect(m.get(a)?.docNo).toBe('RC-001');
      expect(m.has(b)).toBe(false);
    });

    it('ใบเสร็จของอู่อื่นไม่โผล่มา', async () => {
      const ivt = await addDoc('IVT', 'IVT-001');

      await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
      await app.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, parent_doc_id, vat_mode)
         values (current_tenant_id(), 'RC', 'RC-เพื่อนบ้าน', current_date, $1, 'ex')`, [ivt]);
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

      expect((await receiptsOfWith(app, [ivt])).has(ivt)).toBe(false);
    });

    it('รายการว่างไม่พัง', async () => {
      expect((await receiptsOfWith(app, [])).size).toBe(0);
    });
  });

  /* ---------------- กล่องเลือกใบตอนออกเอกสารจากศูนย์ ---------------- */

  describe('ใบที่ยังค้าง ให้เลือกตอนออกเอกสารใหม่', () => {
    const nos = async (t: 'invoice' | 'receipt', search?: string) =>
      (await openDocsForWith(app, t, { search })).map((r) => r.docNo).sort();

    it('ออกใบส่งมอบ — เสนอใบเสนอราคาที่ยังไม่ได้ออกอะไรเลย', async () => {
      await addDoc('QT', 'QT-001');
      expect(await nos('invoice')).toEqual(['QT-001']);
    });

    it('ใบเสนอราคาที่ออกใบส่งมอบไปแล้ว ไม่โผล่ให้เลือกอีก', async () => {
      const qt = await addDoc('QT', 'QT-001');
      await addDoc('IVT', 'IVT-001', qt);
      expect(await nos('invoice')).toEqual([]);
    });

    it('ใบเสนอราคาที่ออกใบเสร็จตรง ๆ ไปแล้ว ก็ไม่โผล่', async () => {
      const qt = await addDoc('QT', 'QT-001');
      await addDoc('RC', 'RC-001', qt);
      expect(await nos('invoice')).toEqual([]);
    });

    it('ใบต่อที่ถูกยกเลิก — ใบเสนอราคากลับมาให้เลือกใหม่', async () => {
      const qt = await addDoc('QT', 'QT-001');
      await addDoc('IVT', 'IVT-001', qt, 'void');
      expect(await nos('invoice')).toEqual(['QT-001']);
    });

    it('ออกใบเสร็จ — เสนอทั้งใบส่งมอบที่ยังไม่เก็บเงิน และใบเสนอราคาที่ค้าง', async () => {
      await addDoc('QT', 'QT-001');
      await addDoc('IVT', 'IVT-900');
      expect(await nos('receipt')).toEqual(['IVT-900', 'QT-001']);
    });

    it('ใบส่งมอบที่เก็บเงินแล้ว ไม่โผล่ให้ออกใบเสร็จซ้ำ', async () => {
      const ivt = await addDoc('IVT', 'IVT-900');
      await addDoc('RC', 'RC-001', ivt);
      expect(await nos('receipt')).toEqual([]);
    });

    it('ตอนออกใบส่งมอบ ไม่เสนอใบส่งมอบด้วยกันเอง', async () => {
      await addDoc('IVT', 'IVT-900');
      expect(await nos('invoice')).toEqual([]);
    });

    it('ใบที่ถูกยกเลิกไม่โผล่ให้เลือก', async () => {
      await addDoc('QT', 'QT-001', null, 'void');
      expect(await nos('invoice')).toEqual([]);
    });

    it('ค้นด้วยเลขที่เอกสาร', async () => {
      await addDoc('QT', 'QT-001');
      await addDoc('QT', 'QT-002');
      expect(await nos('invoice', 'QT-002')).toEqual(['QT-002']);
    });

    it('ใบของอู่อื่นไม่โผล่มาให้เลือก', async () => {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
      await app.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, vat_mode)
         values (current_tenant_id(), 'QT', 'QT-เพื่อนบ้าน', current_date, 'ex')`);
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

      expect(await nos('invoice')).toEqual([]);
    });
  });

  /* ---------------- ทะเบียนรถแบบข้อความ ---------------- */

  describe('ทะเบียนที่ใช้ค้นหา', () => {
    /*
     * เอกสารขายกับใบเคลมต้องประกอบทะเบียนแบบเดียวกัน ไม่งั้นค้นด้วยทะเบียน
     * แล้วเจอเฉพาะบางชนิดเอกสาร ซึ่งผู้ใช้จะสรุปว่าใบนั้นหายไป
     */
    it('ประกอบจากหมวดอักษรกับหมวดตัวเลข', () => {
      expect(plateOf({ plateA: 'กค', plateB: '3279' })).toBe('กค 3279');
    });

    it('มีแค่ครึ่งเดียวก็ยังใช้ได้', () => {
      expect(plateOf({ plateA: 'กค', plateB: '' })).toBe('กค');
      expect(plateOf({ plateA: '', plateB: '3279' })).toBe('3279');
    });

    it('ไม่มีรถ — ได้ข้อความว่าง ไม่ใช่ null', () => {
      expect(plateOf(null)).toBe('');
      expect(plateOf(undefined)).toBe('');
      expect(plateOf({})).toBe('');
    });
  });
});