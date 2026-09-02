/**
 * เตรียมไฟล์สำรองข้อมูลก่อนนำเข้า — ทำสิ่งเดียวกับที่ `loadDB()` ของโปรแกรมเดิม
 * ทำให้ทุกครั้งที่เปิดไฟล์เก่า
 *
 * ไฟล์ของลูกค้าที่ใช้โปรแกรมมาหลายรุ่นจะขาดฟิลด์ที่รุ่นหลังเพิ่มเข้ามา ถ้าข้ามขั้นนี้
 * importer จะพังกลางทางหรือ (แย่กว่า) นำเข้าสำเร็จแต่ข้อมูลผิดเงียบ ๆ
 *
 * อ้างอิง: drivegolight.html — loadDB(), migrateUserPerms(), migrateDB()
 */

export interface BackupFile {
  schemaVersion?: number;
  shop?: Record<string, unknown> | null;
  products: any[];
  categories?: string[];
  customers: any[];
  /** ทะเบียนผู้ขายของรุ่นเก่า — รุ่นใหม่ย้ายเข้า customers แล้ว */
  vendors?: any[];
  /** ใบวางบิล — มีตั้งแต่รุ่น 6.4 */
  billnotes?: any[];
  /** ใบเคลมสินค้าทั้งสองทิศทาง — มีตั้งแต่รุ่น 6.4 */
  claims?: any[];
  /** ใบตรวจนับสต๊อก — มีตั้งแต่รุ่น 6.4 */
  counts?: any[];
  purchases: any[];
  expenses: any[];
  quotes: any[];
  invoices: any[];
  receipts: any[];
  users?: any[];
  seq?: Record<string, number>;
  lic?: { installedAt?: string; key?: string; expires?: string };
  ignoredItems?: string[];
  ui?: Record<string, unknown>;
  lastExportAt?: number | null;
  demoSeeded?: boolean;
  [k: string]: unknown;
}

/** ค่าตั้งต้นของร้าน — ตรงกับ DEFAULT_SHOP เดิม */
export const DEFAULT_SHOP = {
  name: 'อู่ของฉัน',
  taxId: '',
  addr: '',
  tel: '',
  tel2: '',
  vatRate: 7,
  whtRate: 3,
  priceTier: 'A',
  logo: '',
  proposerName: '',
} as const;

export const DEFAULT_CATEGORIES = [
  'เบรก', 'ของเหลว/น้ำมันเครื่อง', 'กรอง', 'ช่วงล่าง', 'ไฟฟ้า', 'สายพาน/โซ่', 'ยางและล้อ', 'ทั่วไป',
];

const DEFAULT_SEQ = { q: 0, r: 0, c: 0, p: 0, v: 0, e: 0, iv: 0, ivt: 0 };

/** ตรวจโครงสร้างไฟล์ — พอร์ตจาก validateBackupShape() คืนรายการปัญหาที่พบ */
export function validateBackup(d: unknown): string[] {
  const errors: string[] = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return ['ไฟล์นี้ไม่ใช่ออบเจกต์ข้อมูลสำรองที่ถูกต้อง'];
  }
  const b = d as Record<string, any>;

  if (b.shop !== undefined && b.shop !== null && typeof b.shop !== 'object') {
    errors.push('shop ต้องเป็นออบเจกต์ข้อมูลร้าน');
  }

  const arr = (key: string, required = true) => {
    if (!Array.isArray(b[key])) {
      if (required || b[key] !== undefined) errors.push(`${key} ต้องเป็น array (พบ ${typeof b[key]})`);
      return false;
    }
    return true;
  };

  if (arr('products')) {
    b.products.forEach((p: any, i: number) => {
      if (!p || typeof p !== 'object') return void errors.push(`products[${i}] ไม่ใช่ออบเจกต์`);
      if (!p.id) errors.push(`products[${i}] ไม่มี field "id"`);
      if (typeof p.code !== 'string') errors.push(`products[${i}] ไม่มี field "code" (รหัสสินค้า)`);
      if (typeof p.name !== 'string') errors.push(`products[${i}] ไม่มี field "name" (ชื่อสินค้า)`);
    });
  }

  arr('categories', false);

  if (arr('customers')) {
    b.customers.forEach((c: any, i: number) => {
      if (!c || typeof c !== 'object') return void errors.push(`customers[${i}] ไม่ใช่ออบเจกต์`);
      if (!c.id) errors.push(`customers[${i}] ไม่มี field "id"`);
      if (!Array.isArray(c.vehicles)) errors.push(`customers[${i}] ไม่มี field "vehicles" (ต้องเป็น array)`);
      if (!c.addr || typeof c.addr !== 'object') errors.push(`customers[${i}] ไม่มี field "addr"`);
    });
  }

  for (const key of ['purchases', 'expenses'] as const) {
    if (arr(key)) {
      b[key].forEach((x: any, i: number) => {
        if (!x || typeof x !== 'object') return void errors.push(`${key}[${i}] ไม่ใช่ออบเจกต์`);
        if (!x.id) errors.push(`${key}[${i}] ไม่มี field "id"`);
        if (!Array.isArray(x.items)) errors.push(`${key}[${i}] ไม่มี field "items" (ต้องเป็น array)`);
      });
    }
  }

  for (const key of ['quotes', 'invoices', 'receipts'] as const) {
    if (arr(key)) {
      b[key].forEach((x: any, i: number) => {
        if (!x || typeof x !== 'object') return void errors.push(`${key}[${i}] ไม่ใช่ออบเจกต์`);
        if (!x.id) errors.push(`${key}[${i}] ไม่มี field "id"`);
        if (!Array.isArray(x.items)) errors.push(`${key}[${i}] ไม่มี field "items" (ต้องเป็น array)`);
        if (!x.addr || typeof x.addr !== 'object') errors.push(`${key}[${i}] ไม่มี field "addr"`);
        if (!x.veh || typeof x.veh !== 'object') errors.push(`${key}[${i}] ไม่มี field "veh"`);
      });
    }
  }

  if (b.users !== undefined && !Array.isArray(b.users)) errors.push(`users ต้องเป็น array (พบ ${typeof b.users})`);
  if (b.seq !== undefined && b.seq !== null && typeof b.seq !== 'object') {
    errors.push(`seq ต้องเป็นออบเจกต์ (พบ ${typeof b.seq})`);
  }

  return errors;
}

