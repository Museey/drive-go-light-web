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
