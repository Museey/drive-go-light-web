import 'server-only';
import type pg from 'pg';
import { recTotals, today, totalsOf, whtBaseOf, type VatMode } from '@drivegolight/core';
import { query } from './auth';
import {
  openDocsForWith, plateOf, resolveSourceForNewWith, syncVehicleFromDocWith,
  type OpenDoc,
} from './doc-chain';
import { mutate } from './mutate';
import { consumeStock, returnDocStock } from './stock-cost';
import { billnoteOfDoc } from './billnotes';
import { REMAINING_LOTS_SQL } from './expiry';
import { findByScanWith, parseScan } from './scan';

const n = (v: unknown): number => Number(v ?? 0);

export { forcedVatMode, nextKinds, WALK_IN_CUSTOMER, type SalesKind } from './sales-rules';
import { forcedVatMode, type SalesKind } from './sales-rules';

export interface DocItemInput {
  productId: string | null;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  isService: boolean;
}

export interface PaymentInput {
  method: string;
  amount: number;
  ref: string;
}

export interface SalesDocInput {
  id?: string;
  kind: SalesKind;
  docDate: string;
  parentDocId: string | null;

  partyId: string | null;
  partyType: 'person' | 'company';
  partyName: string;
  partyTaxId: string;
  partyTel: string;
  partyEmail: string;
  partyAddr: Record<string, string>;
  partyAddrText: string;

  vehicleId: string | null;
  vehicle: Record<string, string> | null;

  priceTier: 'A' | 'B' | 'C' | null;
  discount: number;
  vatMode: VatMode;
  whtRate: number;
  creditDays: number;

  complaints: string[];
  findings: string[];
  approver: string;
  proposer: string;

  warrantyText: string;
  receivedBy: string;
  note: string;

  items: DocItemInput[];
  /** การรับชำระ ณ วันออกเอกสาร */
  payments: PaymentInput[];
}

const PREFIX: Record<SalesKind, string> = { QT: 'QT', IV: 'IV', IVT: 'IVT', RC: 'RC' };

/**
 * บันทึกเอกสารขาย — สร้างใหม่หรือแก้ของเดิม
 *
 * ทุกอย่างอยู่ในทรานแซกชันเดียว: ออกเลขที่ เขียนเอกสาร รายการ การชำระเงิน และตัดสต๊อก
 * ถ้าล้มกลางทางจะไม่มีเลขที่ถูกใช้ทิ้งและไม่มีสต๊อกที่ตัดค้าง
 */
