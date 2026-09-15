/**
 * กติกาที่ตั้งใจให้ต่างจากโปรแกรมเดิม — ขั้นต่ำหัก ณ ที่จ่ายของเอกสารขาย
 *
 * โปรแกรมเดิมหัก ณ ที่จ่ายทุกยอด ผู้ใช้กำหนด (16 ก.ย. 2569) ว่าค่าบริการต่ำกว่า 1,000 บาทไม่หัก
 * เทสต์เทียบของเดิมจึงใช้ผลของเดิม **แล้วใส่กติกานี้ทับให้เห็นชัด ๆ ที่นี่ที่เดียว**
 * ไม่ใช่เลิกเทียบ — ช่องอื่นทุกช่องยังต้องเท่ากับของเดิมทุกสตางค์
 *
 * ตัวเลข 1,000 เขียนซ้ำตรงนี้โดยตั้งใจ ไม่ import จาก src
 * ถ้าใครเปลี่ยนค่าคงที่ในโค้ดโดยไม่ตั้งใจ เทสต์เทียบของเดิมต้องแดง
 */
const MIN_BASE = 1000;

type LegacyRec = { whtBase: number; wht: number; grand: number; payable: number } & Record<string, unknown>;

/** ผล recTotals ของโปรแกรมเดิม หลังใส่ขั้นต่ำหัก ณ ที่จ่าย */
export function legacyRecWithMinimum(legacy: any, doc: unknown): LegacyRec {
  const t = legacy.recTotals(doc) as LegacyRec;
  return t.whtBase < MIN_BASE ? { ...t, wht: 0, payable: t.grand } : t;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** ยอดตั้งลูกหนี้ / ยอดค้าง ของโปรแกรมเดิม หลังใส่ขั้นต่ำ (ของเดิม arTotal = payable · arDue = arTotal − ที่จ่ายแล้ว) */
export function legacyArWithMinimum(legacy: any, doc: unknown): { total: number; due: number } {
  const total = legacyRecWithMinimum(legacy, doc).payable;
  return { total, due: round2(total - legacy.paidOf(doc)) };
}
