/**
 * บันทึกพร้อมกันหลายเครื่อง — ยิงด้วยการเชื่อมต่อสองสายพร้อมกันจริง (ผู้ใช้สั่งแก้ 21 ก.ย. 2569)
 *
 * ทุกข้อในไฟล์นี้เปิดทรานแซกชันค้างไว้ฝั่งหนึ่ง แล้วให้อีกฝั่งทำงานกับแถวเดียวกัน
 * สิ่งที่ต้องพิสูจน์คือ **อีกฝั่งต้องรอ แล้วเห็นผลของฝั่งแรก** ไม่ใช่เห็นสถานะเก่าแล้วผ่านไปทั้งคู่
 * การรันทีละคำสั่งตามลำดับพิสูจน์เรื่องนี้ไม่ได้ เพราะไม่มีวันที่สองฝั่งอ่านก่อนอีกฝั่งเขียน
 *
 *   1. สองคนแก้ใบเดียวกัน → คนที่บันทึกทีหลังถูกปฏิเสธ ไม่ใช่ทับเงียบ   (doc-version.ts)
 *   2. สองเครื่องรับชำระใบเดียวกัน → รับได้ไม่เกินยอดคงค้าง            (bulk-pay.ts)
 *   3. สองเครื่องขายของตัวเดียวกัน → ต้นทุนไม่ถูกตัดจากล็อตเดียวกันซ้ำ   (stock-cost.ts)
 *   4. ยกเลิกกับแก้ใบเดียวกันพร้อมกัน → การแก้ต้องเห็นว่าใบถูกยกเลิกแล้ว
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { docVersionWith, lockDocForEditWith, STALE_DOC_MESSAGE } from '../src/lib/doc-version';
import { bulkPay, recordPaymentWith } from '../src/lib/bulk-pay';
import { consumeStock, lockProductsWith, receiveStock } from '../src/lib/stock-cost';
import { voidSalesDocWith } from '../src/lib/sales-void';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

/** นานพอให้คำสั่งที่ไม่ได้ถูกล็อกทำงานจบไปแล้วแน่ ๆ — ถ้ายังไม่จบแปลว่ามันรออยู่จริง */
const WAIT_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ติดตามว่างานยังค้างอยู่ไหม โดยไม่ต้อง await มัน */
function track<T>(p: Promise<T>) {
  const s = { done: false, value: undefined as T | undefined, error: null as Error | null };
  const settled = p.then(
    (v) => { s.done = true; s.value = v; },
    (e: Error) => { s.done = true; s.error = e; },
  );
  return { s, settled };
}

