import { EXPENSE_CATS } from '@drivegolight/core';
import { payLabel } from './format';

/**
 * แถวเอกสาร → การ์ด (จอต่ำกว่า 1280 · ต้นแบบของทีม `a.mdoc`)
 *
 * **โมดูลบริสุทธิ์** ไม่ import อะไรที่แตะฐานข้อมูลหรือ next/headers เพื่อให้เทสต์ด้วย vitest ได้
 * (ไลบรารีฝั่งเซิร์ฟเวอร์ import เข้า vitest ไม่ได้ — กติกาเดิมของโปรเจกต์)
 *
 * **การ์ดกับตารางต้องพูดเรื่องเดียวกัน** — ชิปสถานะของหน้ารายรับคิดที่ `incomeStatus`
 * ที่เดียว แล้วทั้งตารางและการ์ดเรียกใช้ ไม่งั้นวันหนึ่งใบเดียวกันจะขึ้น "ค้างชำระ"
 * บนมือถือ แต่ "เกินกำหนด" บนเดสก์ท็อป โดยไม่มีใครรู้ว่าอันไหนถูก
 */

/** สีชิปสถานะ — `plain` คือชิปเทาไม่มีความหมายเชิงเตือน (ใบที่ยกเลิก · ใบวางบิลปกติ) */
export type CardTone = 'ok' | 'warn' | 'due' | 'plain';

export interface CardStatus {
  label: string;
  tone: CardTone;
}

export interface DocCard {
  /** ปลายทางตอนกดทั้งใบ — การ์ดคือลิงก์ ไม่มีปุ่มในตัว (ผู้ใช้กำหนด 16 ก.ย. 2569) */
  href: string;
  /** ตัวย่อบนชิปซ้ายบน — QT · IVT · IV · RC · BN · PO · EX */
  kind: string;
  no: string;
  name: string;
  /** ทะเบียนรถ — ว่างคือไม่ต้องแสดงบรรทัดนี้ */
  plate: string;
  date: string;
  amount: number;
  /** ยอดคงค้าง · `null` = ไม่แสดงบรรทัดนี้เลย (ใบเสนอราคายังไม่ใช่หนี้ · ใบที่ยกเลิกแล้ว) */
  outstanding: number | null;
  status: CardStatus;
  voided: boolean;
}

/** เกินกำหนดเมื่อ "เลยวันครบกำหนดไปแล้ว" — ครบกำหนดวันนี้ยังไม่เกิน */
const overdue = (outstanding: number, dueDate: string | null, todayIso: string) =>
  outstanding > 0.004 && !!dueDate && dueDate < todayIso;

export interface IncomeCardRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  vehiclePlate: string;
  payable: number;
  outstanding: number;
  dueDate: string | null;
  /** ใบที่ออกต่อจากใบเสนอราคานี้แล้ว — มีใบใดใบหนึ่งก็ถือว่าส่งมอบแล้ว */
  invoice: unknown;
  receipt: unknown;
  voided: boolean;
}

/** ชิปสถานะของเอกสารขาย — ตารางประวัติและการ์ดใช้ตัวเดียวกัน */
export function incomeStatus(r: IncomeCardRow, todayIso: string): CardStatus {
  if (r.voided) return { label: 'ยกเลิก', tone: 'plain' };
  if (r.kind === 'QT') {
    return r.invoice || r.receipt
      ? { label: 'ออกใบต่อแล้ว', tone: 'ok' }
      : { label: 'ค้างส่งมอบ', tone: 'warn' };
  }
  if (overdue(r.outstanding, r.dueDate, todayIso)) return { label: 'เกินกำหนด', tone: 'due' };
  if (r.outstanding > 0.004) return { label: 'ค้างชำระ', tone: 'warn' };
  return { label: 'ชำระครบ', tone: 'ok' };
}

export function incomeDocCard(r: IncomeCardRow, todayIso: string): DocCard {
  return {
    href: `/income/${r.id}`,
    kind: r.kind,
    no: r.docNo,
    name: r.partyName || '-',
    plate: r.vehiclePlate,
    date: r.docDate,
    amount: r.payable,
    /* ใบเสนอราคายังไม่ใช่หนี้ · ใบที่ยกเลิกไม่ต้องเก็บแล้ว — ทั้งสองกรณีไม่มีบรรทัดคงค้าง */
    outstanding: r.kind === 'QT' || r.voided ? null : r.outstanding,
    status: incomeStatus(r, todayIso),
    voided: r.voided,
  };
}

