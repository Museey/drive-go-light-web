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
import { listTrashWith, purgeFromTrashWith, restoreFromTrashWith } from '../src/lib/trash-core';
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

  /**
   * ใบเสร็จ ใบกำกับภาษี และใบส่งมอบที่ยกเลิกแล้ว กู้คืนไม่ได้ ต้องคัดลอกเป็นใบใหม่
   * อาจส่งให้ลูกค้าหรือยื่นภาษีไปแล้ว — ตัดสินใจร่วมกับเจ้าของกิจการ 14 ก.ย. 2569
   * (ถังขยะในชุดแก้เดิมให้กู้คืนใบเสร็จได้ ดู lib/trash-rules.ts)
   */
  it('ใบเสร็จที่ยกเลิกขึ้นในถังขยะ แต่กู้คืนไม่ได้ — สถานะและสต๊อกไม่ขยับ', async () => {
    await as(mine);
    const rc = await pickReceipt();
    await voidSale(rc.id, 'ลูกค้าคืนของ');
    const afterVoid = await stockOf(rc.id);

    const listed = await listTrashWith(app, {});
    expect(listed.find((r) => r.id === rc.id)).toMatchObject({ source: 'doc', kind: 'RC', reason: 'ลูกค้าคืนของ' });

    await expect(restore('doc', rc.id, null)).rejects.toThrow('คัดลอกเป็นใบใหม่');
    const doc = (await app.query(`select status::text as s from documents where id = $1`, [rc.id])).rows[0];
    expect(doc.s, 'ถูกปฏิเสธแล้วต้องยังอยู่ในถังขยะ').toBe('void');
    expect(await stockOf(rc.id), 'ต้องไม่ตัดสต๊อกซ้ำ').toEqual(afterVoid);
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
