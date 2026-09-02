/**
 * ดึงฟังก์ชันคำนวณของโปรแกรมเดิมออกจาก drivegolight.html แบบคำต่อคำ
 * แล้วห่อเป็นโมดูลให้เทสต์เรียกใช้ได้ — ใช้เทียบผลกับ @drivegolight/core
 *
 * ไม่แก้โค้ดที่ดึงออกมาแม้แต่ตัวอักษรเดียว ถ้าแก้ก็ไม่ได้เทียบกับของจริงแล้ว
 * สิ่งเดียวที่ทำคือห่อไว้ในฟังก์ชันที่รับ DB เข้ามา แทนที่จะอ่านจาก global
 *
 * รัน: node test/extract-legacy.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** สำเนาตรึงรุ่นของโปรแกรมเดิม — ตั้ง DGL_LEGACY_HTML เพื่อเทียบกับไฟล์รุ่นอื่น */
const SOURCE = process.env.DGL_LEGACY_HTML
  ? resolve(process.cwd(), process.env.DGL_LEGACY_HTML)
  : resolve(here, '../../../legacy/drivegolight-3.6.html');
const OUT = resolve(here, 'legacy.generated.mjs');

/** ฟังก์ชันแบบ `function ชื่อ(...)` ที่ต้องดึง */
const FUNCTIONS = [
  'addDays', 'daysBetween',
  'isServiceItem', 'totalsOf', 'whtBaseOf', 'recTotals', 'poTotals', 'exTotals',
  'paidOf', 'laterPaidOf', 'payState',
  'poDue', 'exDue', 'apTotalOf', 'apDueOf',
  'salesDocs', 'arTotal', 'arDue',
  'vatMonthKeys', 'vatOfMonth', 'vatChain', 'vatCarryInto',
  'bahttext',
  /* มีเฉพาะรุ่น 6.4 ขึ้นไป ดึงเมื่อชี้ DGL_LEGACY_HTML ไปที่ไฟล์ที่มี
     live/isVoid ต้องมาก่อน salesDocs เพราะ 6.4 เรียกใช้ข้างใน */
  'isVoid', 'live', 'livePurchases', 'liveExpenses',
  'lotsOf', 'lotSync', 'lotConsume', 'lotAdd', 'lotReturn', 'lotValue',
  'barcodeSVG', 'genBarcode',
];

/** ฟังก์ชันที่ยอมให้ไม่มีในไฟล์ต้นทาง — รุ่น 3.6 ยังไม่มีการยกเลิกเอกสารและล็อต */
const OPTIONAL = new Set([
  'isVoid', 'live', 'livePurchases', 'liveExpenses',
  'lotsOf', 'lotSync', 'lotConsume', 'lotAdd', 'lotReturn', 'lotValue',
  'barcodeSVG', 'genBarcode',
]);

/** ตัวแปรแบบบรรทัดเดียว `const ชื่อ = ...;` */
const CONSTS = ['num', 'iso', 'today', 'isInvoice', 'isExpenseDoc'];

/** อาเรย์หลายบรรทัด `const ชื่อ = [ ... ];` */
const ARRAYS = ['EXPENSE_CATS'];

/** ออบเจกต์หลายบรรทัด `const ชื่อ = { ... };` — มีเฉพาะรุ่น 6.4 ขึ้นไป */
const OBJECTS = ['C39'];
const OPTIONAL_OBJECTS = new Set(['C39']);

const html = readFileSync(SOURCE, 'utf8');

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd < 0) throw new Error(`หา <script> ใน ${SOURCE} ไม่เจอ`);
const js = html.slice(scriptStart + '<script>'.length, scriptEnd);

/** ตัดโค้ดตั้งแต่ตำแหน่ง start จนวงเล็บปีกกา/เหลี่ยมปิดครบ */
function sliceBalanced(src, start, open, close) {
  const from = src.indexOf(open, start);
  if (from < 0) throw new Error(`หา ${open} ไม่เจอ`);
  let depth = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = from; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }

    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('วงเล็บไม่ครบ');
}

const parts = [];

const missing = [];
for (const name of FUNCTIONS) {
  const re = new RegExp(`^function ${name}\\s*\\(`, 'm');
  const m = re.exec(js);
  if (!m) {
    /* รุ่นเก่ายังไม่มีล็อต — ปล่อยผ่านแล้วให้เทสต์ข้ามเอง แต่ของที่ต้องมีห้ามหาย */
    if (OPTIONAL.has(name)) { missing.push(name); continue; }
    throw new Error(`ไม่พบ function ${name}() — โครงสร้างไฟล์เดิมเปลี่ยนไปแล้ว`);
  }
  parts.push(sliceBalanced(js, m.index, '{', '}'));
}

for (const name of CONSTS) {
  const re = new RegExp(`^const ${name}\\s*=.*$`, 'm');
  const m = re.exec(js);
  if (!m) throw new Error(`ไม่พบ const ${name} — โครงสร้างไฟล์เดิมเปลี่ยนไปแล้ว`);
  parts.push(m[0]);
}

for (const name of ARRAYS) {
  const re = new RegExp(`^const ${name}\\s*=\\s*\\[`, 'm');
  const m = re.exec(js);
  if (!m) throw new Error(`ไม่พบ const ${name} — โครงสร้างไฟล์เดิมเปลี่ยนไปแล้ว`);
  parts.push(sliceBalanced(js, m.index, '[', ']') + ';');
}

const foundObjects = [];
for (const name of OBJECTS) {
  const re = new RegExp(`^const ${name}\\s*=\\s*\\{`, 'm');
  const m = re.exec(js);
  if (!m) {
    if (OPTIONAL_OBJECTS.has(name)) { missing.push(name); continue; }
    throw new Error(`ไม่พบ const ${name} — โครงสร้างไฟล์เดิมเปลี่ยนไปแล้ว`);
  }
  parts.push(sliceBalanced(js, m.index, '{', '}') + ';');
  foundObjects.push(name);
}

const exported = [
  ...FUNCTIONS.filter((f) => !missing.includes(f)), ...CONSTS, ...ARRAYS, ...foundObjects,
];
if (missing.length) {
  console.log(`ไฟล์นี้ยังไม่มี: ${missing.join(', ')} — เทสต์ที่ต้องใช้จะข้ามเอง`);
}

const out = `/* สร้างอัตโนมัติจาก drivegolight.html — ห้ามแก้ด้วยมือ
   สร้างใหม่ด้วย: node test/extract-legacy.mjs
   โค้ดข้างในคัดลอกจากโปรแกรมเดิมคำต่อคำ ใช้เทียบผลเท่านั้น */

/** @param {object} DB ฐานข้อมูลจำลอง — ต้องมีอย่างน้อย {shop:{vatRate}, invoices, receipts, purchases, expenses} */
export function makeLegacy(DB) {
${parts.map((p) => p.split('\n').map((l) => '  ' + l).join('\n')).join('\n\n')}

  return { ${exported.join(', ')} };
}
`;

writeFileSync(OUT, out, 'utf8');
console.log(`เขียน ${OUT}`);
console.log(`ดึงมาได้ ${exported.length} รายการ: ${exported.join(', ')}`);
