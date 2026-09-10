import type pg from 'pg';

/**
 * ยอดสะสมและยอดคงค้างต่อผู้ติดต่อ
 *
 * ยกความหมายมาจาก `custHistory()` กับ `vendHistory()` ของรุ่น 6.4
 *   ยอดสะสม = ผลรวมยอดที่ต้องชำระของเอกสารที่ผูกกับผู้ติดต่อรายนี้
 *   คงค้าง  = ผลรวมส่วนที่ยังไม่ได้ชำระ โดยใบที่จ่ายเกินไม่ทำให้ติดลบ
 *
 * ผู้ติดต่อที่เป็นทั้งลูกค้าและผู้ขายได้ยอดของทั้งสองฝั่งรวมกัน ตามที่ 6.4 ทำ
 *
 * อยู่ไฟล์นี้เพราะไม่มี `server-only` จึงเรียกจากชุดทดสอบได้โดยส่ง client เข้ามาเอง
 * เหมือน reports-pl.ts และ doc-chain.ts
 */

export interface ContactMoney {
  spent: number;
  owe: number;
}

/**
 * **ใบเสร็จที่ออกต่อจากใบส่งมอบไม่ถูกนับซ้ำ**
 *
 * เงื่อนไขชุดเดียวกับที่คิวรียอดขายใช้ — ลืมข้อนี้แล้วยอดสะสมของลูกค้าจะเป็นสองเท่า
 * โดยที่ตัวเลขยังดูสมเหตุสมผลอยู่ ไม่มีอะไรบอกว่าผิด
 *
 * ฝั่งซื้อคิดเฉพาะใบซื้อ (PO) ไม่รวมค่าใช้จ่ายทั่วไป ตามที่ 6.4 ทำใน vendHistory()
 */
export const CONTACT_MONEY_SQL = `
  select d.party_id,
         coalesce(sum(d.payable), 0) as spent,
         coalesce(sum(greatest(d.payable - coalesce(p.paid, 0), 0)), 0) as owe
    from documents d
    left join documents pd on pd.id = d.parent_doc_id
    left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
           on p.doc_id = d.id
   where d.status <> 'void'
     and d.party_id is not null
     and (d.kind in ('IV','IVT')
          or (d.kind = 'RC' and (d.parent_doc_id is null or pd.kind = 'QT'))
          or d.kind = 'PO')
   group by d.party_id`;

/**
 * ยอดของผู้ติดต่อทุกรายในอู่ปัจจุบัน
 *
 * **คิวรีเดียว ไม่ใช่ต่อแถว** — เครื่องจริงมีผู้ติดต่อ 60 ราย เอกสาร 1,474 ใบ
 * ยิงต่อแถวคือ 60 คิวรีต่อการเปิดหน้าหนึ่งครั้ง
 */
export async function contactTotalsWith(
  c: pg.PoolClient | pg.Client,
): Promise<Map<string, ContactMoney>> {
  const { rows } = await c.query(CONTACT_MONEY_SQL);
  return new Map(rows.map((r) => [
    r.party_id as string,
    { spent: Number(r.spent ?? 0), owe: Number(r.owe ?? 0) },
  ]));
}
