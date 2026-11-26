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
/**
 * เงินที่รับจริง — ตัดแถว "สำเนา" ที่โปรแกรมรุ่น 6.4 จดไว้ที่ใบส่งมอบออก (26 พ.ย. 2569)
 *
 * รุ่น 6.4 พอออกใบเสร็จจากใบส่งมอบ จะคัดลอกยอดที่รับตามใบเสร็จไปใส่ใน payments ของใบส่งมอบด้วย
 * อ้างอิงว่า "รับชำระตามใบเสร็จ <เลขที่ใบเสร็จ>" (legacy: inv.payments.push({... fromReceipt}))
 * ตัวนำเข้าเก็บมาครบทั้งสองแถว อู่ที่ย้ายมาจาก 6.4 จึงมีเงินก้อนเดียวอยู่สองที่
 *
 * ตอนแต่ละหน้านับเฉพาะเงินของใบตัวเอง สำเนานี้ไม่เป็นปัญหา แต่ DEBT_PAID_SQL รวมเงินของทั้งคู่
 * ถ้านับสำเนาด้วย ยอดชำระจะเป็นสองเท่า — ใบที่รับมาครึ่งเดียวจะดูเหมือนจ่ายครบ หนี้หายจากหน้าลูกหนี้
 *
 * แถวที่ตัด: อยู่ที่ใบส่งมอบ และอ้างอิงตรงกับเลขที่ใบเสร็จที่ออกต่อจากใบนั้นพอดี
 * ไม่ดูสถานะของใบเสร็จ — ใบเสร็จที่ถูกยกเลิกแล้ว เงินตามใบเสร็จนั้นก็ไม่ควรนับ (6.4 ลบสำเนาตอนยกเลิกเช่นกัน)
 * เงินที่รับที่ใบส่งมอบเองจริง ๆ (อ้างอิงอื่น) ยังนับตามเดิม
 */
export const RECEIPT_MIRROR_PREFIX = 'รับชำระตามใบเสร็จ ';

const REAL_PAYMENTS_SQL = `
  (select p.id, p.doc_id, p.amount
     from payments p
    where not exists (
      select 1
        from documents miv
        join documents mrc on mrc.parent_doc_id = miv.id and mrc.kind = 'RC'
       where miv.id = p.doc_id and miv.kind in ('IV', 'IVT')
         and p.ref = '${RECEIPT_MIRROR_PREFIX}' || mrc.doc_no))`;

export const DEBT_PAID_SQL = `
  (select t.doc_id, sum(t.amount) as paid
     from (
       select p.doc_id, p.amount from ${REAL_PAYMENTS_SQL} p
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
         from ${REAL_PAYMENTS_SQL} p
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
