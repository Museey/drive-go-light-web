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
