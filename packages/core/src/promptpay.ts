/**
 * ข้อความในคิวอาร์พร้อมเพย์ (Thai QR Payment ตามมาตรฐาน EMVCo Merchant-Presented QR)
 *
 * ลูกค้าสแกนด้วยแอปธนาคารไหนก็ได้ แล้วโอนเข้าพร้อมเพย์ของอู่ตามยอดบนเอกสาร
 * ไม่ต้องสมัครบริการรับชำระเงินกับใคร — เงินเข้าบัญชีที่ผูกพร้อมเพย์ไว้โดยตรง
 *
 * ที่นี่สร้างแค่ **ข้อความ** ที่จะฝังในคิวอาร์ ไม่วาดรูป (ไม่พึ่ง DOM เหมือนส่วนอื่นของ core)
 *
 * โครงของข้อความ: ชุดของ `รหัส 2 หลัก` + `ความยาว 2 หลัก` + `ค่า` ต่อกันไป
 *   00  รุ่นของรูปแบบ                         = 01
 *   01  ใช้ได้กี่ครั้ง                         = 12 (ระบุยอด ใช้ครั้งเดียว) · 11 (ไม่ระบุยอด ใช้ซ้ำได้)
 *   29  บัญชีพร้อมเพย์
 *         00 รหัสแอปพลิเคชันของพร้อมเพย์      = A000000677010111
 *         01 เบอร์มือถือ (0066 + ตัดศูนย์นำ)   · 02 เลขประจำตัวผู้เสียภาษี/บัตรประชาชน 13 หลัก
 *         03 e-Wallet 15 หลัก
 *   58  ประเทศ = TH      53  สกุลเงิน = 764 (บาท)      54  ยอดเงิน ทศนิยมสองตำแหน่ง
 *   63  ตัวตรวจ CRC-16/CCITT-FALSE ของข้อความทั้งหมดรวม "6304"
 */

export type PromptPayIdType = 'mobile' | 'taxId' | 'ewallet';

export interface PromptPayTarget {
  type: PromptPayIdType;
  /** ตัวเลขล้วนตามที่ผู้ใช้กรอก ไม่มีขีดหรือช่องว่าง */
  digits: string;
}

/**
 * อ่านเลขพร้อมเพย์ที่ผู้ใช้กรอก — ขีดและช่องว่างตัดทิ้ง · คืน null ถ้าไม่ใช่รูปแบบที่พร้อมเพย์รับ
 *
 * เบอร์มือถือ 10 หลักขึ้นต้นด้วย 0 · เลขประจำตัว 13 หลัก · e-Wallet 15 หลัก
 */
export function parsePromptPayId(raw: string | null | undefined): PromptPayTarget | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return { type: 'mobile', digits };
  if (digits.length === 13) return { type: 'taxId', digits };
  if (digits.length === 15) return { type: 'ewallet', digits };
  return null;
}

const field = (id: string, value: string): string =>
  id + String(value.length).padStart(2, '0') + value;

/** CRC-16/CCITT-FALSE — ค่าเริ่ม 0xFFFF พหุนาม 0x1021 ไม่กลับบิต ตามที่ EMVCo กำหนด */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * ข้อความคิวอาร์พร้อมเพย์ — คืน null ถ้าเลขพร้อมเพย์ใช้ไม่ได้
 *
 * `amount` มากกว่าศูนย์ = ล็อกยอดไว้ในคิวอาร์ ลูกค้าไม่ต้องพิมพ์ยอดเองและพิมพ์ผิดไม่ได้
 * ไม่ส่งหรือเป็นศูนย์ = คิวอาร์ไม่ระบุยอด ลูกค้ากรอกเองตอนโอน
 */
export function promptPayPayload(id: string | null | undefined, amount?: number): string | null {
  const target = parsePromptPayId(id);
  if (!target) return null;

  const account =
    target.type === 'mobile' ? field('01', '0066' + target.digits.slice(1))
    : target.type === 'taxId' ? field('02', target.digits)
    : field('03', target.digits);

  const hasAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;

  const body =
    field('00', '01') +
    field('01', hasAmount ? '12' : '11') +
    field('29', field('00', 'A000000677010111') + account) +
    field('58', 'TH') +
    field('53', '764') +
    (hasAmount ? field('54', (Math.round(amount! * 100) / 100).toFixed(2)) : '') +
    '6304';

  return body + crc16(body);
}
