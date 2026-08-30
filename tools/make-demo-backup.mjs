/**
 * สร้างไฟล์สำรองข้อมูล (JSON) ชุดทดสอบ โดยรัน seedDemo() ของโปรแกรมเดิมจริง ๆ
 *
 * ทำไมไม่เขียนข้อมูลตัวอย่างขึ้นมาเอง: ถ้าเราแต่งข้อมูลเอง เราจะแต่งเฉพาะเคสที่เรานึกออก
 * แล้ว importer จะผ่านเทสต์แต่พังกับไฟล์จริง — การรันโค้ดของโปรแกรมเดิมได้ไฟล์ที่มี
 * โครงสร้างเหมือนที่ลูกค้ากดปุ่ม "สำรองข้อมูลทั้งหมด (JSON)" ออกมาทุกประการ
 *
 * วิธีทำงาน: ดึงโค้ด <script> ทั้งก้อนจาก drivegolight.html มารันใน vm ของ Node
 * โดยตัดเฉพาะ IIFE init() ตอนท้ายทิ้ง (นั่นคือส่วน bootstrap หน้าจอ ไม่ใช่ตรรกะข้อมูล)
 * แล้วใส่ DOM ปลอมแบบ Proxy ให้โค้ดที่แตะ DOM ตอนโหลดไม่พัง
 *
 * รัน:
 *   node tools/make-demo-backup.mjs                    # ใช้วันที่วันนี้
 *   node tools/make-demo-backup.mjs --date=2026-08-28  # ตรึงวันที่ ได้ไฟล์เดิมทุกครั้ง
 *   node tools/make-demo-backup.mjs --if-missing         # ข้ามถ้ามีไฟล์อยู่แล้ว (ใช้ใน pretest)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
/** สำเนาตรึงรุ่นของโปรแกรมเดิม — ตั้ง DGL_LEGACY_HTML เพื่อชี้ไปไฟล์อื่น (เช่น รุ่นใหม่ที่ยังไม่ได้ก๊อปเข้ามา) */
const SOURCE = process.env.DGL_LEGACY_HTML
  ? resolve(process.cwd(), process.env.DGL_LEGACY_HTML)
  : resolve(ROOT, 'legacy/drivegolight-3.6.html');
const OUT_DIR = resolve(ROOT, 'fixtures');

const OUT_FILE_EARLY = resolve(ROOT, 'fixtures', 'demo-backup.json');
if (process.argv.includes('--if-missing') && existsSync(OUT_FILE_EARLY)) {
  console.log(`มี ${OUT_FILE_EARLY} อยู่แล้ว — ข้ามการสร้างใหม่`);
  process.exit(0);
}

const dateArg = process.argv.find((a) => a.startsWith('--date='));
/** ตรึงวันที่เพื่อให้ไฟล์ที่ได้เหมือนเดิมทุกครั้ง — ข้อมูลตัวอย่างอิงจาก today() */
const FROZEN = dateArg ? dateArg.slice('--date='.length) : null;

/* ---------- ดึงโค้ดออกจาก HTML ---------- */

const html = readFileSync(SOURCE, 'utf8');
const start = html.indexOf('<script>');
const end = html.lastIndexOf('</script>');
if (start < 0 || end < 0) throw new Error(`หา <script> ใน ${SOURCE} ไม่เจอ`);

let js = html.slice(start + '<script>'.length, end);

// ตัด IIFE init() ตอนท้ายทิ้ง — ส่วนนี้ประกอบหน้าจอ ไม่เกี่ยวกับการสร้างข้อมูล
const initAt = js.lastIndexOf('(async function init(){');
if (initAt < 0) throw new Error('หา init() ไม่เจอ — โครงสร้างไฟล์เดิมเปลี่ยนไปแล้ว');
js = js.slice(0, initAt);

/* ---------- DOM ปลอม ---------- */

/** อ็อบเจกต์ที่รับได้ทุกอย่าง: อ่าน property อะไรก็คืนตัวเอง เรียกเป็นฟังก์ชันก็ได้ */
function stubNode() {
  const fn = function () { return fn; };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'length') return 0;
      if (prop === Symbol.iterator) return function* () {};
      return stubNode();
    },
    set() { return true; },
    apply() { return stubNode(); },
    has() { return true; },
  });
}

const documentStub = {
  querySelector: () => stubNode(),
  querySelectorAll: () => [],
  createElement: () => stubNode(),
  addEventListener: () => {},
  getElementById: () => stubNode(),
  body: stubNode(),
  head: stubNode(),
};

/** สุ่มแบบมี seed แทน Math.random เพื่อให้ uid() ออกมาเหมือนเดิมทุกครั้ง */
function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x / 4294967296;
  };
}

