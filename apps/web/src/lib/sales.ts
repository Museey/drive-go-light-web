import 'server-only';
import { recTotals, totalsOf, whtBaseOf, type VatMode } from '@drivegolight/core';
import { query } from './auth';
import { mutate } from './mutate';

const n = (v: unknown): number => Number(v ?? 0);

export { forcedVatMode, nextKinds, type SalesKind } from './sales-rules';
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
      await c.query(`delete from stock_moves where doc_id = $1`, [id]);
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
        await c.query(
          `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, reason, doc_id, created_by)
           values (current_tenant_id(),$1,$2,$3,'sale',$4,$5)`,
          [it.productId, input.docDate, -it.qty, id, userId],
        );
      }
    }

    /* ใบเสนอราคาที่ถูกนำไปออกเอกสารต่อ ให้ทำเครื่องหมายว่าออกบิลแล้ว */
    if (input.parentDocId && input.kind !== 'QT') {
      await c.query(
        `update documents set status = 'billed'
         where id = $1 and kind = 'QT' and status <> 'void'`,
        [input.parentDocId],
      );
    }

    return { id: id!, docNo };
  });
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
const plateOf = (v: Record<string, string> | null) =>
  v ? [v.plateA, v.plateB].filter(Boolean).join(' ') : '';

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

    const moves = await c.query(
      `select product_id, qty_delta, moved_on from stock_moves where doc_id = $1 and reason = 'sale'`,
      [id],
    );
    for (const m of moves.rows) {
      /* รายการคืนต้องอ้างเอกสารที่ยกเลิก — สคีมาบังคับไว้ (stock_move_doc_ref)
         และเป็นสิ่งที่ควรทำอยู่แล้ว เพราะต้องตามได้ว่าของคืนกลับมาเพราะใบไหน */
      await c.query(
        `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, reason,
                                  doc_id, note, created_by)
         values (current_tenant_id(),$1,current_date,$2,'return',$3,'คืนสต๊อกจากการยกเลิกเอกสาร',$4)`,
        [m.product_id, -n(m.qty_delta), id, userId],
      );
    }

    await c.query(
      `update documents set status='void', voided_at=now(), voided_reason=$2 where id=$1`,
      [id, reason || 'ยกเลิกโดยผู้ใช้'],
    );
  });
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
}

export async function searchProducts(q: string, limit = 15): Promise<PickedProduct[]> {
  const term = q.trim();
  return query(async (c) => {
    const { rows } = await c.query(
      `select p.id, p.code, p.oem, p.name, p.unit, p.price_a, p.price_b, p.price_c, s.qty_on_hand
       from products p join product_stock s on s.product_id = p.id
       where p.active and ($1 = '' or p.code ilike $2 or p.name ilike $2 or p.oem ilike $2)
       order by p.code limit $3`,
      [term, `%${term}%`, limit],
    );
    return rows.map((r) => ({
      id: r.id, code: r.code, oem: r.oem, name: r.name, unit: r.unit,
      priceA: n(r.price_a), priceB: n(r.price_b), priceC: n(r.price_c),
      qtyOnHand: n(r.qty_on_hand),
    }));
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
      type: r.type,
      taxId: r.tax_id ?? '',
      tel: r.tel,
      email: r.email ?? '',
      addr: r.addr ?? {},
      addrText: r.addr_text ?? '',
      creditDays: Number(r.credit_days),
      vehicles: veh
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
  });
}

/** โหลดเอกสารต้นทางมาตั้งต้นเอกสารใหม่ในสายเดียวกัน */
export async function loadDocForCopy(id: string): Promise<SalesDocInput | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.*, d.kind::text as kind_text, d.vat_mode::text as vat_mode_text
       from documents d where d.id = $1 and d.status <> 'void'`,
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