export async function saveSalesDoc(input: SalesDocInput): Promise<{ id: string; docNo: string }> {
  return mutate('income', async (c, userId) => {
    const shop = await c.query(
      `select vat_rate, warranty_text from tenants where id = current_tenant_id()`,
    );
    const vatRate = n(shop.rows[0].vat_rate);
    const vatMode = forcedVatMode(input.kind, input.vatMode);

    /* ยอดคำนวณฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าที่หน้าเว็บส่งมา
       ใช้สูตรชุดเดียวกับที่หน้าเว็บใช้แสดงผล ตัวเลขจึงตรงกันอยู่แล้ว */
    const doc = {
      items: input.items.map((i) => ({ qty: i.qty, price: i.unitPrice, svc: i.isService })),
      discount: input.discount,
      vatMode,
      whtRate: input.kind === 'QT' ? 0 : input.whtRate,
      date: input.docDate,
    };
    const t = recTotals(doc, { vatRate });

    const dueDate = input.creditDays > 0 ? addDays(input.docDate, input.creditDays) : input.docDate;

    let id = input.id;
    let docNo: string;

    if (id) {
      const existing = await c.query(
        `select doc_no, status::text as status from documents where id = $1`, [id],
      );
      if (!existing.rows[0]) throw new Error('ไม่พบเอกสารที่จะแก้');
      if (existing.rows[0].status === 'void') throw new Error('เอกสารนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
      docNo = existing.rows[0].doc_no;

      await c.query(
        `update documents set doc_date=$2, party_id=$3, party_type=$4, party_name=$5,
                party_tax_id=$6, party_tel=$7, party_email=$8, party_addr=$9, party_addr_text=$10,
                vehicle_id=$11, vehicle=$12, vehicle_plate=$13,
                price_tier=$14, discount=$15, vat_mode=$16, vat_rate=$17, wht_rate=$18,
                subtotal=$19, net_amount=$20, vat_amount=$21, wht_amount=$22,
                grand_total=$23, payable=$24, credit_days=$25, due_date=$26,
                complaints=$27, findings=$28, approver=$29, proposer=$30,
                warranty_text=$31, received_by=$32, note=$33
         where id=$1`,
        updateParams(id, input, vatMode, vatRate, t, dueDate),
      );

      await c.query(`delete from doc_items where doc_id = $1`, [id]);
      await c.query(`delete from payments where doc_id = $1 and at_issue`, [id]);

      /* สต๊อกไม่ลบทิ้งแล้วลงใหม่ — ลงรายการคืนแล้วค่อยตัดใหม่ข้างล่าง
         บัญชีที่ลบย้อนหลังได้ก็ไม่ใช่บัญชี ต้นทุนของใบที่ขายหลังจากนี้
         จะอ้างล็อตที่ไม่มีอยู่จริง และประวัติการแก้ก็หายไปด้วย */
      await returnDocStock(c, id, {
        movedOn: input.docDate,
        note: 'คืนสต๊อกเพราะแก้ไขเอกสาร',
        userId,
      });
    } else {
      const seq = await c.query(
        `select next_doc_no(current_tenant_id(), $1, '') as no`, [input.kind],
      );
      const ym = input.docDate.slice(0, 4) + input.docDate.slice(5, 7);
      docNo = `${PREFIX[input.kind]}-${ym}-${String(seq.rows[0].no).padStart(3, '0')}`;

      const { rows } = await c.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, parent_doc_id,
                party_id, party_type, party_name, party_tax_id, party_tel, party_email,
                party_addr, party_addr_text, vehicle_id, vehicle, vehicle_plate,
                price_tier, discount, vat_mode, vat_rate, wht_rate,
                subtotal, net_amount, vat_amount, wht_amount, grand_total, payable,
                credit_days, due_date, complaints, findings, approver, proposer,
                warranty_text, received_by, note, created_by)
         values (current_tenant_id(),$1,$2,$3,'issued',$4,
                 $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                 $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
                 $27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
         returning id`,
        [
          input.kind, docNo, input.docDate, input.parentDocId,
          input.partyId, input.partyType, input.partyName, digits(input.partyTaxId),
          input.partyTel, input.partyEmail, JSON.stringify(input.partyAddr), input.partyAddrText,
          input.vehicleId, input.vehicle ? JSON.stringify(input.vehicle) : null, plateOf(input.vehicle),
          input.priceTier,
          money(input.discount), vatMode, vatRate, input.kind === 'QT' ? 0 : input.whtRate,
          money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
          input.creditDays, dueDate,
          input.kind === 'QT' ? input.complaints : null,
          input.kind === 'QT' ? input.findings : null,
          input.kind === 'QT' ? input.approver : '',
          input.kind === 'QT' ? input.proposer : '',
          input.warrantyText || null, input.receivedBy, input.note, userId,
        ],
      );
      id = rows[0].id;
    }

    /* ---------- รายการ ---------- */
    for (const [i, it] of input.items.entries()) {
      await c.query(
        `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit,
                                qty, unit_price, is_service)
         values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, i + 1, it.productId, it.code, it.oem, it.name || '(ไม่ระบุชื่อรายการ)',
         it.unit, it.qty, money(it.unitPrice), it.isService],
      );
    }

    /* ---------- การรับชำระ ณ วันออกเอกสาร ---------- */
    for (const p of input.payments) {
      if (p.amount <= 0.004) continue;
      await c.query(
        `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref, at_issue, created_by)
         values (current_tenant_id(),$1,$2,$3,$4,$5,true,$6)`,
        [id, input.docDate, money(p.amount), p.method, p.ref, userId],
      );
    }

    /* ---------- ตัดสต๊อก ----------
       ตัดตอนออกใบเสร็จเท่านั้น ตามพฤติกรรมของโปรแกรมเดิม

       ข้อสังเกต: ใบส่งมอบที่ยังไม่เก็บเงินจะยังไม่ตัดสต๊อก ทั้งที่ของออกจากร้านไปแล้ว
       เป็นพฤติกรรมที่ยกมาจากต้นแบบโดยตั้งใจ ถ้าจะเปลี่ยนต้องตัดสินใจร่วมกับเจ้าของอู่
       เพราะตัวเลขสต๊อกจะไม่ตรงกับที่เขาคุ้นเคย */
    if (input.kind === 'RC') {
      for (const it of input.items) {
        if (!it.productId || it.qty === 0) continue;
        /* ต้นทุนคิดแบบเข้าก่อนออกก่อนแล้วตรึงลงแถวนั้นเลย
           งบกำไรขาดทุนอ่านค่านี้ ไม่ได้คำนวณใหม่ตอนเปิดรายงาน */
        await consumeStock(c, {
          productId: it.productId,
          qty: it.qty,
          movedOn: input.docDate,
          reason: 'sale',
          docId: id,
          userId,
        });
      }
    }

    /* เลขไมล์กลับเข้าทะเบียนรถ — กติกาอยู่ที่ doc-chain.ts เพื่อให้ทดสอบได้ */
    await syncVehicleFromDocWith(c, {
      vehicleId: input.vehicleId,
      mileage: String(input.vehicle?.mileage ?? ''),
      docDate: input.docDate,
    });

    /* ใบเสนอราคาที่ถูกนำไปออกเอกสารต่อ ให้ทำเครื่องหมายว่าออกบิลแล้ว */
    if (input.parentDocId && input.kind !== 'QT') {
      await c.query(
        `update documents set status = 'billed'
         where id = $1 and kind = 'QT' and status <> 'void'`,
        [input.parentDocId],
      );
    }

    return { id: id!, docNo };
  }, { sub: 'receipt' });
}

