import type { VatMode } from '@drivegolight/core';

export type SalesKind = 'QT' | 'IV' | 'IVT' | 'RC';

/** ข้อมูลที่ใช้ตัดสินว่าเอกสารขายใบหนึ่งคิด VAT แบบไหนได้ */
export interface VatContext {
  /** ร้านจดภาษีมูลค่าเพิ่มหรือไม่ (tenants.vat_registered) — ไม่ส่ง = จด ตามพฤติกรรมเดิม */
  registered?: boolean;
  /** โหมดภาษีที่บันทึกไว้แล้วของใบที่กำลังแก้ — ใบใหม่ไม่ส่ง */
  saved?: VatMode | null;
  /** ชนิดของใบต้นทาง (ใบที่ใบนี้ออกต่อมา) */
  parentKind?: SalesKind | null;
}

/** ลำดับเดียวกับช่องเลือกบนฟอร์ม */
const ALL_MODES: VatMode[] = ['none', 'ex', 'in'];

/**
 * โหมดภาษีที่เอกสารขายใบหนึ่งเลือกได้ — ตัวแรกคือค่าที่ใช้แทนเมื่อค่าที่เลือกมาใช้ไม่ได้
 *
 * ร้านที่จด VAT (พฤติกรรมเดิม ตรงกับ enforceVat() ของโปรแกรมเดิม)
 *   ใบส่งมอบแบบไม่มีใบกำกับภาษี (IV) ห้ามมี VAT · ใบกำกับภาษี (IVT) ต้องมี VAT เสมอ
 *   ใบเสนอราคาและใบเสร็จเลือกเอง
 *
 * ร้านที่ไม่จด VAT (ผู้ใช้กำหนด 2 ต.ค. 2569)
 *   ใบใหม่ไม่คิด VAT ทุกใบ — ยกเว้นใบเสร็จที่รับเงินตามใบกำกับภาษีที่ออกไว้ก่อนเปลี่ยน
 *   ซึ่งต้องคิดตามใบกำกับ ไม่งั้นยอดที่เก็บไม่ตรงกับหนี้
 *   ใบเก่าที่มี VAT เปิดแก้แล้ว**ยอดไม่เปลี่ยนเอง** — คงไว้หรือเอาออกได้ แต่เพิ่ม VAT ไม่ได้
 *   ส่วนการออกใบกำกับภาษีใบใหม่ถูกห้ามที่ canIssueKind() — ใบเก่าที่มีอยู่แล้วต้องมี VAT ตามสคีมา
 *
 * ฟอร์มกับเซิร์ฟเวอร์ใช้ตัวนี้ตัวเดียว ตัวเลือกบนจอจึงตรงกับที่บันทึกได้จริงเสมอ
 * สคีมามี CHECK ของ IV/IVT บังคับอีกชั้น ถ้าตรงนี้พลาดฐานข้อมูลจะปฏิเสธ
 */
export function vatChoices(kind: SalesKind, ctx: VatContext = {}): VatMode[] {
  if (kind === 'IV') return ['none'];
  if (kind === 'IVT') return ['ex'];
  if (ctx.registered !== false) return ALL_MODES;
  if (kind === 'RC' && ctx.parentKind === 'IVT') return [ctx.saved ?? 'ex'];
  if (ctx.saved && ctx.saved !== 'none') return [ctx.saved, 'none'];
  return ['none'];
}

/** โหมดภาษีที่ใช้จริง — ค่าที่เลือกมาถ้าใช้ได้ ไม่งั้นตัวแรกของ vatChoices() */
export function forcedVatMode(kind: SalesKind, chosen: VatMode, ctx: VatContext = {}): VatMode {
  const choices = vatChoices(kind, ctx);
  return choices.includes(chosen) ? chosen : choices[0]!;
}

/** โหมดภาษีตั้งต้นของใบใหม่ — ร้านที่จด VAT เริ่มที่ "ราคายังไม่รวมภาษี" ตามเดิม */
export function newDocVatMode(kind: SalesKind, registered = true): VatMode {
  return forcedVatMode(kind, registered ? 'ex' : 'none', { registered });
}

/** ร้านนี้ออกเอกสารชนิดนี้ใบใหม่ได้ไหม — ผู้ไม่ได้จด VAT ออกใบกำกับภาษีไม่ได้ตามกฎหมาย */
export function canIssueKind(kind: SalesKind, registered = true): boolean {
  return registered || kind !== 'IVT';
}

export const NO_TAX_INVOICE =
  'ร้านตั้งค่าเป็นไม่จดภาษีมูลค่าเพิ่ม — ออกใบกำกับภาษีไม่ได้ ใช้ใบส่งมอบ (ไม่มี VAT) แทน';

/** ใบส่งมอบที่เสนอให้ออกต่อจากใบเสนอราคา — ร้านที่ไม่จด VAT ไม่มีใบกำกับภาษีให้เลือก */
export function invoiceKind(registered = true): SalesKind {
  return registered ? 'IVT' : 'IV';
}

/** เอกสารที่ออกต่อได้จากเอกสารชนิดหนึ่ง */
export function nextKinds(kind: SalesKind, registered = true): SalesKind[] {
  if (kind === 'QT') return (['IVT', 'IV', 'RC'] as SalesKind[]).filter((k) => canIssueKind(k, registered));
  if (kind === 'IV' || kind === 'IVT') return ['RC'];
  return [];
}

/**
 * ชื่อลูกค้าตั้งต้นของใบเสร็จขายหน้าร้าน
 *
 * ระบบบังคับให้ทุกใบมีชื่อลูกค้า ซึ่งถูกแล้วสำหรับงานซ่อมที่ต้องตามเก็บเงิน
 * แต่ลูกค้าที่เดินเข้ามาซื้อของชิ้นเดียวแล้วจ่ายสดไม่มีชื่อให้กรอก
 * การบังคับให้คิดชื่อก่อนถึงจะกดบันทึกได้ คือการขวางงานที่ไม่มีอะไรต้องตาม
 *
 * แก้ทับได้ทุกเมื่อ — และใบกำกับภาษียังบังคับเลขประจำตัวผู้เสียภาษีเหมือนเดิม
 */
export const WALK_IN_CUSTOMER = 'ลูกค้าเงินสด';
