import type { VatMode } from '@drivegolight/core';

export type SalesKind = 'QT' | 'IV' | 'IVT' | 'RC';

/**
 * โหมดภาษีถูกบังคับตามชนิดเอกสาร — ตรงกับ enforceVat() ของโปรแกรมเดิม
 *
 * ใบส่งมอบแบบไม่มีใบกำกับภาษี (IV) ห้ามมี VAT
 * ใบส่งมอบพร้อมใบกำกับภาษี (IVT) ต้องมี VAT เสมอ
 * สคีมามี CHECK บังคับอีกชั้น ถ้าตรงนี้พลาดฐานข้อมูลจะปฏิเสธ
 */
export function forcedVatMode(kind: SalesKind, chosen: VatMode): VatMode {
  if (kind === 'IV') return 'none';
  if (kind === 'IVT') return 'ex';
  return chosen;
}

/** เอกสารที่ออกต่อได้จากเอกสารชนิดหนึ่ง */
export function nextKinds(kind: SalesKind): SalesKind[] {
  if (kind === 'QT') return ['IVT', 'IV', 'RC'];
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
