import type pg from 'pg';
import { today } from '@drivegolight/core';
import { DEBT_PAID_SQL } from './debt-paid';

/**
 * การ์ด "เอกสารที่ออก" ของหน้าแรก (24 พ.ย. 2569 — ผู้ใช้ขอ ตามแบบรายงานของโปรแกรมบัญชีที่ใช้อยู่)
 *
 * เลือกชนิดเอกสารจาก dropdown แล้วเห็นว่าในช่วงเวลานั้นออกไปกี่ใบ เป็นเงินเท่าไร
 * และตอนนี้แต่ละใบ**ค้างอยู่ที่ขั้นไหน** — ใบเสนอราคารอลูกค้าตอบ ใบแจ้งหนี้รอเก็บเงิน ฯลฯ
 * ค่าเริ่มต้นคือใบเสนอราคา
 *
 * กติกาที่ต้องตรงกับหน้าอื่น
 *   - ยอดเงินใช้ `payable` (ยอดสุทธิที่ต้องรับ/จ่าย) เหมือนหน้าลูกหนี้–เจ้าหนี้
 *   - เงินที่ชำระแล้วใช้ DEBT_PAID_SQL นิยามเดียวกับทั้งระบบ
 *   - แถวย่อยของชนิดเดียวกันไม่ทับกัน (ยกเว้น "เกินกำหนด" ซึ่งเป็นส่วนหนึ่งของ "รอเก็บ/ค้างจ่าย" และบอกไว้ในชื่อ)
 *
 * ไม่มี server-only — รับ client ที่ตั้ง tenant แล้ว ชุดทดสอบเรียกได้ตรง ๆ
 */

type Client = pg.PoolClient | pg.Client;

export const DOC_GROUPS = [
  { key: 'QT', label: 'ใบเสนอราคา', perm: 'income' },
  { key: 'IV', label: 'ใบส่งมอบงาน / ใบแจ้งหนี้ / ใบกำกับภาษี', perm: 'income' },
  { key: 'RC', label: 'ใบเสร็จรับเงิน', perm: 'income' },
  { key: 'BN', label: 'ใบวางบิล', perm: 'income' },
  { key: 'PO', label: 'ใบซื้อสินค้า', perm: 'expense' },
  { key: 'EX', label: 'ค่าใช้จ่าย', perm: 'expense' },
] as const;

export type DocGroupKey = (typeof DOC_GROUPS)[number]['key'];

export const isDocGroup = (v: unknown): v is DocGroupKey =>
  DOC_GROUPS.some((g) => g.key === v);

export interface IssuedRow {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** สีของแถบ — ตรงกับชุดสีการ์ดหน้าแรก */
  tone: 'blue' | 'green' | 'amber' | 'red' | 'teal' | 'slate' | 'violet';
  /** แถวนี้เป็นส่วนหนึ่งของแถวก่อนหน้า (เช่น เกินกำหนด ⊂ รอเก็บเงิน) — ไม่เอาไปรวมยอด */
  partOf?: boolean;
}

export interface IssuedReport {
  group: DocGroupKey;
  label: string;
  /** ทุกใบที่ออกในช่วง ไม่รวมใบที่ยกเลิก */
  total: { count: number; amount: number };
  rows: IssuedRow[];
  /** หน้ารายการของชนิดนี้ — null = ไม่มีหน้าที่กรองตรงกัน */
  href: string | null;
}

const n = (v: unknown): number => Number(v ?? 0);
const money = (v: unknown): number => Math.round(n(v) * 100) / 100;