function updateParams(
  id: string, input: SalesDocInput, vatMode: VatMode, vatRate: number,
  t: { sub: number; net: number; vat: number; wht: number; grand: number; payable: number },
  dueDate: string,
): unknown[] {
  return [
    id, input.docDate, input.partyId, input.partyType, input.partyName,
    digits(input.partyTaxId), input.partyTel, input.partyEmail,
    JSON.stringify(input.partyAddr), input.partyAddrText,
    input.vehicleId, input.vehicle ? JSON.stringify(input.vehicle) : null, plateOf(input.vehicle),
    input.priceTier,
    money(input.discount), vatMode, vatRate, input.kind === 'QT' ? 0 : input.whtRate,
    money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
    input.creditDays, dueDate,
    input.kind === 'QT' ? input.complaints : null,
    input.kind === 'QT' ? input.findings : null,
    input.kind === 'QT' ? input.approver : '',
    input.kind === 'QT' ? input.proposer : '',
    input.warrantyText || null, input.receivedBy, input.note,
  ];
}

const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
const digits = (v: string) => String(v ?? '').replace(/\D/g, '');
function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * ยกเลิกเอกสาร — ไม่ลบ เพราะเอกสารภาษีที่ออกแล้วลบไม่ได้ตามกฎหมาย
 * สต๊อกที่ตัดไปต้องคืนกลับด้วย ไม่งั้นของหายจากบัญชีทั้งที่ยังอยู่ในร้าน
 */
