/**
 * บาร์โค้ดมาตรฐาน 4 ระบบสำหรับทะเบียนสินค้า — UPC-A · EAN (13/8) · Code 39 · Code 128
 *
 * ทำอะไร:
 *   - ตรวจว่าข้อความที่พิมพ์/ยิงเข้ามาเป็นบาร์โค้ดแบบไหน และเลขตรวจสอบ (check digit) ถูกไหม
 *   - ออกบาร์โค้ดใหม่ให้สินค้าที่ยังไม่มี: EAN-13 แบบใช้ในร้าน (นำหน้า 20) หรือ Code 128 จากรหัสสินค้า
 *   - วาดแถบเป็น SVG ให้ปืนยิงอ่านได้ ตามสเปกโมดูลของแต่ละระบบ
 *   - ทำรูปแบบเทียบเท่าตอนค้นหา (ปืนบางรุ่นยิง UPC-A แล้วส่ง 13 หลักนำด้วย 0)
 *
 * Code 39 ตัวเดิม (barcode.ts) คงไว้ทุกแถบ เพราะฉลากเก่าที่พิมพ์แล้วยังต้องยิงติด
 */
import { barcodeSVG as code39SVG } from './barcode.js';

export type BarcodeType = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE39' | 'CODE128';

export const BARCODE_TYPES: { key: BarcodeType; label: string; desc: string }[] = [
  { key: 'EAN13', label: 'EAN-13', desc: 'สินค้าทั่วไป 13 หลัก (ของไทยขึ้นต้น 885) · ใช้ในร้านขึ้นต้น 20–29' },
  { key: 'UPCA', label: 'UPC-A', desc: 'สินค้าอเมริกา 12 หลัก' },
  { key: 'EAN8', label: 'EAN-8', desc: 'สินค้าชิ้นเล็ก 8 หลัก' },
  { key: 'CODE128', label: 'Code 128', desc: 'ตัวอักษร/ตัวเลขผสม แถบแน่น เหมาะกับรหัสร้าน' },
  { key: 'CODE39', label: 'Code 39', desc: 'ตัวพิมพ์ใหญ่ ตัวเลข - . (ฉลากรุ่นเดิม)' },
];

