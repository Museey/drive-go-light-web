/**
 * เงินที่ชำระแล้วต่อเอกสาร — **นิยามเดียวที่ทุกหน้าต้องใช้**
 *
 * ใบส่งมอบ (IV/IVT) กับใบเสร็จ (RC) ที่ออกต่อจากมันคือ**หนี้ก้อนเดียวกัน**
 * เงินรับได้ทั้งสองที่: บันทึกรับชำระที่ใบส่งมอบจากหน้าลูกหนี้ หรือรับตอนออกใบเสร็จ
 *
 * เดิมแต่ละหน้านับเฉพาะเงินที่ผูกกับใบของตัวเอง ตัวเลขจึงไม่ตรงกัน
 *   - หน้าลูกหนี้ย้ายหนี้ไปดูที่ใบเสร็จ → เงินที่เคยรับบางส่วนไว้ที่ใบส่งมอบหายจากการคิด
 *   - ใบวางบิล ยอดค้างของลูกค้า ยอดค้างของรถ และรายงานยอดขาย ดูที่ใบส่งมอบ
 *     → ใบที่จ่ายครบผ่านใบเสร็จแล้วยังขึ้นว่าค้าง และยังถูกเสนอให้วางบิลซ้ำ
 *
 * ตรงนี้คืนรูปเดียวกับ `(select doc_id, sum(amount) as paid from payments group by doc_id)`
 * ที่ทุกคิวรีใช้อยู่เดิม จึงสลับแทนกันได้ทันที ต่างกันแค่ว่าเงินของคู่ใบส่งมอบ–ใบเสร็จ
 * ถูกนับให้**ทั้งสองใบ** ยอดค้างของสองใบจึงเท่ากันเสมอ
 *
 * **ห้ามเอายอดของสองใบในคู่เดียวกันมาบวกกัน** — ผู้เรียกต้องเลือกนับใบเดียวต่อหนึ่งหนี้
 * (หน้าลูกหนี้กับใบวางบิลนับใบเสร็จ · รายงานยอดขายกับยอดของลูกค้านับใบส่งมอบ)
 * เงื่อนไขนั้นอยู่ที่ `HAS_LIVE_RECEIPT_SQL` ด้านล่าง
 *
 * เอกสารฝั่งซื้อไม่มีคู่แบบนี้ แถวของมันจึงได้ค่าเท่าเดิมทุกประการ
 */
export const DEBT_PAID_SQL = `
  (select t.doc_id, sum(t.amount) as paid
     from (
       select p.doc_id, p.amount from payments p
       union all
       /* เงินที่รับที่ใบเสร็จ นับให้ใบส่งมอบต้นทางด้วย */
       select r.parent_doc_id, p.amount
         from payments p
         join documents r on r.id = p.doc_id
         join documents iv on iv.id = r.parent_doc_id
        where r.kind = 'RC' and r.status <> 'void' and iv.kind in ('IV', 'IVT')
       union all
       /* เงินที่รับที่ใบส่งมอบ นับให้ใบเสร็จที่ออกต่อจากมันด้วย */
       select r.id, p.amount
         from payments p
         join documents iv on iv.id = p.doc_id
         join documents r on r.parent_doc_id = iv.id
        where r.kind = 'RC' and r.status <> 'void'
          and iv.kind in ('IV', 'IVT') and iv.status <> 'void'
     ) t
    group by t.doc_id)`;

/**
 * ใบส่งมอบที่มีใบเสร็จออกต่อแล้ว — หนี้ก้อนนี้ให้นับที่ใบเสร็จ ไม่นับที่ใบส่งมอบซ้ำ
 * `d` คือ alias ของ documents ในคิวรีที่เอาไปใช้
 */
export const hasLiveReceiptSql = (d = 'd'): string => `
  exists (select 1 from documents x
           where x.parent_doc_id = ${d}.id and x.kind = 'RC' and x.status <> 'void')`;
