/**
 * หาสินค้าจากบาร์โค้ดที่ยิง — บนฐานข้อมูลจริง
 *
 * ลำดับการค้นสำคัญกว่าที่เห็น: รหัสร้านของสินค้าตัวหนึ่งไปตรงกับส่วนหนึ่งของชื่อ
 * สินค้าอีกตัวได้เสมอ ถ้าไม่ให้ตัวที่ตรงเป๊ะชนะก่อน การยิงจะได้ของผิดเป็นครั้งคราว
 * โดยไม่มีรูปแบบ ซึ่งเป็นอาการที่หาสาเหตุยากที่สุด
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { findByScanWith } from '../src/lib/scan';
import { freshSchema } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ยิงบาร์โค้ดหาสินค้า', () => {
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
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ยิงบาร์โค้ด'), ('อู่ข้างบ้าน') returning id`);
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
    for (const t of [otherTenant, tenantId]) {
      await admin.query(`delete from products where tenant_id = $1`, [t]);
    }
  });

  const add = async (o: {
    code: string; name?: string; barcode?: string | null; oem?: string;
    active?: boolean; tenant?: string;
  }): Promise<string> => {
    const { rows } = await admin.query(
      `insert into products (tenant_id, code, name, unit, barcode, oem, active, last_cost)
       values ($1,$2,$3,'ชิ้น',$4,$5,$6,100) returning id`,
      [o.tenant ?? tenantId, o.code, o.name ?? o.code, o.barcode ?? null,
       o.oem ?? '', o.active ?? true]);
    return rows[0].id;
  };

  it('ยิงบาร์โค้ดตรงเป๊ะ เจอตัวนั้น', async () => {
    const id = await add({ code: 'BRK-1', barcode: '8851234567890' });
    expect(await findByScanWith(app, '8851234567890')).toEqual({ kind: 'one', productId: id });
  });

  it('พิมพ์เล็กพิมพ์ใหญ่ไม่สำคัญ', async () => {
    const id = await add({ code: 'brk-1', barcode: 'abc123' });
    expect(await findByScanWith(app, 'ABC123')).toEqual({ kind: 'one', productId: id });
    expect(await findByScanWith(app, 'BRK-1')).toEqual({ kind: 'one', productId: id });
  });

  it('ยิงด้วยรหัสร้านหรือรหัส OEM ก็เจอ', async () => {
    const id = await add({ code: 'OIL-001', oem: 'OEM-9', barcode: null });
    expect(await findByScanWith(app, 'OIL-001')).toEqual({ kind: 'one', productId: id });
    expect(await findByScanWith(app, 'OEM-9')).toEqual({ kind: 'one', productId: id });
  });

  /** ข้อสำคัญที่สุดของไฟล์นี้ */
  /*
   * ตั้งรหัสให้ตัวที่ควรชนะเรียงตัวอักษร **ท้ายสุด** โดยตั้งใจ —
   * ถ้าเผลอเรียงด้วยรหัสแทนชนิดที่ตรง ข้อนี้จะผ่านโดยบังเอิญ
   * (เคยเขียนแบบนั้นแล้วการกลายพันธุ์รอดมาได้จริง)
   */
  it('ตัวที่บาร์โค้ดตรงเป๊ะชนะตัวที่รหัสตรงเป๊ะ และชนะตัวที่ตรงบางส่วน', async () => {
    const byBarcode = await add({ code: 'ZZZ-LAST', barcode: 'X100' });
    await add({ code: 'X100', barcode: 'AAA-FIRST' });          /* รหัสตรงเป๊ะ */
    await add({ code: 'AAA-NAME', name: 'ของที่มี X100 อยู่ในชื่อ' }); /* ตรงบางส่วน */

    expect(await findByScanWith(app, 'X100')).toEqual({ kind: 'one', productId: byBarcode });
  });

  it('รหัสร้านตรงเป๊ะชนะรหัส OEM ที่ตรงเป๊ะ', async () => {
    const byCode = await add({ code: 'ZZ-CODE', oem: 'ไม่เกี่ยว' });
    await add({ code: 'AA-OTHER', oem: 'ZZ-CODE' });

    expect(await findByScanWith(app, 'ZZ-CODE')).toEqual({ kind: 'one', productId: byCode });
  });

  it('ตรงบางส่วนหลายตัว — บอกว่าเจอหลายตัว ไม่เดาให้', async () => {
    await add({ code: 'BRK-1', name: 'ผ้าเบรกหน้า' });
    await add({ code: 'BRK-2', name: 'ผ้าเบรกหลัง' });
    expect(await findByScanWith(app, 'ผ้าเบรก')).toEqual({ kind: 'many', count: 2 });
  });

  it('ตรงบางส่วนตัวเดียว — ใช้ตัวนั้นเลย', async () => {
    const id = await add({ code: 'BRK-1', name: 'ผ้าเบรกหน้า' });
    expect(await findByScanWith(app, 'เบรกหน้า')).toEqual({ kind: 'one', productId: id });
  });

  it('ไม่เจอ ก็บอกว่าไม่เจอ ไม่สร้างอะไรขึ้นมา', async () => {
    await add({ code: 'BRK-1' });
    expect(await findByScanWith(app, 'ไม่มีจริง')).toEqual({ kind: 'none' });
    const { rows } = await admin.query(
      `select count(*)::int as c from products where tenant_id = $1`, [tenantId]);
    expect(rows[0].c).toBe(1);
  });

  /*
   * ของที่ปิดใช้งานต้องบอกคนละแบบกับไม่พบ — คนยิงจะได้รู้ว่าต้องไปเปิดใช้งาน
   * ไม่ใช่ไปสร้างสินค้าใหม่ซ้ำกับที่มีอยู่แล้ว ซึ่งจะทำให้บาร์โค้ดชนกันด้วย
   */
  it('สินค้าปิดใช้งาน บอกว่าปิดอยู่ ไม่ใช่บอกว่าไม่พบ', async () => {
    await add({ code: 'OLD-1', name: 'ของเลิกขาย', barcode: 'DEAD1', active: false });
    expect(await findByScanWith(app, 'DEAD1'))
      .toEqual({ kind: 'inactive', code: 'OLD-1', name: 'ของเลิกขาย' });
  });

  it('ถ้ามีทั้งตัวที่เปิดและปิดที่ตรงเป๊ะ เอาตัวที่เปิดใช้งาน', async () => {
    await add({ code: 'DUP', name: 'ตัวเก่า', active: false });
    const live = await add({ code: 'DUP2', oem: 'DUP', name: 'ตัวใหม่' });
    expect(await findByScanWith(app, 'DUP')).toEqual({ kind: 'one', productId: live });
  });

  it('ยิงค่าว่างไม่ไปค้นอะไร', async () => {
    await add({ code: 'BRK-1' });
    expect(await findByScanWith(app, '   ')).toEqual({ kind: 'none' });
  });

  it('บาร์โค้ดของอู่อื่นยิงไม่เจอ', async () => {
    await add({ code: 'THEIRS', barcode: 'OTHER1', tenant: otherTenant });
    expect(await findByScanWith(app, 'OTHER1')).toEqual({ kind: 'none' });
  });
});
