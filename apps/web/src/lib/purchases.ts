import 'server-only';
import { exTotals, poTotals, type VatMode } from '@drivegolight/core';
import { query } from './auth';
import { mutate } from './mutate';

const n = (v: unknown): number => Number(v ?? 0);
const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
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
}

export interface BuyDocInput {
  id?: string;
  kind: BuyKind;
  docDate: string;

  partyId: string | null;
  partyName: string;
  partyTaxId: string;
  partyTel: string;
  partyAddrText: string;

  /** เลขที่ใบกำกับของผู้ขาย */
  refDocNo: string;

  discount: number;
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
export async function saveBuyDoc(input: BuyDocInput): Promise<{ id: string; docNo: string }> {
  return mutate('expense', async (c, userId) => {
    const shop = await c.query(`select vat_rate from tenants where id = current_tenant_id()`);
    const vatRate = n(shop.rows[0].vat_rate);

    const base = {
      items: input.items.map((i) => ({ qty: i.qty, price: i.unitPrice })),
      discount: input.discount,
      vatMode: input.vatMode,
      date: input.docDate,
    };

    const t = input.kind === 'PO'
      ? poTotals(base, { vatRate })
      : exTotals({ ...base, cat: input.expenseCat ?? 'other', whtRate: input.whtRate }, { vatRate });

    const dueDate = input.creditDays > 0 ? addDays(input.docDate, input.creditDays) : input.docDate;
    const isAsset = input.kind === 'EX' && input.expenseCat === 'asset';

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
        `update documents set doc_date=$2, ref_doc_no=$3, party_id=$4, party_name=$5,
                party_tax_id=$6, party_tel=$7, party_addr_text=$8,
                discount=$9, vat_mode=$10, vat_rate=$11, wht_rate=$12,
                subtotal=$13, net_amount=$14, vat_amount=$15, wht_amount=$16,
                grand_total=$17, payable=$18, credit_days=$19, due_date=$20,
                goods_received=$21, expense_cat=$22, asset_life_yrs=$23, note=$24
         where id=$1`,
        [
          id, input.docDate, input.refDocNo, input.partyId, input.partyName,
          digits(input.partyTaxId), input.partyTel, input.partyAddrText,
          money(input.discount), input.vatMode, vatRate, input.kind === 'PO' ? 0 : input.whtRate,
          money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
          input.creditDays, dueDate,
          input.kind === 'PO' ? input.goodsReceived : false,
          input.kind === 'EX' ? input.expenseCat : null,
          isAsset && input.assetLifeYears && input.assetLifeYears > 0 ? input.assetLifeYears : null,
          input.note,
        ],
      );

      await c.query(`delete from doc_items where doc_id = $1`, [id]);
      await c.query(`delete from payments where doc_id = $1 and at_issue`, [id]);
      await c.query(`delete from stock_moves where doc_id = $1`, [id]);
    } else {
      const seq = await c.query(
        `select next_doc_no(current_tenant_id(), $1, '') as no`, [input.kind],
      );
      const ym = input.docDate.slice(0, 4) + input.docDate.slice(5, 7);
      docNo = `${input.kind}-${ym}-${String(seq.rows[0].no).padStart(3, '0')}`;

      const { rows } = await c.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, ref_doc_no,
                party_id, party_type, party_name, party_tax_id, party_tel, party_addr_text,
                discount, vat_mode, vat_rate, wht_rate,
                subtotal, net_amount, vat_amount, wht_amount, grand_total, payable,
                credit_days, due_date, goods_received, expense_cat, asset_life_yrs,
                note, created_by)
         values (current_tenant_id(),$1,$2,$3,'issued',$4,
                 $5,'company',$6,$7,$8,$9,
                 $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                 $20,$21,$22,$23,$24,$25,$26)
         returning id`,
        [
          input.kind, docNo, input.docDate, input.refDocNo,
          input.partyId, input.partyName, digits(input.partyTaxId),
          input.partyTel, input.partyAddrText,
          money(input.discount), input.vatMode, vatRate, input.kind === 'PO' ? 0 : input.whtRate,
          money(t.sub), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
          input.creditDays, dueDate,
          input.kind === 'PO' ? input.goodsReceived : false,
          input.kind === 'EX' ? input.expenseCat : null,
          isAsset && input.assetLifeYears && input.assetLifeYears > 0 ? input.assetLifeYears : null,
          input.note, userId,
        ],
      );
      id = rows[0].id;
    }

    for (const [i, it] of input.items.entries()) {
      await c.query(
        `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit,
                                qty, unit_price, is_service)
         values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,false)`,
        [id, i + 1, it.productId, it.code, it.oem, it.name || '(ไม่ระบุชื่อรายการ)',
         it.unit, it.qty, money(it.unitPrice)],
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
                                    reason, doc_id, created_by)
           values (current_tenant_id(),$1,$2,$3,$4,'purchase',$5,$6)`,
          [it.productId, input.docDate, it.qty, money(it.unitPrice), id, userId],
        );
        if (it.unitPrice > 0) {
          await c.query(`update products set last_cost = $2 where id = $1`,
            [it.productId, money(it.unitPrice)]);
        }
      }
    }

    return { id: id!, docNo };
  });
}

export async function voidBuyDoc(id: string, reason: string): Promise<void> {
  return mutate('expense', async (c, userId) => {
    const moves = await c.query(
      `select product_id, qty_delta from stock_moves where doc_id = $1 and reason = 'purchase'`,
      [id],
    );
    for (const m of moves.rows) {
      await c.query(
        `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, reason,
                                  doc_id, note, created_by)
         values (current_tenant_id(),$1,current_date,$2,'return',$3,'คืนสต๊อกจากการยกเลิกใบซื้อ',$4)`,
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
}): Promise<{ rows: BuyRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();

  return query(async (c) => {
    const where: string[] = [`d.kind in ('PO','EX')`];
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

    const limitSql = opts.all
      ? ''
      : `limit $${params.length + 1} offset $${params.length + 2}`;
    if (!opts.all) params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);

    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.ref_doc_no, d.party_name,
              d.expense_cat::text as expense_cat, d.payable, d.due_date, d.goods_received,
              d.status::text as status, coalesce(p.paid, 0) as paid
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where ${whereSql}
       order by d.doc_date desc, d.doc_no desc
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
      kind: d.kind_text as BuyKind,
      docDate: d.doc_date,
      partyId: d.party_id,
      partyName: d.party_name,
      partyTaxId: d.party_tax_id,
      partyTel: d.party_tel,
      partyAddrText: d.party_addr_text,
      refDocNo: d.ref_doc_no,
      discount: n(d.discount),
      vatMode: d.vat_mode_text as VatMode,
      whtRate: n(d.wht_rate),
      creditDays: Number(d.credit_days),
      goodsReceived: d.goods_received,
      expenseCat: d.cat_text as ExpenseCat | null,
      assetLifeYears: d.asset_life_yrs,
      note: d.note ?? '',
      items: items.rows.map((r) => ({
        productId: r.product_id, code: r.code, oem: r.oem, name: r.name, unit: r.unit,
        qty: n(r.qty), unitPrice: n(r.unit_price),
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
