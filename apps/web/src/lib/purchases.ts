import 'server-only';
import { docNoPeriod, formatDocNo } from './doc-no';
import { lineAmount, exTotals, poTotals, today, type VatMode } from '@drivegolight/core';
import { query } from './auth';
import { docVersionWith, lockDocForEditWith } from './doc-version';
import { mutate } from './mutate';
import { voidBuyDocWith, unvoidBuyDocWith } from './buy-void';

const n = (v: unknown): number => Number(v ?? 0);
const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
const r2 = (v: number) => Math.round(v * 100) / 100;
const digits = (v: string) => String(v ?? '').replace(/\D/g, '');

export type BuyKind = 'PO' | 'EX';
export type ExpenseCat = 'rent' | 'utility' | 'salary' | 'telecom' | 'asset' | 'other';

export interface BuyItemInput {
  productId: string | null;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  /** ส่วนลดรายบรรทัด 0–100 (%) — ไม่ส่ง = 0 */
  discPct?: number;
  /**
   * วันหมดอายุของล็อตที่รับเข้าจากบรรทัดนี้ — ว่าง = ไม่มีวันหมดอายุ
   *
   * เก็บที่ล็อต ไม่ใช่ที่สินค้า เพราะของรหัสเดียวกันที่ซื้อคนละครั้งหมดอายุคนละวัน
   */
  expiresOn?: string | null;
}

export interface BuyDocInput {
  id?: string;
  /** ฉบับของใบตอนเปิดหน้าแก้ไข — บันทึกแล้วไม่ตรง = มีคนบันทึกใบนี้ไประหว่างที่เปิดอยู่ (doc-version.ts) */
  baseVersion?: string;
  kind: BuyKind;
  docDate: string;

  partyId: string | null;
  partyName: string;
  partyTaxId: string;
  partyTel: string;
  partyAddrText: string;

  /** เลขที่ใบกำกับของผู้ขาย */
  refDocNo: string;

  /** ส่วนลดท้ายบิลที่กรอก (บาท เมื่อ mode='baht') · ระบบเก็บบาทที่มีผลจริง */
  discount: number;
  discountMode?: 'baht' | 'pct';
  discountPct?: number;
  vatMode: VatMode;
  whtRate: number;
  creditDays: number;

  /** เฉพาะใบซื้อ — รับของเข้าสต๊อกแล้วหรือยัง */
  goodsReceived: boolean;

  /** เฉพาะค่าใช้จ่าย */
  expenseCat: ExpenseCat | null;
  assetLifeYears: number | null;