/* ---------- เลขตรวจสอบ GTIN (EAN/UPC): ถ่วงน้ำหนัก 3/1 จากขวา ---------- */
export function gtinCheckDigit(body: string): number {
  const d = body.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    const n = Number(d[d.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}
const gtinValid = (s: string) => gtinCheckDigit(s.slice(0, -1)) === Number(s.slice(-1));

const C39_RE = /^[A-Z0-9\-. $/+%]+$/;
const C128_RE = /^[\x20-\x7E]+$/;

export interface BarcodeCheck {
  ok: boolean;
  /** ระบบที่ตรวจพบ/ระบุ */
  type: BarcodeType | null;
  /** ข้อความที่ปรับรูปแล้ว (ตัดช่องว่างหัวท้าย · Code 39 เป็นตัวพิมพ์ใหญ่) */
  value: string;
  error?: string;
}

/**
 * ตรวจบาร์โค้ด — ไม่ระบุระบบก็เดาให้: ตัวเลขล้วน 13/12/8 หลัก → EAN-13 / UPC-A / EAN-8
 * ตัวอักษรผสม → Code 128 (ครอบคลุม Code 39 ทั้งหมดและแถบแน่นกว่า)
 */
export function validateBarcode(raw: string, type?: BarcodeType | 'AUTO' | null): BarcodeCheck {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, type: null, value, error: 'ว่าง' };
  const digits = /^\d+$/.test(value);
  const want: BarcodeType | null = !type || type === 'AUTO'
    ? (digits && value.length === 13 ? 'EAN13'
      : digits && value.length === 12 ? 'UPCA'
      : digits && value.length === 8 ? 'EAN8'
      : 'CODE128')
    : type;

  switch (want) {
    case 'EAN13':
      if (!digits || value.length !== 13) return { ok: false, type: want, value, error: 'EAN-13 ต้องเป็นตัวเลข 13 หลัก' };
      if (!gtinValid(value)) return { ok: false, type: want, value, error: `เลขตรวจสอบไม่ถูกต้อง (ควรลงท้าย ${gtinCheckDigit(value.slice(0, 12))})` };
      return { ok: true, type: want, value };
    case 'UPCA':
      if (!digits || value.length !== 12) return { ok: false, type: want, value, error: 'UPC-A ต้องเป็นตัวเลข 12 หลัก' };
      if (!gtinValid(value)) return { ok: false, type: want, value, error: `เลขตรวจสอบไม่ถูกต้อง (ควรลงท้าย ${gtinCheckDigit(value.slice(0, 11))})` };
      return { ok: true, type: want, value };
    case 'EAN8':
      if (!digits || value.length !== 8) return { ok: false, type: want, value, error: 'EAN-8 ต้องเป็นตัวเลข 8 หลัก' };
      if (!gtinValid(value)) return { ok: false, type: want, value, error: `เลขตรวจสอบไม่ถูกต้อง (ควรลงท้าย ${gtinCheckDigit(value.slice(0, 7))})` };
      return { ok: true, type: want, value };
    case 'CODE39': {
      const up = value.toUpperCase();
      if (!C39_RE.test(up)) return { ok: false, type: want, value: up, error: 'Code 39 ใช้ได้เฉพาะ A–Z 0–9 - . เว้นวรรค $ / + %' };
      if (up.length > 30) return { ok: false, type: want, value: up, error: 'Code 39 ยาวเกิน 30 ตัว ฉลากจะอ่านยาก' };
      return { ok: true, type: want, value: up };
    }
    case 'CODE128':
      if (!C128_RE.test(value)) return { ok: false, type: want, value, error: 'Code 128 ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และสัญลักษณ์ (ไม่รับภาษาไทย)' };
      if (value.length > 40) return { ok: false, type: want, value, error: 'Code 128 ยาวเกิน 40 ตัว' };
      return { ok: true, type: want, value };
  }
}

/* ---------- ออกบาร์โค้ดใหม่ ---------- */
/** EAN-13 ใช้ในร้าน: นำหน้า 20 (ช่วง 20–29 สงวนให้ใช้ภายใน ไม่ชนสินค้าจริง) + 10 หลัก + เลขตรวจสอบ */
export function genEan13(seed: number = Date.now(), rand: () => number = Math.random, prefix = '20'): string {
  const body = (prefix + String(seed).slice(-7) + String(Math.floor(rand() * 1000)).padStart(3, '0')).slice(0, 12);
  return body + gtinCheckDigit(body);
}
/** Code 128 จากรหัสสินค้าของร้าน — ยิงแล้วได้รหัสร้านตรง ๆ */
export function genCode128FromCode(code: string): string {
  return code.trim().replace(/[^\x20-\x7E]/g, '').slice(0, 40);
}

/** รูปแบบเทียบเท่าที่ปืนต่างรุ่นอาจส่งมา — ใช้ตอนค้นหา (UPC-A ↔ EAN-13 นำ 0) */
export function barcodeAliases(raw: string): string[] {
  const v = String(raw ?? '').trim();
  const out = new Set<string>([v]);
  if (/^\d{12}$/.test(v)) out.add('0' + v);
  if (/^0\d{12}$/.test(v)) out.add(v.slice(1));
  if (/^\d{14}$/.test(v) && v.startsWith('0')) out.add(v.slice(1));   // GTIN-14 ที่บางปืนเติม 0 หน้า
  return [...out];
}

/* ---------- วาด EAN/UPC ---------- */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => p.split('').reverse().map((b) => (b === '1' ? '0' : '1')).join(''));   // G = สลับสีของ L ที่กลับด้าน
const R = L.map((p) => p.split('').map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** โมดูลของ EAN-13 (95) — UPC-A = EAN-13 ที่ตัวแรกเป็น 0 */
export function ean13Modules(code13: string): string {
  const d = code13.split('').map(Number);
  const par = PARITY[d[0]!]!;
  let m = '101';
  for (let i = 1; i <= 6; i++) m += (par[i - 1] === 'L' ? L : G)[d[i]!];
  m += '01010';
  for (let i = 7; i <= 12; i++) m += R[d[i]!];
  return m + '101';
}
export function ean8Modules(code8: string): string {
  const d = code8.split('').map(Number);
  let m = '101';
  for (let i = 0; i < 4; i++) m += L[d[i]!];
  m += '01010';
  for (let i = 4; i < 8; i++) m += R[d[i]!];
  return m + '101';
}

/* ---------- วาด Code 128 (ชุด B, สลับ C เมื่อเลขล้วนคู่) ---------- */
const C128 = [
  '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011',
];
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

/** ค่ารหัส (สำหรับทดสอบและวาด) — คืนลำดับค่ารวมตัวเริ่ม เลขตรวจสอบ และตัวจบ */
export function code128Values(text: string): number[] {
  const vals: number[] = [];
  let i = 0, set: 'B' | 'C' | null = null;
  const digitsRun = (from: number) => { let n = 0; while (from + n < text.length && /\d/.test(text[from + n]!)) n++; return n; };
  while (i < text.length) {
    const run = digitsRun(i);
    const useC = run >= 4 || (run >= 2 && i + run === text.length && run % 2 === 0);
    if (useC) {
      if (set !== 'C') { vals.push(set === null ? START_C : CODE_C); set = 'C'; }
      const pairs = run - (run % 2);
      for (let k = 0; k < pairs; k += 2) vals.push(Number(text.slice(i + k, i + k + 2)));
      i += pairs;
      if (run % 2 === 1) { /* เลขคี่ตัวสุดท้ายไปชุด B */ }
      continue;
    }
    if (set !== 'B') { vals.push(set === null ? START_B : CODE_B); set = 'B'; }
    vals.push(text.charCodeAt(i) - 32);
    i++;
  }
  let sum = vals[0]!;
  for (let k = 1; k < vals.length; k++) sum += vals[k]! * k;
  vals.push(sum % 103);
  vals.push(STOP);
  return vals;
}
export function code128Modules(text: string): string {
  return code128Values(text).map((v) => C128[v]!).join('');
}

/* ---------- SVG รวม ---------- */
function modulesSVG(modules: string, w: number, h: number): string {
  const k = w / modules.length;
  let rects = '', x = 0;
  for (let i = 0; i < modules.length; i++) {
    let n = 1;
    while (modules[i + n] === modules[i]) n++;
    if (modules[i] === '1') rects += `<rect x="${x.toFixed(2)}" y="0" width="${(n * k).toFixed(2)}" height="${h}"/>`;
    x += n * k; i += n - 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${rects}</svg>`;
}

/** วาดตามระบบ — ค่าที่ไม่ผ่านการตรวจวาดเป็น Code 128 เพื่อให้ยิงได้อยู่ดี */
export function barcodeSVGFor(text: string, type: BarcodeType | 'AUTO' | null | undefined, w: number, h: number): string {
  const v = validateBarcode(text, type);
  const t = v.ok ? v.type : 'CODE128';
  switch (t) {
    case 'EAN13': return modulesSVG(ean13Modules(v.value), w, h);
    case 'UPCA': return modulesSVG(ean13Modules('0' + v.value), w, h);
    case 'EAN8': return modulesSVG(ean8Modules(v.value), w, h);
    case 'CODE39': return code39SVG(v.value, w, h);
    default: return modulesSVG(code128Modules(v.ok ? v.value : String(text).replace(/[^\x20-\x7E]/g, '')), w, h);
  }
}
