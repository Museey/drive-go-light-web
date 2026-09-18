/**
 * ส่งออกแล้วนำกลับเข้าใหม่ ยอดต้องเท่าเดิมทุกบาท
 *
 * ไฟล์สำรองคือสัญญาที่ให้ไว้กับลูกค้าว่าข้อมูลเป็นของเขา ไม่ใช่ของเรา
 * ถ้าส่งออกแล้วนำกลับเข้าไม่ได้ หรือได้ตัวเลขไม่ตรง สัญญานั้นก็ไม่มีความหมาย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { readPic, savePic, sha256 } from '../src/lib/pics';
import { exportBackupWith } from '../src/lib/backup';
import { recTotals } from '@drivegolight/core';
import { openInvoices, saveBillnote } from '../src/lib/billnotes';
import { saveClaim } from '../src/lib/claims';
import {
  addCountItems, applyCount, createCount, getCount, setCountedQty,
} from '../src/lib/stock-counts';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

/** โลโก้ทดสอบ — data URI สั้น ๆ ที่ผ่านเกณฑ์เดียวกับช่องอัปโหลดหน้า 07.1 */
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const n = (v: unknown) => Number(v);

const PICS = resolve(here, 'fixtures/pics');
const picFull = new Uint8Array(readFileSync(join(PICS, 'small.jpg')));
const picThumb = new Uint8Array(readFileSync(join(PICS, 'small.png')));