export async function voidSalesDoc(id: string, reason: string): Promise<void> {
  return mutate('income', async (c, userId) => {
    const child = await c.query(
      `select doc_no from documents where parent_doc_id = $1 and status <> 'void' limit 1`, [id],
    );
    if (child.rows[0]) {
      throw new Error(`ยกเลิกไม่ได้เพราะมีเอกสาร ${child.rows[0].doc_no} ออกต่อจากใบนี้แล้ว`);
    }

    /* ใบที่ถูกวางบิลไปแล้วยกเลิกไม่ได้ — ลูกค้าถือใบวางบิลที่มีเลขใบนี้อยู่ในมือ
       ถ้าหายไปเฉย ๆ ยอดบนกระดาษกับในระบบจะไม่ตรงกันโดยไม่มีใครอธิบายได้ */
    const bn = await billnoteOfDoc(c, id);
    if (bn) {
      throw new Error(`ใบนี้ถูกรวมอยู่ในใบวางบิล ${bn} — เอาออกจากใบวางบิลก่อน`);
    }

    /* คืนของด้วยต้นทุนที่เคยตัดไป ไม่ใช่ต้นทุนวันนี้ — ไม่งั้นการยกเลิกใบเสร็จ
       จะกลายเป็นกำไรหรือขาดทุนจากอากาศ รายการคืนอ้างเอกสารที่ยกเลิกเสมอ
       ทั้งเพราะสคีมาบังคับและเพราะต้องตามได้ว่าของกลับมาเพราะใบไหน */
    await returnDocStock(c, id, {
      movedOn: today(),
      note: 'คืนสต๊อกจากการยกเลิกเอกสาร',
      userId,
    });

    await c.query(
      `update documents set status='void', voided_at=now(), voided_reason=$2 where id=$1`,
      [id, reason || 'ยกเลิกโดยผู้ใช้'],
    );
  }, { sub: 'receipt' });
}

/* =====================================================================
   ตัวช่วยสำหรับหน้าจอออกเอกสาร
   ===================================================================== */

export interface PickedProduct {
  id: string;
  code: string;
  oem: string;
  name: string;
  unit: string;
  priceA: number;
  priceB: number;
  priceC: number;
  qtyOnHand: number;
  /** อายุการเก็บ ใช้เติมวันหมดอายุให้ตอนรับของเข้าใบซื้อ — ว่าง = ไม่มีวันหมดอายุ */
  shelfLifeMonths: number | null;
  /** วันหมดอายุของล็อตที่จะถูกตัดก่อน — ว่าง = ไม่มีของที่หมดอายุได้ */
  nearestExpiry: string | null;
}

/**
 * วันหมดอายุที่ใกล้ที่สุดของอะไหล่ที่อยู่บนเอกสาร — ใช้เตือนตอนออกเอกสาร
 *
 * ตอบเป็นวันของล็อตที่**จะถูกตัดก่อน** ไม่ใช่ของทั้งกอง เพราะบรรทัดนั้นจะกินล็อตนั้นก่อน
 * บรรทัดที่ไม่ได้ผูกกับทะเบียนสินค้า (ค่าแรง บรรทัดพิมพ์เอง) ไม่มีล็อตให้ตัด จึงไม่ต้องถาม
 */
export async function lotExpiryOf(ids: (string | null)[]): Promise<Record<string, string>> {
  const want = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (want.length === 0) return {};
  return query(async (c) => {
    const { nearestExpiryWith } = await import('./expiry');
    return Object.fromEntries(await nearestExpiryWith(c, want));
  });
}

/** ชุดคอลัมน์ของอะไหล่ที่หน้าออกเอกสารต้องใช้ — ที่เดียว ใช้ทั้งการค้นและการยิง */
const PICK_SELECT = `
  ${REMAINING_LOTS_SQL}
  select p.id, p.code, p.oem, p.name, p.unit, p.price_a, p.price_b, p.price_c,
         p.shelf_life_months, s.qty_on_hand,
         x.nearest_expiry::text as nearest_expiry
    from products p join product_stock s on s.product_id = p.id
    left join (select product_id, min(expires_on) as nearest_expiry
                 from remaining group by product_id) x on x.product_id = p.id`;

