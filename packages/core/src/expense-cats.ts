import type { ExpenseCatKey } from './types.js';

export interface ExpenseCat {
  key: ExpenseCatKey;
  label: string;
  /** อัตราภาษีหัก ณ ที่จ่ายที่แนะนำ (%) — ผู้ใช้แก้ได้ในเอกสาร */
  wht: number;
  desc: string;
}

/** หมวดค่าใช้จ่าย — ตรงกับ EXPENSE_CATS ของเดิม ลำดับมีผลกับหน้าจอ */
export const EXPENSE_CATS: readonly ExpenseCat[] = [
  { key: 'rent',    label: 'ค่าเช่า',                    wht: 5, desc: 'ค่าเช่าอาคาร ที่ดิน หรือลานจอดรถ' },
  { key: 'utility', label: 'ค่าน้ำค่าไฟ',                wht: 0, desc: 'ค่าไฟฟ้า ค่าน้ำประปา' },
  { key: 'salary',  label: 'เงินเดือนพนักงาน',           wht: 0, desc: 'เงินเดือน ค่าแรงรายวัน โบนัส' },
  { key: 'telecom', label: 'ค่าโทรศัพท์ / อินเทอร์เน็ต', wht: 0, desc: 'ค่าบริการโทรศัพท์และอินเทอร์เน็ต' },
  { key: 'asset',   label: 'ซื้อสินทรัพย์',              wht: 0, desc: 'เครื่องมือ อุปกรณ์ และทรัพย์สินถาวรของอู่' },
  { key: 'other',   label: 'ค่าใช้จ่ายอื่น ๆ',           wht: 3, desc: 'ค่าซ่อมบำรุง ค่าบริการ ค่าขนส่ง และอื่น ๆ' },
] as const;

const byKey = new Map(EXPENSE_CATS.map((c) => [c.key, c]));

export const catName = (k: string): string => byKey.get(k as ExpenseCatKey)?.label ?? 'ไม่ระบุหมวด';
export const catWht  = (k: string): number => byKey.get(k as ExpenseCatKey)?.wht ?? 0;
export const catDesc = (k: string): string => byKey.get(k as ExpenseCatKey)?.desc ?? '';

/** หมวดที่ถือเป็นค่าใช้จ่ายดำเนินงาน — ซื้อสินทรัพย์ไม่นับ (ไปเป็นค่าเสื่อมราคาแทน) */
export const OPS_CATS = EXPENSE_CATS.filter((c) => c.key !== 'asset');
