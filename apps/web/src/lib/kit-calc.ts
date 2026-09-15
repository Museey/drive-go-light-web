/**
 * ชุดอะไหล่ซ่อมบำรุง — ส่วนคำนวณและตรวจข้อมูลที่ไม่แตะฐานข้อมูล
 *
 * แยกจาก kits.ts เพราะ kits.ts import auth (server-only) — ฟอร์มฝั่ง client
 * และเทสต์หน่วยต้องใช้สูตรตัวเดียวกับที่บันทึกจริง ถ้าคัดลอกไปวางจะเพี้ยนกันเงียบ ๆ
 */
export interface KitItemInput { productId: string | null; name: string; unit: string; qty: number; unitCost: number }
export interface KitInput {
  id?: string | null; code: string; name: string;
  price: number; priceB: number; priceC: number; note: string; items: KitItemInput[];
}

/** ต้นทุนรวม = Σ จำนวน × ทุนต่อหน่วย ปัด 2 ตำแหน่ง */
export function kitCost(items: { qty: number; unitCost: number }[]): number {
  return Math.round(items.reduce((a, it) => a + it.qty * it.unitCost, 0) * 100) / 100;
}

/** ชื่อบรรทัดบนเอกสาร: ชุดอะไหล่ซ่อมบำรุง <ชื่อชุด> (ชื่อรายการทุกตัว) */
export function kitLineName(name: string, items: { name: string }[]): string {
  return `ชุดอะไหล่ซ่อมบำรุง ${name} (${items.map((i) => i.name).filter(Boolean).join(', ')})`;
}

/** บรรทัดที่ไม่มีชื่อถือว่าเป็นแถวว่างที่ผู้ใช้ยังไม่ได้กรอก — ไม่บันทึก */
export function filledItems(items: KitItemInput[]): KitItemInput[] {
  return items.filter((it) => it.name.trim());
}

/** ตรวจก่อนบันทึก — คืนช่องที่ผิดกับข้อความ หรือ null ถ้าผ่าน */
export function kitProblem(input: KitInput): { field: string; error: string } | null {
  if (!input.code.trim()) return { field: 'code', error: 'ใส่รหัสชุด' };
  if (!input.name.trim()) return { field: 'name', error: 'ใส่ชื่อชุด' };
  for (const [field, v, label] of [['price', input.price, 'A'], ['priceB', input.priceB, 'B'], ['priceC', input.priceC, 'C']] as const) {
    if (!Number.isFinite(v) || v < 0) return { field, error: `ราคา ${label} ต้องไม่ติดลบ` };
  }
  const items = filledItems(input.items);
  if (items.length === 0) return { field: 'items', error: 'ชุดต้องมีรายการอย่างน้อยหนึ่งรายการ' };
  const i = input.items.findIndex((it) => it.name.trim() && !(Number.isFinite(it.qty) && it.qty > 0));
  if (i >= 0) return { field: `it${i}_qty`, error: `บรรทัดที่ ${i + 1} จำนวนต้องมากกว่า 0` };
  const j = input.items.findIndex((it) => it.name.trim() && !(Number.isFinite(it.unitCost) && it.unitCost >= 0));
  if (j >= 0) return { field: `it${j}_cost`, error: `บรรทัดที่ ${j + 1} ทุนต่อหน่วยต้องไม่ติดลบ` };
  return null;
}