  note: string;
  items: BuyItemInput[];
  /** ชำระ ณ วันบันทึก */
  payments: { method: string; amount: number; ref: string }[];
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * บันทึกใบซื้อหรือค่าใช้จ่าย
 *
 * ฝั่งซื้อไม่มีการหักภาษี ณ ที่จ่าย (สคีมาบังคับให้ wht_rate = 0)
 * ส่วนค่าใช้จ่ายอู่เป็นผู้จ่ายเงิน จึงมีหน้าที่หักและนำส่งเอง
 */
/** บีบ % ให้อยู่ 0–100 ทศนิยม 2 ตำแหน่ง — DB มี check เดียวกัน */
function clampPct(v: number | undefined): number {
  const x = Number(v) || 0;
  return Math.round(Math.min(100, Math.max(0, x)) * 100) / 100;
}

/** ใบซื้อ/ค่าใช้จ่ายเปล่า — ใช้ทั้งหน้าออกเอกสารและฟอร์มที่ฝังในหน้ารายการ */
export function blankBuyDoc(kind: BuyKind, noteDefault: string, vendor?: PickedVendor | null): BuyDocInput {
  return {
    kind,
    docDate: today(),
    partyId: vendor?.id ?? null,
    partyName: vendor?.name ?? '',
    partyTaxId: vendor?.taxId ?? '',
    partyTel: vendor?.tel ?? '',
    partyAddrText: vendor?.addrText ?? '',
    refDocNo: '',
    discount: 0,
    vatMode: kind === 'PO' ? 'ex' : 'none',
    whtRate: kind === 'PO' ? 0 : 3,
    creditDays: vendor?.creditDays ?? 0,
    goodsReceived: kind === 'PO',
    expenseCat: kind === 'EX' ? 'other' : null,
    assetLifeYears: null,
    note: noteDefault,
    items: [],
    payments: [],
  };
}

export async function saveBuyDoc(input: BuyDocInput): Promise<{ id: string; docNo: string }> {
  return mutate('expense', async (c, userId) => {
    const shop = await c.query(`select vat_rate from tenants where id = current_tenant_id()`);
    const vatRate = n(shop.rows[0].vat_rate);

    const base = {
      items: input.items.map((i) => ({ qty: i.qty, price: i.unitPrice, discPct: clampPct(i.discPct) })),
      discount: 0,
      vatMode: input.vatMode,
      date: input.docDate,
    };

    base.discount = input.discountMode === 'pct'
      ? r2(base.items.reduce((acc, it) => acc + lineAmount(it), 0) * clampPct(input.discountPct) / 100)
      : r2(Math.max(0, Number(input.discount) || 0));
    const discount = base.discount;
    const t = input.kind === 'PO'
      ? poTotals(base, { vatRate })
      : exTotals({ ...base, cat: input.expenseCat ?? 'other', whtRate: input.whtRate }, { vatRate });

    const dueDate = input.creditDays > 0 ? addDays(input.docDate, input.creditDays) : input.docDate;
    const isAsset = input.kind === 'EX' && input.expenseCat === 'asset';

    let id = input.id;
    let docNo: string;

    if (id) {
      /* ล็อกแถวก่อนตรวจ — อีกเครื่องที่ยกเลิก รับชำระ หรือแก้ใบเดียวกันอยู่ต้องรอกันคนละรอบ
         แล้วตรวจกับสถานะหลังรอ ไม่ใช่สถานะตอนเปิดหน้า (doc-version.ts) */
      ({ docNo } = await lockDocForEditWith(c, id, input.baseVersion));

      await c.query(
        `update documents set doc_date=$2, ref_doc_no=$3, party_id=$4, party_name=$5,
                party_tax_id=$6, party_tel=$7, party_addr_text=$8,
                discount=$9, vat_mode=$10, vat_rate=$11, wht_rate=$12,
                subtotal=$13, net_amount=$14, vat_amount=$15, wht_amount=$16,
                grand_total=$17, payable=$18, credit_days=$19, due_date=$20,
                goods_received=$21, expense_cat=$22, asset_life_yrs=$23, note=$24,
                discount_mode=$25, discount_pct=$26
         where id=$1`,
        [
          id, input.docDate, input.refDocNo, input.partyId, input.partyName,
          digits(input.partyTaxId), input.partyTel, input.partyAddrText,
          money(discount), input.vatMode, vatRate, input.kind === 'PO' ? 0 : input.whtRate,
          money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
          input.creditDays, dueDate,
          input.kind === 'PO' ? input.goodsReceived : false,
          input.kind === 'EX' ? input.expenseCat : null,
          isAsset && input.assetLifeYears && input.assetLifeYears > 0 ? input.assetLifeYears : null,
          input.note,
          input.discountMode ?? 'baht', money(input.discountMode === 'pct' ? clampPct(input.discountPct) : 0),
        ],
      );

      await c.query(`delete from doc_items where doc_id = $1`, [id]);
      await c.query(`delete from payments where doc_id = $1 and at_issue`, [id]);
      await c.query(`delete from stock_moves where doc_id = $1`, [id]);
    } else {
      const seq = await c.query(
        `select next_doc_no(current_tenant_id(), $1, $2) as no`,
        [input.kind, docNoPeriod(input.docDate)],
      );
      docNo = formatDocNo(input.kind, input.docDate, Number(seq.rows[0].no));

      const { rows } = await c.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, ref_doc_no,
                party_id, party_type, party_name, party_tax_id, party_tel, party_addr_text,
                discount, vat_mode, vat_rate, wht_rate,
                subtotal, net_amount, vat_amount, wht_amount, grand_total, payable,
                credit_days, due_date, goods_received, expense_cat, asset_life_yrs,
                note, created_by, discount_mode, discount_pct)
         values (current_tenant_id(),$1,$2,$3,'issued',$4,
                 $5,'company',$6,$7,$8,$9,
                 $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                 $20,$21,$22,$23,$24,$25,$26,$27,$28)
         returning id`,
        [
          input.kind, docNo, input.docDate, input.refDocNo,
          input.partyId, input.partyName, digits(input.partyTaxId),
          input.partyTel, input.partyAddrText,
          money(discount), input.vatMode, vatRate, input.kind === 'PO' ? 0 : input.whtRate,
          money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
          input.creditDays, dueDate,
          input.kind === 'PO' ? input.goodsReceived : false,
          input.kind === 'EX' ? input.expenseCat : null,
          isAsset && input.assetLifeYears && input.assetLifeYears > 0 ? input.assetLifeYears : null,
          input.note, userId,
          input.discountMode ?? 'baht', money(input.discountMode === 'pct' ? clampPct(input.discountPct) : 0),
        ],
      );
      id = rows[0].id;
    }

    for (const [i, it] of input.items.entries()) {
      await c.query(
        `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit,
                                qty, unit_price, is_service, expires_on, disc_pct)
         values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)`,
        [id, i + 1, it.productId, it.code, it.oem, it.name || '(ไม่ระบุชื่อรายการ)',
         it.unit, it.qty, money(it.unitPrice), it.expiresOn || null, clampPct(it.discPct)],
      );
    }

    for (const p of input.payments) {
      if (p.amount <= 0.004) continue;
      await c.query(
        `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref, at_issue, created_by)
         values (current_tenant_id(),$1,$2,$3,$4,$5,true,$6)`,
        [id, input.docDate, money(p.amount), p.method, p.ref, userId],
      );
    }

    /* ---------- รับของเข้าสต๊อก ----------
       เข้าเฉพาะบรรทัดที่ผูกกับทะเบียนสินค้า และเฉพาะเมื่อติ๊กว่ารับของแล้ว
       ทุนล่าสุดอัปเดตตามราคาที่ซื้อจริง เหมือนที่โปรแกรมเดิมทำ */
    if (input.kind === 'PO' && input.goodsReceived) {
      for (const it of input.items) {
        if (!it.productId || it.qty === 0) continue;
        await c.query(
          `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, unit_cost,
                                    cost_amount, reason, doc_id, created_by, expires_on)
           values (current_tenant_id(),$1,$2,$3,$4,$5,'purchase',$6,$7,$8)`,
          [
            it.productId, input.docDate, it.qty, money(it.unitPrice),
            money(it.qty * it.unitPrice), id, userId, it.expiresOn || null,
          ],
        );
        if (it.unitPrice > 0) {
          await c.query(`update products set last_cost = $2 where id = $1`,
            [it.productId, money(it.unitPrice)]);
        }
      }
    }

    return { id: id!, docNo };
  }, { sub: 'purchase' });
}

export async function voidBuyDoc(id: string, reason: string): Promise<void> {
  return mutate('expense', (c, userId) => voidBuyDocWith(c, id, reason, userId), { sub: 'purchase' });
}

/**
 * นำใบซื้อหรือค่าใช้จ่ายที่ยกเลิกไปแล้วกลับมาใช้ — กติกาอยู่ที่ buy-void.ts
 *
 * **มีเฉพาะฝั่งรายจ่าย** เอกสารรายรับที่ยกเลิกแล้วต้องคัดลอกเป็นใบใหม่เท่านั้น
 */
export async function unvoidBuyDoc(id: string): Promise<void> {
  return mutate('expense', (c, userId) => unvoidBuyDocWith(c, id, userId), { sub: 'purchase' });
}

/* =====================================================================
   อ่านข้อมูล
   ===================================================================== */

export interface BuyRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  refDocNo: string;
  partyName: string;
  expenseCat: string | null;
  payable: number;
  paid: number;
  outstanding: number;
  dueDate: string | null;
  goodsReceived: boolean;
  status: string;
}

const PAGE_SIZE = 25;

export async function listBuyDocs(opts: {
  kind?: string;
  cat?: string;
  search?: string;
  page?: number;
  /** ช่วงวันที่ของเอกสาร 'YYYY-MM-DD' */
  from?: string;
  to?: string;
  /** ขอทุกแถวโดยไม่แบ่งหน้า — ใช้ตอนสั่งพิมพ์หรือส่งออก */
  all?: boolean;
  pageSize?: number;
}): Promise<{ rows: BuyRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();

  return query(async (c) => {
    const where: string[] = [`d.purged_at is null`, `d.kind in ('PO','EX')`];
    const params: unknown[] = [];

    if (opts.kind === 'PO' || opts.kind === 'EX') {
      params.push(opts.kind);
      where.push(`d.kind = $${params.length}`);
    }
    if (opts.cat) {
      params.push(opts.cat);
      where.push(`d.expense_cat = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(d.doc_no ilike $${i} or d.party_name ilike $${i} or d.ref_doc_no ilike $${i})`);
    }
    if (opts.from) {
      params.push(opts.from);
      where.push(`d.doc_date >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`d.doc_date <= $${params.length}`);
    }

    const whereSql = where.join(' and ');
    const totalRes = await c.query(
      `select count(*)::int as c from documents d where ${whereSql}`, params,
    );

    const size = opts.pageSize ?? PAGE_SIZE;
    const limitSql = opts.all
      ? ''
      : `limit $${params.length + 1} offset $${params.length + 2}`;
    if (!opts.all) params.push(size, (page - 1) * size);

    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.ref_doc_no, d.party_name,
              d.expense_cat::text as expense_cat, d.payable, d.due_date, d.goods_received,
              d.status::text as status, coalesce(p.paid, 0) as paid
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where ${whereSql}
       /* ใบที่บันทึกล่าสุดอยู่บนสุด (ผู้ใช้กำหนด 17 ก.ย. 2569) — เวลาเท่ากัน (นำเข้า/กู้คืนทั้งชุด) ค่อยเรียงวันที่ → เลขที่ */
       order by d.created_at desc, d.doc_date desc, d.doc_no desc
       ${limitSql}`,
      params,
    );

    return {
      total: totalRes.rows[0].c,
      rows: rows.map((r) => {
        const payable = n(r.payable);
        const paid = n(r.paid);
        return {
          id: r.id, kind: r.kind, docNo: r.doc_no, docDate: r.doc_date,
          refDocNo: r.ref_doc_no, partyName: r.party_name, expenseCat: r.expense_cat,
          payable, paid, outstanding: Math.round((payable - paid) * 100) / 100,
          dueDate: r.due_date, goodsReceived: r.goods_received, status: r.status,
        };
      }),
    };
  });
}

/** โหลดเอกสารมาแก้ */
export async function loadBuyDoc(id: string): Promise<BuyDocInput | null> {
  return query(async (c) => {
    /* อ่านฉบับก่อนเนื้อหา — มีคนบันทึกคั่นกลางแล้วได้แค่เตือนเกิน ไม่ใช่ทับเงียบ (ดู loadDocForEdit ใน sales.ts) */
    const baseVersion = await docVersionWith(c, id);
    if (!baseVersion) return null;
    const { rows } = await c.query(
      `select d.*, d.kind::text as kind_text, d.vat_mode::text as vat_mode_text,
              d.expense_cat::text as cat_text
       from documents d where d.id = $1 and d.kind in ('PO','EX')`,
      [id],
    );
    const d = rows[0];
    if (!d) return null;

    const items = await c.query(
      `select * from doc_items where doc_id = $1 order by line_no`, [id],
    );

    return {
      id: d.id,
      baseVersion,
      kind: d.kind_text as BuyKind,
      docDate: d.doc_date,
      partyId: d.party_id,
      partyName: d.party_name,
      partyTaxId: d.party_tax_id,
      partyTel: d.party_tel,
      partyAddrText: d.party_addr_text,
      refDocNo: d.ref_doc_no,
      discount: n(d.discount),
      discountMode: (d.discount_mode ?? 'baht') as 'baht' | 'pct',
      discountPct: n(d.discount_pct),
      vatMode: d.vat_mode_text as VatMode,
      whtRate: n(d.wht_rate),
      creditDays: Number(d.credit_days),
      goodsReceived: d.goods_received,
      expenseCat: d.cat_text as ExpenseCat | null,
      assetLifeYears: d.asset_life_yrs,
      note: d.note ?? '',
      items: items.rows.map((r) => ({
        productId: r.product_id, code: r.code, oem: r.oem, name: r.name, unit: r.unit,
        qty: n(r.qty), unitPrice: n(r.unit_price), discPct: n(r.disc_pct),
        /* คืนวันหมดอายุกลับเข้าฟอร์ม ไม่งั้นเปิดใบมาแก้แล้วกดบันทึก ค่าจะหายเงียบ ๆ */
        expiresOn: r.expires_on ? String(r.expires_on).slice(0, 10) : null,
      })),
      payments: [],
    };
  });
}

export interface PickedVendor {
  id: string;
  code: string;
  name: string;
  taxId: string;
  tel: string;
  addrText: string;
  creditDays: number;
}

/**
 * ดึงผู้ขายรายเดียว — ใช้ตอนเปิดใบซื้อจากแถวทะเบียนผู้ขาย
 * ต้องได้ผลเหมือนกดเลือกจากช่องค้นหา ไม่ใช่แค่ชื่อ
 */
export async function pickVendorById(id: string): Promise<PickedVendor | null> {
  return query(async (c) => {
    const { rows } = await c.query(`select k.* from contacts k where k.id = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      code: r.code,
      name: r.type === 'company'
        ? r.org_name
        : [r.prefix, r.first_name, r.last_name].filter(Boolean).join(' '),
      taxId: r.tax_id ?? '',
      tel: r.tel,
      addrText: r.addr_text || '',
      creditDays: Number(r.credit_days),
    };
  });
}

