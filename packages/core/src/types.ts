/**
 * ชนิดข้อมูลของเอกสาร — ตรงกับโครงสร้างเดิมใน drivegolight.html
 *
 * ตัวเลขรับได้ทั้ง number และ string เพราะข้อมูลเดิมมาจากช่องกรอกในหน้าเว็บ
 * ซึ่งเก็บเป็นข้อความ (เช่น "1,250") — `num()` เป็นตัวจัดการให้
 */
export type Numeric = number | string | null | undefined;

export type VatMode = 'none' | 'ex' | 'in';

/** ชนิดเอกสารขาย — ตรงกับ SALES_KINDS ของเดิม */
export type SalesKind = 'QT' | 'IV' | 'IVT' | 'RC';

export type ExpenseCatKey = 'rent' | 'utility' | 'salary' | 'telecom' | 'asset' | 'other';

/**
 * ค่าตั้งค่าร้านที่สูตรต้องใช้
 *
 * ของเดิมอ่าน `DB.shop.vatRate` จาก global ตรง ๆ — ตรงนี้ต้องส่งเข้ามาเสมอ
 * เพราะเอกสารที่ออกไปแล้วต้องคำนวณด้วยอัตราภาษี ณ วันที่ออก ไม่ใช่อัตราปัจจุบัน
 */
export interface ShopContext {
  /** อัตราภาษีมูลค่าเพิ่มเป็นเปอร์เซ็นต์ เช่น 7 */
  vatRate: Numeric;
}

/** บรรทัดรายการในเอกสาร */
export interface DocItem {
  qty: Numeric;
  price: Numeric;
  /** true = ค่าแรง/ค่าบริการ ใช้เป็นฐานภาษีหัก ณ ที่จ่าย */
  svc?: boolean;
  /** เอกสารรุ่นก่อนไม่มี svc ใช้ code === 'LAB' แทน */
  code?: string;
  name?: string;
  unit?: string;
  oem?: string;
  pid?: string | null;
}

/** ส่วนที่ทุกเอกสารมีเหมือนกัน — พอสำหรับคำนวณยอด */
export interface TotalsInput {
  items: DocItem[];
  discount?: Numeric;
  vatMode?: VatMode;
}

export interface PaymentEntry {
  amount: Numeric;
  date?: string;
  method?: string;
  ref?: string;
  /** true = ชำระพร้อมออกเอกสาร */
  atIssue?: boolean;
}

export interface PayableDoc extends TotalsInput {
  date: string;
  payments?: PaymentEntry[];
}

/** เอกสารขาย (ใบเสนอราคา / ใบส่งมอบ / ใบเสร็จ) */
export interface SalesDoc extends PayableDoc {
  kind?: SalesKind;
  /** อัตราภาษีหัก ณ ที่จ่ายเป็นเปอร์เซ็นต์ */
  whtRate?: Numeric;
  creditDays?: Numeric;
  /** ใบเสร็จที่ออกต่อจากใบส่งมอบ จะมีค่านี้ */
  invId?: string | null;
  pay?: {
    cash?: boolean;
    transfer?: boolean;
    card?: boolean;
    credit?: boolean;
    days?: Numeric;
    cashAmt?: Numeric;
    transferAmt?: Numeric;
    cardAmt?: Numeric;
    ref?: string;
    cardRef?: string;
    due?: string;
  };
}

/** ใบซื้อ */
export interface PurchaseDoc extends PayableDoc {
  terms?: 'cash' | 'credit';
  creditDays?: Numeric;
}

/** บันทึกค่าใช้จ่าย */
export interface ExpenseDoc extends PayableDoc {
  cat: ExpenseCatKey;
  whtRate?: Numeric;
  terms?: 'cash' | 'credit';
  creditDays?: Numeric;
}

/** ผลลัพธ์ของ totalsOf */
export interface Totals {
  /** ยอดรวมก่อนหักส่วนลด */
  sub: number;
  /** ส่วนลด */
  disc: number;
  /** ฐานหลังหักส่วนลด (ยังไม่แยก VAT) */
  base: number;
  /** มูลค่าก่อนภาษีมูลค่าเพิ่ม */
  net: number;
  /** ภาษีมูลค่าเพิ่ม */
  vat: number;
  /** ยอดรวมทั้งสิ้น */
  grand: number;
}

export interface SalesTotals extends Totals {
  /** ฐานคำนวณภาษีหัก ณ ที่จ่าย (เฉพาะค่าแรง) */
  whtBase: number;
  /** ภาษีหัก ณ ที่จ่าย */
  wht: number;
  /** ยอดที่ต้องรับ/จ่ายจริง = grand - wht */
  payable: number;
}

export interface BuyTotals extends Totals {
  wht: number;
  payable: number;
}

export type PayStatus = 'unpaid' | 'partial' | 'paid';

export interface VatMonth {
  /** 'YYYY-MM' */
  key: string;
  /** ภาษีขาย */
  out: number;
  /** ภาษีซื้อ */
  in: number;
  /** เครดิตยกมาจากเดือนก่อน */
  carryIn: number;
  /** ภาษีที่ต้องชำระเดือนนี้ */
  payable: number;
  /** เครดิตยกไปเดือนถัดไป */
  carryOut: number;
}
