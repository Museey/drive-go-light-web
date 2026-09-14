/**
 * ถังขยะ — เอกสารที่ลบ/ยกเลิก (07.5)
 *
 * เก็บทุกเอกสารที่ status = 'void' (ขาย/ซื้อ/ค่าใช้จ่าย/ใบวางบิล) ค้นตามช่วงเวลาเท่านั้น
 * กู้คืน = เอา void ออกและคืนผลทางสต๊อกให้เหมือนก่อนยกเลิก
 * ลบถาวร = ตั้ง purged_at แล้วหายจากทุกหน้ารวมถังขยะ กู้ไม่ได้ (แถวยังอยู่เพื่อรักษาบัญชีที่อ้างถึง)
 *
 * ไฟล์นี้รับ client ที่ตั้ง tenant แล้ว ไม่แตะ session — เทสต์เรียกได้ตรง ๆ
 * ตัวที่ผูกกับ session และสิทธิ์ของผู้ใช้อยู่ใน trash.ts
 */
import type pg from 'pg';
import { isRestorable } from './trash-rules';
import { unvoidBuyDocWith } from './buy-void';

type Client = pg.PoolClient | pg.Client;
type Source = 'doc' | 'billnote';

export interface TrashRow {
  id: string;
  source: Source;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  amount: number;
  voidedAt: string;
  reason: string;
}

export async function listTrashWith(c: Client, opts: { from?: string; to?: string }): Promise<TrashRow[]> {
  const params: unknown[] = [];
  const w: string[] = [];
  if (opts.from) { params.push(opts.from); w.push(`voided_at::date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); w.push(`voided_at::date <= $${params.length}`); }
  const where = w.length ? 'and ' + w.join(' and ') : '';
  const { rows } = await c.query(
    `select id, 'doc' as source, kind::text as kind, doc_no, doc_date::text as doc_date, party_name,
            payable as amount, voided_at::text as voided_at, coalesce(voided_reason, '') as reason
       from documents where status = 'void' and purged_at is null ${where}
     union all
     select id, 'billnote' as source, 'BN' as kind, no as doc_no, bill_date::text as doc_date, party_name,
            total_snapshot as amount, voided_at::text as voided_at, coalesce(voided_reason, '') as reason
       from billnotes where voided_at is not null and purged_at is null ${where}
     order by voided_at desc
     limit 500`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, source: r.source, kind: r.kind, docNo: r.doc_no, docDate: r.doc_date,
    partyName: r.party_name ?? '', amount: Number(r.amount ?? 0), voidedAt: r.voided_at, reason: r.reason,
  }));
}

/** กู้คืน — ใบเสนอราคา: คืนสถานะ · ใบซื้อ/ค่าใช้จ่าย: ใช้ unvoid ที่มีอยู่ · ใบวางบิล: ดูข้างใน · ที่เหลือดู trash-rules.ts */
export async function restoreFromTrashWith(
  c: Client, source: Source, id: string, userId: string | null,
): Promise<void> {
  if (source === 'billnote') {
    const b = await c.query(
      `select no, status::text as status from billnotes where id = $1 and purged_at is null for update`, [id]);
    if (!b.rows[0] || b.rows[0].status !== 'void') {
      throw new Error('ไม่พบใบวางบิลในถังขยะ — อาจถูกกู้คืนหรือลบถาวรไปแล้ว');
    }

    /* ใบที่อยู่ในใบวางบิลนี้ ระหว่างที่ถูกยกเลิกอาจถูกวางบิลใบใหม่ไปแล้ว หรือถูกยกเลิกเอง
       กู้คืนทับจะทำให้ใบเดียวอยู่ในใบวางบิลสองใบ (ดัชนี billnote_doc_once กันไว้แต่ข้อความอ่านไม่รู้เรื่อง) */
    const taken = await c.query(
      `select d.doc_no, ob.no as other_no
         from billnote_docs bd
         join documents d on d.id = bd.doc_id
         join billnote_docs od on od.doc_id = bd.doc_id and od.billnote_id <> bd.billnote_id and not od.voided
         join billnotes ob on ob.id = od.billnote_id
        where bd.billnote_id = $1 limit 1`, [id]);
    if (taken.rows[0]) {
      throw new Error(`กู้คืนไม่ได้ — ${taken.rows[0].doc_no} อยู่ในใบวางบิล ${taken.rows[0].other_no} แล้ว`);
    }
    const dead = await c.query(
      `select d.doc_no from billnote_docs bd join documents d on d.id = bd.doc_id
        where bd.billnote_id = $1 and (d.status = 'void' or d.purged_at is not null) limit 1`, [id]);
    if (dead.rows[0]) {
      throw new Error(`กู้คืนไม่ได้ — ${dead.rows[0].doc_no} ในใบวางบิลนี้ถูกยกเลิกไปแล้ว กู้ใบนั้นก่อน`);
    }

    /* ต้องคืนสถานะด้วย ไม่ใช่แค่ล้าง voided_at — ตารางบังคับ (status = 'void') = (voided_at is not null)
       ของเดิมล้างแค่ voided_at จึงกู้คืนใบวางบิลไม่ได้เลยสักใบ */
    await c.query(
      `update billnotes set status = 'issued', voided_at = null, voided_reason = null where id = $1`, [id]);
    await c.query(`update billnote_docs set voided = false where billnote_id = $1`, [id]);
    return;
  }

  const { rows } = await c.query(
    `select kind::text as kind, direction::text as direction from documents
      where id = $1 and status = 'void' and purged_at is null for update`, [id]);
  const d = rows[0];
  if (!d) throw new Error('ไม่พบเอกสารในถังขยะ — อาจถูกกู้คืนหรือลบถาวรไปแล้ว');
  if (!isRestorable(d.kind)) {
    throw new Error('ใบนี้กู้คืนไม่ได้ — ใบส่งมอบ ใบกำกับภาษี และใบเสร็จที่ยกเลิกแล้ว ต้องคัดลอกเป็นใบใหม่ '
      + 'เพราะอาจส่งให้ลูกค้าหรือยื่นภาษีไปแล้ว');
  }
  if (d.direction === 'buy') { await unvoidBuyDocWith(c, id, userId); return; }

  /* เหลือแค่ใบเสนอราคา — ไม่ตัดสต๊อกและไม่มีผลทางบัญชี คืนสถานะอย่างเดียวพอ */
  await c.query(`update documents set status = 'issued', voided_at = null, voided_reason = null where id = $1`, [id]);
}

/** ลบถาวร — กู้ไม่ได้ · ใบที่ไม่ได้อยู่ในถังขยะ (ยังไม่ยกเลิก หรือลบไปแล้ว) ต้องไม่เงียบ */
export async function purgeFromTrashWith(c: Client, source: Source, id: string): Promise<void> {
  const res = source === 'billnote'
    ? await c.query(
      `update billnotes set purged_at = now() where id = $1 and status = 'void' and purged_at is null`, [id])
    : await c.query(
      `update documents set purged_at = now() where id = $1 and status = 'void' and purged_at is null`, [id]);
  if (!res.rowCount) throw new Error('ไม่พบเอกสารในถังขยะ — อาจถูกกู้คืนหรือลบถาวรไปแล้ว');
}