export async function searchVendors(q: string, limit = 15): Promise<PickedVendor[]> {
  const term = q.trim();
  return query(async (c) => {
    const { rows } = await c.query(
      `select k.* from contacts k
       where k.kind = 'vendor'
         and ($1 = '' or k.code ilike $2 or k.org_name ilike $2
              or k.first_name ilike $2 or k.last_name ilike $2 or k.tel ilike $2)
       order by k.code limit $3`,
      [term, `%${term}%`, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.type === 'company'
        ? r.org_name
        : [r.prefix, r.first_name, r.last_name].filter(Boolean).join(' '),
      taxId: r.tax_id ?? '',
      tel: r.tel,
      addrText: r.addr_text || '',
      creditDays: Number(r.credit_days),
    }));
  });
}

export interface BuyDocMeta {
  id: string;
  docNo: string;
  kind: string;
  status: string;
  expenseCat: string | null;
  assetLifeYears: number | null;
  goodsReceived: boolean;
  voidedReason: string | null;
}

export async function getBuyDocMeta(id: string): Promise<BuyDocMeta | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, doc_no, kind::text as kind, status::text as status,
              expense_cat::text as expense_cat, asset_life_yrs, goods_received, voided_reason
       from documents where id = $1 and kind in ('PO','EX')`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, docNo: r.doc_no, kind: r.kind, status: r.status,
      expenseCat: r.expense_cat, assetLifeYears: r.asset_life_yrs,
      goodsReceived: r.goods_received, voidedReason: r.voided_reason,
    };
  });
}