const sandboxMath = Object.create(Math);
sandboxMath.random = seededRandom(20260828);

/** Date ที่ `new Date()` (ไม่ใส่อาร์กิวเมนต์) คืนวันที่ที่ตรึงไว้ */
function makeFrozenDate(isoDate) {
  const fixed = new Date(isoDate + 'T09:00:00').getTime();
  return class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  };
}

const context = {
  console,
  Math: sandboxMath,
  Date: FROZEN ? makeFrozenDate(FROZEN) : Date,
  document: documentStub,
  navigator: { userAgent: 'node' },
  location: { href: 'file:///drivegolight.html', hostname: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  indexedDB: undefined,
  setTimeout: () => 0,
  clearTimeout: () => {},
  alert: () => {},
  confirm: () => true,
  prompt: () => null,
  Blob: class { constructor(parts) { this.size = String(parts?.[0] ?? '').length; } },
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  JSON, Object, Array, String, Number, Boolean, Set, Map, Promise, RegExp, Error, isFinite, parseFloat, parseInt,
};
context.window = context;
context.globalThis = context;
context.window.addEventListener = () => {};
context.addEventListener = () => {};

vm.createContext(context);

/* ---------- รัน ---------- */

vm.runInContext(js, context, { filename: 'drivegolight.html<script>' });

/**
 * เตรียม DB ให้อยู่ในสภาพเดียวกับที่ loadDB() ทำกับเครื่องเปล่า
 * แล้วเรียก seedDemo() ตามที่ปุ่ม "สร้างข้อมูลทดสอบ" ในเมนู 07 เรียก
 */
const json = vm.runInContext(
  `
  DB.shop = Object.assign({}, DEFAULT_SHOP);
  DB.categories = seedCategories();
  DB.users = [];
  licInit();
  DB.seq = Object.assign({q:0,r:0,c:0,p:0,v:0,e:0,iv:0,ivt:0}, DB.seq);
  seedDemo();
  DB.lastExportAt = Date.now();
  JSON.stringify(DB, null, 2);
  `,
  context,
  { filename: 'seed-demo' },
);

const db = JSON.parse(json);

/* ---------- ตรวจก่อนเขียน ---------- */

const errors = vm.runInContext('validateBackupShape', context)(db);
if (errors.length) {
  console.error('ไฟล์ที่สร้างไม่ผ่าน validateBackupShape() ของโปรแกรมเดิม:');
  errors.slice(0, 20).forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const outFile = resolve(OUT_DIR, 'demo-backup.json');
writeFileSync(outFile, json, 'utf8');

/* ---------- สรุป ---------- */

const dates = [...db.quotes, ...db.invoices, ...db.receipts, ...db.purchases, ...db.expenses]
  .map((d) => d.date).sort();

console.log(`เขียน ${outFile}`);
console.log('');
console.log(`  ร้าน           ${db.shop.name}`);
console.log(`  สินค้า          ${db.products.length} รายการ / ${db.categories.length} หมวด`);
console.log(`  ผู้ติดต่อ         ${db.customers.length} ราย ` +
            `(ลูกค้า ${db.customers.filter((c) => c.kind === 'customer').length} · ` +
            `ผู้ขาย ${db.customers.filter((c) => c.kind === 'vendor').length})`);
console.log(`  รถ             ${db.customers.reduce((s, c) => s + (c.vehicles?.length ?? 0), 0)} คัน`);
console.log(`  ใบเสนอราคา      ${db.quotes.length} ใบ`);
console.log(`  ใบส่งมอบ        ${db.invoices.length} ใบ ` +
            `(IVT ${db.invoices.filter((d) => d.kind === 'IVT').length} · ` +
            `IV ${db.invoices.filter((d) => d.kind === 'IV').length})`);
console.log(`  ใบเสร็จ         ${db.receipts.length} ใบ ` +
            `(ออกต่อจากใบส่งมอบ ${db.receipts.filter((r) => r.invId).length})`);
console.log(`  ใบซื้อ          ${db.purchases.length} ใบ`);
console.log(`  ค่าใช้จ่าย       ${db.expenses.length} รายการ`);
console.log(`  รายการชำระเงิน   ${[...db.receipts, ...db.invoices, ...db.purchases, ...db.expenses]
              .reduce((s, d) => s + (d.payments?.length ?? 0), 0)} รายการ`);
console.log(`  ช่วงวันที่        ${dates[0]} ถึง ${dates[dates.length - 1]}`);
console.log(`  ขนาดไฟล์        ${(json.length / 1024 / 1024).toFixed(2)} MB`);
