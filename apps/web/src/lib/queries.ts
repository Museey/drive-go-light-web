import 'server-only';
import { docMissing, EXPIRY_WARN_DAYS } from '@drivegolight/core';
import { query } from './auth';
import { quoteFollowUpsWith, receiptsOfWith, type DocRef } from './doc-chain';
import { expiringSummaryWith } from './expiry';

/** ยอดเงินจาก Postgres มาเป็นสตริง แปลงเองเพื่อไม่ให้เสียความละเอียดระหว่างทาง */
const money = (v: unknown): number => Number(v ?? 0);

export interface ShopInfo {
  id: string;
  name: string;
  taxId: string | null;
  addrText: string | null;
  tel: string | null;
  tel2: string | null;
  vatRate: number;
  whtRate: number;
  /** บัญชีธนาคารของอู่ — พิมพ์ลงบนใบเสร็จและใบวางบิลให้ลูกค้าโอนเงิน */
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  /** เตือนล่วงหน้ากี่วันก่อนของหมดอายุ ตั้งได้ที่หน้าตั้งค่าร้าน */
  expiryWarnDays: number;
}

export async function getShop(): Promise<ShopInfo> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, name, tax_id, addr_text, tel, tel2, vat_rate, wht_rate,
              bank_name, bank_account_no, bank_account_name, expiry_warn_days
       from tenants where id = current_tenant_id()`,
    );
    const r = rows[0];
    return {
      id: r.id, name: r.name, taxId: r.tax_id, addrText: r.addr_text,
      tel: r.tel, tel2: r.tel2,
      vatRate: money(r.vat_rate), whtRate: money(r.wht_rate),
      bankName: r.bank_name ?? '',
      bankAccountNo: r.bank_account_no ?? '',
      bankAccountName: r.bank_account_name ?? '',
      expiryWarnDays: money(r.expiry_warn_days) || EXPIRY_WARN_DAYS,
    };
  });
}

export interface ReorderItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  qtyMin: number;
  /** ควรสั่งเท่าไรให้เต็มระดับสูงสุด */
  need: number;
  /** เงินที่ต้องใช้สำหรับรายการนี้ตามต้นทุนล่าสุด */
  cost: number;
}

export interface HomeSummary {
  salesThisYear: number;
  /** จำนวนเอกสารขายในช่วงที่เลือก */
  salesDocCount: number;
  /** รับชำระแล้วจากเอกสารขายในช่วงที่เลือก */
  salesPaid: number;
  /** เฉลี่ยต่อใบ — ยอดขายหารจำนวนใบ */
  salesAvg: number;
  /** รายจ่ายในช่วงเดียวกัน แยกซื้อสินค้ากับค่าใช้จ่าย */
  spendTotal: number;
  spendBuy: number;
  spendExpense: number;
  arOutstanding: number;
  apOutstanding: number;
  reorderCount: number;
  /** เงินที่ต้องใช้ถ้าสั่งของที่ถึงจุดสั่งซื้อทั้งหมดให้เต็ม Max */
  reorderCost: number;
  /** รายการที่ควรสั่งก่อน เรียงจากที่ขาดมือหนักที่สุด */
  reorderTop: ReorderItem[];
  productCount: number;
  /** สินค้าที่ไม่เคลื่อนไหวตั้งแต่ 6 เดือน — เงินจมในชั้นวาง */
  deadCount: number;
  deadValue: number;
  /** ล็อตที่ใกล้หมดอายุหรือหมดอายุแล้ว ตามเกณฑ์วันของร้าน — นับเท่ากับหน้ารายการ */
  expiringCount: number;
  /** ในจำนวนนั้น เลยวันหมดอายุไปแล้วกี่ล็อต */
  expiredCount: number;
  expiringValue: number;
  docCounts: { kind: string; count: number }[];
}

export async function getHomeSummary(from?: string, to?: string): Promise<HomeSummary> {
  return query(async (c) => {
    /* ยอดขายจำกัดตามช่วงที่เลือก ส่วนลูกหนี้เจ้าหนี้เป็นยอดคงค้าง ณ ปัจจุบันเสมอ
       ไม่ผูกกับช่วงเวลา เพราะหนี้เก่ายังต้องตามเก็บอยู่ดี */
    const params: unknown[] = [];
    let range = '';
    if (from) { params.push(from); range += ` and doc_date >= $${params.length}`; }
    if (to) { params.push(to); range += ` and doc_date <= $${params.length}`; }

    const sales = await c.query(
      `select coalesce(sum(d.net_amount), 0) as total,
              count(*)::int as n,
              coalesce(sum(coalesce(pay.paid, 0)), 0) as paid
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) pay
              on pay.doc_id = d.id
       where d.status <> 'void'
         and (d.kind in ('IV','IVT')
              or (d.kind = 'RC' and (d.parent_doc_id is null
                  or (select kind from documents p where p.id = d.parent_doc_id) = 'QT')))
         ${range.replace(/doc_date/g, 'd.doc_date')}`,
      params,
    );

    const outstanding = await c.query(
      `select d.direction, coalesce(sum(d.payable - coalesce(p.paid, 0)), 0) as due
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where d.status = 'issued' and d.kind <> 'QT'
         and d.payable - coalesce(p.paid, 0) > 0.004
       group by d.direction`,
    );

    /* เงื่อนไขเดียวกับป้าย min ใน core — คงเหลือเท่ากับจุดสั่งซื้อพอดีก็นับแล้ว
       และข้ามสินค้าที่ยังไม่ได้ตั้งจุดสั่งซื้อ ไม่งั้นของหมดสต๊อกทุกตัวจะขึ้นมาเตือน */
    const reorder = await c.query(
      `select count(*) as c
       from products p join product_stock s on s.product_id = p.id
       where p.active and p.qty_min > 0 and s.qty_on_hand <= p.qty_min`,
    );

    /* รายจ่ายในช่วงเดียวกัน แยกใบซื้อกับค่าใช้จ่ายเหมือนที่หน้าแรกรุ่นเดิมแสดง */
    const spend = await c.query(
      `select kind::text as kind, coalesce(sum(payable), 0) as total
       from documents
       where status <> 'void' and direction = 'buy' ${range}
       group by kind`,
      params,
    );

    /* รายการที่ควรสั่งก่อน — เรียงจากที่ต่ำกว่าจุดสั่งซื้อมากที่สุด ตามรุ่นเดิม
       จำนวนที่ควรสั่งคือเติมให้เต็ม Max อย่างน้อยหนึ่งหน่วย */
    const reorderList = await c.query(
      `select p.id, p.code, p.name, p.unit, p.last_cost, p.qty_min, p.qty_max,
              s.qty_on_hand,
              greatest(1, p.qty_max - s.qty_on_hand) as need
       from products p join product_stock s on s.product_id = p.id
       where p.active and p.qty_min > 0 and s.qty_on_hand <= p.qty_min
       order by s.qty_on_hand - p.qty_min, p.code`,
    );

    const stockStats = await c.query(
      `select count(*)::int as total,
              count(*) filter (where s.last_move_on is null
                                  or s.last_move_on <= current_date - interval '6 months')::int as dead,
              coalesce(sum(s.qty_on_hand * p.last_cost) filter (
                where s.last_move_on is null
                   or s.last_move_on <= current_date - interval '6 months'), 0) as dead_value
       from products p join product_stock s on s.product_id = p.id
       where p.active`,
    );

    const expiring = await expiringSummaryWith(c);

    const counts = await c.query(
      `select kind::text as kind, count(*)::int as count
       from documents where status <> 'void' group by kind order by kind`,
    );

    const byDirection = Object.fromEntries(
      outstanding.rows.map((r) => [r.direction, money(r.due)]),
    );
    const byKind = Object.fromEntries(spend.rows.map((r) => [r.kind, money(r.total)]));
    const spendBuy = byKind['PO'] ?? 0;
    const spendExpense = byKind['EX'] ?? 0;

    const salesTotal = money(sales.rows[0].total);
    const salesDocCount = Number(sales.rows[0].n);

    const reorderTop: ReorderItem[] = reorderList.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      unit: r.unit,
      qtyOnHand: money(r.qty_on_hand),
      qtyMin: money(r.qty_min),
      need: money(r.need),
      cost: Math.round(money(r.need) * money(r.last_cost) * 100) / 100,
    }));

    return {
      salesThisYear: salesTotal,
      salesDocCount,
      salesPaid: money(sales.rows[0].paid),
      salesAvg: salesDocCount ? Math.round((salesTotal / salesDocCount) * 100) / 100 : 0,
      spendTotal: Math.round((spendBuy + spendExpense) * 100) / 100,
      spendBuy,
      spendExpense,
      arOutstanding: byDirection['sell'] ?? 0,
      apOutstanding: byDirection['buy'] ?? 0,
      reorderCount: Number(reorder.rows[0].c),
      reorderCost: Math.round(reorderTop.reduce((s, r) => s + r.cost, 0) * 100) / 100,
      reorderTop: reorderTop.slice(0, 5),
      productCount: stockStats.rows[0].total,
      deadCount: stockStats.rows[0].dead,
      deadValue: money(stockStats.rows[0].dead_value),
      expiringCount: expiring.count,
      expiredCount: expiring.expired,
      expiringValue: expiring.value,
      docCounts: counts.rows.map((r) => ({ kind: r.kind, count: r.count })),
    };
  });
}

export interface IncomeRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  vehiclePlate: string;
  grandTotal: number;
  payable: number;
  paid: number;
  outstanding: number;
  dueDate: string | null;
  /** ข้อมูลที่ยังขาดบนเอกสารใบนี้ — ว่างคือครบ */
  missing: string[];
  /** เอกสารแม่ที่ใบนี้ออกต่อมา — ใช้เป็นคอลัมน์ "อ้างอิง" ของใบเสร็จ */
  parent: DocRef | null;
  /**
   * ใบที่ออกต่อจากใบนี้แล้ว — เติมเฉพาะตอนดูแท็บใบเสนอราคา
   *
   * `null` แปลว่ายังไม่ได้ออก ไม่ใช่ว่าไม่รู้ เพราะคิวรีถามเสมอเมื่ออยู่แท็บนั้น
   */
  invoice: DocRef | null;
  receipt: DocRef | null;
  /** วิธีชำระเงินที่ใช้จริงในใบนี้ ไม่ซ้ำ เรียงตามที่บันทึก */
  payMethods: string[];
  /** ยกเลิกไปแล้วหรือยัง — แถวที่ยกเลิกต้องดูออกทันทีว่าต่างจากแถวปกติ */
  voided: boolean;
  voidedReason: string;
}

export type { DocRef } from './doc-chain';

export interface IncomeListResult {
  rows: IncomeRow[];
  total: number;
}

const PAGE_SIZE = 25;

export async function listIncomeDocs(opts: {
  search?: string;
  kind?: string;
  page?: number;
  /** ช่วงวันที่ของเอกสาร 'YYYY-MM-DD' */
  from?: string;
  to?: string;
  /** ขอทุกแถวโดยไม่แบ่งหน้า — ใช้ตอนสั่งพิมพ์หรือส่งออก */
  all?: boolean;
  pageSize?: number;
  /** รวมใบที่ยกเลิกแล้วในรายการด้วย */
  includeVoid?: boolean;
}): Promise<IncomeListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();
  const kind = opts.kind && ['QT', 'IV', 'IVT', 'RC'].includes(opts.kind) ? opts.kind : null;

  return query(async (c) => {
    // ค้นจากเลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ — สามอย่างที่หน้าเคาน์เตอร์ใช้จริง
    const where: string[] = [`d.kind in ('QT','IV','IVT','RC')`];
    const params: unknown[] = [];

    /*
     * ใบที่ยกเลิกแล้วซ่อนไว้เป็นค่าปริยาย เพราะรายการที่ใช้ทุกวันไม่ควรรก
     *
     * **แต่ค้นด้วยเลขที่เอกสารต้องเจอเสมอ** คนที่พิมพ์เลขที่ใบมาค้นรู้อยู่แล้วว่า
     * จะหาใบไหน การซ่อนคือการตอบว่า "ไม่มีใบนี้" ซึ่งไม่จริง และเป็นเหตุผลเดียว
     * ที่ทำให้ปุ่มคัดลอกใบใหม่ของช่วงที่ 8 เดินไปถึงไม่ได้เลย
     *
     * หน้ารายจ่าย ใบซื้อ ใบวางบิล และใบเคลม แสดงใบที่ยกเลิกอยู่แล้ว
     * ก่อนหน้านี้หน้ารายรับเป็นหน้าเดียวที่ต่างออกไป
     */
    /* ดันตัวค้นหาเข้าเป็นพารามิเตอร์ตัวแรก เพื่อให้อ้างเลขได้ทั้งสองที่ */
    let sIdx = 0;
    if (search) { params.push(`%${search}%`); sIdx = params.length; }

    if (!opts.includeVoid) {
      where.push(sIdx
        ? `(d.status <> 'void' or d.doc_no ilike $${sIdx})`
        : `d.status <> 'void'`);
    }

    if (kind) {
      params.push(kind);
      where.push(`d.kind = $${params.length}`);
    }
    if (sIdx) {
      where.push(`(d.doc_no ilike $${sIdx} or d.party_name ilike $${sIdx}
                   or d.vehicle_plate ilike $${sIdx})`);
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
      `select count(*)::int as c from documents d where ${whereSql}`,
      params,
    );

    const size = opts.pageSize ?? PAGE_SIZE;
    const limitSql = opts.all
      ? ''
      : `limit $${params.length + 1} offset $${params.length + 2}`;
    if (!opts.all) params.push(size, (page - 1) * size);

    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.party_name, d.vehicle_plate,
              d.grand_total, d.payable, d.due_date,
              d.status::text as status, coalesce(d.voided_reason, '') as voided_reason,
              d.party_id, d.party_type::text as party_type, d.party_tax_id,
              d.party_addr_text, d.party_addr,
              coalesce(p.paid, 0) as paid,
              case when pd.id is null then null
                   else json_build_object('id', pd.id, 'docNo', pd.doc_no) end as parent,
              coalesce(pm.methods, '{}') as pay_methods
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       left join documents pd on pd.id = d.parent_doc_id
       left join (select doc_id, array_agg(distinct method) as methods
                    from payments group by doc_id) pm
              on pm.doc_id = d.id
       where ${whereSql}
       order by d.doc_date desc, d.doc_no desc
       ${limitSql}`,
      params,
    );

    /*
     * คอลัมน์งานค้างของใบเสนอราคา — ถามเฉพาะตอนอยู่แท็บนั้น
     * คิวรีเดียวสำหรับทั้งหน้า ไม่ใช่ต่อแถว ใช้ดัชนี (tenant_id, parent_doc_id) ที่มีอยู่แล้ว
     */
    const follow = kind === 'QT'
      ? await quoteFollowUpsWith(c, rows.map((r) => r.id as string))
      : new Map<string, { invoice: DocRef | null; receipt: DocRef | null }>();

    /* ใบส่งมอบในหน้านี้ ใบไหนออกใบเสร็จไปแล้ว — ใช้ตัดสินว่าจะโชว์ปุ่มออกใบเสร็จในแถวไหม
       ถามทุกแท็บที่มีใบส่งมอบปนอยู่ ไม่ใช่เฉพาะแท็บใบส่งมอบ */
    const invoiceIds = rows
      .filter((r) => r.kind === 'IV' || r.kind === 'IVT')
      .map((r) => r.id as string);
    const rcOf = await receiptsOfWith(c, invoiceIds);

    return {
      total: totalRes.rows[0].c,
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        docNo: r.doc_no,
        docDate: r.doc_date,
        partyName: r.party_name,
        vehiclePlate: r.vehicle_plate,
        grandTotal: money(r.grand_total),
        payable: money(r.payable),
        paid: money(r.paid),
        outstanding: Math.round((money(r.payable) - money(r.paid)) * 100) / 100,
        dueDate: r.due_date,
        parent: r.parent ?? null,
        invoice: follow.get(r.id)?.invoice ?? null,
        receipt: follow.get(r.id)?.receipt ?? rcOf.get(r.id) ?? null,
        payMethods: r.pay_methods ?? [],
        voided: r.status === 'void',
        voidedReason: r.voided_reason ?? '',
        missing: docMissing({
          kind: r.kind,
          partyId: r.party_id,
          partyName: r.party_name ?? '',
          partyType: r.party_type,
          partyTaxId: r.party_tax_id ?? '',
          partyAddrText: r.party_addr_text ?? '',
          partyAddr: r.party_addr,
        }),
      })),
    };
  });
}

