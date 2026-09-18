/**
 * โหมดการรับ/จ่ายชำระที่เอกสารอยู่ตอนนี้ — ใช้ทำให้ปุ่มลัดบอกได้ว่าเลือกอะไรอยู่
 * (ผู้ใช้แจ้ง 19 ก.ย. 2569: "เลือกปุ่มใดปุ่มนึงก็ต้องมีสีต่างไปจากปุ่มอื่น")
 *
 * **อ่านจากรายการรับชำระจริง ไม่ใช่จำว่าเพิ่งกดปุ่มไหน** — ผู้ใช้กดปุ่มแล้วไปแก้ยอดในช่องต่อได้
 * ถ้าจำจากปุ่ม ปุ่มจะค้างโชว์สิ่งที่ไม่จริงทันทีที่ตัวเลขเปลี่ยน
 */
export type PayMode = 'cash' | 'transfer' | 'partial' | 'credit';

const EPS = 0.005;

export function payModeOf(
  payments: readonly { method: string; amount: number }[],
  payable: number,
): PayMode {
  /* ไม่มีแถวรับชำระเลย = ยังไม่รับเงิน · มีแถวแต่ยอดยังเป็นศูนย์ = กำลังกรอกยอดบางส่วน
     สองอย่างนี้ต้องแยกกัน ไม่งั้นระหว่างพิมพ์ยอด ปุ่มจะไปติดที่ "ยังไม่รับเงิน" ซึ่งผู้ใช้ไม่ได้เลือก */
  if (payments.length === 0) return 'credit';
  const live = payments.filter((p) => Number(p.amount) > EPS);
  if (live.length === 0) return 'partial';

  const paid = live.reduce((s, p) => s + Number(p.amount), 0);
  /* ครบแล้วถือว่าเต็มจำนวน — รับเกินคือทอนเงินหน้าร้าน ไม่ใช่ชำระบางส่วน */
  const full = paid >= payable - EPS;
  if (!full || live.length > 1) return 'partial';

  return live[0].method === 'เงินโอน' ? 'transfer' : live[0].method === 'เงินสด' ? 'cash' : 'partial';
}
