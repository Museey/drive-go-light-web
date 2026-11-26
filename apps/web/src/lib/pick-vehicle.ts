/**
 * รถคันที่ควรขึ้นบนเอกสารเมื่อเลือกลูกค้าจากผลค้นหา
 *
 * ช่อง "กรอกทะเบียน" ค้นลูกค้าจากทะเบียนรถ — เดิมเลือกลูกค้าแล้วขึ้น**รถคันแรก**ของลูกค้าเสมอ
 * ลูกค้าที่มีสามคัน ค้นทะเบียนคันที่สามก็ได้คันแรกขึ้นใบ ถ้าไม่สังเกตใบจะออกผิดคัน
 * และประวัติซ่อมไปอยู่กับรถอีกคัน (ตรวจ 24 พ.ย. 2569)
 *
 * เทียบแบบเดียวกับที่เซิร์ฟเวอร์ค้น (lib/sales.ts searchCustomers): คำค้นเป็นส่วนหนึ่งของ
 * ทะเบียนหมวดหรือเลข — และยอมให้พิมพ์ติดกันหรือมีขีด/เว้นวรรคต่างจากที่บันทึกไว้
 */

interface VehicleLike {
  id: string;
  data: Record<string, string>;
}

const squash = (s: string | undefined | null): string =>
  (s ?? '').replace(/[\s\-.]/g, '').toLowerCase();

/** ทะเบียนของรถคันนี้ตรงกับคำค้นไหม — คำค้นว่างไม่ตรงกับคันไหน */
export function plateMatches(v: VehicleLike, plateQuery: string): boolean {
  const q = squash(plateQuery);
  if (!q) return false;
  const a = squash(v.data.plateA);
  const b = squash(v.data.plateB);
  return (a + b).includes(q) || (b !== '' && b.includes(q)) || (a !== '' && a.includes(q));
}

export function vehicleForPlate<V extends VehicleLike>(vehicles: V[], plateQuery: string): V | null {
  if (vehicles.length === 0) return null;
  return vehicles.find((v) => plateMatches(v, plateQuery)) ?? vehicles[0]!;
}

/** เรียงรถของลูกค้าให้คันที่ทะเบียนตรงคำค้นขึ้นก่อน — ผลค้นหาแสดงได้ไม่กี่คัน คันที่ค้นต้องไม่ตกไปอยู่ใน "+N คัน" */
export function vehiclesByMatch<V extends VehicleLike>(vehicles: V[], plateQuery: string): V[] {
  return [...vehicles].sort((x, y) => Number(plateMatches(y, plateQuery)) - Number(plateMatches(x, plateQuery)));
}
