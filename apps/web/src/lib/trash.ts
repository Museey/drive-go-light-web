/**
 * ถังขยะ — เอกสารที่ลบ/ยกเลิก (07.5)
 *
 * เก็บทุกเอกสารที่ status = 'void' (ขาย/ซื้อ/ค่าใช้จ่าย/ใบวางบิล) ค้นตามช่วงเวลาเท่านั้น
 * กู้คืน = เอา void ออกและคืนผลทางสต๊อกให้เหมือนก่อนยกเลิก
 * ลบถาวร = ตั้ง purged_at แล้วหายจากทุกหน้ารวมถังขยะ กู้ไม่ได้ (แถวยังอยู่เพื่อรักษาบัญชีที่อ้างถึง)
 */
import { today } from '@drivegolight/core';
import { query } from './auth';
import { mutate } from './mutate';
import { consumeStock } from './stock-cost';
import { unvoidBuyDocWith } from './buy-void';

export interface TrashRow {
  id: string;
  source: 'doc' | 'billnote';
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  amount: number;
  voidedAt: string;
  reason: string;
}

export async function listTrash(opts: { from?: string; to?: string }): Promise<TrashRow[]> {
  return query(async (c) => {
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
  });
}

/** กู้คืน — ใบขาย: ตั้ง issued แล้วตัดสต๊อกใหม่ (ใบเสร็จ) · ใบซื้อ: ใช้ unvoid ที่มีอยู่ · ใบวางบิล: เอา void ออก */
export async function restoreFromTrash(source: 'doc' | 'billnote', id: string): Promise<void> {
  return mutate('settings', async (c, userId) => {
    if (source === 'billnote') {
      await c.query(`update billnotes set voided_at = null, voided_reason = null where id = $1 and purged_at is null`, [id]);
      return;
    }
    const { rows } = await c.query(`select kind::text as kind, direction::text as direction, doc_date::text as doc_date from documents where id = $1 and status = 'void' and purged_at is null`, [id]);
    const d = rows[0];
    if (!d) throw new Error('ไม่พบเอกสาร หรือไม่ได้อยู่ในถังขยะ');
    if (d.direction === 'buy') { await unvoidBuyDocWith(c, id, userId); return; }
    await c.query(`update documents set status = 'issued', voided_at = null, voided_reason = null where id = $1`, [id]);
    if (d.kind === 'RC') {
      /* ยกเลิกไปแล้วของถูกคืนเข้าสต๊อก — กู้คืนจึงต้องตัดออกอีกครั้งให้บัญชีสมดุล */
      const items = await c.query(`select id, product_id, qty from doc_items where doc_id = $1 and product_id is not null`, [id]);
      for (const it of items.rows) {
        await consumeStock(c, { productId: it.product_id, qty: Number(it.qty), movedOn: today(), reason: 'sale', docId: id, docItemId: it.id, userId, note: 'กู้คืนเอกสารจากถังขยะ' });
      }
    }
  }, { sub: 'shop' });
}

/** ลบถาวร — กู้ไม่ได้ */
export async function purgeFromTrash(source: 'doc' | 'billnote', id: string): Promise<void> {
  return mutate('settings', async (c) => {
    if (source === 'billnote') await c.query(`update billnotes set purged_at = now() where id = $1 and voided_at is not null`, [id]);
    else await c.query(`update documents set purged_at = now() where id = $1 and status = 'void'`, [id]);
  }, { sub: 'shop' });
}
