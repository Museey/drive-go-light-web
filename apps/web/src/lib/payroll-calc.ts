/**
 * สูตรเงินเดือน (Light Plus) — TypeScript ล้วน ใช้ร่วมกันทั้งฟอร์มฝั่ง client และตัวบันทึก
 *
 * ตัวเลขที่คิดให้เป็น **ค่าเสนอ** ผู้ใช้แก้ทุกช่องได้ก่อนบันทึก
 * ภาษีเงินเดือนจริงคิดแบบอัตราก้าวหน้าต่อปี ซึ่งขึ้นกับค่าลดหย่อนของแต่ละคน —
 * ที่นี่ใช้อัตราคงที่รายคนตามที่ตั้งในทะเบียนพนักงาน ให้เจ้าของหรือสำนักงานบัญชีกำหนดเอง
 */

/** อัตราเงินสมทบประกันสังคมฝ่ายลูกจ้าง เป็น % (นายจ้างสมทบเท่ากัน) */
export const SSO_RATE_PCT = 5;
/** ฐานค่าจ้างขั้นต่ำที่ใช้คิดเงินสมทบ */
export const SSO_MIN_WAGE = 1650;
/**
 * เพดานค่าจ้างที่ใช้คิดเงินสมทบ — 17,500 บาท (สูงสุด 875 บาท/เดือน) ใช้ตั้งแต่ 1 ม.ค. 2569
 * กฎกระทรวงกำหนดขั้นถัดไปไว้ 20,000 (ปี 2572) และ 23,000 (ปี 2575) — ถึงตอนนั้นแก้ที่นี่ที่เดียว
 */
export const SSO_MAX_WAGE = 17500;
/** เพดานเดิมก่อน 1 ม.ค. 2569 — 15,000 บาท (สูงสุด 750 บาท/เดือน) */
export const SSO_MAX_WAGE_BEFORE_2026 = 15000;

/**
 * เพดานค่าจ้างของงวด (YYYY-MM) — งวดย้อนหลังก่อน ม.ค. 2569 ใช้เพดานเดิม
 * ไม่ส่งงวด = เพดานปัจจุบัน · เดิมใช้ 17,500 ทุกงวด เปิดงวด ธ.ค. 2568 ย้อนหลังแล้วเสนอ 875 แทน 750
 */
export function ssoMaxWage(period?: string | null): number {
  return period && /^\d{4}-\d{2}$/.test(period) && period < '2026-01' ? SSO_MAX_WAGE_BEFORE_2026 : SSO_MAX_WAGE;
}

/** ค่าจ้างที่ใช้เป็นฐานเงินสมทบของงวด — ใช้ทั้งตอนคิดเงินสมทบและตอนออก สปส.1-10 */
export function ssoWageOf(wage: number, period?: string | null): number {
  return Math.min(Math.max(wage, SSO_MIN_WAGE), ssoMaxWage(period));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const nonNeg = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** เงินสมทบประกันสังคมจากค่าจ้าง — เศษตั้งแต่ 50 สตางค์ปัดขึ้นเป็นบาท ต่ำกว่านั้นปัดทิ้ง */
export function ssoOf(wage: number, enabled = true, period?: string | null): number {
  const w = nonNeg(wage);
  if (!enabled || w === 0) return 0;
  const base = ssoWageOf(w, period);
  /* คูณก่อนหาร — base × 0.05 เป็นเลขฐานสองแล้วได้ .4999… ตรงที่ควรเป็น .50 พอดี ปัดผิดไปหนึ่งบาท */
  return Math.round(base * SSO_RATE_PCT / 100);
}

/** ภาษีหัก ณ ที่จ่ายจากเงินได้รวมของงวด ตามอัตรา % ที่ตั้งไว้รายคน */
export function whtOf(income: number, ratePct: number): number {
  return round2(nonNeg(income) * nonNeg(ratePct) / 100);
}

export interface PayLine {
  base: number;
  overtime: number;
  otherIncome: number;
  sso: number;
  wht: number;
  otherDeduct: number;
}

export const lineIncome = (l: PayLine): number =>
  round2(nonNeg(l.base) + nonNeg(l.overtime) + nonNeg(l.otherIncome));

export const lineDeduct = (l: PayLine): number =>
  round2(nonNeg(l.sso) + nonNeg(l.wht) + nonNeg(l.otherDeduct));

/** ยอดจ่ายสุทธิ — สูตรเดียวกับคอลัมน์ net ที่ฐานข้อมูลคิดเอง (db/041_plus.sql) */
export const lineNet = (l: PayLine): number => round2(lineIncome(l) - lineDeduct(l));

/** ค่าเสนอของบรรทัดใหม่จากทะเบียนพนักงาน */
export function suggestLine(
  emp: { baseSalary: number; ssoEnabled: boolean; whtRate: number }, period?: string | null,
): PayLine {
  const base = round2(nonNeg(emp.baseSalary));
  return {
    base, overtime: 0, otherIncome: 0,
    sso: ssoOf(base, emp.ssoEnabled, period),
    wht: whtOf(base, emp.whtRate),
    otherDeduct: 0,
  };
}

export interface PayTotals {
  income: number; sso: number; wht: number; otherDeduct: number; net: number;
}

export function payTotals(lines: readonly PayLine[]): PayTotals {
  const sum = (f: (l: PayLine) => number) => round2(lines.reduce((s, l) => s + nonNeg(f(l)), 0));
  return {
    income: round2(lines.reduce((s, l) => s + lineIncome(l), 0)),
    sso: sum((l) => l.sso),
    wht: sum((l) => l.wht),
    otherDeduct: sum((l) => l.otherDeduct),
    net: round2(lines.reduce((s, l) => s + lineNet(l), 0)),
  };
}

/** ตรวจบรรทัดก่อนบันทึก — ยอดหักมากกว่าเงินได้คือกรอกผิดช่องแทบทุกครั้ง */
export function payLineProblem(l: PayLine, name: string): string | null {
  for (const v of [l.base, l.overtime, l.otherIncome, l.sso, l.wht, l.otherDeduct]) {
    if (!Number.isFinite(v) || v < 0) return `ยอดของ ${name} ต้องเป็นตัวเลขที่ไม่ติดลบ`;
  }
  if (lineNet(l) < 0) return `ยอดหักของ ${name} มากกว่าเงินได้ — ตรวจช่องประกันสังคม ภาษี และหักอื่น`;
  return null;
}

/** 'YYYY-MM' ค.ศ. ที่ถูกรูปแบบ */
export const isPeriod = (v: string): boolean => /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(v);

/** วันสุดท้ายของงวด — วันจ่ายเงินเดือนตั้งต้น */
export function periodEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${period}-${String(last).padStart(2, '0')}`;
}

export const EMP_TYPES = [
  { key: 'full', label: 'ประจำ' },
  { key: 'probation', label: 'ทดลองงาน' },
  { key: 'temp', label: 'ชั่วคราว / รายวัน' },
] as const;

export type EmpType = (typeof EMP_TYPES)[number]['key'];

export const empTypeLabel = (k: string): string =>
  EMP_TYPES.find((t) => t.key === k)?.label ?? k;
