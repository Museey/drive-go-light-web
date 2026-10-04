import type pg from 'pg';
import type { SalesKind } from './sales-rules';

/**
 * เอกสารขายใบไหนตัดสต๊อก — ในสายใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ มีใบเดียวที่ถือสต๊อก
 *
 * ผู้ใช้กำหนด 4 ต.ค. 2569 (ตรงกับรุ่น 6.4): ตัดสต๊อกตั้งแต่บันทึกใบส่งมอบ เพราะของออกจากร้านไปแล้ว
 * ใบเสร็จที่ออกต่อจากใบส่งมอบนั้นไม่ตัดซ้ำ ส่วนใบเสร็จที่ไม่มีใบส่งมอบนำหน้า (ขายหน้าร้าน ·
 * ออกต่อจากใบเสนอราคา) ยังตัดตอนบันทึกเหมือนเดิม
 *
 * **ดูจากบัญชีสต๊อกจริง ไม่ดูจากชนิดใบอย่างเดียว** — ใบส่งมอบที่ออกก่อนเปลี่ยนกติกาไม่เคยตัดสต๊อก
 * ใบเสร็จที่ออกต่อจากใบพวกนั้นจึงยังต้องตัดเหมือนเดิม (ผู้ใช้เลือก) ไม่ต้องย้อนแก้ข้อมูลเก่า
 * และแก้ใบส่งมอบเก่าที่ใบเสร็จตัดไปแล้ว ใบส่งมอบต้องไม่ตัดซ้ำอีกรอบ
 *
 * รับ client ที่ตั้ง tenant แล้ว ไม่มี server-only — เทสต์เรียกกับฐานจริงได้ (sales-stock-db.test.ts)
 */

type Client = Pick<pg.ClientBase, 'query'>;

/** ใบนี้ถือสต๊อกอยู่ไหม — ตัดออกไปสุทธิแล้วยังไม่ได้คืน (ยกเลิกแล้วคืนครบ = ไม่ถือ) */
export async function holdsStockWith(c: Client, docId: string): Promise<boolean> {
  const { rows } = await c.query(
    `select coalesce(sum(qty_delta), 0) < 0 as holds from stock_moves where doc_id = $1`, [docId]);
  return rows[0]?.holds === true;
}

/**
 * บันทึกใบนี้แล้วต้องตัดสต๊อกไหม — เรียกในทรานแซกชันเดียวกับที่บันทึก หลังล็อกใบ/ใบต้นทางแล้ว
 *
 * ใบที่แก้ (มี id) ถูกคืนสต๊อกเดิมทั้งหมดก่อนถึงตรงนี้ (returnDocStock) — คำถามจึงเป็น "ตัดใหม่ไหม"
 * และใช้ชนิดกับใบต้นทางที่บันทึกไว้ในฐาน ไม่ใช่ที่หน้าเว็บส่งมา
 */
export async function cutsStockWith(
  c: Client,
  input: { id?: string; kind: SalesKind; parentDocId: string | null },
): Promise<boolean> {
  let doc = input;
  if (input.id) {
    const { rows } = await c.query(
      `select kind::text as kind, parent_doc_id from documents where id = $1`, [input.id]);
    if (!rows[0]) throw new Error('ไม่พบเอกสาร');
    doc = { id: input.id, kind: rows[0].kind as SalesKind, parentDocId: rows[0].parent_doc_id ?? null };
  }

  if (doc.kind === 'QT') return false;

  if (doc.kind === 'RC') {
    /* ออกต่อจากใบส่งมอบที่ตัดสต๊อกไปแล้ว — ของออกจากร้านตั้งแต่ใบนั้น ใบเสร็จนี้แค่รับเงิน */
    return !(doc.parentDocId && await holdsStockWith(c, doc.parentDocId));
  }

  /* ใบส่งมอบ — ตัดเสมอ ยกเว้นแก้ใบเก่าที่ใบเสร็จต่อของมันเป็นคนตัดสต๊อกไปแล้ว */
  return !(doc.id && await receiptHoldsStockWith(c, doc.id));
}

/**
 * ใบเสร็จที่ออกต่อจากใบส่งมอบใบนี้เป็นคนถือสต๊อกไหม — เกิดกับใบส่งมอบที่ออกก่อนเปลี่ยนกติกา
 * (ตอนนั้นตัดตอนออกใบเสร็จ) แก้ใบส่งมอบแบบนี้แล้วต้องไม่ตัดซ้ำ
 */
export async function receiptHoldsStockWith(c: Client, invoiceId: string): Promise<boolean> {
  const { rows } = await c.query(
    `select exists (
       select 1 from documents x
        where x.parent_doc_id = $1 and x.kind = 'RC' and x.status <> 'void'
          and (select coalesce(sum(m.qty_delta), 0) from stock_moves m where m.doc_id = x.id) < 0
     ) as taken`,
    [invoiceId],
  );
  return rows[0].taken === true;
}
