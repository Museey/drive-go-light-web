/** ครึ่งสตางค์ — ต่ำกว่านี้ถือว่าปิดยอดแล้ว ค่าเดียวกับที่ core ใช้ */
export const EPS = 0.004;

const round2 = (v: number) => Math.round(v * 100) / 100;

const thb = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * ตรวจจำนวนเงินที่จะตัดชำระ — คืนข้อความบอกปัญหา หรือ null ถ้ารับได้
 *
 * ปฏิเสธยอดที่เกินคงค้าง เพราะพิมพ์เกินหนึ่งหลักแล้วยอดลูกหนี้ทั้งร้านเพี้ยน
 * และเป็นความผิดพลาดที่เจอบ่อยกว่าการรับเงินเกินจริงมาก
 */
export function checkPaymentAmount(
  payable: number,
  alreadyPaid: number,
  amount: number,
): string | null {
  const outstanding = round2(payable - alreadyPaid);

  if (outstanding <= EPS) return 'เอกสารนี้ชำระครบแล้ว';
  if (!Number.isFinite(amount) || amount <= 0) return 'จำนวนเงินต้องมากกว่าศูนย์';
  if (amount - outstanding > EPS) {
    return `รับเกินยอดคงค้าง — คงค้างอยู่ ${thb(outstanding)} บาท ` +
           'ถ้ายอดจริงสูงกว่านี้ ให้แก้ยอดในเอกสารก่อน';
  }
  return null;
}

/** ยอดคงค้างของเอกสาร */
export const outstandingOf = (payable: number, paid: number) => round2(payable - paid);

/** ปิดยอดแล้วหรือยัง */
export const isSettled = (payable: number, paid: number) => outstandingOf(payable, paid) <= EPS;
