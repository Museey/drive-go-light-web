import type pg from 'pg';
import { KIND_LABEL } from './format';

/**
 * ล็อกเอกสารขายที่บันทึกแล้ว — กติกาตามต้นแบบ (ผู้ใช้เลือก 17 ก.ย. 2569)
 *
 * รับ client ที่ตั้ง tenant แล้ว ไม่มี server-only — เทสต์เรียกกับฐานจริงได้
 */

type Client = Pick<pg.ClientBase, 'query'>;

export interface ChildRef { id: string; docNo: string; kind: string }

/** ใบต่อที่ยังไม่ยกเลิกของใบนี้ */
export async function activeChildWith(c: Client, id: string): Promise<ChildRef | null> {
  const { rows } = await c.query(
    `select id, doc_no, kind::text as kind from documents
      where parent_doc_id = $1 and status <> 'void'
      order by doc_date, doc_no limit 1`, [id]);
  return rows[0] ? { id: rows[0].id, docNo: rows[0].doc_no, kind: rows[0].kind } : null;
}

/**
 * ใช้ก่อนสร้างใบต่อ (และก่อนกู้คืนใบต่อจากถังขยะ) — ใบต้นทางต้องยังไม่มีใบต่อที่ใช้งานอยู่
 *
 * ต้นแบบให้ทำขั้นถัดไปได้เฉพาะใบที่ยังไม่มีใบต่อ ของเดิมซ่อนแค่ทางในแถบขั้นตอน
 * ปุ่มใต้แถบกับเซิร์ฟเวอร์ยังยอม ใบเสนอราคาใบเดียวจึงออกใบส่งมอบได้หลายใบ
 *
 * **ล็อกแถวใบต้นทางก่อนตรวจ** — สองเครื่องกดพร้อมกัน เครื่องที่สองต้องรอให้เครื่องแรกบันทึกเสร็จ
 * แล้วค่อยเห็นใบต่อของเครื่องแรก ต้องเรียกในทรานแซกชันเดียวกับการ insert
 * `exceptId` = ใบที่กำลังกู้คืน (มันเองยังเป็น void อยู่ ไม่ถูกนับอยู่แล้ว แต่กันไว้ให้ชัด)
 */
export async function claimParentWith(c: Client, parentId: string, exceptId?: string): Promise<void> {
  const { rows } = await c.query(`select doc_no from documents where id = $1 for update`, [parentId]);
  if (!rows[0]) return;
  const child = await activeChildWith(c, parentId);
  if (child && child.id !== exceptId) {
    throw new DocChainTakenError(
      `${childTakenMessage(rows[0].doc_no, child)} — เปิดใบนั้น หรือยกเลิกใบนั้นก่อนจึงจะออกใหม่ได้`,
      rows[0].doc_no, child);
  }
}

export class DocChainTakenError extends Error {
  constructor(message: string, readonly parentNo: string, readonly child: ChildRef) { super(message); }
}

/** ยกเลิกใบต่อแล้ว ใบเสนอราคาที่ไม่เหลือใบต่อที่ใช้งานอยู่ กลับเป็นค้างส่งมอบ (ต้นแบบ voidDoc) */
export async function releaseParentWith(c: Client, childId: string): Promise<void> {
  await c.query(
    `update documents q set status = 'issued'
      where q.id = (select parent_doc_id from documents where id = $1)
        and q.kind = 'QT' and q.status = 'billed'
        and not exists (select 1 from documents x where x.parent_doc_id = q.id and x.status <> 'void')`,
    [childId]);
}

/** ใบเสนอราคาที่ถูกออกใบต่อ (บันทึกใบต่อ · กู้คืนใบต่อ) ทำเครื่องหมายว่าออกใบต่อแล้ว */
export async function markParentBilledWith(c: Client, parentId: string): Promise<void> {
  await c.query(
    `update documents set status = 'billed' where id = $1 and kind = 'QT' and status <> 'void'`, [parentId]);
}

/**
 * แก้ในใบเดิมได้ไหม — ตามต้นแบบ `editDoc`
 *
 * ออกใบต่อไปแล้วก็ยังแก้ได้ (ใบต่อไม่เปลี่ยนตาม) · ใบเสร็จตัดสต๊อกแล้ว และใบที่รับเงินแล้ว แก้ไม่ได้
 */
export async function editRuleWith(c: Client, id: string): Promise<{ ok: boolean; reason?: string }> {
  const { rows } = await c.query(
    `select d.status::text as status, d.kind::text as kind,
            (select coalesce(sum(p.amount), 0) from payments p where p.doc_id = d.id) as paid
     from documents d where d.id = $1`,
    [id],
  );
  const d = rows[0];
  if (!d) return { ok: false, reason: 'ไม่พบเอกสาร' };
  if (d.status === 'void') return { ok: false, reason: 'เอกสารนี้ถูกยกเลิกแล้ว' };
  if (d.kind === 'RC') return { ok: false, reason: 'ใบเสร็จตัดสต๊อกแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่' };
  if (Number(d.paid) > 0.004) return { ok: false, reason: 'ใบนี้รับเงินแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่' };
  return { ok: true };
}

export const childTakenMessage = (parentNo: string, child: ChildRef) =>
  `${parentNo} ออก${KIND_LABEL[child.kind] ?? child.kind} ${child.docNo} ต่อไปแล้ว`;