const toPickedProduct = (r: any): PickedProduct => ({
  id: r.id, code: r.code, oem: r.oem, name: r.name, unit: r.unit,
  priceA: n(r.price_a), priceB: n(r.price_b), priceC: n(r.price_c),
  qtyOnHand: n(r.qty_on_hand),
  shelfLifeMonths: r.shelf_life_months ?? null,
  nearestExpiry: r.nearest_expiry ?? null,
});

/**
 * ค้นอะไหล่สำหรับหน้าออกเอกสาร — **ค้นบาร์โค้ดด้วย**
 *
 * ปืนยิงบาร์โค้ดทำงานเหมือนคีย์บอร์ดที่พิมพ์เร็วแล้วกด Enter ช่องนี้จึงรับการยิงได้
 * โดยไม่ต้องมีอะไรพิเศษ ขอแค่ค้นบาร์โค้ดเจอ (เดิมค้นแค่รหัส ชื่อ และ OEM)
 */
export async function searchProducts(q: string, limit = 15): Promise<PickedProduct[]> {
  const term = q.trim();
  return query(async (c) => {
    const { rows } = await c.query(
      `${PICK_SELECT}
       where p.active and ($1 = '' or p.barcode ilike $2 or p.code ilike $2
                        or p.name ilike $2 or p.oem ilike $2)
       /* ตัวที่ตรงเป๊ะมาก่อนเสมอ — ยิงบาร์โค้ดแล้วต้องได้ตัวนั้นเป็นตัวแรก
          ไม่ใช่ตัวที่บังเอิญมีเลขนั้นอยู่กลางชื่อ */
       order by case when upper(p.barcode) = upper($1) then 0
                     when upper(p.code) = upper($1) then 1
                     when upper(p.oem) = upper($1) then 2 else 3 end,
                p.code
       limit $3`,
      [term, `%${term}%`, limit],
    );
    return rows.map(toPickedProduct);
  });
}

/** อะไหล่ตามรหัสภายใน — ใช้ต่อจากการยิงที่รู้ตัวแล้วว่าเป็นตัวไหน */
async function pickedById(
  c: pg.PoolClient | pg.Client, id: string,
): Promise<PickedProduct | null> {
  const { rows } = await c.query(`${PICK_SELECT} where p.id = $1`, [id]);
  return rows[0] ? toPickedProduct(rows[0]) : null;
}

export type DocScan =
  | { kind: 'one'; qty: number; product: PickedProduct }
  | { kind: 'inactive'; code: string; name: string }
  | { kind: 'many'; term: string; count: number }
  | { kind: 'none'; term: string };

/**
 * ยิงบาร์โค้ดเข้าหน้าออกเอกสาร
 *
 * คืนตัวสินค้าพร้อมราคาให้ฝั่งหน้าจอเอาไปใส่เป็นบรรทัดเอง — ไม่ได้เขียนลงเอกสารที่นี่
 * เพราะเอกสารยังเป็นร่างอยู่ในหน้าจอ ยังไม่มีตัวตนในฐานข้อมูลจนกว่าจะกดบันทึก
 *
 * กติกาการค้นใช้ชุดเดียวกับใบตรวจนับ (scan.ts) และจำนวนนำหน้าแบบ `40*ABC123`
 */
export async function scanForDoc(raw: string): Promise<DocScan> {
  const { qty, term } = parseScan(raw);
  if (!term) return { kind: 'none', term };

  return query(async (c) => {
    const hit = await findByScanWith(c, term);
    if (hit.kind === 'none') return { kind: 'none', term };
    if (hit.kind === 'many') return { kind: 'many', term, count: hit.count };
    if (hit.kind === 'inactive') {
      return { kind: 'inactive', code: hit.code, name: hit.name };
    }

    const product = await pickedById(c, hit.productId);
    return product ? { kind: 'one', qty, product } : { kind: 'none', term };
  });
}

