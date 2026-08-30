/**
 * เทียบยอดกับโปรแกรมเดิมบน "ไฟล์สำรองข้อมูลจริง" ที่ seedDemo() สร้าง
 *
 * ต่างจาก differential.test.ts ตรงที่นั่นสุ่มเอกสารขึ้นมาเอง ส่วนอันนี้ใช้ไฟล์ที่มี
 * โครงสร้างเหมือนที่ลูกค้ากดปุ่มสำรองข้อมูลออกมาทุกประการ — รวมถึงเรื่องกวนใจอย่าง
 * ใบเสร็จที่ยังไม่มีฟิลด์ kind, ใบเสร็จที่ออกต่อจากใบส่งมอบ, รายการที่ยังไม่ผูกทะเบียนสินค้า
 *
 * สร้างไฟล์: node tools/make-demo-backup.mjs --date=2026-08-28
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeLegacy } from './legacy.generated.mjs';
import {
  apDueOf, arDue, exTotals, poTotals, profitAndLoss, recTotals, salesDocs, totalsOf, vatChain,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../../../fixtures/demo-backup.json');

let db: any;
let legacy: any;
let ctx: { vatRate: number };

beforeAll(() => {
  db = JSON.parse(readFileSync(FIXTURE, 'utf8'));

  /**
   * เติมฟิลด์ที่ loadDB() ของโปรแกรมเดิมเติมให้ตอนเปิดไฟล์
   * ไฟล์ที่ seedDemo() สร้างยังไม่มี kind เหมือนไฟล์ของลูกค้ารุ่นเก่าเป๊ะ ๆ
   * — importer ต้องทำขั้นตอนนี้เหมือนกัน (ดู db/mapping.md)
   */
  db.receipts.forEach((r: any) => { if (!r.kind) r.kind = 'RC'; });
  db.invoices.forEach((r: any) => { if (!r.kind) r.kind = 'IVT'; });

  ctx = { vatRate: db.shop.vatRate };
  legacy = makeLegacy(db);
});

describe('ไฟล์สำรองข้อมูลชุดทดสอบ', () => {
  it('มีข้อมูลครบทุกชนิดเอกสาร', () => {
    expect(db.products.length).toBe(200);
    expect(db.customers.length).toBe(30);
    expect(db.quotes.length).toBeGreaterThan(200);
    expect(db.invoices.length).toBeGreaterThan(40);
    expect(db.receipts.length).toBeGreaterThan(200);
    expect(db.purchases.length).toBeGreaterThan(140);
    expect(db.expenses.length).toBeGreaterThan(50);
    // ค่าใช้จ่ายครบทั้ง 6 หมวด รวมหมวดสินทรัพย์ที่ไม่เข้างบกำไรขาดทุน
    expect(new Set(db.expenses.map((e: any) => e.cat)).size).toBe(6);
    // มีใบเสร็จที่ออกต่อจากใบส่งมอบ — เคสที่ทำให้ยอดขายถูกนับซ้ำถ้าทำผิด
    expect(db.receipts.filter((r: any) => r.invId).length).toBeGreaterThan(20);
  });

  it('ยอดของเอกสารขายทุกใบตรงกับของเดิม', () => {
    expect(db.receipts.length + db.invoices.length).toBeGreaterThan(250);
    for (const r of [...db.receipts, ...db.invoices]) {
      expect(recTotals(r, ctx), `เอกสาร ${r.no}`).toEqual(legacy.recTotals(r));
      expect(arDue(r, ctx), `ยอดค้างชำระ ${r.no}`).toBe(legacy.arDue(r));
    }
  });

  it('ยอดของใบเสนอราคาทุกใบตรงกับของเดิม', () => {
    for (const q of db.quotes) {
      expect(totalsOf(q, ctx), `ใบเสนอราคา ${q.no}`).toEqual(legacy.totalsOf(q));
    }
  });

  it('ยอดของใบซื้อและค่าใช้จ่ายทุกใบตรงกับของเดิม', () => {
    for (const p of db.purchases) {
      expect(poTotals(p, ctx), `ใบซื้อ ${p.no}`).toEqual(legacy.poTotals(p));
      expect(apDueOf(p, ctx), `ยอดค้างจ่าย ${p.no}`).toBe(legacy.apDueOf(p));
    }
    for (const e of db.expenses) {
      expect(exTotals(e, ctx), `ค่าใช้จ่าย ${e.no}`).toEqual(legacy.exTotals(e));
      expect(apDueOf(e, ctx), `ยอดค้างจ่าย ${e.no}`).toBe(legacy.apDueOf(e));
    }
  });

  it('เครดิตภาษีมูลค่าเพิ่มยกยอดตลอดทั้งปีตรงกับของเดิม', () => {
    const mine = vatChain(
      { sales: salesDocs(db.invoices, db.receipts), purchases: db.purchases, expenses: db.expenses },
      ctx,
    );
    expect(mine).toEqual(legacy.vatChain());
    expect(mine.length).toBeGreaterThanOrEqual(12);   // ข้อมูลย้อนหลัง 1 ปีเต็ม
  });

  it('งบกำไรขาดทุนคำนวณจากมูลค่าก่อน VAT และไม่นับซื้อสินทรัพย์เป็นค่าใช้จ่าย', () => {
    const sales = salesDocs(db.invoices, db.receipts);
    const pl = profitAndLoss({ sales, purchases: db.purchases, expenses: db.expenses }, ctx);

    // เทียบกับสูตรเดิมใน renderFinPL() ทีละบรรทัด
    const revenue = sales.reduce((s: number, r: any) => s + legacy.recTotals(r).net, 0);
    const cogs = db.purchases.reduce((s: number, p: any) => s + legacy.poTotals(p).net, 0);
    const ops = db.expenses
      .filter((e: any) => e.cat !== 'asset')
      .reduce((s: number, e: any) => s + legacy.exTotals(e).net, 0);
    const assets = db.expenses
      .filter((e: any) => e.cat === 'asset')
      .reduce((s: number, e: any) => s + legacy.exTotals(e).net, 0);

    expect(pl.revenue).toBe(revenue);
    expect(pl.cogs).toBe(cogs);
    expect(pl.grossProfit).toBe(revenue - cogs);
    expect(pl.opsTotal).toBe(ops);
    expect(pl.assetTotal).toBe(assets);
    expect(pl.netProfit).toBe(revenue - cogs - ops);

    expect(pl.revenue).toBeGreaterThan(0);
    expect(pl.assetTotal).toBeGreaterThan(0);
    expect(pl.months.length).toBeGreaterThanOrEqual(12);
  });

  it('ยอดขายไม่ถูกนับซ้ำจากใบเสร็จที่ออกต่อจากใบส่งมอบ', () => {
    const sales = salesDocs(db.invoices, db.receipts);
    const linked = db.receipts.filter((r: any) => r.invId).length;
    expect(sales.length).toBe(db.invoices.length + db.receipts.length - linked);
    expect(sales).toEqual(legacy.salesDocs());
  });
});
