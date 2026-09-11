import 'server-only';
import { query, requireEdit } from './auth';
import { mutate } from './mutate';
import { checkPaymentAmount } from './payment-rules';
import { bulkPay, type BulkPaymentLine, type BulkPaymentResult } from './bulk-pay';
import {
  payablesWith, receivablesWith,
  type PayableRow, type PayableSummary, type ReceivableRow, type ReceivableSummary,
} from './ar-ap';

export type { BulkPaymentLine, BulkPaymentResult };
export type { PayableRow, PayableSummary, ReceivableRow, ReceivableSummary };

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * ลูกหนี้คงค้าง — เอกสารขายที่ยังเก็บเงินไม่ครบ
 *
 * กติกาการคิดอยู่ที่ ar-ap.ts เพื่อให้หน้าแรกใช้ตัวเดียวกันได้ และให้ทดสอบได้
 */
export async function listReceivables(opts: {
  search?: string;
  onlyOverdue?: boolean;
} = {}): Promise<ReceivableSummary> {
  return query((c) => receivablesWith(c, opts));
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
 * บันทึกการชำระเงินของเอกสารหนึ่งใบ — ใช้ได้ทั้งรับจากลูกหนี้และจ่ายให้เจ้าหนี้
 *
 * ปฏิเสธยอดที่เกินคงค้าง เพราะพิมพ์ผิดหนึ่งหลักแล้วยอดทั้งร้านเพี้ยน
 * ถ้ายอดจริงสูงกว่า ให้แก้ยอดในเอกสารก่อน
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
      `select d.payable, d.status::text as status, d.direction::text as direction,
              coalesce(sum(p.amount), 0) as paid
       from documents d left join payments p on p.doc_id = d.id
       where d.id = $1 group by d.id`,
      [input.docId],
    );
    const d = rows[0];
    if (!d) throw new Error('ไม่พบเอกสาร');
    if (d.status === 'void') throw new Error('เอกสารนี้ถูกยกเลิกแล้ว รับชำระไม่ได้');

    /* ลูกหนี้กับเจ้าหนี้เป็นคนละแท็บ สิทธิ์แก้ไขจึงแยกกัน
       ดูจากชนิดเอกสารจริง ไม่ใช่เชื่อว่าหน้าที่เรียกมาส่งมาถูก */
    await requireEdit('finance', d.direction === 'buy' ? 'ap' : 'ar');

    const problem = checkPaymentAmount(n(d.payable), n(d.paid), input.amount);
    if (problem) throw new Error(problem);

    await c.query(
      `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref, at_issue, created_by)
       values (current_tenant_id(),$1,$2,$3,$4,$5,false,$6)`,
      [input.docId, input.paidOn, input.amount.toFixed(2), input.method, input.ref, userId],
    );
  });
}

/** ตัดชำระหลายใบพร้อมกัน — ตรวจสิทธิ์แล้วส่งต่อให้ bulkPay ในทรานแซกชันเดียว */
export async function recordBulkPayments(input: {
  lines: BulkPaymentLine[];
  paidOn: string;
  method: string;
  ref: string;
}): Promise<BulkPaymentResult> {
  return mutate('finance', (c, userId) =>
    bulkPay(c, userId, input, (sub) => requireEdit('finance', sub)));
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
      `select p.at_issue, d.direction::text as direction
       from payments p join documents d on d.id = p.doc_id
       where p.id = $1`, [paymentId],
    );
    if (!rows[0]) throw new Error('ไม่พบรายการรับชำระ');
    await requireEdit('finance', rows[0].direction === 'buy' ? 'ap' : 'ar');
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

/** เจ้าหนี้คงค้าง — ใบซื้อและค่าใช้จ่ายที่ยังจ่ายไม่ครบ (กติกาอยู่ที่ ar-ap.ts) */
export async function listPayables(opts: {
  search?: string;
  onlyOverdue?: boolean;
} = {}): Promise<PayableSummary> {
  return query((c) => payablesWith(c, opts));
}
