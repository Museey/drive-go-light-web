/**
 * ความครบถ้วนของข้อมูลบนเอกสารขาย
 *
 * พอร์ตจาก docMissing() ของรุ่น 3.6 — ตรวจว่าเอกสารมีข้อมูลพอจะใช้ได้จริงหรือยัง
 * ใบกำกับภาษีที่ไม่มีเลขประจำตัวผู้เสียภาษีหรือที่อยู่ของผู้ซื้อ สรรพากรไม่รับ
 * และลูกค้าเอาไปใช้เป็นภาษีซื้อไม่ได้ ต้องออกใหม่ทั้งใบ
 *
 * ตรวจตอนแสดงผล ไม่ใช่ตอนบันทึก เพราะอู่ต้องออกใบด่วนหน้าเคาน์เตอร์ได้ก่อน
 * แล้วค่อยตามเก็บข้อมูลทีหลัง — เป็นการเตือน ไม่ใช่การห้าม
 */

export interface DocPartyCheck {
  kind: string;
  /** ผูกกับทะเบียนผู้ติดต่อแล้วหรือยัง */
  partyId: string | null;
  partyName: string;
  partyType: string;
  partyTaxId: string;
  partyAddrText: string;
  /** ที่อยู่แบบแยกช่อง ใช้เมื่อไม่ได้พิมพ์ที่อยู่เอง */
  partyAddr?: Record<string, unknown> | null;
}

const filled = (v: unknown): boolean => String(v ?? '').trim() !== '';

/** มีที่อยู่หรือไม่ — พิมพ์เองก็ได้ กรอกแยกช่องก็ได้ */
export function hasAddress(d: Pick<DocPartyCheck, 'partyAddrText' | 'partyAddr'>): boolean {
  if (filled(d.partyAddrText)) return true;
  const a = d.partyAddr ?? {};
  return Object.values(a).some(filled);
}

/**
 * รายการสิ่งที่ยังขาดบนเอกสารหนึ่งใบ — ว่างเปล่าคือครบ
 * ใบเสนอราคาตรวจหลวมกว่า เพราะยังไม่ใช่เอกสารทางภาษี
 */
export function docMissing(d: DocPartyCheck): string[] {
  const m: string[] = [];

  if (!d.partyId) m.push('ยังไม่ได้ผูกกับทะเบียนลูกค้า');
  if (!filled(d.partyName)) m.push('ไม่มีชื่อลูกค้า');

  /* นิติบุคคลต้องมีเลขผู้เสียภาษีเสมอ ส่วนบุคคลธรรมดาต้องมีเมื่อออกใบกำกับภาษี */
  if (!filled(d.partyTaxId) && (d.partyType === 'company' || d.kind === 'IVT')) {
    m.push('ไม่มีเลขประจำตัวผู้เสียภาษี');
  }
  if (!hasAddress(d)) m.push('ไม่มีที่อยู่');

  return m;
}
