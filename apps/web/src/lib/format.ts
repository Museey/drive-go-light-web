/** ตัวช่วยจัดรูปแบบสำหรับแสดงผล — ใช้ได้ทั้งฝั่ง server และ client */

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * วันที่แบบไทย จากสตริง 'YYYY-MM-DD'
 * แยกสตริงเอง ไม่สร้าง Date เพื่อไม่ให้เขตเวลาเลื่อนวัน
 */
export function thDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${TH_ABBR[m - 1]} ${y + 543}`;
}

export function thDateLong(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

export const baht = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const KIND_LABEL: Record<string, string> = {
  QT: 'ใบเสนอราคา',
  IV: 'ใบส่งมอบงาน / ใบแจ้งหนี้',
  IVT: 'ใบส่งมอบงาน / ใบกำกับภาษี',
  RC: 'ใบเสร็จรับเงิน',
  PO: 'ใบซื้อ',
  EX: 'ค่าใช้จ่าย',
};

export const KIND_SHORT: Record<string, string> = {
  QT: 'ใบเสนอราคา', IV: 'ใบส่งมอบ', IVT: 'ใบส่งมอบ + VAT', RC: 'ใบเสร็จ', PO: 'ใบซื้อ', EX: 'ค่าใช้จ่าย',
};

export const VAT_MODE_LABEL: Record<string, string> = {
  none: 'ไม่คิดภาษีมูลค่าเพิ่ม',
  ex: 'ราคายังไม่รวมภาษีมูลค่าเพิ่ม',
  in: 'ราคารวมภาษีมูลค่าเพิ่มแล้ว',
};

/** สถานะการชำระเงิน — ใช้ค่าความคลาดเคลื่อนครึ่งสตางค์แบบเดียวกับ core */
export function payLabel(outstanding: number, paid: number): { text: string; tone: 'ok' | 'warn' | 'due' } {
  if (outstanding <= 0.004) return { text: 'ชำระแล้ว', tone: 'ok' };
  if (paid > 0.004) return { text: 'ชำระบางส่วน', tone: 'warn' };
  return { text: 'ค้างชำระ', tone: 'due' };
}

/** ชื่องวดภาษีแบบไทย จากคีย์ 'YYYY-MM' */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
}
