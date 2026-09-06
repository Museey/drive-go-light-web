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

/**
 * วันที่และเวลาแบบไทย จาก timestamp เต็ม — ตรงกับ thDateTime() ของรุ่น 6.4
 *
 * ต่างจาก thDate() ตรงที่ต้องสร้าง Date จริงเพราะต้องอ่านเวลาด้วย
 * และตรึงเขตเวลาไว้ที่เวลาไทยเสมอ ไม่ใช่เขตเวลาของเครื่องที่เปิดดู —
 * เจ้าของอู่ที่เปิดดูจากต่างประเทศต้องเห็นเวลาเดียวกับที่พนักงานหน้าร้านเห็น
 */
export function thDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const at = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return `${at('day')} ${TH_ABBR[at('month') - 1]} ${at('year') + 543} `
    + `${String(at('hour')).padStart(2, '0')}:${String(at('minute')).padStart(2, '0')} น.`;
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
