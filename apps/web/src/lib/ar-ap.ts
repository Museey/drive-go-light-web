import type pg from 'pg';

/**
 * ลูกหนี้และเจ้าหนี้คงค้าง — ตัวคิดตัวจริง
 *
 * แยกออกมาจาก receivables.ts เพราะไฟล์นั้นมี `server-only` ชุดทดสอบจึงนำเข้าไม่ได้
 * และเพราะ **หน้าแรกต้องได้ตัวเลขเกินกำหนดชุดเดียวกับหน้า 06.2 / 06.3 เป๊ะ ๆ**
 * ถ้าปล่อยให้หน้าแรกเขียนเงื่อนไข "เกินกำหนด" ขึ้นเองอีกชุด วันหนึ่งสองหน้าจะตอบไม่ตรงกัน
 * แล้วไม่มีใครรู้ว่าอันไหนถูก — เงื่อนไขแบบนี้ต้องมีที่เดียวเสมอ
 *
 * ตรงนี้รับ client เข้ามาเอง ไม่แตะ session หรือคุกกี้ เหมือน contact-totals.ts
 */

type Client = pg.PoolClient | pg.Client;

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface ReceivableRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  vehiclePlate: string;
  payable: number;
  paid: number;
  outstanding: number;
  /** จำนวนวันที่เกินกำหนด ค่าลบคือยังไม่ถึงกำหนด */
  daysOverdue: number;
}

export interface ReceivableSummary {
  rows: ReceivableRow[];
  total: number;
  overdueTotal: number;
  overdueCount: number;
  count: number;
}

/**
 * ลูกหนี้คงค้าง — เอกสารขายที่ยังเก็บเงินไม่ครบ
 *
 * นับเฉพาะใบส่งมอบและใบเสร็จ ใบเสนอราคายังไม่ใช่หนี้
 * และใบเสร็จที่ออกต่อจากใบส่งมอบไม่นับซ้ำ เพราะหนี้ก้อนเดียวกัน
 */
export async function receivablesWith(c: Client, opts: {
  search?: string;
  onlyOverdue?: boolean;
} = {}): Promise<ReceivableSummary> {
  const search = (opts.search ?? '').trim();

  {
    const params: unknown[] = [];
    const where: string[] = [
      `d.status = 'issued'`,
      `d.direction = 'sell'`,
      `d.kind <> 'QT'`,
      /* ใบส่งมอบที่มีใบเสร็จออกตามมาแล้ว ให้ถือว่าหนี้ย้ายไปอยู่ที่ใบเสร็จ */
      `not exists (select 1 from documents x
                   where x.parent_doc_id = d.id and x.kind = 'RC' and x.status <> 'void')`,
    ];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(d.doc_no ilike $${i} or d.party_name ilike $${i} or d.vehicle_plate ilike $${i})`);
    }

    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.due_date,
              d.party_id, d.party_name, d.vehicle_plate, d.payable,
              coalesce(p.paid, 0) as paid,
              current_date - d.due_date as days_overdue
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where ${where.join(' and ')}
         and d.payable - coalesce(p.paid, 0) > 0.004
       order by d.due_date nulls last, d.doc_no`,
      params,
    );

    const all: ReceivableRow[] = rows.map((r) => {
      const payable = n(r.payable);
      const paid = n(r.paid);
      return {
        id: r.id, kind: r.kind, docNo: r.doc_no, docDate: r.doc_date, dueDate: r.due_date,
        partyId: r.party_id, partyName: r.party_name, vehiclePlate: r.vehicle_plate,
        payable, paid,
        outstanding: round2(payable - paid),
        daysOverdue: r.days_overdue === null ? -9999 : Number(r.days_overdue),
      };
    });

    const list = opts.onlyOverdue ? all.filter((r) => r.daysOverdue > 0) : all;
    const overdue = all.filter((r) => r.daysOverdue > 0);

    return {
      rows: list,
      count: all.length,
      total: round2(all.reduce((s, r) => s + r.outstanding, 0)),
      overdueTotal: round2(overdue.reduce((s, r) => s + r.outstanding, 0)),
      overdueCount: overdue.length,
    };
  }
}

/* =====================================================================
   เจ้าหนี้ — ใช้โครงเดียวกับลูกหนี้ ต่างแค่ทิศทางของเอกสาร
   ===================================================================== */

export interface PayableRow extends Omit<ReceivableRow, 'vehiclePlate'> {
  refDocNo: string;
  expenseCat: string | null;
}

export interface PayableSummary {
  rows: PayableRow[];
  total: number;
  overdueTotal: number;
  overdueCount: number;
  count: number;
}

/** เจ้าหนี้คงค้าง — ใบซื้อและค่าใช้จ่ายที่ยังจ่ายไม่ครบ */
export async function payablesWith(c: Client, opts: {
  search?: string;
  onlyOverdue?: boolean;
} = {}): Promise<PayableSummary> {
  const search = (opts.search ?? '').trim();

  {
    const params: unknown[] = [];
    const where = [`d.status = 'issued'`, `d.direction = 'buy'`];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(d.doc_no ilike $${i} or d.party_name ilike $${i} or d.ref_doc_no ilike $${i})`);
    }

    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.due_date, d.ref_doc_no,
              d.party_id, d.party_name, d.expense_cat::text as expense_cat, d.payable,
              coalesce(p.paid, 0) as paid,
              current_date - d.due_date as days_overdue
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where ${where.join(' and ')}
         and d.payable - coalesce(p.paid, 0) > 0.004
       order by d.due_date nulls last, d.doc_no`,
      params,
    );

    const all: PayableRow[] = rows.map((r) => {
      const payable = n(r.payable);
      const paid = n(r.paid);
      return {
        id: r.id, kind: r.kind, docNo: r.doc_no, docDate: r.doc_date, dueDate: r.due_date,
        refDocNo: r.ref_doc_no, partyId: r.party_id, partyName: r.party_name,
        expenseCat: r.expense_cat,
        payable, paid,
        outstanding: round2(payable - paid),
        daysOverdue: r.days_overdue === null ? -9999 : Number(r.days_overdue),
      };
    });

    const list = opts.onlyOverdue ? all.filter((r) => r.daysOverdue > 0) : all;
    const overdue = all.filter((r) => r.daysOverdue > 0);

    return {
      rows: list,
      count: all.length,
      total: round2(all.reduce((s, r) => s + r.outstanding, 0)),
      overdueTotal: round2(overdue.reduce((s, r) => s + r.outstanding, 0)),
      overdueCount: overdue.length,
    };
  }
}
