/**
 * ข้อมูลในไฟล์สำรองที่ระบบใหม่ยังรับไม่ได้
 *
 * รุ่น 6.4 เพิ่มกลุ่มข้อมูลที่รุ่นก่อนไม่มี — ใบวางบิล ใบเคลม ใบตรวจนับ
 * และประวัติการเคลื่อนไหวสต๊อกแบบละเอียด ตัวนำเข้าอ่านคีย์ที่รู้จักเท่านั้น
 * ของที่ไม่รู้จักจึงถูกข้ามไปโดยไม่มีใครรู้
 *
 * ไฟล์นี้มีไว้ให้ "ข้าม" กลายเป็น "บอกก่อนว่าจะข้าม" — ผู้ใช้ตัดสินใจเองได้ว่า
 * จะรอให้ระบบรองรับก่อน หรือยอมรับว่าส่วนนั้นจะไม่ตามมา
 *
 * เมื่อรองรับกลุ่มไหนแล้ว ให้ลบออกจาก UNSUPPORTED แล้วเทสต์จะบอกเองว่าลืมอะไร
 */

export type LossKind = 'lost' | 'partial';

export interface UnsupportedGroup {
  key: string;
  label: string;
  count: number;
  kind: LossKind;
  /** อธิบายให้ผู้ใช้รู้ว่าเสียอะไรไปจริง ๆ */
  note: string;
}

interface Spec {
  key: string;
  label: string;
  kind: LossKind;
  note: string;
}

/**
 * กลุ่มที่ยังรองรับไม่ได้ เรียงตามความร้ายแรง
 *
 * `lost` คือหายทั้งกลุ่ม ส่วน `partial` คือยอดสุดท้ายยังถูก แต่รายละเอียดหาย
 * แยกกันเพราะสองอย่างนี้ผู้ใช้ต้องตัดสินใจไม่เหมือนกัน
 */
const UNSUPPORTED: Spec[] = [
  {
    key: 'billnotes',
    label: 'ใบวางบิล',
    kind: 'lost',
    note: 'ใบแจ้งหนี้ที่อยู่ในใบวางบิลยังเข้าระบบครบ แต่ตัวใบวางบิลและการจับกลุ่มจะไม่ตามมา',
  },
  {
    key: 'claims',
    label: 'ใบเคลมสินค้า',
    kind: 'lost',
    note: 'ทั้งเคลมฝั่งลูกค้าและฝั่งผู้ขาย รวมถึงประวัติการตัดสต๊อกจากการเคลม',
  },
  {
    key: 'counts',
    label: 'ใบตรวจนับสต๊อก',
    kind: 'lost',
    note: 'ยอดคงเหลือปัจจุบันยังถูกต้อง แต่ประวัติว่าเคยนับเมื่อไหร่และพบส่วนต่างเท่าไรจะหาย',
  },
  {
    key: 'moves',
    label: 'ประวัติการเคลื่อนไหวสต๊อก',
    kind: 'partial',
    note: 'ยอดคงเหลือของสินค้าทุกตัวยังถูกต้อง เพราะระบบลงเป็นยอดยกมาให้ '
        + 'แต่รายการย้อนหลังว่าเข้าออกเมื่อไหร่ด้วยเหตุผลอะไรจะไม่ตามมา',
  },
];

/** นับจำนวนแถวของกลุ่มที่ยังรองรับไม่ได้ — คืนเฉพาะกลุ่มที่มีข้อมูลจริง */
export function unsupportedCollections(d: unknown): UnsupportedGroup[] {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return [];
  const b = d as Record<string, unknown>;

  const found: UnsupportedGroup[] = [];
  for (const spec of UNSUPPORTED) {
    const v = b[spec.key];
    if (!Array.isArray(v) || v.length === 0) continue;
    found.push({ ...spec, count: v.length });
  }

  /* หายทั้งกลุ่มขึ้นก่อนเสมอ ผู้ใช้จะได้เห็นเรื่องหนักที่สุดบรรทัดแรก */
  return found.sort((a, b2) => (a.kind === b2.kind ? 0 : a.kind === 'lost' ? -1 : 1));
}

/** true เมื่อมีข้อมูลที่จะหายไปทั้งกลุ่ม — ใช้ตัดสินว่าต้องให้ผู้ใช้ยืนยันเพิ่มหรือไม่ */
export const hasDataLoss = (groups: UnsupportedGroup[]): boolean =>
  groups.some((g) => g.kind === 'lost');

/** แปลงเป็นข้อความคำเตือนบรรทัดเดียวต่อกลุ่ม สำหรับต่อท้าย warnings ของตัวนำเข้า */
export function unsupportedWarnings(groups: UnsupportedGroup[]): string[] {
  return groups.map((g) =>
    g.kind === 'lost'
      ? `ไฟล์มี${g.label} ${g.count.toLocaleString('en-US')} รายการ ` +
        `ซึ่งระบบยังรองรับไม่ได้ — จะไม่ถูกนำเข้า (${g.note})`
      : `ไฟล์มี${g.label} ${g.count.toLocaleString('en-US')} รายการ ` +
        `ซึ่งระบบยังรองรับไม่ได้ — ${g.note}`,
  );
}
