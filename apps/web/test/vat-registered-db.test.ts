/**
 * ร้านจด / ไม่จดภาษีมูลค่าเพิ่ม — ฝั่งฐานข้อมูล (ผู้ใช้กำหนด 2 ต.ค. 2569 · ไมเกรชัน 036)
 *
 * ผู้ใช้ห่วงข้อเดียวก่อนอย่างอื่น: **อู่ที่คิด VAT อยู่ต้องไม่กระทบ**
 * ข้อแรกจึงพิสูจน์กับไมเกรชันจริงว่าอู่ที่มีอยู่ได้ "จด" ทุกอู่ ไม่ใช่แค่ดูค่าตั้งต้นในไฟล์ 001
 *
 * ที่เหลือพิสูจน์ว่าเซิร์ฟเวอร์ตัดสินโหมดภาษีจากค่าในฐาน ไม่ใช่จากที่หน้าเว็บส่งมา (sales-vat.ts)
 * ตารางกติกาเต็มอยู่ที่ sales-rules.test.ts
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { VatMode } from '@drivegolight/core';
import { freshSchema, TEST_OWNER } from '../../../tools/test-schema.mjs';
import { NO_TAX_INVOICE, type SalesKind } from '../src/lib/sales-rules';
import { shopVatRegisteredWith, VAT_MODE_STALE_MESSAGE, vatModeForSaveWith } from '../src/lib/sales-vat';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;
const MIGRATION_036 = readFileSync(resolve(ROOT, 'db/036_vat_registered.sql'), 'utf8');

describe.skipIf(!DB_URL)('ร้านจด / ไม่จดภาษีมูลค่าเพิ่ม', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ไม่จด VAT'), ('อู่จด VAT') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    /* ต่อในนาม role ของแอปจริง ไม่ใช่ superuser — อ่านผ่าน RLS แบบเดียวกับเครื่องจริง */
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  /** รันไฟล์ไมเกรชันในนามเจ้าของสคีมา (role ธรรมดา) เหมือนเครื่องจริง ไม่ใช่ superuser — ดู schema-owner.test.ts */
  const migrate036 = async () => {
    await admin.query(`set role ${TEST_OWNER}`);
    try { await admin.query(MIGRATION_036); } finally { await admin.query('reset role'); }
  };

  beforeEach(async () => {
    await admin.query(`delete from documents`);
    await admin.query(`update tenants set vat_registered = (id <> $1)`, [tenantId]);
  });

  /** ใบที่ออกไว้แล้ว — ใส่ตรงเพื่อจำลองใบเก่าที่ออกตอนร้านยังจด VAT */
  const addDoc = async (kind: SalesKind, vatMode: VatMode, parent: string | null = null): Promise<string> => {
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, status, vat_mode, parent_doc_id)
       values ($1, $2, $3, 'issued', $4, $5) returning id`,
      [tenantId, kind, `${kind}-${Math.random().toString(36).slice(2, 8)}`, vatMode, parent]);
    return rows[0].id as string;
  };

  /** ใบใหม่ (ไม่มี id) */
  const fresh = (kind: SalesKind, vatMode: VatMode, parentDocId: string | null = null) =>
    ({ kind, vatMode, parentDocId });

  /* ===================================================================== */

  it('ไมเกรชัน 036 ให้อู่ที่มีอยู่ทุกอู่เป็น "จด VAT" — อู่ที่คิด VAT อยู่ทำงานเหมือนเดิม', async () => {
    /* ย้อนสคีมาไปก่อนมีคอลัมน์ ใส่อู่เดิมไว้ แล้วรันไฟล์ไมเกรชันจริง */
    await admin.query(`alter table tenants drop column vat_registered`);
    const before = await admin.query(`insert into tenants (name) values ('อู่ที่ใช้มาก่อน') returning id`);
    await migrate036();

    const { rows } = await admin.query(`select vat_registered from tenants where id = $1`, [before.rows[0].id]);
    expect(rows[0].vat_registered).toBe(true);
    /* อู่ที่เปิดใหม่หลังจากนี้ก็เริ่มที่จด — ตั้งเป็นไม่จดเองที่ 07 ตั้งค่าร้าน */
    const after = await admin.query(`insert into tenants (name) values ('อู่เปิดใหม่') returning vat_registered`);
    expect(after.rows[0].vat_registered).toBe(true);

    /* ไฟล์ซ้ำได้ (if not exists) — รันซ้ำบนฐานที่มีคอลัมน์แล้วต้องไม่ล้มและไม่ทับค่าที่ร้านตั้งไว้ */
    await admin.query(`update tenants set vat_registered = false where id = $1`, [before.rows[0].id]);
    await migrate036();
    const again = await admin.query(`select vat_registered from tenants where id = $1`, [before.rows[0].id]);
    expect(again.rows[0].vat_registered).toBe(false);
    await admin.query(`delete from tenants where id in ($1, $2)`, [before.rows[0].id, after.rows[0].id]);
  });

  it('อ่านค่าของอู่ตัวเองผ่าน RLS — อู่ข้างเคียงตั้งต่างกันไม่ปนกัน', async () => {
    expect(await shopVatRegisteredWith(app)).toBe(false);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
    expect(await shopVatRegisteredWith(app)).toBe(true);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  });

  describe('ร้านที่ไม่จด VAT', () => {
    it('ออกใบกำกับภาษีใบใหม่ไม่ได้', async () => {
      await expect(vatModeForSaveWith(app, fresh('IVT', 'ex'), false)).rejects.toThrow(NO_TAX_INVOICE);
    });

    it('ใบใหม่ QT · IV · RC บันทึกเป็นไม่คิด VAT', async () => {
      for (const k of ['QT', 'IV', 'RC'] as const) {
        expect(await vatModeForSaveWith(app, fresh(k, 'none'), false)).toBe('none');
      }
    });

    it('ฟอร์มที่เปิดค้างไว้ก่อนเปลี่ยนการตั้งค่า ส่ง VAT มา → ปฏิเสธ ไม่ปรับยอดให้เงียบ ๆ', async () => {
      await expect(vatModeForSaveWith(app, fresh('RC', 'ex'), false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
      await expect(vatModeForSaveWith(app, fresh('QT', 'in'), false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
    });

    it('ใบเสร็จต่อจากใบกำกับภาษีเก่า คิด VAT ตามใบกำกับ — ชนิดใบต้นทางอ่านจากฐาน', async () => {
      const ivt = await addDoc('IVT', 'ex');
      expect(await vatModeForSaveWith(app, fresh('RC', 'ex', ivt), false)).toBe('ex');
      await expect(vatModeForSaveWith(app, fresh('RC', 'none', ivt), false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);

      /* ต่อจากใบเสนอราคาเก่าที่มี VAT = ใบใหม่ธรรมดา ไม่คิด VAT */
      const qt = await addDoc('QT', 'ex');
      expect(await vatModeForSaveWith(app, fresh('RC', 'none', qt), false)).toBe('none');
      await expect(vatModeForSaveWith(app, fresh('RC', 'ex', qt), false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
    });

    it('แก้ใบเก่าที่มี VAT: คงไว้ได้ · เอาออกได้ · เพิ่มหรือสลับแบบไม่ได้', async () => {
      const rc = await addDoc('RC', 'ex');
      expect(await vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'ex') }, false)).toBe('ex');
      expect(await vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'none') }, false)).toBe('none');
      await expect(vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'in') }, false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);

      const plain = await addDoc('QT', 'none');
      await expect(vatModeForSaveWith(app, { id: plain, ...fresh('QT', 'ex') }, false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
    });

    it('ใบกำกับภาษีเก่าแก้ได้และยังมี VAT · ใบเสร็จเก่าที่ต่อจากมันคง VAT ไว้', async () => {
      const ivt = await addDoc('IVT', 'ex');
      expect(await vatModeForSaveWith(app, { id: ivt, ...fresh('IVT', 'ex') }, false)).toBe('ex');
      const rc = await addDoc('RC', 'ex', ivt);
      expect(await vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'ex') }, false)).toBe('ex');
      await expect(vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'none') }, false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
    });

    it('ใบที่แก้ใช้ชนิดและโหมดเดิมจากฐาน ไม่เชื่อชนิดที่หน้าเว็บส่งมา', async () => {
      const rc = await addDoc('RC', 'none');
      /* ปลอมว่าเป็นใบกำกับภาษีเพื่อให้ได้ VAT — ฐานบอกว่าเป็นใบเสร็จที่ไม่มี VAT */
      await expect(vatModeForSaveWith(app, { id: rc, ...fresh('IVT', 'ex') }, false)).rejects.toThrow(VAT_MODE_STALE_MESSAGE);
    });
  });

  describe('ร้านที่จด VAT — เหมือนเดิมทุกอย่าง', () => {
    it('ใบเสนอราคา/ใบเสร็จตามที่เลือก · IV บังคับไม่คิด · IVT บังคับคิด โดยไม่ปฏิเสธ', async () => {
      expect(await vatModeForSaveWith(app, fresh('QT', 'in'), true)).toBe('in');
      expect(await vatModeForSaveWith(app, fresh('RC', 'none'), true)).toBe('none');
      expect(await vatModeForSaveWith(app, fresh('IV', 'ex'), true)).toBe('none');
      expect(await vatModeForSaveWith(app, fresh('IVT', 'none'), true)).toBe('ex');
    });

    it('แก้ใบเก่าเปลี่ยนแบบภาษีได้อิสระเหมือนเดิม', async () => {
      const rc = await addDoc('RC', 'none');
      expect(await vatModeForSaveWith(app, { id: rc, ...fresh('RC', 'ex') }, true)).toBe('ex');
    });
  });

  /**
   * ลำดับใน saveSalesDoc — ล็อกแถวก่อนแล้วค่อยตัดสินโหมดภาษี
   *
   * sales.ts มี server-only นำเข้าในเทสต์ไม่ได้ จึงตรวจลำดับจากซอร์ส
   * ถ้าสลับกลับ โหมดที่บันทึกไว้จะถูกอ่านก่อนอีกเครื่องบันทึกเสร็จ แล้วตัดสินจากค่าเก่า
   */
  it('saveSalesDoc ล็อกแถวที่แก้ก่อนอ่านค่าที่ใช้ตัดสินโหมดภาษี', () => {
    const src = readFileSync(resolve(ROOT, 'apps/web/src/lib/sales.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function saveSalesDoc'));
    const lock = body.indexOf('lockDocForEditWith(c, id, input.baseVersion)');
    const decide = body.indexOf('vatModeForSaveWith(c, input, await shopVatRegisteredWith(c))');
    const totals = body.indexOf('recTotals(doc, { vatRate })');
    expect(lock).toBeGreaterThan(0);
    expect(decide).toBeGreaterThan(lock);
    expect(totals).toBeGreaterThan(decide);
  });
});
