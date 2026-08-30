import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { checkPaymentAmount } from './payment-rules';

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
export async function listReceivables(opts: {
  search?: string;
  onlyOverdue?: boolean;
} = {}): Promise<ReceivableSummary> {
  const search = (opts.search ?? '').trim();

  return query(async (c) => {
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
  });
}

export interface DocBalance {
  id: string;
  docNo: string;
  kind: string;
  partyName: string;
  payable: number;
  paid: number;
  outstanding: number;
  status: string;
}

export async function getDocBalance(id: string): Promise<DocBalance | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.id, d.doc_no, d.kind::text as kind, d.party_name, d.payable,
              d.status::text as status,
              coalesce(sum(p.amount), 0) as paid
       from documents d
       left join payments p on p.doc_id = d.id
       where d.id = $1
       group by d.id`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const payable = n(r.payable);
    const paid = n(r.paid);
    return {
      id: r.id, docNo: r.doc_no, kind: r.kind, partyName: r.party_name,
      payable, paid, outstanding: round2(payable - paid), status: r.status,
    };
  });
}

/**
 * บันทึกการรับชำระจากลูกหนี้
 *
 * ปฏิเสธยอดที่เกินคงค้าง เพราะพิมพ์ผิดหนึ่งหลักแล้วยอดลูกหนี้ทั้งร้านเพี้ยน
 * ถ้าจะรับเกินจริง ให้แก้ยอดในเอกสารก่อน
 */
export async function recordPayment(input: {
  docId: string;
  paidOn: string;
  amount: number;
  method: string;
  ref: string;
}): Promise<void> {
  return mutate('finance', async (c, userId) => {
    const { rows } = await c.query(
      `select d.payable, d.status::text as status, coalesce(sum(p.amount), 0) as paid
       from documents d left join payments p on p.doc_id = d.id
       where d.id = $1 group by d.id`,
      [input.docId],
    );
    const d = rows[0];
    if (!d) throw new Error('ไม่พบเอกสาร');
    if (d.status === 'void') throw new Error('เอกสารนี้ถูกยกเลิกแล้ว รับชำระไม่ได้');

    const problem = checkPaymentAmount(n(d.payable), n(d.paid), input.amount);
    if (problem) throw new Error(problem);

    await c.query(
      `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref, at_issue, created_by)
       values (current_tenant_id(),$1,$2,$3,$4,$5,false,$6)`,
      [input.docId, input.paidOn, input.amount.toFixed(2), input.method, input.ref, userId],
    );
  });
}

/**
 * ลบรายการรับชำระที่บันทึกผิด
 *
 * ลบได้เฉพาะที่ตัดชำระภายหลัง — ยอดที่รับ ณ วันออกเอกสารเป็นส่วนหนึ่งของตัวเอกสาร
 * ต้องแก้ที่เอกสารแทน ไม่งั้นสิ่งที่พิมพ์บนใบเสร็จกับที่บันทึกไว้จะไม่ตรงกัน
 */
export async function deletePayment(paymentId: string): Promise<void> {
  return mutate('finance', async (c) => {
    const { rows } = await c.query(
      `select at_issue from payments where id = $1`, [paymentId],
    );
    if (!rows[0]) throw new Error('ไม่พบรายการรับชำระ');
    if (rows[0].at_issue) {
      throw new Error(
        'รายการนี้เป็นยอดที่รับ ณ วันออกเอกสาร ซึ่งพิมพ์อยู่บนใบเสร็จ — แก้ที่ตัวเอกสารแทน',
      );
    }
    await c.query(`delete from payments where id = $1`, [paymentId]);
  });
}

export interface PaymentHistoryRow {
  id: string;
  paidOn: string;
  amount: number;
  method: string;
  ref: string;
  atIssue: boolean;
  byWho: string | null;
}

export async function listPayments(docId: string): Promise<PaymentHistoryRow[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select p.id, p.paid_on, p.amount, p.method, p.ref, p.at_issue, u.name as by_who
       from payments p left join users u on u.id = p.created_by
       where p.doc_id = $1
       order by p.paid_on, p.created_at`,
      [docId],
    );
    return rows.map((r) => ({
      id: r.id, paidOn: r.paid_on, amount: n(r.amount),
      method: r.method, ref: r.ref, atIssue: r.at_issue, byWho: r.by_who,
    }));
  });
}