export interface PickedContact {
  id: string;
  code: string;
  name: string;
  type: 'person' | 'company';
  taxId: string;
  tel: string;
  email: string;
  addr: Record<string, string>;
  addrText: string;
  creditDays: number;
  vehicles: { id: string; label: string; data: Record<string, string> }[];
}

/**
 * ดึงผู้ติดต่อรายเดียวมาในรูปแบบเดียวกับที่ช่องค้นหาคืนให้
 *
 * ใช้ตอนเปิดใบซ่อมจากแถวทะเบียนลูกค้า — ต้องได้ผลเหมือนกดเลือกด้วยมือทุกช่อง
 * รวมถึงรถในทะเบียน ไม่ใช่แค่ชื่อกับเบอร์โทร
 */
export async function pickContactById(id: string): Promise<PickedContact | null> {
  return query(async (c) => {
    const { rows } = await c.query(`select k.* from contacts k where k.id = $1`, [id]);
    if (!rows[0]) return null;
    return (await toPicked(c, rows))[0] ?? null;
  });
}

export async function searchCustomers(q: string, limit = 15): Promise<PickedContact[]> {
  const term = q.trim();
  return query(async (c) => {
    const { rows } = await c.query(
      `select k.* from contacts k
       where k.kind = 'customer'
         and ($1 = '' or k.code ilike $2 or k.org_name ilike $2
              or k.first_name ilike $2 or k.last_name ilike $2 or k.tel ilike $2
              or exists (select 1 from vehicles v where v.contact_id = k.id
                         and (v.plate_b ilike $2 or v.plate_a ilike $2)))
       order by k.code limit $3`,
      [term, `%${term}%`, limit],
    );
    return toPicked(c, rows);
  });
}

/** แปลงแถว contacts เป็น PickedContact พร้อมรถในทะเบียน — ที่เดียวเพื่อให้ทุกทางเข้าได้ผลเท่ากัน */
async function toPicked(
  c: pg.PoolClient | pg.Client,
  /* แถวดิบจาก pg — addr เป็น jsonb จึงไม่ใช่สตริงทั้งก้อน */
  rows: Record<string, any>[],
): Promise<PickedContact[]> {
  {

    const ids = rows.map((r) => r.id);
    const veh = ids.length
      ? (await c.query(`select * from vehicles where contact_id = any($1) order by created_at`, [ids])).rows
      : [];

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.type === 'company'
        ? r.org_name
        : [r.prefix, r.first_name, r.last_name].filter(Boolean).join(' '),
      type: r.type as 'person' | 'company',
      taxId: r.tax_id ?? '',
      tel: r.tel,
      email: r.email ?? '',
      addr: r.addr ?? {},
      addrText: r.addr_text ?? '',
      creditDays: Number(r.credit_days),
      vehicles: (veh as Record<string, string>[])
        .filter((v) => v.contact_id === r.id)
        .map((v) => ({
          id: v.id,
          label: [[v.brand, v.model].filter(Boolean).join(' '),
                  [v.plate_a, v.plate_b].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'ไม่ระบุ',
          data: {
            brand: v.brand, model: v.model, year: v.year, color: v.color,
            plateA: v.plate_a, plateB: v.plate_b, plateProv: v.plate_province,
            engineNo: v.engine_no, chassisNo: v.chassis_no, mileage: v.mileage,
          },
        })),
    }));
  }
}

/** โหลดเอกสารต้นทางมาตั้งต้นเอกสารใหม่ในสายเดียวกัน */
/** ตัวห่อของ resolveSourceForNewWith — กติกาอยู่ที่ doc-chain.ts เพื่อให้ทดสอบได้ */
export async function resolveSourceForNew(
  fromId: string,
  kind: SalesKind,
): Promise<{ sourceId: string; movedTo: { id: string; docNo: string } | null }> {
  return query((c) => resolveSourceForNewWith(c, fromId, kind));
}

