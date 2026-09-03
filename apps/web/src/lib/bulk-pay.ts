/**
 * ตัดชำระหลายใบพร้อมกัน — ตรรกะล้วนที่รับ client เข้ามา
 *
 * แยกจาก receivables.ts เพราะไฟล์นั้นกัน server-only ไว้ ชุดทดสอบจึง import ไม่ได้
 * ส่วนที่ต้องพิสูจน์คือกฎการปรับยอดกับความเป็นทรานแซกชันเดียว ซึ่งอยู่ในนี้ทั้งหมด
 */
import type pg from 'pg';
import { EPS } from './payment-rules';

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface BulkPaymentLine {
  docId: string;
  amount: number;
}

export interface BulkPaymentResult {
  /** จำนวนใบที่บันทึกจริง */
  count: number;
  /** ยอดรวมที่บันทึกจริง */
  total: number;
  /** ใบที่กรอกเกินยอดค้างแล้วถูกปรับลงให้พอดี — บอกผู้ใช้ว่าเกิดอะไรขึ้น */
  trimmed: { docNo: string; asked: number; used: number }[];
}

/**
 * ตัดชำระหลายใบพร้อมกัน — ลูกค้าจ่ายทีเดียวตามใบวางบิล
 *
 * วางบิลไปแปดใบแล้วลูกค้าจ่ายเช็คใบเดียว ถ้าตัดได้ทีละใบก็ต้องเปิดฟอร์มแปดรอบ
 * กรอกวันที่กับเลขเช็คเดิมซ้ำแปดครั้ง ใบวางบิลจึงเสียประโยชน์ไปครึ่งหนึ่ง
 *
 * ต่างจาก recordPayment ตรงที่ยอดเกินถูก**ปรับลงให้พอดี**แทนที่จะฟ้องกลับ
 * เพราะยอดตั้งต้นมาจากยอดค้าง ณ ตอนเปิดหน้า — ระหว่างที่ผู้ใช้กรอก
 * อาจมีคนอื่นตัดชำระใบเดียวกันไปบางส่วนแล้ว การล้มทั้งชุดเพราะเศษสตางค์ไม่ช่วยใคร
 * แต่คืน trimmed กลับไปเสมอเพื่อไม่ให้เงียบหาย
 *
 * ทั้งชุดอยู่ในทรานแซกชันเดียว — ใบใดใบหนึ่งพัง ทุกใบต้องไม่ถูกบันทึก
 * ไม่งั้นผู้ใช้จะไม่รู้ว่าตัดไปถึงใบไหนแล้ว แล้วกดซ้ำจนกลายเป็นรับเงินสองรอบ
 */
export async function bulkPay(
  c: pg.PoolClient | pg.Client,
  userId: string | null,
  input: {
    lines: BulkPaymentLine[];
    paidOn: string;
    method: string;
    ref: string;
  },
  /**
   * ตรวจสิทธิ์แก้ไขตามชนิดเอกสารจริงของแต่ละใบ — ลูกหนี้กับเจ้าหนี้เป็นคนละแท็บ
   * ส่งเข้ามาแทนที่จะเรียกเองเพราะไฟล์นี้ไม่ผูกกับ session (ชุดทดสอบเรียกได้ตรง ๆ)
   */
  checkEdit?: (sub: 'ar' | 'ap') => Promise<unknown>,
): Promise<BulkPaymentResult> {
  /* ใบที่กรอกศูนย์ (หรือติดลบ) แปลว่าไม่ตัดใบนั้น ไม่ใช่ข้อผิดพลาด */
  const lines = input.lines.filter((l) => l.amount > EPS);
  if (lines.length === 0) throw new Error('ยังไม่ได้เลือกใบที่จะตัดชำระ');

  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.docId)) throw new Error('มีเอกสารซ้ำกันในรายการที่ส่งมา');
    seen.add(l.docId);
  }

  const { rows } = await c.query(
    `select d.id, d.doc_no, d.payable, d.status::text as status,
            d.direction::text as direction,
            coalesce(sum(p.amount), 0) as paid
     from documents d
     left join payments p on p.doc_id = d.id
     where d.id = any($1::uuid[])
     group by d.id`,
    [lines.map((l) => l.docId)],
  );
  const byId = new Map(rows.map((r) => [r.id as string, r]));

  const trimmed: BulkPaymentResult['trimmed'] = [];
  const toWrite: { docId: string; docNo: string; amount: number }[] = [];

  for (const l of lines) {
    const d = byId.get(l.docId);
    if (!d) throw new Error('ไม่พบเอกสารบางใบในรายการ — เปิดหน้าใหม่แล้วลองอีกครั้ง');
    if (d.status === 'void') throw new Error(`${d.doc_no} ถูกยกเลิกแล้ว รับชำระไม่ได้`);
    if (checkEdit) await checkEdit(d.direction === 'buy' ? 'ap' : 'ar');

    const outstanding = round2(n(d.payable) - n(d.paid));
    const amount = round2(Math.min(l.amount, Math.max(outstanding, 0)));

    if (amount - l.amount < -EPS) {
      trimmed.push({ docNo: d.doc_no, asked: round2(l.amount), used: amount });
    }
    if (amount <= EPS) continue;
    toWrite.push({ docId: l.docId, docNo: d.doc_no, amount });
  }

  if (toWrite.length === 0) {
    throw new Error('ทุกใบที่เลือกถูกตัดชำระครบไปแล้ว — เปิดหน้าใหม่เพื่อดูยอดล่าสุด');
  }

  for (const w of toWrite) {
    await c.query(
      `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref, at_issue, created_by)
       values (current_tenant_id(),$1,$2,$3,$4,$5,false,$6)`,
      [w.docId, input.paidOn, w.amount.toFixed(2), input.method, input.ref, userId],
    );
  }

  return {
    count: toWrite.length,
    total: round2(toWrite.reduce((s2, w) => s2 + w.amount, 0)),
    trimmed,
  };
}
