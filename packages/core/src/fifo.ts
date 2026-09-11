import { num } from './num.js';
import type { Numeric } from './types.js';

/**
 * ต้นทุนแบบเข้าก่อนออกก่อน
 *
 * พอร์ตจาก lotConsume / lotAdd / lotReturn / lotValue ของรุ่น 6.4
 * ผลลัพธ์ต้องตรงกันทุกสตางค์ — มีชุดทดสอบ differential เทียบกับโค้ดเดิมโดยตรง
 *
 * ต่างจากต้นฉบับตรงที่ตรงนี้ไม่แก้ค่าที่รับเข้ามา คืนล็อตชุดใหม่กลับไปแทน
 * เพราะฝั่งเว็บเก็บล็อตเป็นบัญชีเดินสะพัดที่เพิ่มอย่างเดียว ไม่ได้เก็บอาเรย์ที่เขียนทับตัวเอง
 * (ดูเหตุผลใน PLAN-6.4.md ช่วงที่ 1) การคำนวณจึงต้องไม่มีผลข้างเคียง
 */

export interface Lot {
  qty: number;
  unitCost: number;
  /** วันที่ของรับเข้าครั้งนั้น ใช้แสดงผลอย่างเดียว ไม่ได้ใช้เรียงตอนตัด */
  on: string;
  /**
   * วันหมดอายุของล็อตนี้ — ว่าง = ไม่มีวันหมดอายุ (อะไหล่ทั่วไป)
   *
   * ล็อตที่มีวันหมดอายุถูกแทรกเข้าคิวตามวันที่หมด ไม่ใช่ต่อท้ายตามลำดับที่รับเข้า
   * จึงถูกตัดออกก่อน — หมดอายุก่อนออกก่อน (FEFO) ดู fifoAdd()
   */
  expiresOn?: string | null;
}

/** เศษที่เล็กกว่านี้ถือว่าล็อตหมด — ค่าเดียวกับต้นฉบับ กันเศษทศนิยมค้างเป็นล็อตผี */
const EMPTY = 1e-9;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * ตัดสต๊อกตามลำดับเข้าก่อนออกก่อน
 *
 * ถ้าล็อตหมดก่อนตัดครบ ส่วนที่เหลือคิดที่ `fallbackCost` (ต้นทุนล่าสุดของสินค้า)
 * ตามต้นฉบับ — เกิดได้เมื่อยอดคงเหลือติดลบ ซึ่งโปรแกรมเดิมยอมให้เกิด
 * เพราะหน้าเคาน์เตอร์ขายของที่ยังไม่ได้คีย์รับเข้าเป็นเรื่องปกติ
 *
 * ปัดเศษครั้งเดียวตอนท้าย ไม่ปัดระหว่างทาง — ปัดทีละล็อตแล้วผลรวมจะเพี้ยน
 */
export function fifoConsume(
  lots: readonly Lot[],
  qty: Numeric,
  fallbackCost: Numeric = 0,
): { cost: number; lots: Lot[] } {
  let need = num(qty);
  let cost = 0;
  const rest = lots.map((l) => ({ ...l }));

  while (need > 0 && rest.length) {
    const lot = rest[0]!;
    const take = Math.min(num(lot.qty), need);
    cost += take * num(lot.unitCost);
    lot.qty = num(lot.qty) - take;
    need -= take;
    if (lot.qty <= EMPTY) rest.shift();
  }

  if (need > 0) cost += need * num(fallbackCost);

  return { cost: round2(cost), lots: rest };
}

