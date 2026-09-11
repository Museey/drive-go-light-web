/**
 * อ่านและเขียน CSV — ส่วนที่ไม่แตะฐานข้อมูล จึงทดสอบได้ตรง ๆ
 *
 * ไม่ใช้ไลบรารีเพราะต้องการแค่สองอย่าง และการพึ่งไลบรารีสำหรับงานเท่านี้
 * แลกมาด้วยความเสี่ยงตอนอัปเดตที่ไม่คุ้ม
 */

export const CSV_HEADERS = [
  'รหัสสินค้า', 'รหัส OEM', 'ชื่อสินค้า', 'หน่วยนับ', 'หมวดหมู่',
  'ทุน', 'ราคา A', 'ราคา B', 'ราคา C', 'จุดสั่งซื้อ', 'เก็บสูงสุด', 'คงเหลือ',
] as const;

/** ใส่เครื่องหมายคำพูดเมื่อจำเป็น และ escape ตามมาตรฐาน CSV */
export function csvField(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** BOM ให้ Excel บนวินโดวส์เปิดแล้วภาษาไทยไม่เพี้ยน */
export const BOM = '﻿';

/**
 * หัวข้อมูลสำหรับดาวน์โหลดไฟล์ CSV
 *
 * **หัว HTTP รับได้แค่ไบต์ 0–255 ตัวอักษรไทยใส่ตรง ๆ ไม่ได้** — ใส่แล้ว Response
 * โยน TypeError ทันทีและผู้ใช้เห็นแค่หน้า 500 ที่ไม่บอกอะไร
 * (เกิดขึ้นจริงกับปุ่มส่งออกของหน้ายอดขายตอนไม่ได้เลือกช่วงวันที่ ซึ่งเป็นสภาพตั้งต้นของหน้า
 * — พังมาตลอดโดยไม่มีใครรู้ เพราะไม่มีใครกดตอนไม่เลือกช่วง)
 *
 * วิธีที่ถูกคือส่งสองชื่อ — ชื่ออังกฤษล้วนไว้ให้ตัวที่อ่าน RFC 5987 ไม่เป็น
 * และชื่อจริงแบบเข้ารหัสไว้ให้เบราว์เซอร์ปัจจุบัน (รูปเดียวกับที่ contacts/csv ใช้อยู่แล้ว)
 */
export function csvDownloadHeaders(asciiName: string, fullName: string): HeadersInit {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition':
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fullName)}`,
    'cache-control': 'no-store',
  };
}

/**
 * แยกไฟล์ CSV เป็นตาราง รองรับเครื่องหมายคำพูด คอมมาในค่า และขึ้นบรรทัดในค่า
 * บรรทัดที่ว่างทั้งบรรทัดถูกตัดทิ้ง เพราะไฟล์จาก Excel มักมีบรรทัดว่างท้ายไฟล์
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/**
 * ชื่อหัวคอลัมน์ที่ยอมรับได้ของแต่ละฟิลด์
 * อู่ที่มีไฟล์ Excel อยู่แล้วจะได้ไม่ต้องแก้หัวตารางก่อนนำเข้า
 */
const HEADER_ALIASES: Record<string, string[]> = {
  code: ['รหัสสินค้า', 'รหัส', 'code', 'sku'],
  oem: ['รหัส oem', 'oem', 'รหัสอ้างอิง'],
  name: ['ชื่อสินค้า', 'ชื่อ', 'name', 'description'],
  unit: ['หน่วยนับ', 'หน่วย', 'unit'],
  cat: ['หมวดหมู่', 'หมวด', 'category', 'cat'],
  cost: ['ทุน', 'ต้นทุน', 'cost'],
  priceA: ['ราคา a', 'ราคาขาย a', 'ราคา', 'price', 'pricea'],
  priceB: ['ราคา b', 'ราคาขาย b', 'priceb'],
  priceC: ['ราคา c', 'ราคาขาย c', 'pricec'],
  qtyMin: ['จุดสั่งซื้อ', 'ขั้นต่ำ', 'min'],
  qtyMax: ['เก็บสูงสุด', 'สูงสุด', 'max'],
  qty: ['คงเหลือ', 'จำนวน', 'qty', 'stock'],
};

export function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [field, names] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && names.includes(key)) map[field] = i;
    }
  });
  return map;
}

/** อ่านตัวเลขจากช่อง — ตัดคอมมาออกและคืน 0 เมื่ออ่านไม่ออก */
export function csvNumber(row: string[], i?: number): number {
  if (i === undefined) return 0;
  const v = parseFloat(String(row[i] ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

export const csvText = (row: string[], i?: number): string =>
  i === undefined ? '' : String(row[i] ?? '').trim();

/**
 * หัวตารางของไฟล์นำเข้า–ส่งออกทะเบียนลูกค้าและผู้ขาย
 *
 * ยกมาจาก CUST_CSV_HEADERS / VEND_CSV_HEADERS ของรุ่น 6.4 ทีละช่อง
 * ต้องตรงเป๊ะ เพราะอู่ที่ย้ายมาจะเอาไฟล์ชุดเดิมที่เคยส่งออกจาก 6.4 มานำเข้าที่นี่
 * มีเทสต์อ่านเทียบกับไฟล์ต้นฉบับโดยตรง
 *
 * ลูกค้าเป็น **หนึ่งแถวต่อหนึ่งคัน** — ลูกค้าที่มีสามคันก็สามแถว ชื่อเดียวกัน
 */
export const CUST_CSV_HEADERS = [
  'รหัสลูกค้า', 'ประเภท(บุคคล/นิติบุคคล)', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ชื่อนิติบุคคล',
  'เลขผู้เสียภาษี', 'โทรศัพท์', 'โทรศัพท์สำรอง', 'อีเมล', 'เลขที่', 'หมู่บ้าน/อาคาร', 'หมู่ที่',
  'ซอย', 'ถนน', 'ตำบล/แขวง', 'อำเภอ/เขต', 'จังหวัด', 'รหัสไปรษณีย์', 'เครดิต(วัน)', 'หมายเหตุ',
  'ยี่ห้อรถ', 'รุ่นรถ', 'ปีจดทะเบียน', 'สีรถ', 'ทะเบียนหมวดอักษร', 'ทะเบียนหมวดเลข',
  'จังหวัดทะเบียน', 'เลขเครื่องยนต์', 'เลขตัวถัง', 'เลขไมล์',
] as const;

export const VEND_CSV_HEADERS = [
  'รหัสผู้ขาย', 'ประเภท(บุคคล/นิติบุคคล)', 'ชื่อร้าน/บริษัท', 'เลขผู้เสียภาษี',
  'โทรศัพท์', 'โทรศัพท์สำรอง', 'อีเมล', 'เลขที่', 'หมู่บ้าน/อาคาร', 'หมู่ที่', 'ซอย', 'ถนน',
  'ตำบล/แขวง', 'อำเภอ/เขต', 'จังหวัด', 'รหัสไปรษณีย์', 'เครดิต(วัน)', 'หมายเหตุ',
] as const;

/** ชื่อฟิลด์ที่แต่ละคอลัมน์ตรงกับ — เรียงตามหัวตารางข้างบนช่องต่อช่อง */
export const CUST_FIELDS = [
  'code', 'type', 'prefix', 'firstName', 'lastName', 'orgName', 'taxId', 'tel', 'tel2', 'email',
  'a_no', 'a_village', 'a_moo', 'a_soi', 'a_road', 'a_subdistrict', 'a_district', 'a_province',
  'a_zip', 'creditDays', 'note',
  'v_brand', 'v_model', 'v_year', 'v_color', 'v_plateA', 'v_plateB', 'v_plateProv',
  'v_engineNo', 'v_chassisNo', 'v_mileage',
] as const;

export const VEND_FIELDS = [
  'code', 'type', 'orgName', 'taxId', 'tel', 'tel2', 'email',
  'a_no', 'a_village', 'a_moo', 'a_soi', 'a_road', 'a_subdistrict', 'a_district', 'a_province',
  'a_zip', 'creditDays', 'note',
] as const;

/**
 * ทำให้ชื่อหัวคอลัมน์เทียบกันได้ — ตัดวงเล็บทิ้ง ตัดหัวท้าย ตัวพิมพ์เล็ก
 * ตรงกับ normHeader() ของรุ่น 6.4 เพื่อให้ไฟล์ที่เคยนำเข้าได้ที่นั่นนำเข้าที่นี่ได้ด้วย
 */
export const normHeader = (h: string): string =>
  String(h ?? '').replace(/\(.*?\)/g, '').trim().toLowerCase();

/** ชื่อที่เทียบกันได้ — ตัดหัวท้าย ยุบช่องว่างซ้ำ ตัวพิมพ์เล็ก ตรงกับ normName() ของ 6.4 */
export const normName = (v: string): string =>
  String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** หัวตารางของไฟล์ส่งออกรายรับรายจ่าย — เรียงตามรุ่น 3.6 */
export const FINANCE_HEADERS = [
  'ประเภท', 'เลขที่', 'วันที่', 'คู่ค้า', 'ก่อนภาษี', 'VAT',
  'หัก ณ ที่จ่าย', 'ยอดสุทธิ', 'ชำระแล้ว', 'คงค้าง', 'สถานะ',
] as const;

/**
 * หัวคอลัมน์ของลูกหนี้และเจ้าหนี้ — **ต้องตรงกับที่เห็นบนจอ**
 *
 * ไฟล์ที่หัวคอลัมน์ไม่ตรงกับหน้าจอทำให้คนทำบัญชีต้องเดาว่าคอลัมน์ไหนคืออะไร
 * ส่วน "เกินกำหนด (วัน)" ไม่มีบนจอเป็นคอลัมน์ แต่มีเป็นป้ายสี — ในไฟล์ต้องเป็นตัวเลข
 */
export const AR_HEADERS = [
  'เลขที่', 'ชนิด', 'ลูกค้า', 'ทะเบียนรถ', 'วันที่', 'ครบกำหนด',
  'ยอดสุทธิ', 'ชำระแล้ว', 'คงค้าง', 'เกินกำหนด (วัน)',
] as const;

export const AP_HEADERS = [
  'เลขที่', 'ชนิด', 'ผู้ขาย / ผู้รับเงิน', 'อ้างอิง', 'วันที่', 'ครบกำหนด',
  'ยอดสุทธิ', 'จ่ายแล้ว', 'คงค้าง', 'เกินกำหนด (วัน)',
] as const;