const CAT_LABEL = new Map<string, string>(EXPENSE_CATS.map((c) => [c.key, c.label]));

export interface ExpenseCardRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  payable: number;
  paid: number;
  outstanding: number;
  status: string;
  expenseCat: string | null;
}

export function expenseDocCard(r: ExpenseCardRow): DocCard {
  const voided = r.status === 'void';
  const pay = payLabel(r.outstanding, r.paid);
  /* ค่าใช้จ่ายหลายรายการไม่มีคู่ค้า (ค่าน้ำค่าไฟ เงินเดือน) — ใช้ชื่อหมวดแทนช่องว่างเปล่า */
  const fallback = r.kind === 'PO' ? '(ไม่ระบุผู้ขาย)' : CAT_LABEL.get(r.expenseCat ?? '') ?? 'ค่าใช้จ่าย';
  return {
    href: `/expense/${r.id}`,
    kind: r.kind,
    no: r.docNo,
    name: r.partyName || fallback,
    plate: '',
    date: r.docDate,
    amount: r.payable,
    outstanding: voided ? null : r.outstanding,
    status: voided ? { label: 'ยกเลิก', tone: 'plain' } : { label: pay.text, tone: pay.tone },
    voided,
  };
}

export interface BillingCardRow {
  id: string;
  no: string;
  billDate: string;
  partyName: string;
  docCount: number;
  /** ยอดที่แจ้งไปตอนวางบิล — ไม่เปลี่ยนตามการรับชำระ */
  totalSnapshot: number;
  /** ยอดที่ยังเก็บไม่ได้ ณ ตอนนี้ */
  total: number;
  status: string;
  voidedReason: string | null;
}

export function billingDocCard(r: BillingCardRow): DocCard {
  const voided = r.status === 'void';
  return {
    href: `/income/billing/${r.id}`,
    kind: 'BN',
    no: r.no,
    name: r.partyName || '-',
    plate: '',
    date: r.billDate,
    amount: r.totalSnapshot,
    outstanding: voided ? null : r.total,
    status: voided ? { label: 'ยกเลิก', tone: 'plain' } : { label: 'วางบิลแล้ว', tone: 'plain' },
    voided,
  };
}

export interface OwingCardRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  /** ลูกหนี้มีทะเบียนรถ · เจ้าหนี้ไม่มี */
  vehiclePlate?: string;
  payable: number;
  paid: number;
  outstanding: number;
  /** ค่าลบหรือศูนย์ = ยังไม่เกินกำหนด */
  daysOverdue: number;
}

/** ใบค้างหนึ่งใบในหน้าลูกหนี้/เจ้าหนี้รายคน (เฟส 5) — สถานะบอกจำนวนวันที่เกินแบบเดียวกับชิปในตาราง */
export function owingDocCard(r: OwingCardRow, side: 'sell' | 'buy'): DocCard {
  const status: CardStatus = r.daysOverdue > 0
    ? { label: `เกิน ${r.daysOverdue} วัน`, tone: 'due' }
    : r.paid > 0.004 ? { label: 'ชำระบางส่วน', tone: 'warn' } : { label: 'ค้างชำระ', tone: 'warn' };
  return {
    href: side === 'buy' ? `/expense/${r.id}` : `/income/${r.id}`,
    kind: r.kind,
    no: r.docNo,
    name: r.partyName || '-',
    plate: r.vehiclePlate ?? '',
    date: r.docDate,
    amount: r.payable,
    outstanding: r.outstanding,
    status,
    voided: false,
  };
}

/** เอกสารขายรายใบในหน้ายอดขาย — ยอดบนการ์ดคือ "สุทธิรับ" เหมือนคอลัมน์ในตาราง */
export function salesDocCard(r: {
  id: string; kind: string; docNo: string; docDate: string; partyName: string;
  payable: number; outstanding: number;
}): DocCard {
  const owing = r.outstanding > 0.004;
  return {
    href: `/income/${r.id}`,
    kind: r.kind,
    no: r.docNo,
    name: r.partyName || '-',
    plate: '',
    date: r.docDate,
    amount: r.payable,
    outstanding: r.outstanding,
    status: owing ? { label: 'ค้างชำระ', tone: 'warn' } : { label: 'ชำระครบ', tone: 'ok' },
    voided: false,
  };
}