describe.skipIf(!DB_URL)('ส่งออกแล้วนำกลับเข้า', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let firstTenant: string;
  let secondTenant: string;
  let billnoteTotal = 0;
  let billnoteDocNos: string[] = [];
  const claimNos: string[] = [];
  let claimCost = 0;
  let countNo = '';
  let countedTo = 0;
  let picProductCode = '';
  let discDocNo = '';
  let zeroWhtDocNo = '';
  let voidDocNo = '';
  let purgedDocNo = '';
  let supplierProductCode = '';
  let vendorCode = '';

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      -- role อยู่ระดับคลัสเตอร์ จึงค้างข้ามการรันเทสต์และอาจถูกใช้โดยฐานข้อมูลอื่นอยู่
      -- ล้างเฉพาะสิทธิ์ในฐานข้อมูลนี้ แล้วให้ app-role.sql สร้างกลับ (รันซ้ำได้)
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    /* อู่แรก: นำเข้าจากไฟล์ชุดทดสอบ */
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const first = await importBackup(app, fixture, { openingStockDate: '2026-08-28' });
    firstTenant = first.tenantId;

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);

    /* ใส่รูปให้สินค้าตัวหนึ่ง ไฟล์สำรองจะได้มีรูปให้พิสูจน์ว่าไปกลับแล้วยังเท่าเดิม */
    const anyProduct = await app.query('select id, code from products order by code limit 1');
    picProductCode = anyProduct.rows[0].code;
    await savePic(app, anyProduct.rows[0].id, picFull, picThumb);

    /* วางบิลลูกค้าที่ค้างมากที่สุดไว้หนึ่งใบ ไฟล์สำรองจะได้มีใบวางบิลให้พิสูจน์ */
    const open = await openInvoices(app);
    const topParty = open[0]!.partyId ?? null;
    const picked = open
      .filter((v) => (v.partyId ?? null) === topParty)
      .slice(0, 4);
    billnoteTotal = Math.round(picked.reduce((t, v) => t + v.outstanding, 0) * 100) / 100;
    billnoteDocNos = picked.map((v) => v.docNo).sort();
    await saveBillnote(app, {
      billDate: '2026-08-28', dueDate: '2026-09-15',
      partyId: topParty, partyName: picked[0]!.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: 'สมชาย', note: '',
      docIds: picked.map((v) => v.id),
    }, null);

    /* เคลมสินค้าออกไปหนึ่งใบต่อทิศทาง ไฟล์สำรองจะได้มีใบเคลมให้พิสูจน์ */
    /**
     * อ่านผ่าน role ของแอป ไม่ใช่ผู้ดูแล
     *
     * product_stock เป็นวิว ซึ่ง Postgres ประเมินสิทธิ์ด้วย **เจ้าของวิว**
     * ไม่ใช่คนเรียก และเจ้าของวิวก็โดน force row level security เหมือนกัน
     * ผู้ดูแลที่ไม่ได้ตั้ง app.tenant_id จึงได้ศูนย์แถวเสมอ
     *
     * บนเครื่องจริงเป็นแบบนี้อยู่แล้ว — ที่เคยผ่านเพราะฐานทดสอบมีเจ้าของ
     * เป็น superuser ซึ่งข้าม RLS ได้เอง
     */
    const prod = await app.query(
      `select p.id, p.code, p.name, p.unit from products p
       join product_stock s on s.product_id = p.id
       where s.qty_on_hand > 5 limit 1`,
    );
    const part = prod.rows[0];
    const line = (q: number) => [{
      productId: part.id as string, code: part.code as string, oem: '',
      name: part.name as string, unit: part.unit as string, qty: q, unitCost: 0,
    }];
    const cl = await saveClaim(app, {
      side: 'customer', kind: 'warranty', claimDate: '2026-08-28',
      partyId: null, partyName: 'ลูกค้าเคลม', partyTel: '08x-xxx-xxxx',
      refNo: 'RC-อ้างอิง-001', vehicleId: null,
      vehicle: { brand: 'Toyota', model: 'Vios' }, vehiclePlate: 'กข 1234',
      reason: 'อยู่ในระยะรับประกัน', byWhom: 'สมชาย', note: 'ทดสอบ',
      items: line(2),
    }, null);
    claimNos.push(cl.no);
    claimCost = cl.cost;
    const vc = await saveClaim(app, {
      side: 'vendor', kind: 'defect', claimDate: '2026-08-28',
      partyId: null, partyName: 'ร้านอะไหล่', partyTel: '',
      refNo: 'PO-อ้างอิง-001', vehicleId: null, vehicle: null, vehiclePlate: '',
      reason: 'ชำรุดจากโรงงาน', byWhom: '', note: '',
      items: line(1),
    }, null);
    claimNos.push(vc.no);

    /* ตั้งบาร์โค้ดให้สินค้าตัวนั้น ไฟล์สำรองจะได้มีบาร์โค้ดให้พิสูจน์ */
    await admin.query(`update products set barcode = 'DGROUND01' where id = $1`, [part.id]);

    /* ตรวจนับหนึ่งใบและปรับยอดจริง ไฟล์สำรองจะได้มีใบตรวจนับให้พิสูจน์ */
    const ct = await createCount(app, { countDate: '2026-08-28', note: 'ตรวจนับก่อนส่งออก' }, null);
    await addCountItems(app, ct.id, [part.id as string]);
    const opened = await getCount(app, ct.id);
    countedTo = Math.max(0, (opened!.items[0]!.systemQty ?? 0) - 2);
    await setCountedQty(app, opened!.items[0]!.id, countedTo);
    await applyCount(app, ct.id, null);
    countNo = ct.no;

    /* ---------- ข้อมูลที่ชุดแก้ 13–14 ก.ย. เพิ่มเข้ามา — ไฟล์สำรองต้องพากลับมาครบทุกช่อง ----------
       ทำผ่านผู้ดูแลตรง ๆ เพราะฟังก์ชันบันทึกของหน้าจอผูกกับ session */

    /* ใบเสร็จที่มีส่วนลดรายบรรทัดและส่วนลดท้ายบิลแบบ %
       ยอดเอกสารคิดใหม่ด้วย recTotals ตัวเดียวกับที่หน้าจอใช้ตอนบันทึก
       ไม่งั้นยอดที่เก็บไว้ไม่ตรงกับรายการ แล้วการเทียบไปกลับจะไม่พิสูจน์อะไร */
    const rc = await admin.query(
      `select d.id, d.doc_no, d.vat_mode::text as vat_mode, d.wht_rate, d.vat_rate
         from documents d
        where d.tenant_id = $1 and d.kind = 'RC' and d.status = 'issued'
          and (select count(*) from doc_items i where i.doc_id = d.id) >= 2
        order by d.doc_no limit 1`, [firstTenant]);
    discDocNo = rc.rows[0].doc_no;
    await admin.query(
      `update doc_items set disc_pct = 12.5
        where id = (select id from doc_items where doc_id = $1 order by line_no limit 1)`,
      [rc.rows[0].id]);
    const rcItems = (await admin.query(
      `select qty, unit_price, disc_pct, is_service, code from doc_items
        where doc_id = $1 order by line_no`, [rc.rows[0].id])).rows.map((i) => ({
      qty: n(i.qty), price: n(i.unit_price), discPct: n(i.disc_pct),
      ...(i.is_service ? { svc: true } : {}), code: i.code as string,
    }));
    const lineSum = rcItems.reduce((t, it) => t + it.qty * it.price * (1 - it.discPct / 100), 0);
    const billDiscount = Math.round(lineSum * 5) / 100;
    const rcTotals = recTotals(
      { items: rcItems, discount: billDiscount, vatMode: rc.rows[0].vat_mode, whtRate: n(rc.rows[0].wht_rate) } as never,
      { vatRate: n(rc.rows[0].vat_rate) },
    );
    await admin.query(
      `update documents set discount = $2, discount_mode = 'pct', discount_pct = 5,
              subtotal = $3, net_amount = $4, vat_amount = $5, wht_amount = $6,
              grand_total = $7, payable = $8
        where id = $1`,
      [rc.rows[0].id, billDiscount, rcTotals.sub, rcTotals.net, rcTotals.vat,
       rcTotals.wht, rcTotals.grand, rcTotals.payable]);

    /* ค่าใช้จ่ายที่ยกเลิกหนึ่งใบ และยกเลิกแล้วลบถาวรอีกหนึ่งใบ
       ใช้ค่าใช้จ่ายเพราะไม่มีใบต่อ ไม่อยู่ในใบวางบิล และไม่ตัดสต๊อก — ไม่กระทบข้ออื่น
       (ใบเสนอราคาในไฟล์ชุดทดสอบออกใบต่อไปหมดแล้วทั้ง 240 ใบ) */
    const qts = (await admin.query(
      `select id, doc_no from documents
        where tenant_id = $1 and kind = 'EX' and status = 'issued'
        order by doc_no limit 2`, [firstTenant])).rows;
    expect(qts, 'ไฟล์ชุดทดสอบต้องมีค่าใช้จ่ายอย่างน้อยสองใบ').toHaveLength(2);
    voidDocNo = qts[0].doc_no;
    purgedDocNo = qts[1].doc_no;
    await admin.query(
      `update documents set status = 'void', voided_at = '2026-08-20T03:00:00Z',
              voided_reason = 'ลูกค้ายกเลิก'
        where id = any($1)`, [qts.map((q) => q.id)]);
    await admin.query(
      `update documents set purged_at = '2026-08-21T04:00:00Z' where id = $1`, [qts[1].id]);

    /* วิธีคิดต้นทุน ระบบบาร์โค้ด และผู้ขายของสินค้า — ทั้งผู้ขายในทะเบียนและชื่อที่พิมพ์เอง */
    const vendor = (await admin.query(
      `select id, code from contacts where tenant_id = $1 and kind = 'vendor'
        order by code limit 1`, [firstTenant])).rows[0];
    vendorCode = vendor.code;
    supplierProductCode = part.code;
    await admin.query(
      `update products set cost_method = 'AVG', barcode_type = 'EAN13' where id = $1`, [part.id]);
    await admin.query(
      `insert into product_suppliers (tenant_id, product_id, vendor_id, name, sort_order)
       values ($1, $2, $3, 'ผู้ขายในทะเบียน', 0), ($1, $2, null, 'ร้านข้างนอกพิมพ์เอง', 1)`,
      [firstTenant, part.id, vendor.id]);

    /* ข้อมูลร้านที่เพิ่มในชุดแก้ */
    await admin.query(
      `update tenants set owner_name = 'สมศักดิ์ ใจดี',
              signature_url = 'data:image/png;base64,iVBORw0KGgo=',
              note_default = 'รับประกันงานซ่อม 3 เดือน',
              bank_accounts = $2::jsonb,
              bank_name = 'กสิกรไทย', bank_account_no = '123-4-56789-0', bank_account_name = 'อู่ทดสอบ'
        where id = $1`,
      [firstTenant, JSON.stringify([
        { bank: 'กสิกรไทย', no: '123-4-56789-0', name: 'อู่ทดสอบ' },
        { bank: 'ไทยพาณิชย์', no: '987-6-54321-0', name: 'อู่ทดสอบ' },
      ])]);

    /* ชุดอะไหล่ซ่อมบำรุง (029–030) — ปิดใช้งานไว้ด้วย ชุดที่ปิดแล้วต้องตามมาเพราะเอกสารเก่ายังอ้างถึง
       รายการหนึ่งผูกสินค้า อีกรายการพิมพ์เอง · บรรทัดท้ายของใบเสร็จข้างบนอ้างชุดนี้ */
    const kit = (await admin.query(
      `insert into kits (tenant_id, code, name, price, price_b, price_c, note, active)
       values ($1, 'KIT-007', 'ชุดถ่ายน้ำมันเครื่อง', 900, 850, 800, 'รถเก๋ง', false) returning id`,
      [firstTenant])).rows[0];
    await admin.query(
      `insert into kit_items (tenant_id, kit_id, product_id, name, unit, qty, unit_cost, sort_order)
       values ($1, $2, $3, 'น้ำมันเครื่อง', 'ลิตร', 4, 120.5, 0), ($1, $2, null, 'ค่าแรง', 'ครั้ง', 1, 0, 1)`,
      [firstTenant, kit.id, part.id]);
    await admin.query(
      `update doc_items set kit_id = $2
        where id = (select id from doc_items where doc_id = $1 order by line_no desc limit 1)`,
      [rc.rows[0].id, kit.id]);

    /* ช่อง "อื่นๆ" ของรถ */
    await admin.query(
      `update vehicles set other = 'คุณเอ 081-111-2222'
        where id = (select id from vehicles where tenant_id = $1 order by plate_b, id limit 1)`,
      [firstTenant]);

    /* ตัวนับหลายเดือน — ใบวางบิล ใบเคลม ใบตรวจนับข้างบนลงเดือน 6908 ไว้แล้ว
       เพิ่มเดือน 6907 ให้ทุกชนิด เดือนก่อนหน้าต้องตามไปด้วย ไม่ใช่เฉพาะเดือนล่าสุด */
    await admin.query(`select next_doc_no($1, 'RC', '6907')`, [firstTenant]);
    await admin.query(`select next_doc_no($1, 'RC', '6907')`, [firstTenant]);
    await admin.query(`select next_billnote_no($1, '6907')`, [firstTenant]);
    await admin.query(`select next_claim_no($1, 'customer', '6907')`, [firstTenant]);
    await admin.query(`select next_count_no($1, '6907')`, [firstTenant]);

    /* ใบที่ยอดหัก ณ ที่จ่ายที่บันทึกไว้ต่างจากที่สูตรคิดได้ — แบบใบที่บันทึกในเว็บหลังตั้งขั้นต่ำ 1,000 (ค่าแรงไม่ถึง หัก 0)
       ถ้าไฟล์ของเว็บไม่เก็บยอดไว้ ตอนกู้คืนจะถูกคิดใหม่แบบโปรแกรมเดิมแล้วได้ยอดหักกลับมา (ผู้ใช้กำหนด 17 ก.ย. 2569) */
    const small = (await admin.query(
      `select d.id, d.doc_no, d.grand_total from documents d
        where d.tenant_id = $1 and d.kind = 'RC' and d.status = 'issued' and d.wht_amount > 0 and d.doc_no <> $2
        order by d.doc_no limit 1`, [firstTenant, discDocNo])).rows[0];
    zeroWhtDocNo = small.doc_no;
    await admin.query(`update documents set wht_amount = 0, payable = grand_total where id = $1`, [small.id]);

    /* โลโก้ร้าน — เก็บเป็น data URI ในคอลัมน์เดียว ต้องติดไฟล์สำรองไปด้วย
       ไม่งั้นอู่ที่ย้ายเครื่องจะพิมพ์เอกสารออกมาไม่มีโลโก้โดยไม่รู้ตัว */
    await admin.query(`update tenants set logo_url = $2 where id = $1`, [firstTenant, LOGO]);

    /* ส่งออกจากอู่แรก แล้วนำเข้าเป็นอู่ที่สอง */
    const exported = await exportBackupWith(app);

    const second = await importBackup(app, exported as never, { openingStockDate: '2026-08-28' });
    secondTenant = second.tenantId;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /** ยอดสรุปของอู่หนึ่งราย อ่านด้วยสิทธิ์ผู้ดูแลเพื่อข้าม RLS ในการเทียบ */
  async function summary(tenantId: string) {
    const { rows } = await admin.query(
      `select
         (select count(*) from products where tenant_id = $1)::int as products,
         (select count(*) from contacts where tenant_id = $1)::int as contacts,
         (select count(*) from vehicles where tenant_id = $1)::int as vehicles,
         (select count(*) from documents where tenant_id = $1)::int as documents,
         (select count(*) from doc_items where tenant_id = $1)::int as items,
         (select count(*) from payments where tenant_id = $1)::int as payments,
         (select coalesce(sum(grand_total), 0) from documents
           where tenant_id = $1 and direction = 'sell' and kind <> 'QT') as sell_total,
         (select coalesce(sum(wht_amount), 0) from documents
           where tenant_id = $1 and direction = 'sell') as sell_wht,
         (select coalesce(sum(payable), 0) from documents
           where tenant_id = $1 and direction = 'buy') as buy_total,
         (select coalesce(sum(amount), 0) from payments where tenant_id = $1) as paid,
         (select coalesce(sum(qty_delta), 0) from stock_moves where tenant_id = $1) as stock`,
      [tenantId],
    );
    return rows[0];
  }

  it('โลโก้ร้านไปกลับแล้วยังเท่าเดิมทุกไบต์', async () => {
    const logoOf = async (id: string) =>
      (await admin.query(`select logo_url from tenants where id = $1`, [id])).rows[0].logo_url;
    expect(await logoOf(firstTenant)).toBe(LOGO);
    expect(await logoOf(secondTenant), 'อู่ที่นำเข้าจากไฟล์ต้องได้โลโก้เดียวกัน').toBe(LOGO);
  });

  it('จำนวนแถวเท่ากันทุกตาราง', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(b.products).toBe(a.products);
    expect(b.contacts).toBe(a.contacts);
    expect(b.vehicles).toBe(a.vehicles);
    expect(b.documents).toBe(a.documents);
    expect(b.items).toBe(a.items);
    expect(b.payments).toBe(a.payments);
    expect(a.documents).toBeGreaterThan(700);
  });

  it('ยอดเงินเท่ากันทุกบาท', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(n(b.sell_total)).toBe(n(a.sell_total));
    expect(n(b.sell_wht)).toBe(n(a.sell_wht));
    expect(n(b.buy_total)).toBe(n(a.buy_total));
    expect(n(b.paid)).toBe(n(a.paid));
    expect(n(a.sell_total)).toBeGreaterThan(0);
  });

  it('ใบที่บันทึกยอดหัก ณ ที่จ่ายไว้ 0 — กลับมาเป็น 0 ไม่ถูกคิดใหม่ · ใบเก่าจากไฟล์โปรแกรมเดิมยังมียอดหัก', async () => {
    const row = async (tenant: string, no: string) => (await admin.query(
      `select wht_amount, payable, grand_total from documents where tenant_id = $1 and doc_no = $2`, [tenant, no])).rows[0];
    const back = await row(secondTenant, zeroWhtDocNo);
    expect(n(back.wht_amount)).toBe(0);
    expect(n(back.payable)).toBe(n(back.grand_total));

    /* ไฟล์ตัวอย่างเป็นไฟล์ของโปรแกรมเดิม — ใบที่ค่าแรงต่ำกว่า 1,000 ต้องได้ยอดหักแบบโปรแกรมเดิม (เดิมหายไป 75 ใบ) */
    const small = await admin.query(
      `select count(*)::int as n from documents
        where tenant_id = $1 and kind in ('IV','IVT','RC') and wht_rate > 0 and wht_amount > 0
          and wht_amount < wht_rate * 10`, [firstTenant]);
    expect(small.rows[0].n, 'มีใบที่ฐานค่าแรงต่ำกว่า 1,000 แต่ยังมียอดหัก').toBeGreaterThan(0);
  });

  it('ยอดสต๊อกรวมเท่ากัน', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);
    expect(n(b.stock)).toBe(n(a.stock));
  });

  it('สายเอกสารยังผูกครบเหมือนเดิม', async () => {
    const count = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select count(*)::int as c from documents d
         join documents p on p.id = d.parent_doc_id
         where d.tenant_id = $1`,
        [tenantId],
      );
      return rows[0].c;
    };
    const a = await count(firstTenant);
    expect(await count(secondTenant)).toBe(a);
    expect(a).toBeGreaterThan(40);
  });

  /**
   * เลขที่เอกสารนับใหม่ทุกเดือน ตัวนับจึงมีหลายแถวต่อชนิด — ต้องตามมาครบทุกเดือน
   * แบบเดิมเทียบชนิดละเลขเดียว ซึ่งผ่านได้ทั้งที่ตัวนับของเดือนนี้หายไป
   */
  it('ตัวนับเลขที่เอกสารตามมาครบทุกเดือน ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const seqs = async (tenantId: string) => (await admin.query(
      `select kind::text as kind, period, last_no from doc_sequences
        where tenant_id = $1 order by kind, period`, [tenantId],
    )).rows.map((r) => [r.kind, r.period, n(r.last_no)]);
    const a = await seqs(firstTenant);
    expect(a).toContainEqual(['RC', '6907', 2]);
    expect(await seqs(secondTenant)).toEqual(a);

    /* ใบถัดไปของเดือนนั้นต้องต่อจากเลขเดิม ไม่ใช่เริ่ม 1 ใหม่ */
    const next = await admin.query(`select next_doc_no($1, 'RC', '6907') as no`, [secondTenant]);
    expect(n(next.rows[0].no)).toBe(3);
  });

  /**
   * ใบวางบิลถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว แปลว่าตัวนำเข้าต้องรับได้จริง
   * ถ้ารับไม่ได้ อู่ที่ย้ายเข้ามาจะเสียใบวางบิลไปเงียบ ๆ โดยไม่มีคำเตือนใด ๆ
   */
  it('ใบวางบิลตามมาครบ ทั้งยอดที่แจ้งและใบที่รวมไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select b.no, b.bill_date::text as bill_date, b.due_date::text as due_date,
                b.by_whom, b.total_snapshot,
                (select array_agg(d.doc_no order by d.doc_no)
                   from billnote_docs bd join documents d on d.id = bd.doc_id
                  where bd.billnote_id = b.id) as docs
         from billnotes b where b.tenant_id = $1 order by b.no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a).toHaveLength(1);
    expect(n(a[0].total_snapshot)).toBe(billnoteTotal);
    expect(a[0].docs.slice().sort()).toEqual(billnoteDocNos);

    expect(b).toHaveLength(1);
    expect(b[0].no).toBe(a[0].no);
    expect(b[0].bill_date).toBe(a[0].bill_date);
    expect(b[0].due_date).toBe(a[0].due_date);
    expect(b[0].by_whom).toBe(a[0].by_whom);
    expect(n(b[0].total_snapshot)).toBe(n(a[0].total_snapshot));
    expect(b[0].docs.slice().sort()).toEqual(billnoteDocNos);
  });

  it('ตัวนับเลขที่ใบวางบิลตามมาครบทุกเดือน ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select period, last_no from billnote_sequences where tenant_id = $1 order by period`,
      [tenantId],
    )).rows.map((r) => [r.period, n(r.last_no)]);
    const a = await read(firstTenant);
    expect(a).toContainEqual(['6907', 1]);
    expect(a).toContainEqual(['6908', 1]);
    expect(await read(secondTenant)).toEqual(a);

    const next = await admin.query(`select next_billnote_no($1, '6908') as n`, [secondTenant]);
    expect(n(next.rows[0].n)).toBe(2);
  });

  /**
   * ใบเคลมถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว ตัวนำเข้าจึงต้องรับได้จริง
   * และต้อง **ไม่ตัดสต๊อกซ้ำ** — ยอดคงเหลือที่ส่งออกไปเป็นยอดหลังหักเคลมแล้ว
   */
  it('ใบเคลมตามมาครบทั้งสองทิศทาง พร้อมต้นทุนที่ตรึงไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select c.no, c.side::text as side, c.kind, c.claim_date::text as claim_date,
                c.party_name, c.ref_no, c.reason, c.vehicle_plate,
                coalesce(sum(i.cost_amount), 0) as cost
         from claims c left join claim_items i on i.claim_id = c.id
         where c.tenant_id = $1 group by c.id order by c.no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a.map((r) => r.no).sort()).toEqual([...claimNos].sort());
    expect(b.map((r) => r.no).sort()).toEqual([...claimNos].sort());

    for (const [i, row] of a.entries()) {
      expect(b[i].no).toBe(row.no);
      expect(b[i].side).toBe(row.side);
      expect(b[i].kind).toBe(row.kind);
      expect(b[i].claim_date).toBe(row.claim_date);
      expect(b[i].party_name).toBe(row.party_name);
      expect(b[i].ref_no).toBe(row.ref_no);
      expect(b[i].reason).toBe(row.reason);
      expect(b[i].vehicle_plate).toBe(row.vehicle_plate);
      expect(n(b[i].cost)).toBe(n(row.cost));
    }
    expect(claimCost).toBeGreaterThan(0);
  });

  it('อู่ที่นำเข้ามาไม่ถูกตัดสต๊อกซ้ำจากใบเคลม', async () => {
    const moves = await admin.query(
      `select count(*)::int as c from stock_moves
       where tenant_id = $1 and claim_id is not null`,
      [secondTenant],
    );
    expect(moves.rows[0].c).toBe(0);
  });

  it('ตัวนับเลขที่ใบเคลมตามมาแยกตามทิศทางและเดือน', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select side::text as side, period, last_no from claim_sequences
        where tenant_id = $1 order by side, period`, [tenantId],
    )).rows.map((r) => [r.side, r.period, n(r.last_no)]);
    const a = await read(firstTenant);
    expect(a).toContainEqual(['customer', '6907', 1]);
    expect(a).toContainEqual(['customer', '6908', 1]);
    expect(a).toContainEqual(['vendor', '6908', 1]);
    expect(await read(secondTenant)).toEqual(a);
  });

  it('ตัวนับเลขที่ใบตรวจนับตามมาครบทุกเดือน', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select period, last_no from stock_count_sequences where tenant_id = $1 order by period`,
      [tenantId],
    )).rows.map((r) => [r.period, n(r.last_no)]);
    const a = await read(firstTenant);
    expect(a).toContainEqual(['6907', 1]);
    expect(a).toContainEqual(['6908', 1]);
    expect(await read(secondTenant)).toEqual(a);
  });

  /**
   * ใบตรวจนับถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว ตัวนำเข้าจึงต้องรับได้จริง
   * และต้อง **ไม่ปรับสต๊อกซ้ำ** — ยอดที่ส่งออกไปเป็นยอดหลังปรับแล้ว
   */
  it('ใบตรวจนับตามมาครบ พร้อมยอดระบบและต้นทุนที่ตรึงไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select c.no, c.count_date::text as count_date, c.note, c.status::text as status,
                i.counted_qty, i.system_qty, i.unit_cost
         from stock_counts c
         join stock_count_items i on i.count_id = c.id
         where c.tenant_id = $1 order by c.no, i.line_no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a).toHaveLength(1);
    expect(a[0].no).toBe(countNo);
    expect(a[0].status).toBe('applied');
    expect(n(a[0].counted_qty)).toBe(countedTo);

    expect(b).toHaveLength(1);
    expect(b[0].no).toBe(a[0].no);
    expect(b[0].count_date).toBe(a[0].count_date);
    expect(b[0].note).toBe(a[0].note);
    expect(b[0].status).toBe(a[0].status);
    expect(n(b[0].counted_qty)).toBe(n(a[0].counted_qty));
    expect(n(b[0].system_qty)).toBe(n(a[0].system_qty));
    expect(n(b[0].unit_cost)).toBe(n(a[0].unit_cost));
  });

  it('อู่ที่นำเข้ามาไม่ถูกปรับสต๊อกซ้ำจากใบตรวจนับ', async () => {
    const { rows } = await admin.query(
      `select count(*)::int as c from stock_moves
       where tenant_id = $1 and reason = 'count'`,
      [secondTenant],
    );
    expect(rows[0].c).toBe(0);
  });

  it('บาร์โค้ดของสินค้าตามไปด้วย ผูกกับสินค้าตัวเดิม', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select code, barcode from products
         where tenant_id = $1 and barcode is not null order by code`, [tenantId],
      );
      return rows.map((r) => [r.code, r.barcode]);
    };
    const a = await read(firstTenant);
    expect(a).toEqual([[expect.any(String), 'DGROUND01']]);
    expect(await read(secondTenant)).toEqual(a);
  });

  /**
   * สิทธิ์แบบละเอียดต้องรอดข้ามไฟล์สำรอง — ส่งออกเป็นรูปแบบของรุ่น 6.4
   * แล้วนำกลับเข้ามาต้องได้สิทธิ์เท่าเดิม ไม่ใช่ตกกลับไปเป็นค่าปริยาย
   */
  it('สิทธิ์แบบละเอียดของพนักงานตามไฟล์สำรองไปด้วย', async () => {
    await admin.query(
      `insert into users (tenant_id, code, name, email, role, perms, active)
       values ($1, 'U77', 'พนักงานสิทธิ์จำกัด', 'limited@example.com', 'staff',
               $2::jsonb, true)`,
      [firstTenant, JSON.stringify({
        menus: { stock: true, income: true },
        tabs: { 'stock.list': true, 'stock.count': false },
        edit: { 'stock.list': false },
        cost: false,
      })],
    );

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app) as unknown as Record<string, any>;
    const out = exported.users.find((u: any) => u.code === 'U77');

    /* รูปแบบต้องเป็นแบบ 6.4 — เมนูเป็นคีย์ระดับบน สิทธิ์รายแท็บอยู่ใน tabs/editTabs */
    expect(out.perms.stock).toBe(true);
    expect(out.perms.cost).toBe(false);
    expect(out.perms.tabs['stock.count']).toBe(false);
    expect(out.perms.editTabs['stock.list']).toBe(false);

    const back = await importBackup(app, exported as never, { openingStockDate: '2026-08-28' });
    const { rows } = await admin.query(
      `select perms from users where tenant_id = $1 and code = 'U77'`, [back.tenantId],
    );
    expect(rows[0].perms.menus).toEqual({ stock: true, income: true });
    expect(rows[0].perms.cost).toBe(false);
    expect(rows[0].perms.tabs['stock.count']).toBe(false);
    expect(rows[0].perms.edit['stock.list']).toBe(false);
  });

  it('ไฟล์สำรองไม่มีรหัสผ่านติดไปด้วย', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);
    const text = JSON.stringify(exported);

    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('passwordHash');
  });

  it('รูปสินค้าไปกลับแล้วยังเท่าเดิมทุกไบต์', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [secondTenant]);
    const p = await app.query('select id from products where code = $1', [picProductCode]);
    expect(p.rows[0], 'สินค้าที่มีรูปต้องถูกนำเข้ามาด้วย').toBeTruthy();

    const back = await readPic(app, p.rows[0].id, sha256(picFull), 'full');
    expect(back, 'รูปต้องตามมากับไฟล์สำรอง').not.toBeNull();
    expect(new Uint8Array(back!.bytes)).toEqual(picFull);

    const t = await readPic(app, p.rows[0].id, sha256(picFull), 'thumb');
    expect(new Uint8Array(t!.bytes), 'รูปย่อก็ต้องตามมา ไม่ใช่ถูกสร้างใหม่จากรูปเต็ม')
      .toEqual(picThumb);

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
  });

  it('ไฟล์สำรองเก็บรูปในรูปแบบเดียวกับรุ่น 6.4 เปิดที่นั่นได้', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const file = await exportBackupWith(app);

    const key = `p:${sha256(picFull)}`;
    expect(file._piclib, '_piclib คือชื่อที่รุ่น 6.4 ใช้').toHaveProperty(key);
    expect(file._piclib![key]).toMatch(/^data:image\/jpeg;base64,/);

    const prod = (file.products as any[]).find((x) => x.code === picProductCode);
    expect(prod.pics, 'ตัวสินค้าอ้างถึงรหัสรูป เหมือน p.pics ของรุ่นเดิม').toEqual([key]);

    expect(file._picthumbs, 'รูปย่ออยู่คนละคีย์ ซึ่งรุ่น 6.4 ข้ามไปเอง').toHaveProperty(key);
  });

  it('ไฟล์ที่ส่งออกผ่านการตรวจของตัวนำเข้าเอง', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);

    const { validateBackup } = await import('@drivegolight/importer');
    expect(validateBackup(exported)).toEqual([]);
  });

  /* ---------- ข้อมูลที่ชุดแก้ 13–14 ก.ย. เพิ่มเข้ามา ---------- */

  it('ส่วนลดรายบรรทัดและส่วนลดท้ายบิลแบบ % กลับมาครบ ยอดเอกสารเท่าเดิมทุกสตางค์', async () => {
    const read = async (tenantId: string) => {
      const d = (await admin.query(
        `select id, discount, discount_mode, discount_pct, subtotal, net_amount, vat_amount,
                wht_amount, grand_total, payable
           from documents where tenant_id = $1 and kind = 'RC' and doc_no = $2`,
        [tenantId, discDocNo])).rows[0];
      const items = (await admin.query(
        `select unit_price, disc_pct, line_total from doc_items where doc_id = $1 order by line_no`,
        [d.id])).rows;
      const { id: _id, ...doc } = d;
      return { doc, items };
    };
    const a = await read(firstTenant);
    expect(n(a.items[0].disc_pct)).toBe(12.5);
    expect(a.doc.discount_mode).toBe('pct');
    expect(await read(secondTenant)).toEqual(a);
  });

  it('ไฟล์ที่เปิดด้วยรุ่น 6.4 เห็นราคาหลังหักส่วนลด ยอดบรรทัดที่นั่นจึงถูก', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const file = await exportBackupWith(app) as unknown as Record<string, any>;
    const doc = file.receipts.find((r: any) => r.no === discDocNo);
    const line = doc.items[0];
    expect(line._discPct).toBe(12.5);
    /* รุ่น 6.4 คิดยอดบรรทัด = qty × price */
    expect(line.qty * line.price).toBeCloseTo(line.qty * line._gross * 0.875, 6);
    expect(doc.items[1]._gross, 'บรรทัดที่ไม่มีส่วนลดไม่ต้องมีคีย์เสริม').toBeUndefined();
    expect(doc._discountMode).toBe('pct');
    expect(doc._discountPct).toBe(5);
  });

  it('ชุดอะไหล่ซ่อมบำรุงตามมาครบ — รายการในชุด ราคา A/B/C ชุดที่ปิดใช้งาน และบรรทัดเอกสารที่อ้างชุด', async () => {
    const read = async (tenantId: string) => {
      const kits = (await admin.query(
        `select k.code, k.name, k.price, k.price_b, k.price_c, k.note, k.active,
                coalesce(json_agg(json_build_object('code', p.code, 'name', i.name, 'unit', i.unit,
                                                    'qty', i.qty, 'cost', i.unit_cost) order by i.sort_order)
                         filter (where i.id is not null), '[]') as items
           from kits k left join kit_items i on i.kit_id = k.id left join products p on p.id = i.product_id
          where k.tenant_id = $1 group by k.id order by k.code`, [tenantId])).rows;
      const lines = (await admin.query(
        `select d.doc_no, i.line_no, k.code as kit_code from doc_items i
           join documents d on d.id = i.doc_id join kits k on k.id = i.kit_id
          where i.tenant_id = $1 order by d.doc_no, i.line_no`, [tenantId])).rows;
      return { kits, lines };
    };
    const a = await read(firstTenant);
    expect(a.kits).toEqual([{
      code: 'KIT-007', name: 'ชุดถ่ายน้ำมันเครื่อง', price: '900.00', price_b: '850.00', price_c: '800.00',
      note: 'รถเก๋ง', active: false,
      items: [
        { code: supplierProductCode, name: 'น้ำมันเครื่อง', unit: 'ลิตร', qty: 4, cost: 120.5 },
        { code: null, name: 'ค่าแรง', unit: 'ครั้ง', qty: 1, cost: 0 },
      ],
    }]);
    expect(a.lines).toEqual([expect.objectContaining({ doc_no: discDocNo, kit_code: 'KIT-007' })]);
    expect(await read(secondTenant)).toEqual(a);
  });

  it('วิธีคิดต้นทุน ระบบบาร์โค้ด และผู้ขายของสินค้าตามมาครบ', async() => {
    const read = async (tenantId: string) => {
      const p = (await admin.query(
        `select id, cost_method, barcode_type from products where tenant_id = $1 and code = $2`,
        [tenantId, supplierProductCode])).rows[0];
      const suppliers = (await admin.query(
        `select c.code as vendor_code, s.name, s.sort_order from product_suppliers s
           left join contacts c on c.id = s.vendor_id
          where s.product_id = $1 order by s.sort_order`, [p.id])).rows;
      return { cost: p.cost_method, barcodeType: p.barcode_type, suppliers };
    };
    const a = await read(firstTenant);
    expect(a).toEqual({
      cost: 'AVG', barcodeType: 'EAN13',
      suppliers: [
        { vendor_code: vendorCode, name: 'ผู้ขายในทะเบียน', sort_order: 0 },
        { vendor_code: null, name: 'ร้านข้างนอกพิมพ์เอง', sort_order: 1 },
      ],
    });
    expect(await read(secondTenant)).toEqual(a);
  });

  it('ชื่อเจ้าของ ลายเซ็น หมายเหตุมาตรฐาน และบัญชีรับโอนทุกธนาคารตามมาครบ', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select owner_name, signature_url, note_default, bank_accounts,
              bank_name, bank_account_no, bank_account_name
         from tenants where id = $1`, [tenantId])).rows[0];
    const a = await read(firstTenant);
    expect(a.bank_accounts).toHaveLength(2);
    expect(a.owner_name).toBe('สมศักดิ์ ใจดี');
    expect(await read(secondTenant)).toEqual(a);
  });

  it('ช่อง "อื่นๆ" ของรถตามมา', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select c.code, v.plate_a, v.plate_b, v.other
         from vehicles v join contacts c on c.id = v.contact_id
        where v.tenant_id = $1 and v.other <> '' order by c.code`, [tenantId])).rows;
    const a = await read(firstTenant);
    expect(a).toHaveLength(1);
    expect(await read(secondTenant)).toEqual(a);
  });

  /**
   * เอกสารที่ยกเลิกต้องกลับมาเป็นยกเลิก ด้วยวันที่ยกเลิกเดิม
   *
   * ตัวนำเข้าเดิมไม่อ่านธง voided ของเอกสารเลย กู้ข้อมูลแล้วใบที่ยกเลิกไปกลับมาเป็นใบปกติ
   * เข้ารายงาน ลูกหนี้ และภาษีขายอีกครั้ง (มีมาก่อนชุดแก้) — ถังขยะค้นตามวันที่ยกเลิก
   * จึงต้องได้วันเดิมด้วย ไม่ใช่วันที่กู้
   */
  it('เอกสารที่ยกเลิกยังเป็นยกเลิกด้วยวันที่เดิม และที่ลบถาวรยังลบถาวร', async () => {
    const read = async (tenantId: string) => (await admin.query(
      `select doc_no, status::text as status, voided_at, voided_reason, purged_at
         from documents where tenant_id = $1 and kind = 'EX' and doc_no = any($2)
        order by doc_no`, [tenantId, [voidDocNo, purgedDocNo]],
    )).rows.map((r) => ({
      ...r,
      voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : null,
      purged_at: r.purged_at ? new Date(r.purged_at).toISOString() : null,
    }));
    const a = await read(firstTenant);
    expect(a.map((r) => r.status)).toEqual(['void', 'void']);
    expect(a.find((r) => r.doc_no === voidDocNo)!.purged_at).toBeNull();
    expect(a.find((r) => r.doc_no === purgedDocNo)!.purged_at).toBe('2026-08-21T04:00:00.000Z');
    expect(await read(secondTenant)).toEqual(a);
  });

  /* แยกเป็นการส่งออกรอบใหม่ เหมือนข้อสิทธิ์พนักงาน — ใบวางบิลที่เพิ่มตรงนี้จึงไม่กระทบข้อก่อนหน้า */
  it('ใบวางบิลที่ยกเลิกและลบถาวร ไปกลับแล้วยังเป็นแบบเดิม', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const open = await openInvoices(app);
    const one = open.find((v) => !billnoteDocNos.includes(v.docNo))!;
    await saveBillnote(app, {
      billDate: '2026-08-29', dueDate: '2026-09-30',
      partyId: one.partyId ?? null, partyName: one.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: '', note: 'ใบที่จะยกเลิกและลบถาวร',
      docIds: [one.id],
    }, null);
    const bn = (await admin.query(
      `select id, no from billnotes where tenant_id = $1 and note = 'ใบที่จะยกเลิกและลบถาวร'`,
      [firstTenant])).rows[0];
    await admin.query(
      `update billnotes set status = 'void', voided_at = '2026-08-30T02:00:00Z',
              purged_at = '2026-08-31T02:00:00Z' where id = $1`, [bn.id]);
    await admin.query(`update billnote_docs set voided = true where billnote_id = $1`, [bn.id]);

    const file = await exportBackupWith(app);
    const back = await importBackup(app, file as never, { openingStockDate: '2026-08-28' });

    const read = async (tenantId: string) => (await admin.query(
      `select status::text as status, voided_at, purged_at from billnotes
        where tenant_id = $1 and no = $2`, [tenantId, bn.no],
    )).rows.map((r) => ({
      status: r.status,
      voided_at: new Date(r.voided_at).toISOString(),
      purged_at: r.purged_at ? new Date(r.purged_at).toISOString() : null,
    }));
    const a = await read(firstTenant);
    expect(a).toEqual([{
      status: 'void', voided_at: '2026-08-30T02:00:00.000Z', purged_at: '2026-08-31T02:00:00.000Z',
    }]);
    expect(await read(back.tenantId)).toEqual(a);
  });
});
