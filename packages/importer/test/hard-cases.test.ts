/**
 * เคสยากที่ชุดทดสอบจาก seedDemo() ไม่ครอบคลุม
 *
 * ต้องมี Postgres — ตั้ง DATABASE_URL ก่อนรัน (ดู README)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// คอลัมน์ date (oid 1082) ต้องกลับมาเป็นสตริง 'YYYY-MM-DD'
// ถ้าปล่อยให้เป็น Date แล้วเรียก toISOString() จะเพี้ยนไป 1 วันในเขตเวลาไทย (UTC+7)
pg.types.setTypeParser(1082, (v) => v);
import { exTotals, recTotals } from '@drivegolight/core';
import { importBackup, normalizeBackup } from '../src/index.js';
import type { ImportResult } from '../src/index.js';
import {
  billnoteBackup, claimBackup, duplicateDocNoBackup, emptyBackup, largeChainBackup, legacyV1Backup,
  messyBackup, vatInclusiveBackup, wrongVatModeBackup,
} from './hard-cases.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '../../../db/001_init.sql');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('เคสยากของตัวนำเข้า', () => {
  let admin: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await admin.query('drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(SCHEMA, 'utf8'));
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';   -- ต้องคืนสิทธิ์ก่อน ไม่งั้นลบ role ไม่ได้
          execute 'drop role dgl_app';
        end if;
      end $$;
      create role dgl_app login password 'apppass';
      grant usage on schema public to dgl_app;
      grant select, insert, update, delete on all tables in schema public to dgl_app;
      grant execute on all functions in schema public to dgl_app;
    `);
    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /** นำเข้าแล้วตั้ง tenant ให้ query ต่อได้ */
  async function load(backup: any): Promise<ImportResult> {
    const r = await importBackup(app, backup);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [r.tenantId]);
    return r;
  }

  const has = (w: string[], text: string) => w.some((x) => x.includes(text));

  describe('ไฟล์จากโปรแกรมรุ่นเก่าสุด', () => {
    let result: ImportResult;
    beforeAll(async () => { result = await load(legacyV1Backup()); });

    it('ย้ายทะเบียนผู้ขายแยกเข้าทะเบียนผู้ติดต่อชุดเดียวกัน', async () => {
      const { rows } = await app.query(
        `select code, kind, type, org_name, addr_text, credit_days from contacts where kind = 'vendor'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].org_name).toBe('ห้างหุ้นส่วน อะไหล่เก่า');
      expect(rows[0].type).toBe('company');
      expect(rows[0].code).toMatch(/^VEN-/);              // ของเดิม code ว่าง ต้องออกให้ใหม่
      expect(rows[0].addr_text).toContain('ถ.อะไหล่');    // ที่อยู่รุ่นเก่าเป็นข้อความยาว
      expect(n(rows[0].credit_days)).toBe(30);
    });

    it('เติมชนิดเอกสารให้ใบส่งมอบและใบเสร็จที่ไม่มี kind', async () => {
      const { rows } = await app.query(`select kind, doc_no, vat_mode from documents order by doc_no`);
      const kinds = Object.fromEntries(rows.map((r) => [r.doc_no, r.kind]));
      expect(kinds['IV-202403-001']).toBe('IVT');   // ไฟล์เก่าไม่มี kind → IVT
      expect(kinds['RC-202403-001']).toBe('RC');
    });

    it('รู้จักค่าแรงจากรหัส LAB ในเอกสารที่ไม่มีฟิลด์ svc', async () => {
      const { rows } = await app.query(
        `select i.name, i.is_service from doc_items i
         join documents d on d.id = i.doc_id where d.kind = 'RC'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].is_service).toBe(true);
    });

    it('คำนวณภาษีหัก ณ ที่จ่ายจากค่าแรงได้ถูกต้อง', async () => {
      const { rows } = await app.query(
        `select wht_amount, payable, grand_total from documents where doc_no = 'RC-202403-001'`,
      );
      // ค่าแรง 500 + VAT 7% = 535 · หัก ณ ที่จ่าย 3% ของ 500 = 15
      expect(n(rows[0].grand_total)).toBe(535);
      expect(n(rows[0].wht_amount)).toBe(15);
      expect(n(rows[0].payable)).toBe(520);
    });

    it('แปลงสิทธิ์ผู้ใช้รุ่นเก่าเป็นชุดปัจจุบัน', async () => {
      const { rows } = await app.query(`select code, name, perms, active from users order by code`);
      expect(rows).toHaveLength(2);

      // quote:true หรือ receipt:true → income
      expect(rows[0].perms.sort()).toEqual(['customer', 'income', 'stock']);
      expect(rows[0].active).toBe(true);

      // purchase:true → expense
      expect(rows[1].perms.sort()).toEqual(['expense', 'finance']);
      expect(rows[1].active).toBe(false);
    });

    it('ไม่นำรหัสผ่านเดิมเข้ามา และเตือนให้ตั้งใหม่', async () => {
      const { rows } = await app.query(`select password_hash from users`);
      expect(rows.every((r) => r.password_hash === null)).toBe(true);
      expect(has(result.warnings, 'ตั้งรหัสผ่านใหม่')).toBe(true);
      expect(has(result.warnings, 'เจ้าของกิจการ')).toBe(true);
    });

    it('เติมหมวดหมู่สินค้าชุดตั้งต้นให้ไฟล์ที่ไม่มี', async () => {
      const { rows } = await app.query(`select count(*) as c from product_categories`);
      expect(n(rows[0].c)).toBe(8);
    });

    it('เติมตัวนับเลขที่เอกสารที่ไฟล์เก่าไม่มี (iv/ivt/e) เป็นศูนย์', async () => {
      const { rows } = await app.query(`select kind, last_no from doc_sequences order by kind`);
      const seq = Object.fromEntries(rows.map((r) => [r.kind, n(r.last_no)]));
      expect(seq).toEqual({ QT: 3, IV: 0, IVT: 0, RC: 1, PO: 1, EX: 0 });
    });

    it('เติมเลขเครื่องยนต์/เลขตัวถังที่ขาดเป็นค่าว่าง', async () => {
      const { rows } = await app.query(`select engine_no, chassis_no from vehicles`);
      expect(rows[0].engine_no).toBe('');
      expect(rows[0].chassis_no).toBe('');
    });

    it('ใบซื้อที่ใช้ terms:cash แบบรุ่นเก่าถือว่าชำระแล้ว', async () => {
      const { rows } = await app.query(
        `select credit_days, due_date, doc_date from documents where kind = 'PO'`,
      );
      expect(n(rows[0].credit_days)).toBe(0);
      expect(rows[0].due_date).toEqual(rows[0].doc_date);
    });
  });

  describe('เอกสารที่ราคารวมภาษีมูลค่าเพิ่มแล้ว', () => {
    const backup = vatInclusiveBackup();
    let result: ImportResult;
    beforeAll(async () => { result = await load(backup); });

    it('ถอด VAT ออกจากยอดได้ถูกต้อง', async () => {
      const { rows } = await app.query(
        `select net_amount, vat_amount, grand_total from documents where doc_no = 'RC-202601-1'`,
      );
      expect(n(rows[0].net_amount)).toBe(1000);   // 1,070 ÷ 1.07
      expect(n(rows[0].vat_amount)).toBe(70);
      expect(n(rows[0].grand_total)).toBe(1070);  // ยอดที่ลูกค้าจ่ายไม่เปลี่ยน
    });

    it('ฐานภาษีหัก ณ ที่จ่ายถอด VAT ออกก่อนคำนวณ', async () => {
      const { rows } = await app.query(
        `select wht_amount, payable from documents where doc_no = 'RC-202601-1'`,
      );
      expect(n(rows[0].wht_amount)).toBe(30);     // 3% ของ 1,000 ไม่ใช่ของ 1,070
      expect(n(rows[0].payable)).toBe(1040);
    });

    it('ยอดทุกใบตรงกับที่ core คำนวณ', async () => {
      const ctx = { vatRate: 7 };
      const { rows } = await app.query(`select legacy_id, net_amount, vat_amount, wht_amount, payable from documents`);
      const byLegacy = new Map(rows.map((r) => [r.legacy_id, r]));

      for (const r of backup.receipts) {
        const t = recTotals(r, ctx);
        const row = byLegacy.get(`RC:${r.id}`);
        expect(n(row.net_amount), `net ${r.no}`).toBe(t.net);
        expect(n(row.vat_amount), `vat ${r.no}`).toBe(t.vat);
        expect(n(row.wht_amount), `wht ${r.no}`).toBe(t.wht);
        expect(n(row.payable), `payable ${r.no}`).toBe(t.payable);
      }
      for (const e of backup.expenses) {
        const t = exTotals(e, ctx);
        const row = byLegacy.get(`EX:${e.id}`);
        expect(n(row.net_amount), `net ${e.no}`).toBe(t.net);
        expect(n(row.wht_amount), `wht ${e.no}`).toBe(t.wht);
      }
    });

    it('บันทึกโหมดภาษีไว้ในเอกสาร ไม่ได้แปลงทิ้ง', async () => {
      const { rows } = await app.query(`select distinct vat_mode from documents order by 1`);
      expect(rows.map((r) => r.vat_mode)).toContain('in');
    });
  });

  describe('ข้อมูลสกปรก', () => {
    let result: ImportResult;
    beforeAll(async () => { result = await load(messyBackup()); });

    it('รหัสสินค้าซ้ำถูกเปลี่ยนให้ไม่ชน และเตือน', async () => {
      const { rows } = await app.query(`select code from products where code like 'DUP-001%' order by code`);
      expect(rows.map((r) => r.code)).toEqual(['DUP-001', 'DUP-001-2', 'DUP-001-3']);
      expect(has(result.warnings, 'รหัสสินค้า "DUP-001" ซ้ำ')).toBe(true);
    });

    it('ผู้ติดต่อที่ไม่มีชื่อได้ชื่อแทนและมีคำเตือน', async () => {
      const { rows } = await app.query(
        `select code, type, org_name, first_name from contacts order by code`,
      );
      const company = rows.find((r) => r.code === 'X-001');
      expect(company.org_name).toContain('ไม่ระบุชื่อ');

      const person = rows.find((r) => r.code === 'X-002');
      expect(person.first_name).toContain('ไม่ระบุชื่อ');

      expect(has(result.warnings, 'ไม่มีชื่อ')).toBe(true);
    });

    it('รหัสผู้ติดต่อซ้ำถูกแก้ให้ไม่ชน', async () => {
      const { rows } = await app.query(`select code from contacts where code like 'X-003%' order by code`);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.code)).size).toBe(2);
    });

    it('เลขผู้เสียภาษีที่ไม่ครบ 13 หลักยังเก็บไว้พร้อมคำเตือน ของร้านมีขีดคั่นก็ยังใช้ได้', async () => {
      // เก็บค่าเดิมไว้ ไม่ลบทิ้ง — แต่ต้องมีคำเตือน
      const { rows } = await app.query(`select tax_id from contacts where code = 'X-003'`);
      expect(rows[0].tax_id).toBe('123');
      expect(has(result.warnings, 'ไม่ครบ 13 หลัก')).toBe(true);

      const shop = await app.query(`select tax_id from tenants where id = current_tenant_id()`);
      expect(shop.rows[0].tax_id).toBe('0105561000444');   // '0105-561-000-444' → เหลือแต่ตัวเลข
    });

    it('ระดับราคาที่ไม่ถูกต้องถูกแทนด้วย A', async () => {
      const { rows } = await app.query(`select price_tier from tenants where id = current_tenant_id()`);
      expect(rows[0].price_tier).toBe('A');
    });

    it('เตือนเรื่องโลโก้ที่ต้องย้ายไป object storage', () => {
      expect(has(result.warnings, 'โลโก้')).toBe(true);
    });

    it('สต๊อกติดลบยกมาได้ ส่วนสินค้าที่ไม่มีของไม่ต้องลงรายการ', async () => {
      const { rows } = await app.query(`
        select p.code, s.qty_on_hand from products p
        join product_stock s on s.product_id = p.id order by p.code
      `);
      const byCode = Object.fromEntries(rows.map((r) => [r.code, n(r.qty_on_hand)]));
      expect(byCode['SKU-4']).toBe(-3);
      expect(byCode['SKU-5']).toBe(0);

      const moves = await app.query(`select count(*) as c from stock_moves`);
      expect(n(moves.rows[0].c)).toBe(4);   // 5 สินค้า แต่ตัวที่ qty = 0 ไม่ต้องลง
    });

    it('รายการที่อ้างสินค้าที่ถูกลบไปแล้วยังเก็บชื่อและราคาไว้ครบ', async () => {
      const { rows } = await app.query(
        `select name, unit_price, product_id from doc_items where code = 'GONE'`,
      );
      expect(rows[0].product_id).toBeNull();
      expect(rows[0].name).toBe('สินค้าที่ถูกลบ');
      expect(n(rows[0].unit_price)).toBe(900);
      expect(has(result.warnings, 'ไม่มีในทะเบียนแล้ว')).toBe(true);
    });

    it('รายการที่ชื่อว่างได้ชื่อแทน (คอลัมน์ห้ามว่าง)', async () => {
      const { rows } = await app.query(`select name from doc_items where name like '(ไม่ระบุ%'`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('ยอดชำระศูนย์และติดลบถูกข้าม', async () => {
      const { rows } = await app.query(`
        select p.amount from payments p join documents d on d.id = p.doc_id
        where d.doc_no = 'RC-202601-2'
      `);
      expect(rows).toHaveLength(1);
      expect(n(rows[0].amount)).toBe(107);
    });

    it('ตัวเลขที่มาเป็นข้อความพร้อมคอมมาแปลงถูก', async () => {
      const { rows } = await app.query(
        `select subtotal, discount, grand_total from documents where doc_no = 'RC-202601-3'`,
      );
      expect(n(rows[0].subtotal)).toBe(2501);      // 2 × 1,250.50
      expect(n(rows[0].discount)).toBe(100);
      expect(n(rows[0].grand_total)).toBe(2569.07); // (2501 - 100) × 1.07
    });

    it('อายุการใช้งานเก็บเฉพาะหมวดสินทรัพย์', async () => {
      const { rows } = await app.query(
        `select expense_cat, asset_life_yrs from documents where kind = 'EX' order by expense_cat`,
      );
      const byCat = Object.fromEntries(rows.map((r) => [r.expense_cat, r.asset_life_yrs]));
      expect(byCat['asset']).toBe(10);
      expect(byCat['rent']).toBeNull();   // ติดมาในไฟล์แต่ต้องไม่ถูกบันทึก
    });

    it('ใบเสนอราคาสถานะ open เข้ามาเป็น issued · billed คงเดิม', async () => {
      const { rows } = await app.query(
        `select doc_no, status from documents where kind = 'QT' order by doc_no`,
      );
      expect(rows.map((r) => r.status)).toEqual(['issued', 'billed']);
    });

    it('ชื่อรายการที่สั่งไม่ให้เตือนถูกรวมซ้ำหลังตัดช่องว่าง', async () => {
      const { rows } = await app.query(`select name_norm from ignored_item_names order by name_norm`);
      expect(rows.map((r) => r.name_norm)).toEqual(['ค่าแรง ทั่วไป', 'ล้างแอร์']);
    });

    it('ลิขสิทธิ์ที่ยังไม่หมดอายุกลายเป็นการสมัครใช้งาน', async () => {
      const { rows } = await app.query(
        `select plan, started_on, expires_on from subscriptions`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].plan).toBe('light-yearly');
      expect(rows[0].expires_on).toBe('2027-06-01');
      expect(rows[0].started_on).toBe('2025-06-01');
    });
  });

  describe('ชนิดเอกสารขัดกับโหมดภาษี', () => {
    let result: ImportResult;
    beforeAll(async () => { result = await load(wrongVatModeBackup()); });

    it('บังคับโหมดภาษีให้ตรงกับชนิดเอกสาร และเตือนทุกใบ', async () => {
      const { rows } = await app.query(
        `select kind, vat_mode, vat_amount from documents order by kind`,
      );
      const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));

      expect(byKind['IV'].vat_mode).toBe('none');
      expect(n(byKind['IV'].vat_amount)).toBe(0);

      expect(byKind['IVT'].vat_mode).toBe('ex');
      expect(n(byKind['IVT'].vat_amount)).toBeGreaterThan(0);

      expect(result.warnings.filter((w) => w.includes('ขัดกับชนิด'))).toHaveLength(2);
    });
  });

  describe('เลขที่เอกสารซ้ำ', () => {
    let result: ImportResult;
    beforeAll(async () => { result = await load(duplicateDocNoBackup()); });

    it('นำเข้าได้ครบทุกใบ ไม่มีใบไหนหาย', async () => {
      const { rows } = await app.query(`select count(*) as c from documents where kind = 'RC'`);
      expect(n(rows[0].c)).toBe(5);
    });

    it('เลขที่ถูกทำให้ไม่ซ้ำ และเตือน', async () => {
      const { rows } = await app.query(`select doc_no from documents where kind = 'RC' order by doc_no`);
      const nos = rows.map((r) => r.doc_no);
      expect(new Set(nos).size).toBe(5);
      expect(nos).toContain('RC-202601-001');
      expect(has(result.warnings, 'ซ้ำ')).toBe(true);
    });
  });

  describe('เอกสารจำนวนมากจนต้องแบ่งก้อนตอนแทรก', () => {
    beforeAll(async () => { await load(largeChainBackup(900)); }, 120_000);

    it('สายเอกสารยังผูกครบทุกใบแม้ข้ามก้อน', async () => {
      const { rows } = await app.query(`
        select count(*) as c from documents rc
        join documents inv on inv.id = rc.parent_doc_id
        join documents q on q.id = inv.parent_doc_id
        where rc.kind = 'RC' and inv.kind = 'IVT' and q.kind = 'QT'
      `);
      expect(n(rows[0].c)).toBe(900);
    });

    it('แทรกครบ 2,700 ใบ', async () => {
      const { rows } = await app.query(`select count(*) as c from documents`);
      expect(n(rows[0].c)).toBe(2700);
    });
  });

  describe('ใบวางบิลจากรุ่น 6.4', () => {
    let r: ImportResult;
    beforeAll(async () => { r = await load(billnoteBackup()); });

    it('ใบวางบิลตามมาครบทุกใบ ไม่ถูกทิ้งเงียบ ๆ', async () => {
      expect(r.counts.billnotes).toBe(2);
      const { rows } = await app.query(`select count(*) as c from billnotes`);
      expect(n(rows[0].c)).toBe(2);
    });

    it('เลขที่ซ้ำถูกเติมเลขต่อท้ายให้ไม่ชน แล้วเตือนไว้', async () => {
      const { rows } = await app.query(`select no from billnotes order by bill_date`);
      expect(rows.map((x) => x.no)).toEqual(['BN-202601-001', 'BN-202601-001-2']);
      expect(r.warnings.some((w) => w.includes('เลขที่ใบวางบิลซ้ำ'))).toBe(true);
    });

    it('ใบที่ถูกวางบิลซ้ำสองใบ คงไว้ในใบแรก แล้วเตือน', async () => {
      const { rows } = await app.query(`
        select b.no, d.doc_no
        from billnote_docs bd
        join billnotes b on b.id = bd.billnote_id
        join documents d on d.id = bd.doc_id
        order by b.bill_date, d.doc_no`);
      expect(rows.map((x) => `${x.no} · ${x.doc_no}`)).toEqual([
        'BN-202601-001 · IVT-202601-001',
        'BN-202601-001 · IVT-202601-002',
        'BN-202601-001-2 · IVT-202601-003',
      ]);
      expect(r.warnings.some((w) => w.includes('วางบิลซ้ำ'))).toBe(true);
    });

    it('ใบที่อ้างถึงเอกสารที่ถูกลบไปแล้วถูกตัดออก แล้วเตือน', () => {
      expect(r.warnings.some((w) => w.includes('ไม่มีในไฟล์แล้ว'))).toBe(true);
    });

    it('ยอดที่แจ้งไปตอนวางบิลถูกเก็บไว้ตามไฟล์ ไม่คำนวณใหม่', async () => {
      const { rows } = await app.query(
        `select total_snapshot from billnotes order by bill_date`);
      expect(rows.map((x) => n(x.total_snapshot))).toEqual([2140, 3210]);
    });

    it('ตัวนับเลขที่ใบวางบิลตามมาด้วย ออกใบถัดไปแล้วไม่ซ้ำของเก่า', async () => {
      const next = await app.query(
        `select next_billnote_no(current_tenant_id(), '') as no`);
      expect(n(next.rows[0].no)).toBe(3);
    });
  });

  describe('ใบเคลมจากรุ่น 6.4', () => {
    let r: ImportResult;
    beforeAll(async () => { r = await load(claimBackup()); });

    /**
     * ข้อสำคัญที่สุดของกลุ่มนี้ — พลาดแล้วสินค้าทุกตัวที่เคยเคลมจะติดลบทันทีที่นำเข้าเสร็จ
     */
    it('ไม่สร้างแถวตัดสต๊อกจากใบเคลม ยอดคงเหลือเท่าที่อยู่ในไฟล์เป๊ะ', async () => {
      const moves = await app.query(
        `select count(*)::int as c from stock_moves where claim_id is not null`);
      expect(n(moves.rows[0].c)).toBe(0);

      const { rows } = await app.query(
        `select qty_on_hand from product_stock s
         join products p on p.id = s.product_id where p.code = 'BRK-001'`);
      expect(n(rows[0].qty_on_hand)).toBe(8);
    });

    it('ใบเคลมตามมาครบทั้งสองทิศทาง', async () => {
      expect(r.counts.claims).toBe(4);
      const { rows } = await app.query(
        `select side::text as side, count(*)::int as c from claims group by 1 order by 1`);
      expect(rows).toEqual([
        { side: 'customer', c: 3 },
        { side: 'vendor', c: 1 },
      ]);
    });

    it('เลขที่ซ้ำถูกเติมเลขต่อท้าย แล้วเตือนไว้', async () => {
      const { rows } = await app.query(
        `select no from claims where side = 'customer' order by claim_date`);
      expect(rows.map((x) => x.no)).toEqual([
        'CL-202601-001', 'CL-202601-001-2', 'CL-202602-009',
      ]);
      expect(r.warnings.some((w) => w.includes('เลขที่ใบเคลมซ้ำ'))).toBe(true);
    });

    it('ประเภทที่ระบบใหม่ไม่รู้จักถูกตั้งเป็น "อื่น ๆ" แล้วเตือน', async () => {
      const { rows } = await app.query(
        `select kind from claims where no = 'CL-202601-001-2'`);
      expect(rows[0].kind).toBe('other');
      expect(r.warnings.some((w) => w.includes('ระบบใหม่ไม่รู้จัก'))).toBe(true);
    });

    it('เหตุผลที่เว้นว่างถูกเติมข้อความแทน เพราะฐานใหม่บังคับให้มี', async () => {
      const { rows } = await app.query(
        `select reason from claims where no = 'CL-202601-001-2'`);
      expect(rows[0].reason).toContain('ไม่ได้ระบุเหตุผล');
    });

    it('บรรทัดที่อ้างสินค้าที่ถูกลบไปแล้วยังเก็บชื่อและต้นทุนไว้ แล้วเตือน', async () => {
      const { rows } = await app.query(
        `select i.product_id, i.name, i.qty, i.unit_cost
         from claim_items i join claims c on c.id = i.claim_id
         where c.no = 'CL-202601-001-2'`);
      expect(rows[0].product_id).toBeNull();
      expect(rows[0].name).toBe('ผ้าเบรกหน้า');
      expect(n(rows[0].unit_cost)).toBe(250);
      expect(r.warnings.some((w) => w.includes('ไม่มีในทะเบียนแล้ว'))).toBe(true);
    });

    it('ต้นทุนที่ติดมากับใบ (cogs) ถูกเก็บไว้ให้งบย้อนหลังยังตรง', async () => {
      const { rows } = await app.query(
        `select i.cost_amount from claim_items i join claims c on c.id = i.claim_id
         where c.no = 'CL-202601-001'`);
      expect(n(rows[0].cost_amount)).toBe(460);
    });

    it('ใบที่ถูกยกเลิกเข้ามาเป็น void พร้อมเหตุผลเดิม', async () => {
      const { rows } = await app.query(
        `select status::text as status, voided_at is not null as stamped, voided_reason
         from claims where no = 'CL-202602-009'`);
      expect(rows[0].status).toBe('void');
      expect(rows[0].stamped).toBe(true);
      expect(rows[0].voided_reason).toBe('เปิดใบผิด');
    });

    it('ฝั่งผู้ขายไม่มีรถติดมา', async () => {
      const { rows } = await app.query(
        `select vehicle, vehicle_plate from claims where side = 'vendor'`);
      expect(rows[0].vehicle).toBeNull();
      expect(rows[0].vehicle_plate).toBe('');
    });

    it('ฝั่งลูกค้าเก็บรถและทะเบียนไว้ครบ', async () => {
      const { rows } = await app.query(
        `select vehicle, vehicle_plate from claims where no = 'CL-202601-001'`);
      expect(rows[0].vehicle.brand).toBe('Toyota');
      expect(rows[0].vehicle_plate).toBe('กข 1234');
    });

    it('ตัวนับเลขที่เดินคนละชุดต่อทิศทาง ออกใบถัดไปแล้วไม่ทับของเก่า', async () => {
      const cl = await app.query(
        `select next_claim_no(current_tenant_id(), 'customer', '') as no`);
      const vc = await app.query(
        `select next_claim_no(current_tenant_id(), 'vendor', '') as no`);
      expect(n(cl.rows[0].no)).toBe(4);
      expect(n(vc.rows[0].no)).toBe(2);
    });

    it('บอกผู้ใช้ตรง ๆ ว่าใบเคลมเข้ามาโดยไม่ตัดสต๊อกซ้ำ', () => {
      expect(r.warnings.some((w) => w.includes('ไม่ตัดสต๊อกซ้ำ'))).toBe(true);
    });
  });

  describe('ไฟล์ว่างเปล่า', () => {
    it('อู่ที่ยังไม่มีข้อมูลเลยก็นำเข้าได้', async () => {
      const r = await load(emptyBackup());
      expect(r.counts.documents).toBe(0);
      expect(r.counts.products).toBe(0);

      const { rows } = await app.query(`select name from tenants where id = current_tenant_id()`);
      expect(rows[0].name).toBe('อู่ทดสอบ');

      // ตัวนับเลขที่ต้องมีครบทุกชนิดเพื่อให้ออกเลขใบแรกได้
      const seq = await app.query(`select count(*) as c from doc_sequences`);
      expect(n(seq.rows[0].c)).toBe(6);

      const next = await app.query(`select next_doc_no(current_tenant_id(), 'RC', '') as no`);
      expect(n(next.rows[0].no)).toBe(1);
    });
  });
});