/** ที่อยู่แบบข้อความบรรทัดเดียว — พอร์ตจาก addrLine() */
export function addrLine(a: Record<string, string> | undefined): string {
  if (!a) return '';
  const p: string[] = [];
  if (a.no) p.push(a.no);
  if (a.village) p.push(a.village);
  if (a.moo) p.push(`หมู่ ${a.moo}`);
  if (a.soi) p.push(`ซ.${a.soi}`);
  if (a.road) p.push(`ถ.${a.road}`);
  if (a.subdistrict) p.push(`แขวง/ต.${a.subdistrict}`);
  if (a.district) p.push(`เขต/อ.${a.district}`);
  if (a.province) p.push(a.province);
  if (a.zip) p.push(a.zip);
  return p.join(' ');
}

/** ชื่อผู้ติดต่อสำหรับแสดงผล — พอร์ตจาก custName() */
export function contactName(c: any): string {
  if (!c) return '';
  return c.type === 'company'
    ? (c.orgName || '')
    : [c.prefix, c.firstName, c.lastName].filter(Boolean).join(' ');
}

const emptyAddr = () => ({
  no: '', village: '', moo: '', soi: '', road: '',
  subdistrict: '', district: '', province: '', zip: '',
});

/**
 * เติมฟิลด์ที่ขาดและแปลงโครงสร้างเก่าให้เป็นรุ่นปัจจุบัน
 * ทำงานบนสำเนา ไม่แก้ไฟล์ต้นฉบับ
 */
export function normalizeBackup(raw: BackupFile): BackupFile {
  const db: BackupFile = structuredClone(raw);

  db.shop = { ...DEFAULT_SHOP, ...(db.shop ?? {}) };
  db.customers ??= [];
  db.products ??= [];
  db.quotes ??= [];
  db.receipts ??= [];
  db.purchases ??= [];
  db.expenses ??= [];
  db.invoices ??= [];
  db.users ??= [];
  db.ignoredItems ??= [];
  db.ui ??= {};
  if (!('lastExportAt' in db)) db.lastExportAt = null;

  db.lic = { installedAt: '', key: '', expires: '', ...(db.lic ?? {}) };

  if (!db.categories || !db.categories.length) db.categories = [...DEFAULT_CATEGORIES];

  // สิทธิ์ผู้ใช้รุ่นเก่าแยกเป็น quote/receipt/purchase — รุ่นใหม่รวมเป็น income/expense
  db.users.forEach((u: any) => {
    const p = u.perms || {};
    if (p.income === undefined) p.income = !!(p.quote || p.receipt);
    if (p.expense === undefined) p.expense = !!p.purchase;
    u.perms = p;
  });

  db.products.forEach((p: any) => { if (p.cat === undefined) p.cat = ''; });

  db.customers.forEach((c: any) => { if (!c.kind) c.kind = 'customer'; });

  // ทะเบียนผู้ขายแยกของรุ่นเก่า → ย้ายเข้าทะเบียนผู้ติดต่อชุดเดียวกัน
  const seq = { ...DEFAULT_SEQ, ...(db.seq ?? {}) };
  if (Array.isArray(db.vendors) && db.vendors.length) {
    for (const v of db.vendors) {
      if (db.customers.some((c: any) => c.id === v.id)) continue;
      seq.v = (seq.v || 0) + 1;
      db.customers.push({
        id: v.id,
        code: v.code || 'VEN-' + String(seq.v).padStart(4, '0'),
        kind: 'vendor',
        type: 'company',
        prefix: '', firstName: '', lastName: '',
        orgName: v.name || '',
        taxId: v.taxId || '',
        addr: emptyAddr(),
        addrText: v.addr || '',
        tel: v.tel || '', tel2: '', email: '', note: '',
        creditDays: Number(v.creditDays) || 0,
        created: v.created || '',
        vehicles: [],
      });
    }
  }
  db.vendors = [];

  db.customers.forEach((c: any) => {
    c.addr ??= emptyAddr();
    c.vehicles ??= [];
    c.vehicles.forEach((v: any) => {
      if (v.engineNo === undefined) v.engineNo = '';
      if (v.chassisNo === undefined) v.chassisNo = '';
    });
  });

  // ชนิดเอกสารของไฟล์รุ่นก่อน
  db.receipts.forEach((r: any) => { if (!r.kind) r.kind = 'RC'; });
  db.invoices.forEach((r: any) => { if (!r.kind) r.kind = 'IVT'; });

  // เอกสารรุ่นก่อนใช้เงื่อนไข cash/credit — แปลงเป็นสถานะชำระเงินแล้ว
  [...db.purchases, ...db.expenses].forEach((x: any) => {
    if (x.paidNow === undefined) x.paidNow = x.terms === 'cash';
    if (!x.payMethod) x.payMethod = 'เงินสด';
    if (x.payRef === undefined) x.payRef = '';
    if (x.payDate === undefined) x.payDate = '';
    x.payments ??= [];
  });

  [...db.quotes, ...db.invoices, ...db.receipts].forEach((d: any) => {
    d.payments ??= [];
    d.items ??= [];
  });

  db.seq = seq;
  return db;
}