/**
 * @param allowVoid ยอมให้คัดลอกจากเอกสารที่ถูกยกเลิกแล้ว — ใช้ตอนกด "คัดลอกใบใหม่"
 *   ซึ่งเป็นทางออกเดียวที่เหลือของใบที่ยกเลิกไปแล้ว ตัวใบเดิมไม่ถูกแตะต้อง
 */
export async function loadDocForCopy(
  id: string,
  allowVoid = false,
): Promise<SalesDocInput | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.*, d.kind::text as kind_text, d.vat_mode::text as vat_mode_text
       from documents d where d.id = $1 ${allowVoid ? '' : "and d.status <> 'void'"}`,
      [id],
    );
    const d = rows[0];
    if (!d) return null;

    const items = await c.query(
      `select * from doc_items where doc_id = $1 order by line_no`, [id],
    );

    return {
      kind: d.kind_text as SalesKind,
      docDate: d.doc_date,
      /* คืน parent จริงของเอกสารนี้ — หน้าที่เอาไปออกใบต่อจะตั้ง parent ใหม่เองทับค่านี้ */
      parentDocId: d.parent_doc_id,
      partyId: d.party_id,
      partyType: d.party_type,
      partyName: d.party_name,
      partyTaxId: d.party_tax_id,
      partyTel: d.party_tel,
      partyEmail: d.party_email,
      partyAddr: d.party_addr ?? {},
      partyAddrText: d.party_addr_text,
      vehicleId: d.vehicle_id,
      vehicle: d.vehicle,
      priceTier: d.price_tier,
      discount: n(d.discount),
      vatMode: d.vat_mode_text as VatMode,
      whtRate: n(d.wht_rate),
      creditDays: Number(d.credit_days),
      complaints: d.complaints ?? [],
      findings: d.findings ?? [],
      approver: d.approver ?? '',
      proposer: d.proposer ?? '',
      warrantyText: d.warranty_text ?? '',
      receivedBy: d.received_by ?? '',
      note: d.note ?? '',
      items: items.rows.map((r) => ({
        productId: r.product_id,
        code: r.code, oem: r.oem, name: r.name, unit: r.unit,
        qty: n(r.qty), unitPrice: n(r.unit_price), isService: r.is_service,
      })),
      payments: [],
    };
  });
}

/** เอกสารนี้แก้ไขได้ไหม */
export async function canEdit(id: string): Promise<{ ok: boolean; reason?: string }> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.status::text as status,
              (select doc_no from documents x
               where x.parent_doc_id = d.id and x.status <> 'void' limit 1) as child_no
       from documents d where d.id = $1`,
      [id],
    );
    const d = rows[0];
    if (!d) return { ok: false, reason: 'ไม่พบเอกสาร' };
    if (d.status === 'void') return { ok: false, reason: 'เอกสารนี้ถูกยกเลิกแล้ว' };
    if (d.child_no) {
      return { ok: false, reason: `แก้ไม่ได้เพราะมีเอกสาร ${d.child_no} ออกต่อจากใบนี้แล้ว` };
    }
    return { ok: true };
  });
}

/** ข้อความรับประกันตั้งต้นของร้าน */
export async function getDefaultWarranty(): Promise<string> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select coalesce(warranty_text, '') as w from tenants where id = current_tenant_id()`,
    );
    return rows[0].w;
  });
}

/** ใบที่ยังค้าง ให้เลือกตอนออกเอกสารใหม่จากศูนย์ — กติกาอยู่ที่ doc-chain.ts */
export async function openDocsFor(
  target: 'invoice' | 'receipt',
  search?: string,
): Promise<OpenDoc[]> {
  return query((c) => openDocsForWith(c, target, { search }));
}

export type { OpenDoc };