export async function docsIssuedWith(
  c: Client, group: DocGroupKey, from?: string, to?: string,
  /** หน้ารายการเอกสารแยกแท็บละเอียดกว่าการ์ดหน้าแรก — ระบุชนิดเอง (เช่นเฉพาะ IVT) และตัวกรอง VAT ของแท็บใบเสร็จ */
  narrow: { kinds?: string[]; vat?: 'yes' | 'no' } = {},
): Promise<IssuedReport> {
  const label = DOC_GROUPS.find((g) => g.key === group)!.label;
  const params: unknown[] = [];
  const range = (col: string): string => {
    let s = '';
    if (from) { params.push(from); s += ` and ${col} >= $${params.length}`; }
    if (to) { params.push(to); s += ` and ${col} <= $${params.length}`; }
    return s;
  };
  const cell = (r: Record<string, unknown>, k: string) => ({ count: n(r[`${k}_c`]), amount: money(r[`${k}_a`]) });
  /* นับกับรวมเงินของเงื่อนไขหนึ่งในคิวรีเดียว */
  const agg = (k: string, cond: string, amt = 'd.payable') =>
    `count(*) filter (where ${cond})::int as ${k}_c, coalesce(sum(${amt}) filter (where ${cond}), 0) as ${k}_a`;

  if (group === 'BN') {
    const r = (await c.query(
      `select ${agg('all', `b.status <> 'void'`, 'b.total_snapshot')},
              ${agg('void', `b.status = 'void'`, 'b.total_snapshot')}
         from billnotes b
        where b.purged_at is null${range('b.bill_date')}`, params)).rows[0];
    return {
      group, label, total: cell(r, 'all'), href: '/income/billing?hist=1',
      rows: [
        { key: 'open', label: 'ใบวางบิลที่ใช้อยู่', tone: 'blue', ...cell(r, 'all') },
        { key: 'void', label: 'ยกเลิก', tone: 'slate', ...cell(r, 'void') },
      ],
    };
  }

  const kinds = narrow.kinds?.length ? narrow.kinds : group === 'IV' ? ['IV', 'IVT'] : [group];
  const vatSql = narrow.vat === 'yes' ? ` and d.vat_mode <> 'none'` : narrow.vat === 'no' ? ` and d.vat_mode = 'none'` : '';
  const live = `d.status <> 'void'`;
  const owe = `(d.payable - coalesce(p.paid, 0))`;
  params.push(kinds);
  const kindAt = params.length;

  const parts: string[] = [agg('all', live), agg('void', `d.status = 'void'`)];
  if (group === 'QT') {
    parts.push(agg('wait', `d.status = 'issued'`), agg('next', `d.status = 'billed'`));
  } else {
    /* ใส่พารามิเตอร์เฉพาะตอนคิวรีใช้จริง — Postgres ปฏิเสธพารามิเตอร์ที่ส่งเกินจำนวนที่อ้างถึง */
    params.push(today());
    const todayAt = params.length;
    parts.push(
      agg('paid', `${live} and ${owe} <= 0.004`),
      agg('open', `${live} and ${owe} > 0.004`, owe),
      agg('late', `${live} and ${owe} > 0.004 and d.due_date is not null and d.due_date < $${todayAt}::date`, owe),
    );
    if (group === 'RC') {
      parts.push(
        agg('walkin', `${live} and d.parent_doc_id is null`),
        agg('job', `${live} and d.parent_doc_id is not null`),
      );
    }
  }

  const r = (await c.query(
    `select ${parts.join(',\n            ')}
       from documents d
       left join ${DEBT_PAID_SQL} p on p.doc_id = d.id
      where d.kind::text = any($${kindAt}::text[]) and d.purged_at is null${vatSql}${range('d.doc_date')}`,
    params)).rows[0];

  const total = cell(r, 'all');
  const voided: IssuedRow = { key: 'void', label: 'ยกเลิก', tone: 'slate', ...cell(r, 'void') };

  if (group === 'QT') {
    return {
      group, label, total, href: '/income?kind=QT&hist=1',
      rows: [
        { key: 'wait', label: 'รอลูกค้าตอบรับ (ยังไม่ออกใบต่อ)', tone: 'amber', ...cell(r, 'wait') },
        { key: 'next', label: 'ลูกค้าตกลงแล้ว (ออกใบต่อแล้ว)', tone: 'green', ...cell(r, 'next') },
        voided,
      ],
    };
  }

  const sell = group === 'IV' || group === 'RC';
  const rows: IssuedRow[] = [];
  if (group === 'RC') {
    rows.push(
      { key: 'walkin', label: 'ขายหน้าร้าน (ไม่มีใบต้นทาง)', tone: 'teal', ...cell(r, 'walkin') },
      { key: 'job', label: 'งานซ่อม/งานที่มีใบต้นทาง', tone: 'violet', ...cell(r, 'job') },
    );
  }
  rows.push(
    { key: 'paid', label: sell ? 'รับชำระครบแล้ว' : 'จ่ายครบแล้ว', tone: 'green', ...cell(r, 'paid'), partOf: group === 'RC' },
    { key: 'open', label: sell ? 'รอรับชำระ (ยอดค้าง)' : 'ค้างจ่าย (ยอดค้าง)', tone: 'amber', ...cell(r, 'open'), partOf: group === 'RC' },
    { key: 'late', label: 'ในนี้เกินกำหนดแล้ว', tone: 'red', ...cell(r, 'late'), partOf: true },
    voided,
  );

  return {
    group, label, total, rows,
    href: sell ? `/income?kind=${group === 'IV' ? 'IV' : 'RC'}&hist=1` : `/expense?kind=${group}&hist=1`,
  };
}