describe.skipIf(!DB_URL)('บันทึกพร้อมกันหลายเครื่อง', () => {
  let admin: pg.Client;
  let a: pg.Client;          // เครื่องที่หนึ่ง
  let b: pg.Client;          // เครื่องที่สอง
  let tenantId: string;

  const connect = async (url: string) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    return c;
  };

  const addDoc = async (kind: string, no: string, payable = 5000): Promise<string> => {
    const { rows } = await a.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, vat_mode, payable, grand_total)
       values (current_tenant_id(), $1, $2, current_date, 'issued', $3, $4, $4) returning id`,
      [kind, no, kind === 'IV' ? 'none' : 'ex', payable]);
    return rows[0].id as string;
  };

  const addProduct = async (code: string): Promise<string> => {
    const { rows } = await a.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a)
       values (current_tenant_id(), $1, $1, 'ชิ้น', 0, 0) returning id`, [code]);
    return rows[0].id as string;
  };

  const paidOf = async (docId: string) =>
    Number((await admin.query(`select coalesce(sum(amount), 0) as s from payments where doc_id = $1`, [docId])).rows[0].s);

  const pay = (docId: string, amount: number) =>
    ({ docId, paidOn: '2026-09-21', amount, method: 'เงินสด', ref: '' });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ทดสอบบันทึกพร้อมกัน') returning id`)).rows[0].id;

    /* ต่อในนาม role ของแอปจริง ไม่ใช่ superuser — ล็อกแถวผ่าน RLS ต้องใช้ได้กับสิทธิ์ที่เครื่องจริงมี */
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    a = await connect(url.toString());
    b = await connect(url.toString());
  }, 60_000);

  afterAll(async () => {
    await a?.end();
    await b?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    /* เทสต์ที่ล้มกลางทางอาจทิ้งทรานแซกชันค้างไว้ — ปิดให้หมดก่อนเริ่มข้อใหม่ */
    await a.query('rollback').catch(() => {});
    await b.query('rollback').catch(() => {});
    await a.query('delete from payments');
    await a.query('delete from stock_moves');
    await a.query('delete from documents');
    await a.query('delete from products');
  });

  /* =====================================================================
     1. สองคนแก้ใบเดียวกัน
     ===================================================================== */

  describe('แก้เอกสารใบเดียวกัน', () => {
    it('ฉบับที่ส่งกลับมาตรงกับที่ล็อกอ่านได้ — ละเอียดถึงไมโครวินาที ไม่ใช่ Date ของ JS', async () => {
      const id = await addDoc('IVT', 'IVT-V1');
      const v = await docVersionWith(a, id);
      expect(v).toMatch(/^\d{16}$/);

      await a.query('begin');
      await expect(lockDocForEditWith(a, id, v)).resolves.toEqual({ docNo: 'IVT-V1' });
      await a.query('rollback');
    });

    it('ใบถูกบันทึกไปแล้ว ฉบับเปลี่ยน · การรับเงินไม่เปลี่ยนฉบับ', async () => {
      const id = await addDoc('IVT', 'IVT-V2');
      const v0 = await docVersionWith(a, id);

      await a.query(`insert into payments (tenant_id, doc_id, amount) values (current_tenant_id(), $1, 100)`, [id]);
      expect(await docVersionWith(a, id), 'รับเงินไม่ได้แก้แถวเอกสาร').toBe(v0);

      await a.query(`update documents set note = 'แก้' where id = $1`, [id]);
      expect(await docVersionWith(a, id)).not.toBe(v0);
    });

    it('สองคนเปิดใบเดียวกัน คนแรกบันทึกไปแล้ว → คนที่สองถูกปฏิเสธ ไม่บันทึกทับ', async () => {
      const id = await addDoc('IVT', 'IVT-V3');
      const opened = await docVersionWith(a, id);   // ทั้งสองคนเปิดหน้าแก้ไขตอนนี้ ได้ฉบับเดียวกัน

      await a.query('begin');
      await lockDocForEditWith(a, id, opened);
      await a.query(`update documents set note = 'ของคนแรก' where id = $1`, [id]);

      /* คนที่สองกดบันทึกระหว่างที่คนแรกยังบันทึกไม่เสร็จ — ต้องรอ ไม่ใช่ผ่านไปก่อน */
      await b.query('begin');
      const second = track(lockDocForEditWith(b, id, opened));
      await sleep(WAIT_MS);
      expect(second.s.done, 'คนที่สองต้องรอคนแรกบันทึกเสร็จก่อน').toBe(false);

      await a.query('commit');
      await second.settled;
      await b.query('rollback');

      expect(second.s.error?.message).toBe(STALE_DOC_MESSAGE);
      const note = (await admin.query(`select note from documents where id = $1`, [id])).rows[0].note;
      expect(note, 'งานของคนแรกต้องยังอยู่').toBe('ของคนแรก');
    });

    it('ฟอร์มที่ไม่ได้ส่งฉบับมา (เปิดค้างไว้ตั้งแต่ก่อนมีการตรวจนี้) ยังบันทึกได้ตามเดิม', async () => {
      const id = await addDoc('IVT', 'IVT-V4');
      await a.query(`update documents set note = 'มีคนแก้ไปแล้ว' where id = $1`, [id]);

      await a.query('begin');
      await expect(lockDocForEditWith(a, id, undefined)).resolves.toEqual({ docNo: 'IVT-V4' });
      await a.query('rollback');
    });
  });

  /* =====================================================================
     4. ยกเลิกกับแก้ใบเดียวกันพร้อมกัน
     ===================================================================== */

  it('อีกเครื่องกดยกเลิกระหว่างที่เครื่องนี้กำลังบันทึกการแก้ → การแก้เห็นว่าถูกยกเลิกแล้ว ไม่เขียนลงใบที่ยกเลิก', async () => {
    const id = await addDoc('IVT', 'IVT-VOID');
    const opened = await docVersionWith(a, id);

    await a.query('begin');
    await voidSalesDocWith(a, id, 'ทดสอบยกเลิกพร้อมแก้', null);

    await b.query('begin');
    const edit = track(lockDocForEditWith(b, id, opened));
    await sleep(WAIT_MS);
    expect(edit.s.done, 'การแก้ต้องรอการยกเลิกจบก่อน').toBe(false);

    await a.query('commit');
    await edit.settled;
    await b.query('rollback');

    /* ยกเลิกมาก่อนฉบับไม่ตรง — บอกผู้ใช้ได้ตรงกว่าว่าเกิดอะไรขึ้น */
    expect(edit.s.error?.message).toBe('เอกสารนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
  });

  it('รับเงินกับแก้ใบเดียวกัน ต้องรอกันคนละรอบ — ล็อกแถวเดียวกัน', async () => {
    const id = await addDoc('IV', 'IV-PAYEDIT');

    await a.query('begin');
    await lockDocForEditWith(a, id, await docVersionWith(a, id));

    await b.query('begin');
    const payment = track(recordPaymentWith(b, null, pay(id, 1000)));
    await sleep(WAIT_MS);
    expect(payment.s.done, 'การรับเงินต้องรอการแก้บันทึกเสร็จ').toBe(false);

    await a.query('commit');
    await payment.settled;
    await b.query('commit');
    expect(payment.s.error).toBeNull();
  });

  /* =====================================================================
     2. สองเครื่องรับชำระใบเดียวกัน
     ===================================================================== */

  describe('รับชำระใบเดียวกันพร้อมกัน', () => {
    it('ค้าง 5,000 สองเครื่องรับเครื่องละ 5,000 → ผ่านเครื่องเดียว อีกเครื่องได้ข้อความว่าชำระครบแล้ว', async () => {
      const id = await addDoc('IV', 'IV-PAY1');

      await a.query('begin');
      await recordPaymentWith(a, null, pay(id, 5000));

      await b.query('begin');
      const second = track(recordPaymentWith(b, null, pay(id, 5000)));
      await sleep(WAIT_MS);
      expect(second.s.done, 'เครื่องที่สองต้องรอเครื่องแรก').toBe(false);

      await a.query('commit');
      await second.settled;
      await b.query(second.s.error ? 'rollback' : 'commit');

      expect(second.s.error?.message).toBe('เอกสารนี้ชำระครบแล้ว');
      expect(await paidOf(id), 'ยอดรับรวมต้องไม่เกินยอดบิล').toBe(5000);
    });

    it('รับบางส่วนพร้อมกัน — เครื่องที่สองถูกตรวจกับยอดคงค้างหลังเครื่องแรก', async () => {
      const id = await addDoc('IV', 'IV-PAY2');

      await a.query('begin');
      await recordPaymentWith(a, null, pay(id, 3000));

      await b.query('begin');
      const second = track(recordPaymentWith(b, null, pay(id, 3000)));
      await sleep(WAIT_MS);
      await a.query('commit');
      await second.settled;
      await b.query(second.s.error ? 'rollback' : 'commit');

      expect(second.s.error?.message).toMatch(/^รับเกินยอดคงค้าง — คงค้างอยู่ 2,000\.00 บาท/);
      expect(await paidOf(id)).toBe(3000);
    });

    it('ตัดชำระหลายใบ สองเครื่องเลือกใบซ้อนกันคนละลำดับ → ไม่ค้างรอกัน และไม่เกินยอด', async () => {
      const x = await addDoc('IV', 'IV-BULK-X', 1000);
      const y = await addDoc('IV', 'IV-BULK-Y', 1000);
      const input = (first: string, second: string) => ({
        lines: [{ docId: first, amount: 1000 }, { docId: second, amount: 1000 }],
        paidOn: '2026-09-21', method: 'โอน', ref: '',
      });

      await a.query('begin');
      await bulkPay(a, null, input(x, y));

      await b.query('begin');
      const second = track(bulkPay(b, null, input(y, x)));
      await sleep(WAIT_MS);
      expect(second.s.done).toBe(false);

      await a.query('commit');
      await second.settled;
      await b.query(second.s.error ? 'rollback' : 'commit');

      expect(second.s.error?.message).toBe('ทุกใบที่เลือกถูกตัดชำระครบไปแล้ว — เปิดหน้าใหม่เพื่อดูยอดล่าสุด');
      expect(await paidOf(x)).toBe(1000);
      expect(await paidOf(y)).toBe(1000);
    });
  });

  /* =====================================================================
     3. สองเครื่องขายของตัวเดียวกัน
     ===================================================================== */

  describe('ตัดสต๊อกสินค้าตัวเดียวกันพร้อมกัน', () => {
    it('ล็อตแรก 100 บาท ล็อตสอง 200 บาท สองเครื่องตัดเครื่องละชิ้น → ได้ 100 กับ 200 ไม่ใช่ 100 ซ้ำสองรอบ', async () => {
      const p = await addProduct('SAME-LOT');
      await receiveStock(a, { productId: p, qty: 1, costAmount: 100, movedOn: '2026-09-01', reason: 'set' });
      await receiveStock(a, { productId: p, qty: 1, costAmount: 200, movedOn: '2026-09-02', reason: 'set' });

      await a.query('begin');
      const first = await consumeStock(a, { productId: p, qty: 1, movedOn: '2026-09-21', reason: 'adjust' });

      await b.query('begin');
      const second = track(consumeStock(b, { productId: p, qty: 1, movedOn: '2026-09-21', reason: 'adjust' }));
      await sleep(WAIT_MS);
      expect(second.s.done, 'เครื่องที่สองต้องรอเครื่องแรกบันทึกก่อนอ่านล็อต').toBe(false);

      await a.query('commit');
      await second.settled;
      await b.query('commit');

      expect(second.s.error).toBeNull();
      expect([first, second.s.value]).toEqual([100, 200]);

      const cut = await admin.query(
        `select coalesce(sum(cost_amount), 0) as c from stock_moves where product_id = $1 and qty_delta < 0`, [p]);
      expect(Number(cut.rows[0].c), 'ต้นทุนรวมที่ตัดออกต้องเท่ากับเงินที่จ่ายซื้อสองชิ้นจริง').toBe(300);
    });

    it('สองใบมีสินค้าชุดเดียวกันคนละลำดับ → ล็อกเรียงตามรหัส ไม่ค้างรอกัน', async () => {
      const p1 = await addProduct('ORD-1');
      const p2 = await addProduct('ORD-2');

      await a.query('begin');
      await lockProductsWith(a, [p1, p2]);

      await b.query('begin');
      const second = track(lockProductsWith(b, [p2, p1]));
      await sleep(WAIT_MS);
      expect(second.s.done).toBe(false);

      await a.query('commit');
      await second.settled;
      await b.query('commit');
      expect(second.s.error, 'ต้องไม่ถูกฐานข้อมูลตัดสินว่ารอกันค้าง (40P01)').toBeNull();
    });

    it('ส่งรหัสว่างหรือซ้ำมา — ข้ามรหัสว่าง ล็อกตัวซ้ำครั้งเดียว ไม่ error', async () => {
      const p = await addProduct('DUP');
      await a.query('begin');
      await expect(lockProductsWith(a, [p, null, p, undefined])).resolves.toBeUndefined();
      await expect(lockProductsWith(a, [])).resolves.toBeUndefined();
      await a.query('rollback');
    });
  });
});
