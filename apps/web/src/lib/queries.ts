import 'server-only';
import { query } from './auth';

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
}

export async function getShop(): Promise<ShopInfo> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, name, tax_id, addr_text, tel, tel2, vat_rate, wht_rate
       from tenants where id = current_tenant_id()`,
    );
    const r = rows[0];
    return {
      id: r.id, name: r.name, taxId: r.tax_id, addrText: r.addr_text,
      tel: r.tel, tel2: r.tel2,
      vatRate: money(r.vat_rate), whtRate: money(r.wht_rate),
    };
  });
}

export interface HomeSummary {
  salesThisYear: number;
  arOutstanding: number;
  apOutstanding: number;
  reorderCount: number;
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
      `select coalesce(sum(net_amount), 0) as total
       from documents
       where status <> 'void'
         and (kind in ('IV','IVT')
              or (kind = 'RC' and (parent_doc_id is null
                  or (select kind from documents p where p.id = documents.parent_doc_id) = 'QT')))
         ${range}`,
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

    const reorder = await c.query(
      `select count(*) as c
       from products p join product_stock s on s.product_id = p.id
       where p.active and s.qty_on_hand < p.qty_min`,
    );

    const counts = await c.query(
      `select kind::text as kind, count(*)::int as count
       from documents where status <> 'void' group by kind order by kind`,
    );

    const byDirection = Object.fromEntries(
      outstanding.rows.map((r) => [r.direction, money(r.due)]),
    );

    return {
      salesThisYear: money(sales.rows[0].total),
      arOutstanding: byDirection['sell'] ?? 0,
      apOutstanding: byDirection['buy'] ?? 0,
      reorderCount: Number(reorder.rows[0].c),
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
}

export interface IncomeListResult {
  rows: IncomeRow[];
  total: number;
}

const PAGE_SIZE = 25;

export async function listIncomeDocs(opts: {
  search?: string;
  kind?: string;
  page?: number;
}): Promise<IncomeListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();
  const kind = opts.kind && ['QT', 'IV', 'IVT', 'RC'].includes(opts.kind) ? opts.kind : null;

  return query(async (c) => {
    // ค้นจากเลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ — สามอย่างที่หน้าเคาน์เตอร์ใช้จริง
    const where: string[] = [`d.kind in ('QT','IV','IVT','RC')`, `d.status <> 'void'`];
    const params: unknown[] = [];

    if (kind) {
      params.push(kind);
      where.push(`d.kind = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(d.doc_no ilike $${i} or d.party_name ilike $${i} or d.vehicle_plate ilike $${i})`);
    }

    const whereSql = where.join(' and ');

    const totalRes = await c.query(
      `select count(*)::int as c from documents d where ${whereSql}`,
      params,
    );

    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.party_name, d.vehicle_plate,
              d.grand_total, d.payable, d.due_date,
              coalesce(p.paid, 0) as paid
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where ${whereSql}
       order by d.doc_date desc, d.doc_no desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );

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
