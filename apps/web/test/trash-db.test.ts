/**
 * ถังขยะ (07.5) — กู้คืนต้องคืนผลทุกอย่างให้เหมือนก่อนยกเลิก ลบถาวรต้องหายจริงและกู้ไม่ได้
 *
 * ชุดแก้ 13–14 ก.ย. ส่งฟังก์ชันมาแต่ไม่มีเทสต์และไม่มีหน้า — เทสต์นี้เจอว่ากู้คืนใบวางบิล
 * ไม่ได้เลยสักใบ (ล้างแค่ voided_at ทั้งที่ตารางบังคับให้สถานะกับวันที่ยกเลิกไปด้วยกัน)
 *
 * ต่อฐานด้วย role ของแอป ไม่ใช่ผู้ดูแล — RLS ต้องทำงานจริงทั้งฝั่งอ่านและเขียน
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { assertOwnerPasswordWith, listTrashWith, purgeFromTrashWith, restoreFromTrashWith } from '../src/lib/trash-core';
import { hashPassword } from '../src/lib/password';
import { voidSalesDocWith } from '../src/lib/sales-void';
import { voidBuyDocWith } from '../src/lib/buy-void';
import { openInvoices, saveBillnote, voidBillnote } from '../src/lib/billnotes';
import { consumeStock, receiveStock } from '../src/lib/stock-cost';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ถังขยะ', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let theirs: string;

  const as = (tenant: string) => app.query(`select set_config('app.tenant_id', $1, false)`, [tenant]);

  /** ยอดคงเหลือของสินค้าทุกตัวในเอกสาร อ่านผ่านวิวเดียวกับหน้าจอ */
  const stockOf = async (docId: string) => (await app.query(
    `select i.product_id, s.qty_on_hand from doc_items i
       join product_stock s on s.product_id = i.product_id
      where i.doc_id = $1 order by i.product_id`, [docId],
  )).rows.map((r) => [r.product_id, n(r.qty_on_hand)]);

  const used: string[] = [];
  /**
   * หนึ่งการกระทำ = หนึ่งทรานแซกชัน เหมือน mutate() ของหน้าจอ
   *
   * ไม่ใช่แค่ความเหมือนจริง — กู้คืนใบซื้อจับกลุ่มแถวคืนของการยกเลิกครั้งล่าสุดด้วย created_at
   * ซึ่งเท่ากันทั้งก้อนเพราะ now() คงที่ในทรานแซกชัน ถ้าเรียกแบบ autocommit แต่ละแถวได้เวลาคนละค่า
   * แล้วกู้คืนได้แค่สินค้าตัวสุดท้าย (เจอตอนเขียนเทสต์นี้ — ของขาดไป 3 และ 1 ชิ้น)
   */
  const tx = async <T>(fn: () => Promise<T>): Promise<T> => {
    await app.query('begin');
    try {
      const r = await fn();
      await app.query('commit');
      return r;
    } catch (err) {
      await app.query('rollback');
      throw err;
    }
  };
  const voidSale = (id: string, reason: string) => tx(() => voidSalesDocWith(app, id, reason, null));
  const voidBn = (id: string, reason: string) => tx(() => voidBillnote(app, id, reason));
  const restore = (source: 'doc' | 'billnote', id: string, _userId: null) =>
    tx(() => restoreFromTrashWith(app, source, id, null));
  const purge = (source: 'doc' | 'billnote', id: string) => tx(() => purgeFromTrashWith(app, source, id));


  /**
   * ใบเสร็จที่ตัดสต๊อกจริง ไม่อยู่ในใบวางบิล และยังไม่เคยใช้ในข้ออื่น
   *
   * ตัวนำเข้าลงแค่ยอดยกมา เอกสารที่นำเข้าจึงไม่มีรายการตัดสต๊อกของตัวเอง
   * ถ้ายกเลิกใบแบบนั้น ไม่มีของให้คืน การตรวจว่า "สต๊อกกลับมาเท่าเดิม" จะผ่านเพราะไม่มีอะไรขยับ
   * — ตัดสต๊อกให้ด้วย consumeStock ตัวเดียวกับที่หน้าจอใช้ตอนบันทึกใบเสร็จ
   */
  const pickReceipt = async () => {
    const rc = (await app.query(
      `select d.id, d.doc_no from documents d
        where d.kind = 'RC' and d.status = 'issued' and d.id <> all($1::uuid[])
          and exists (select 1 from doc_items i where i.doc_id = d.id and i.product_id is not null)
          and not exists (select 1 from billnote_docs b where b.doc_id = d.id and not b.voided)
        order by d.doc_no limit 1`, [used],
    )).rows[0] as { id: string; doc_no: string };
    used.push(rc.id);
    const items = (await app.query(
      `select id, product_id, qty from doc_items where doc_id = $1 and product_id is not null`, [rc.id])).rows;
    for (const it of items) {
      await consumeStock(app, {
        productId: it.product_id, qty: n(it.qty), movedOn: '2026-08-28', reason: 'sale',
        docId: rc.id, docItemId: it.id, userId: null, note: 'เตรียมข้อมูลเทสต์ถังขยะ',
      } as never);
    }
    return rc;
  };

  /** ใบวางบิลรับใบค้างชำระที่ยังไม่อยู่ในใบวางบิลใบอื่นเท่านั้น */
  const freeInvoices = async () => {
    const open = await openInvoices(app);
    const busy = new Set((await app.query(
      `select doc_id from billnote_docs where not voided`)).rows.map((r) => r.doc_id as string));
    return open.filter((v) => !busy.has(v.id));
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
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    mine = (await importBackup(app, fixture, { tenantName: 'อู่ของเรา', openingStockDate: '2026-08-28' })).tenantId;
    theirs = (await importBackup(app, fixture, { tenantName: 'อู่อื่น', openingStockDate: '2026-08-28' })).tenantId;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /** กู้คืนได้ทุกชนิด — ชุดแก้ 14 ก.ย. 2569 22:37 เจ้าของกิจการเลือกตามต้นฉบับ */
  it('ใบเสร็จที่ยกเลิก กู้คืนแล้วตัดสต๊อกกลับเท่าก่อนยกเลิก', async () => {
    await as(mine);
    const rc = await pickReceipt();
    const beforeVoid = await stockOf(rc.id);
    await voidSale(rc.id, 'ลูกค้าคืนของ');
    expect(await stockOf(rc.id), 'ยกเลิกแล้วของต้องกลับเข้าสต๊อก').not.toEqual(beforeVoid);

    const listed = await listTrashWith(app, {});
    expect(listed.find((r) => r.id === rc.id)).toMatchObject({ source: 'doc', kind: 'RC', reason: 'ลูกค้าคืนของ' });

    await restore('doc', rc.id, null);
    const doc = (await app.query(`select status::text as s, voided_at from documents where id = $1`, [rc.id])).rows[0];
    expect(doc).toEqual({ s: 'issued', voided_at: null });
    expect(await stockOf(rc.id), 'ตัดสต๊อกกลับเท่าเดิม').toEqual(beforeVoid);

    /* ยกเลิก → กู้ อีกรอบต้องยังสมดุล (ไม่นับแถวคืนของรอบแรกซ้ำ) */
    await voidSale(rc.id, 'รอบสอง');
    await restore('doc', rc.id, null);
    expect(await stockOf(rc.id), 'รอบที่สองต้องตรงเหมือนกัน').toEqual(beforeVoid);
  });

  /**
   * ต้นฉบับตัดสต๊อกตอนกู้จากบรรทัดสินค้าเท่านั้น — ชิ้นส่วนของชุดอะไหล่ที่ใบเสร็จตัดไปตอนขายไม่ถูกตัดกลับ
   * สร้างใบเสร็จที่มีบรรทัดชุด แล้วตัดชิ้นส่วนแบบเดียวกับ sales.ts ตอนบันทึก
   */
  it('ใบเสร็จที่มีชุดอะไหล่ กู้คืนแล้วชิ้นส่วนถูกตัดกลับด้วย', async () => {
    await as(mine);
    const parts = (await app.query(
      `select p.id from products p join product_stock s on s.product_id = p.id
        where s.qty_on_hand >= 10 order by p.code limit 2`)).rows.map((r) => r.id as string);
    expect(parts).toHaveLength(2);
    const kit = (await app.query(
      `insert into kits (tenant_id, code, name, price) values (current_tenant_id(), 'KIT-ทดสอบ', 'ชุดถ่ายน้ำมันเครื่อง', 900)
       returning id`)).rows[0].id as string;
    await app.query(
      `insert into kit_items (tenant_id, kit_id, product_id, name, qty) values
         (current_tenant_id(), $1, $2, 'ชิ้น 1', 2), (current_tenant_id(), $1, $3, 'ชิ้น 2', 1),
         (current_tenant_id(), $1, null, 'ค่าแรง (พิมพ์เอง)', 1)`, [kit, parts[0], parts[1]]);

    const cols = (await admin.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'documents' and is_generated = 'NEVER'
          and column_name not in ('id', 'doc_no', 'status', 'parent_doc_id', 'legacy_id',
                                  'voided_at', 'voided_reason', 'purged_at')
        order by ordinal_position`)).rows.map((r) => r.column_name as string);
    const list = cols.join(', ');
    const src = (await app.query(`select id from documents where kind = 'RC' order by doc_no limit 1`)).rows[0];
    const rc = (await app.query(
      `insert into documents (${list}, doc_no, status)
       select ${list}, 'RC-ทดสอบชุดอะไหล่', 'issued' from documents where id = $1 returning id`, [src.id])).rows[0].id as string;
    await app.query(
      `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit, qty, unit_price, is_service, disc_pct, kit_id)
       values (current_tenant_id(), $1, 1, null, '', '', 'ชุดอะไหล่ซ่อมบำรุง ชุดถ่ายน้ำมันเครื่อง', 'ชุด', 3, 900, false, 0, $2)`,
      [rc, kit]);

    const onHand = async () => (await app.query(
      `select product_id, qty_on_hand from product_stock where product_id = any($1::uuid[]) order by product_id`,
      [parts])).rows.map((r) => [r.product_id, n(r.qty_on_hand)]);
    await tx(async () => {
      await consumeStock(app, { productId: parts[0], qty: 6, movedOn: '2026-08-28', reason: 'sale', docId: rc, userId: null } as never);
      await consumeStock(app, { productId: parts[1], qty: 3, movedOn: '2026-08-28', reason: 'sale', docId: rc, userId: null } as never);
    });
    const sold = await onHand();

    await voidSale(rc, 'ทดสอบชุด');
    const back = await onHand();
    expect(back.map(([, q]) => q), 'ยกเลิกคืนชิ้นส่วน 2×3 และ 1×3').toEqual(sold.map(([p, q]) => q as number + (p === parts[0] ? 6 : 3)));

    await restore('doc', rc, null);
    expect(await onHand(), 'กู้คืนแล้วชิ้นส่วนต้องถูกตัดกลับเท่าตอนขาย').toEqual(sold);
  });

  it('ใบส่งมอบที่ไม่เคยตัดสต๊อก กู้คืนแล้วไม่ตัดอะไรเพิ่ม', async () => {
    await as(mine);
    const iv = (await app.query(
      `select d.id from documents d
        where d.kind in ('IV', 'IVT') and d.status = 'issued'
          and not exists (select 1 from documents x where x.parent_doc_id = d.id and x.status <> 'void')
          and not exists (select 1 from billnote_docs b where b.doc_id = d.id and not b.voided)
          and exists (select 1 from doc_items i where i.doc_id = d.id and i.product_id is not null)
        order by d.doc_no limit 1`)).rows[0];
    expect(iv, 'ชุดทดสอบต้องมีใบส่งมอบที่ยกเลิกได้').toBeTruthy();
    const before = await stockOf(iv.id);
    await voidSale(iv.id, 'ทดสอบใบส่งมอบ');
    await restore('doc', iv.id, null);
    const d = (await app.query(`select status::text as s from documents where id = $1`, [iv.id])).rows[0];
    expect(d.s).toBe('issued');
    expect(await stockOf(iv.id)).toEqual(before);
  });

  it('ลบถาวร: พนักงานลบไม่ได้ · เจ้าของใส่รหัสผ่านผิดไม่ได้ · รหัสถูกผ่าน', async () => {
    await as(mine);
    /* การนำเข้าไม่สร้างผู้ใช้ — สร้างเจ้าของทดสอบเองผ่าน admin */
    const u = (await admin.query(
      `insert into users (tenant_id, code, name, password_hash, role)
       values ($1, 'U-ถังขยะ', 'เจ้าของทดสอบถังขยะ', $2, 'owner') returning id`,
      [mine, await hashPassword('รหัสที่ถูก-1234')])).rows[0];

    await expect(assertOwnerPasswordWith(app, { userId: u.id, role: 'staff' }, 'รหัสที่ถูก-1234'))
      .rejects.toThrow('เฉพาะเจ้าของกิจการ');
    await expect(assertOwnerPasswordWith(app, { userId: u.id, role: 'owner' }, 'ผิด'))
      .rejects.toThrow('รหัสผ่านไม่ถูกต้อง');
    await expect(assertOwnerPasswordWith(app, { userId: u.id, role: 'owner' }, ''))
      .rejects.toThrow('รหัสผ่านไม่ถูกต้อง');
    await expect(assertOwnerPasswordWith(app, { userId: u.id, role: 'owner' }, 'รหัสที่ถูก-1234')).resolves.toBeUndefined();

    /* ผู้ใช้ของอู่อื่นมองไม่เห็น — รหัสถูกก็ผ่านไม่ได้ */
    await as(theirs);
    await expect(assertOwnerPasswordWith(app, { userId: u.id, role: 'owner' }, 'รหัสที่ถูก-1234'))
      .rejects.toThrow('รหัสผ่านไม่ถูกต้อง');
  });

  it('ใบเสนอราคาที่ยกเลิก กู้คืนได้', async () => {
    await as(mine);
    /* ใบเสนอราคาในไฟล์ชุดทดสอบออกใบต่อไปหมดแล้วจึงยกเลิกไม่ได้ — คัดลอกหัวเอกสารเป็นใบใหม่ที่ยังไม่มีใบต่อ
       เลือกคอลัมน์จากสคีมาจริง (ข้ามคอลัมน์คำนวณ) จะได้ไม่พังเมื่อมีคอลัมน์เพิ่ม */
    const cols = (await admin.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'documents' and is_generated = 'NEVER'
          and column_name not in ('id', 'doc_no', 'status', 'parent_doc_id', 'legacy_id',
                                  'voided_at', 'voided_reason', 'purged_at')
        order by ordinal_position`)).rows.map((r) => r.column_name as string);
    const list = cols.join(', ');
    const src = (await app.query(`select id from documents where kind = 'QT' order by doc_no limit 1`)).rows[0];
    const qt = (await app.query(
      `insert into documents (${list}, doc_no, status)
       select ${list}, 'QT-ทดสอบถังขยะ', 'issued' from documents where id = $1 returning id`, [src.id])).rows[0];

    await voidSale(qt.id, 'ลูกค้าไม่เอาแล้ว');
    await restore('doc', qt.id, null);
    const d = (await app.query(`select status::text as s, voided_at from documents where id = $1`, [qt.id])).rows[0];
    expect(d).toEqual({ s: 'issued', voided_at: null });
  });

  it('ใบซื้อที่ยกเลิก กู้คืนแล้วรับของกลับเข้าสต๊อก', async () => {
    await as(mine);
    const po = (await app.query(
      `select d.id from documents d where d.kind = 'PO' and d.status = 'issued'
          and exists (select 1 from doc_items i where i.doc_id = d.id and i.product_id is not null)
        order by d.doc_no limit 1`)).rows[0];
    expect(po, 'ไฟล์ชุดทดสอบต้องมีใบซื้อที่มีรายการสินค้า').toBeTruthy();
    /* รับของเข้าให้ก่อน ด้วยตัวเดียวกับที่หน้าจอใช้ตอนบันทึกใบซื้อ — เหตุผลเดียวกับ pickReceipt */
    const poItems = (await app.query(
      `select id, product_id, qty, unit_price from doc_items where doc_id = $1 and product_id is not null`,
      [po.id])).rows;
    for (const it of poItems) {
      await receiveStock(app, {
        productId: it.product_id, qty: n(it.qty), costAmount: n(it.qty) * n(it.unit_price),
        movedOn: '2026-08-28', reason: 'purchase', docId: po.id, note: 'เตรียมข้อมูลเทสต์ถังขยะ',
      } as never);
    }
    const before = await stockOf(po.id);

    await tx(() => voidBuyDocWith(app, po.id, 'ส่งของผิด', null));
    expect(await stockOf(po.id)).not.toEqual(before);

    await restore('doc', po.id, null);
    expect(await stockOf(po.id)).toEqual(before);
  });

  it('ใบวางบิลที่ยกเลิก กู้คืนได้ สถานะกลับมา และใบที่รวมไว้ผูกกลับครบ', async () => {
    await as(mine);
    const picked = (await freeInvoices()).slice(0, 2);
    expect(picked).toHaveLength(2);
    const bn = await saveBillnote(app, {
      billDate: '2026-08-28', dueDate: '2026-09-30',
      partyId: picked[0]!.partyId ?? null, partyName: picked[0]!.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: '', note: 'ทดสอบถังขยะ',
      docIds: picked.map((v) => v.id),
    }, null);
    await voidBn(bn.id, 'ออกผิดใบ');
    expect((await listTrashWith(app, {})).find((r) => r.id === bn.id)).toMatchObject({ source: 'billnote', kind: 'BN' });

    await restore('billnote', bn.id, null);

    const b = (await app.query(`select status::text as s, voided_at, voided_reason from billnotes where id = $1`, [bn.id])).rows[0];
    expect(b).toEqual({ s: 'issued', voided_at: null, voided_reason: null });
    const links = (await app.query(`select voided from billnote_docs where billnote_id = $1`, [bn.id])).rows;
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.voided === false), 'ใบที่รวมไว้ต้องกลับมาอยู่ในใบวางบิลนี้').toBe(true);
  });

  it('กู้คืนใบวางบิลไม่ได้ ถ้าใบที่รวมไว้ถูกวางบิลใบใหม่ไปแล้ว — บอกชัดว่าติดใบไหน', async () => {
    await as(mine);
    const one = (await freeInvoices())[0]!;
    const first = await saveBillnote(app, {
      billDate: '2026-08-28', dueDate: null, partyId: one.partyId ?? null, partyName: one.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: '', note: '', docIds: [one.id],
    } as never, null);
    await voidBn(first.id, 'จะออกใหม่');
    const second = await saveBillnote(app, {
      billDate: '2026-08-29', dueDate: null, partyId: one.partyId ?? null, partyName: one.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: '', note: '', docIds: [one.id],
    } as never, null);

    await expect(restore('billnote', first.id, null))
      .rejects.toThrow(`อยู่ในใบวางบิล ${second.no} แล้ว`);
    const b = (await app.query(`select status::text as s from billnotes where id = $1`, [first.id])).rows[0];
    expect(b.s, 'ถูกปฏิเสธแล้วต้องยังอยู่ในถังขยะ').toBe('void');
  });

  it('ลบถาวรแล้วหายจากถังขยะ กู้คืนไม่ได้ และลบซ้ำไม่ได้', async () => {
    await as(mine);
    const rc = await pickReceipt();
    await voidSale(rc.id, 'ทดสอบลบถาวร');

    await purge('doc', rc.id);
    const d = (await app.query(`select status::text as s, purged_at from documents where id = $1`, [rc.id])).rows[0];
    expect(d.s).toBe('void');
    expect(d.purged_at).not.toBeNull();
    expect((await listTrashWith(app, {})).some((r) => r.id === rc.id)).toBe(false);

    await expect(restore('doc', rc.id, null)).rejects.toThrow('ไม่พบเอกสารในถังขยะ');
    await expect(purge('doc', rc.id)).rejects.toThrow('ไม่พบเอกสารในถังขยะ');
  });

  it('ลบถาวรใบที่ยังไม่ได้ยกเลิกไม่ได้', async () => {
    await as(mine);
    const rc = await pickReceipt();
    await expect(purge('doc', rc.id)).rejects.toThrow('ไม่พบเอกสารในถังขยะ');
    const d = (await app.query(`select purged_at from documents where id = $1`, [rc.id])).rows[0];
    expect(d.purged_at).toBeNull();
  });

  it('ตัวกรองช่วงเวลาค้นตามวันที่ยกเลิก ไม่ใช่วันที่เอกสาร', async () => {
    await as(mine);
    const rc = await pickReceipt();
    await voidSale(rc.id, 'ทดสอบช่วงเวลา');
    await app.query(`update documents set voided_at = '2026-01-15T03:00:00Z' where id = $1`, [rc.id]);

    expect((await listTrashWith(app, { from: '2026-01-01', to: '2026-01-31' })).map((r) => r.id)).toContain(rc.id);
    expect((await listTrashWith(app, { from: '2026-02-01' })).map((r) => r.id)).not.toContain(rc.id);
  });

  it('อู่อื่นไม่เห็นถังขยะของเรา และกู้คืนหรือลบถาวรเอกสารของเราไม่ได้', async () => {
    await as(mine);
    const rc = await pickReceipt();
    await voidSale(rc.id, 'ของอู่เรา');

    await as(theirs);
    expect((await listTrashWith(app, {})).some((r) => r.id === rc.id)).toBe(false);
    await expect(restore('doc', rc.id, null)).rejects.toThrow('ไม่พบเอกสารในถังขยะ');
    await expect(purge('doc', rc.id)).rejects.toThrow('ไม่พบเอกสารในถังขยะ');

    const d = (await admin.query(`select status::text as s, purged_at from documents where id = $1`, [rc.id])).rows[0];
    expect(d).toEqual({ s: 'void', purged_at: null });
  });
});
