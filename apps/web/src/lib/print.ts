import type { DocDetail } from './queries';

const EPS = 0.004;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PayAtIssue {
  cash: number;
  transfer: number;
  card: number;
  /** ช่องทางอื่นที่ไม่ใช่สามอย่างข้างบน เช่น เช็ค */
  other: number;
  paid: number;
  remain: number;
  ref: string;
}

/**
 * แยกยอดที่รับชำระตอนออกเอกสารตามช่องทาง สำหรับพิมพ์ลงใบเสร็จ
 *
 * โปรแกรมเดิมเก็บไว้ในอ็อบเจกต์ pay{} แยกต่างหากจากรายการชำระเงิน ระบบใหม่ไม่ต้องมีอันนั้น
 * เพราะรายการที่ at_issue = true บอกได้ครบอยู่แล้วว่ารับมาทางไหนเท่าไร
 * (ของเดิมต้องคอยซิงก์สองที่ให้ตรงกันด้วย syncIssuePayments — ที่มาของบั๊กได้ง่าย)
 */
export function payAtIssue(doc: Pick<DocDetail, 'payments' | 'payable'>): PayAtIssue {
  const atIssue = doc.payments.filter((p) => p.atIssue);
  const byMethod = (m: string) =>
    round2(atIssue.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0));

  const cash = byMethod('เงินสด');
  const transfer = byMethod('เงินโอน');
  const card = byMethod('บัตรเครดิต');
  const paid = round2(atIssue.reduce((s, p) => s + p.amount, 0));

  return {
    cash, transfer, card,
    other: round2(paid - cash - transfer - card),
    paid,
    remain: round2(doc.payable - paid),
    ref: atIssue.find((p) => p.ref)?.ref ?? '',
  };
}

export const isPaid = (v: number) => v > EPS;