export interface DocItemRow {
  lineNo: number;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isService: boolean;
}

export interface PaymentRow {
  paidOn: string;
  amount: number;
  method: string;
  ref: string;
  atIssue: boolean;
}

export interface DocDetail {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  status: string;
  partyName: string;
  partyType: 'person' | 'company';
  partyTaxId: string;
  partyTel: string;
  partyEmail: string;
  partyAddrText: string;
  refDocNo: string;
  vehicle: Record<string, string> | null;
  vehiclePlate: string;
  discount: number;
  vatMode: string;
  vatRate: number;
  whtRate: number;
  subtotal: number;
  netAmount: number;
  vatAmount: number;
  whtAmount: number;
  grandTotal: number;
  payable: number;
  dueDate: string | null;
  creditDays: number;
  warrantyText: string | null;
  receivedBy: string;
  note: string;
  /** ข้อมูลที่ยังขาดบนเอกสารใบนี้ — ว่างคือครบ */
  missing: string[];
  /* เฉพาะใบเสนอราคา */
  complaints: string[];
  findings: string[];
  approver: string;
  proposer: string;
  parent: { id: string; kind: string; docNo: string } | null;
  items: DocItemRow[];
  payments: PaymentRow[];
}

export async function getDocDetail(id: string): Promise<DocDetail | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.*, d.kind::text as kind_text, d.status::text as status_text,
              d.vat_mode::text as vat_mode_text,
              pd.id as parent_id, pd.kind::text as parent_kind, pd.doc_no as parent_no
       from documents d
       left join documents pd on pd.id = d.parent_doc_id
       where d.id = $1`,
      [id],
    );
    const d = rows[0];
    if (!d) return null;

    const items = await c.query(
      `select line_no, code, oem, name, unit, qty, unit_price, line_total, is_service
       from doc_items where doc_id = $1 order by line_no`,
      [id],
    );

    const payments = await c.query(
      `select paid_on, amount, method, ref, at_issue
       from payments where doc_id = $1 order by paid_on, created_at`,
      [id],
    );

    return {
      id: d.id,
      kind: d.kind_text,
      docNo: d.doc_no,
      docDate: d.doc_date,
      status: d.status_text,
      partyName: d.party_name,
      partyType: d.party_type,
      partyTaxId: d.party_tax_id,
      partyTel: d.party_tel,
      partyEmail: d.party_email,
      partyAddrText: d.party_addr_text,
      missing: docMissing({
        kind: d.kind_text,
        partyId: d.party_id,
        partyName: d.party_name ?? '',
        partyType: d.party_type,
        partyTaxId: d.party_tax_id ?? '',
        partyAddrText: d.party_addr_text ?? '',
        partyAddr: d.party_addr,
      }),
      refDocNo: d.ref_doc_no,
      vehicle: d.vehicle,
      vehiclePlate: d.vehicle_plate,
      discount: money(d.discount),
      vatMode: d.vat_mode_text,
      vatRate: money(d.vat_rate),
      whtRate: money(d.wht_rate),
      subtotal: money(d.subtotal),
      netAmount: money(d.net_amount),
      vatAmount: money(d.vat_amount),
      whtAmount: money(d.wht_amount),
      grandTotal: money(d.grand_total),
      payable: money(d.payable),
      dueDate: d.due_date,
      creditDays: Number(d.credit_days),
      warrantyText: d.warranty_text,
      receivedBy: d.received_by,
      note: d.note,
      complaints: (d.complaints ?? []).filter((x: string) => x?.trim()),
      findings: (d.findings ?? []).filter((x: string) => x?.trim()),
      approver: d.approver ?? '',
      proposer: d.proposer ?? '',
      parent: d.parent_id ? { id: d.parent_id, kind: d.parent_kind, docNo: d.parent_no } : null,
      items: items.rows.map((r) => ({
        lineNo: Number(r.line_no),
        code: r.code, oem: r.oem, name: r.name, unit: r.unit,
        qty: money(r.qty),
        unitPrice: money(r.unit_price),
        lineTotal: money(r.line_total),
        isService: r.is_service,
      })),
      payments: payments.rows.map((r) => ({
        paidOn: r.paid_on,
        amount: money(r.amount),
        method: r.method,
        ref: r.ref,
        atIssue: r.at_issue,
      })),
    };
  });
}