/**
 * รับของเข้าเป็นล็อตใหม่
 *
 * **ล็อตที่ไม่มีวันหมดอายุต่อท้ายแถวเหมือนเดิมทุกประการ** — อะไหล่ทั่วไปยังเป็น
 * เข้าก่อนออกก่อน ผลลัพธ์ต้องตรงกับก่อนมีเรื่องวันหมดอายุทุกสตางค์
 *
 * **ล็อตที่มีวันหมดอายุแทรกเข้าไปตามวันที่หมด** เรียงจากใกล้หมดไปไกล
 * และอยู่หน้าล็อตที่ไม่มีวันหมดอายุเสมอ ผลคือของที่ใกล้หมดอายุถูกตัดออกก่อน
 *
 * ทำไมต้องแทรกตอนรับเข้า ไม่ใช่เรียงทีเดียวตอนอ่าน — เพราะการเล่นบัญชีซ้ำ
 * ต้องไล่ตามเวลาจริง การตัดของวันที่ 5 ต้องไม่เห็นของที่รับเข้าวันที่ 10
 * ถ้าเรียงทั้งกองก่อนแล้วค่อยเล่น ลำดับเวลาจะพัง
 *
 * แทรกแบบเสถียร — ล็อตที่หมดอายุวันเดียวกันคงลำดับเข้าก่อนออกก่อนไว้
 */
export function fifoAdd(
  lots: readonly Lot[],
  qty: Numeric,
  unitCost: Numeric,
  on: string,
  expiresOn?: string | null,
): Lot[] {
  const q = num(qty);
  const copy = lots.map((l) => ({ ...l }));
  if (q <= 0) return copy;

  /* ไม่ใส่ฟิลด์เลยถ้าไม่มีวันหมดอายุ — ล็อตของอะไหล่ทั่วไปจึงมีรูปร่างเหมือนเดิม
     ทุกประการ เทียบกับก่อนมีเรื่องนี้ได้ตรง ๆ ไม่ใช่แค่ "ค่าเท่ากัน" */
  if (!expiresOn) return [...copy, { qty: q, unitCost: num(unitCost), on }];

  const lot: Lot = { qty: q, unitCost: num(unitCost), on, expiresOn };

  /* หาตำแหน่งแรกที่หมดอายุ "หลัง" ล็อตใหม่ หรือไม่มีวันหมดอายุเลย */
  const at = copy.findIndex((l) => !l.expiresOn || l.expiresOn > expiresOn);
  if (at < 0) return [...copy, lot];
  return [...copy.slice(0, at), lot, ...copy.slice(at)];
}

/**
 * คืนของกลับเข้าคลังด้วยต้นทุนที่เคยตัดไป
 *
 * เข้า**หน้าแถว** ไม่ใช่ท้ายแถว ตามต้นฉบับ — ของที่เพิ่งคืนมาควรถูกตัดออกก่อน
 * ไม่งั้นการยกเลิกใบเสร็จแล้วออกใหม่จะได้ต้นทุนคนละตัวกับครั้งแรก
 */
export function fifoReturn(
  lots: readonly Lot[],
  qty: Numeric,
  totalCost: Numeric,
  on: string,
  fallbackCost: Numeric = 0,
  expiresOn?: string | null,
): Lot[] {
  const q = num(qty);
  if (q <= 0) return lots.map((l) => ({ ...l }));

  const total = num(totalCost);
  const unitCost = total > 0 ? total / q : num(fallbackCost);

  /* ของคืนเข้าหน้าแถวเสมอ ไม่ว่าจะมีวันหมดอายุหรือไม่ — ต้องถูกตัดออกก่อน
     เพื่อให้ยกเลิกใบเสร็จแล้วออกใหม่ได้ต้นทุนเท่าเดิม กติกานี้สำคัญกว่า FEFO */
  const back: Lot = expiresOn
    ? { qty: q, unitCost, on, expiresOn }
    : { qty: q, unitCost, on };
  return [back, ...lots.map((l) => ({ ...l }))];
}

/** มูลค่าของล็อตที่เหลือตามต้นทุนของแต่ละล็อต */
export const fifoValue = (lots: readonly Lot[]): number =>
  round2(lots.reduce((s, l) => s + num(l.qty) * num(l.unitCost), 0));

/** จำนวนคงเหลือรวมทุกล็อต */
export const fifoQty = (lots: readonly Lot[]): number =>
  lots.reduce((s, l) => s + num(l.qty), 0);
