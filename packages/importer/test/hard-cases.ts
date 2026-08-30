/**
 * ไฟล์สำรองข้อมูลที่จงใจสร้างให้ "โหด" — เคสที่ชุดทดสอบจาก seedDemo() ไม่มี
 *
 * seedDemo() สร้างข้อมูลที่ถูกต้องสวยงามทุกใบ ซึ่งแปลว่าโค้ดหลายเส้นทางใน importer
 * ไม่เคยถูกรันเลย ไฟล์ในนี้เล็งไปที่จุดเหล่านั้นโดยตรง
 *
 * แต่ละ builder คืนไฟล์สำรองที่ใช้ได้จริงหนึ่งไฟล์ ประกอบกันได้อิสระ
 */

/** โครงว่างขั้นต่ำที่ผ่าน validateBackupShape() ของโปรแกรมเดิม */
export function emptyBackup(overrides: Record<string, any> = {}): any {
  return {
    schemaVersion: 1,
    shop: {
      name: 'อู่ทดสอบ', taxId: '0105561000111', addr: '1 ถ.ทดสอบ กรุงเทพมหานคร',
      tel: '02-000-0000', tel2: '', vatRate: 7, whtRate: 3, priceTier: 'A',
      logo: '', proposerName: '',
    },
    products: [], categories: [], customers: [], vendors: [],
    purchases: [], expenses: [], quotes: [], invoices: [], receipts: [],
    users: [], seq: { q: 0, r: 0, c: 0, p: 0, v: 0, e: 0, iv: 0, ivt: 0 },
    lic: { installedAt: '2026-01-01', key: '', expires: '' },
    ...overrides,
  };
}

const addr = (o: Partial<Record<string, string>> = {}) => ({
  no: '1', village: '', moo: '', soi: '', road: 'ทดสอบ',
  subdistrict: 'บางมด', district: 'จอมทอง', province: 'กรุงเทพมหานคร', zip: '10150', ...o,
});

const veh = (o: Record<string, string> = {}) => ({
  brand: 'Toyota', model: 'Revo', year: '2562', color: 'ขาว',
  plateA: 'กข', plateB: '1234', plateProv: 'กรุงเทพมหานคร',
  engineNo: '', chassisNo: '', mileage: '80000', ...o,
});

export const customer = (id: string, o: Record<string, any> = {}) => ({
  id, code: `CUS-${id}`, kind: 'customer', type: 'person',
  prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', orgName: '',
  taxId: '1100400123456', addr: addr(), addrText: '',
  tel: '081-000-0000', tel2: '', email: '', note: '',
  creditDays: 0, created: '2026-01-01', vehicles: [{ id: `v-${id}`, ...veh() }],
  ...o,
});

export const product = (id: string, o: Record<string, any> = {}) => ({
  id, code: `SKU-${id}`, oem: '', name: `สินค้า ${id}`, unit: 'ชิ้น', cat: '',
  cost: 100, pA: 200, pB: 180, pC: 160, qty: 10, min: 2, max: 20,
  lastMove: '2026-01-01', ...o,
});

export const receipt = (id: string, o: Record<string, any> = {}) => ({
  id, kind: 'RC', no: `RC-202601-${id}`, date: '2026-01-15',
  quoteId: null, quoteNo: '', invId: null, invNo: '',
  custId: null, custType: 'person', taxId: '', name: 'ลูกค้าเงินสด',
  addr: addr(), addrText: '', tel: '', email: '', veh: veh(),
  items: [{ pid: null, code: '-', oem: '', name: 'ค่าแรง', unit: 'รายการ', qty: 1, price: 1000, svc: true }],
  discount: 0, vatMode: 'ex', whtRate: 0,
  pay: { cash: true, cashAmt: 0, transfer: false, transferAmt: 0, card: false, cardAmt: 0, cardRef: '', credit: false, days: 30, due: '', ref: '' },
  creditDays: 30, warranty: '', receivedBy: '', deducted: false, payments: [],
  ...o,
});

export const purchase = (id: string, o: Record<string, any> = {}) => ({
  id, no: `PO-202601-${id}`, date: '2026-01-10', invNo: '',
  vendorId: null, vendorName: 'ร้านอะไหล่', vendorTaxId: '', vendorTel: '', vendorAddr: '',
  items: [{ pid: null, code: '-', oem: '', name: 'อะไหล่', unit: 'ชิ้น', qty: 1, price: 500 }],
  discount: 0, vatMode: 'ex', terms: 'cash', creditDays: 30, note: '',
  received: true, payments: [], paidNow: true, payMethod: 'เงินสด', payRef: '', payDate: '',
  ...o,
});

export const expense = (id: string, o: Record<string, any> = {}) => ({
  id, no: `EX-202601-${id}`, date: '2026-01-05', cat: 'other', invNo: '',
  payeeId: null, payeeName: 'ผู้รับเงิน', payeeTaxId: '', payeeTel: '', payeeAddr: '',
  items: [{ name: 'ค่าบริการ', qty: 1, price: 1000 }],
  discount: 0, vatMode: 'none', whtRate: 3, terms: 'cash', creditDays: 30, note: '',
  assetLife: 5, payments: [], paidNow: true, payMethod: 'เงินสด', payRef: '', payDate: '',
  ...o,
});

export const quote = (id: string, o: Record<string, any> = {}) => ({
  id, no: `QT-202601-${id}`, date: '2026-01-02', tier: 'A', status: 'open',
  custId: null, vehId: null, custType: 'person', taxId: '', name: 'ลูกค้า',
  addr: addr(), tel: '', tel2: '', email: '', veh: veh(),
  complaints: ['เบรกมีเสียง', '', ''], findings: ['ผ้าเบรกหมด', '', '', ''],
  items: [{ pid: null, code: '-', oem: '', name: 'ผ้าเบรก', unit: 'ชุด', qty: 1, price: 1500 }],
  discount: 0, vatMode: 'ex', approver: '', proposer: '',
  ...o,
});

/* =====================================================================
   เคสที่ 1 — ไฟล์จากโปรแกรมรุ่นเก่าสุด
   ขาดฟิลด์ที่รุ่นหลังเพิ่มเข้ามาเกือบทั้งหมด ต้องผ่าน normalizeBackup() ก่อน
   ===================================================================== */
export function legacyV1Backup(): any {
  return {
    // ไม่มี schemaVersion เลย
    shop: { name: 'อู่รุ่นเก่า', taxId: '0105561000222', addr: '9 ถ.เก่า', tel: '02-111-1111', vatRate: 7, priceTier: 'B' },
    products: [
      { id: 'p1', code: 'OLD-001', name: 'ผ้าเบรกรุ่นเก่า', unit: 'ชุด', cost: 300, pA: 600, pB: 550, pC: 500, qty: 5, min: 1, max: 10 },
      // ไม่มี cat / oem / lastMove
    ],
    // ไม่มี categories → ต้องเติมชุดตั้งต้นให้
    customers: [
      {
        id: 'c1', code: 'CUS-0001', type: 'person', prefix: 'นาย',
        firstName: 'ทดสอบ', lastName: 'รุ่นเก่า', orgName: '', taxId: '1100400000001',
        addr: addr(), tel: '081-111-1111', created: '2024-01-01',
        // ไม่มี kind → ต้องเติม 'customer'
        // รถไม่มี engineNo / chassisNo
        vehicles: [{ id: 'v1', brand: 'Isuzu', model: 'D-Max', year: '2560', color: 'เทา', plateA: 'บย', plateB: '9999', plateProv: 'นนทบุรี', mileage: '150000' }],
      },
    ],
    // ทะเบียนผู้ขายแยกแบบรุ่นเก่า → ต้องย้ายเข้า customers
    vendors: [
      { id: 'ven1', code: '', name: 'ห้างหุ้นส่วน อะไหล่เก่า', taxId: '0105561000333', addr: '5 ถ.อะไหล่ กรุงเทพมหานคร', tel: '02-222-2222', creditDays: 30, created: '2024-02-01' },
    ],
    purchases: [
      // ใช้ terms:'cash' แบบรุ่นเก่า ไม่มี paidNow / payMethod / payRef / payDate
      {
        id: 'po1', no: 'PO-202401-001', date: '2024-03-01', invNo: 'INV-777',
        vendorId: 'ven1', vendorName: 'ห้างหุ้นส่วน อะไหล่เก่า', vendorTaxId: '0105561000333', vendorTel: '02-222-2222', vendorAddr: '5 ถ.อะไหล่',
        items: [{ pid: 'p1', code: 'OLD-001', name: 'ผ้าเบรกรุ่นเก่า', unit: 'ชุด', qty: 2, price: 300 }],
        discount: 0, vatMode: 'ex', terms: 'cash', creditDays: 30, received: true,
      },
    ],
    expenses: [],
    quotes: [],
    // ใบส่งมอบรุ่นเก่าไม่มี kind → loadDB() เติม 'IVT'
    invoices: [
      {
        id: 'iv1', no: 'IV-202403-001', date: '2024-03-05',
        quoteId: null, custId: 'c1', custType: 'person', taxId: '1100400000001', name: 'นาย ทดสอบ รุ่นเก่า',
        addr: addr(), tel: '081-111-1111', email: '', veh: veh({ plateB: '9999' }),
        items: [{ pid: 'p1', code: 'OLD-001', name: 'ผ้าเบรกรุ่นเก่า', unit: 'ชุด', qty: 1, price: 600 }],
        discount: 0, vatMode: 'ex', whtRate: 0, creditDays: 30,
      },
    ],
    // ใบเสร็จรุ่นเก่าไม่มี kind → 'RC' · ไม่มี pay / payments
    receipts: [
      {
        id: 'rc1', no: 'RC-202403-001', date: '2024-03-06',
        quoteId: null, custId: 'c1', custType: 'person', taxId: '', name: 'นาย ทดสอบ รุ่นเก่า',
        addr: addr(), tel: '', email: '', veh: veh({ plateB: '9999' }),
        items: [{ pid: null, code: 'LAB', name: 'ค่าแรงเปลี่ยนผ้าเบรก', unit: 'รายการ', qty: 1, price: 500 }],
        discount: 0, vatMode: 'ex', whtRate: 3, deducted: true,
      },
    ],
    // สิทธิ์ผู้ใช้แบบรุ่นเก่า — คีย์ quote / receipt / purchase
    users: [
      { id: 'u1', code: 'U01', pass: 'ABCD1234', name: 'ช่างเอ', active: true, created: '2024-01-01',
        perms: { quote: true, receipt: true, purchase: false, stock: true, finance: false, customer: true } },
      { id: 'u2', code: 'U02', pass: 'WXYZ9999', name: 'ธุรการ', active: false, created: '2024-01-01',
        perms: { quote: false, receipt: false, purchase: true, stock: false, finance: true, customer: false } },
    ],
    seq: { q: 3, r: 1, c: 1, p: 1, v: 1 },   // ไม่มีคีย์ iv / ivt / e
    // ไม่มี lic / ignoredItems / ui
  };
}

/* =====================================================================
   เคสที่ 2 — เอกสารที่ราคารวมภาษีมูลค่าเพิ่มแล้ว (vatMode 'in')
   ชุดจาก seedDemo() ไม่มีเลยแม้แต่ใบเดียว ทั้งที่สูตรมีสาขาเฉพาะสำหรับกรณีนี้
   ===================================================================== */
export function vatInclusiveBackup(): any {
  return emptyBackup({
    customers: [customer('c1')],
    receipts: [
      // ค่าแรงล้วน ราคารวม VAT — ฐานหัก ณ ที่จ่ายต้องถอด VAT ออกก่อน
      receipt('1', {
        vatMode: 'in', whtRate: 3,
        items: [{ pid: null, code: 'LAB', name: 'ค่าแรง', unit: 'รายการ', qty: 1, price: 1070, svc: true }],
      }),
      // ปนอะไหล่กับค่าแรง มีส่วนลด ราคารวม VAT
      receipt('2', {
        vatMode: 'in', whtRate: 3, discount: 200,
        items: [
          { pid: null, code: 'SKU', name: 'อะไหล่', unit: 'ชิ้น', qty: 2, price: 1500 },
          { pid: null, code: 'LAB', name: 'ค่าแรง', unit: 'รายการ', qty: 1, price: 800, svc: true },
        ],
      }),
    ],
    purchases: [purchase('1', { vatMode: 'in', items: [{ pid: null, code: '-', name: 'อะไหล่', unit: 'ชิ้น', qty: 1, price: 2140 }] })],
    expenses: [expense('1', { vatMode: 'in', whtRate: 5, cat: 'rent', items: [{ name: 'ค่าเช่า', qty: 1, price: 21400 }] })],
    seq: { q: 0, r: 2, c: 1, p: 1, v: 0, e: 1, iv: 0, ivt: 0 },
  });
}

/* =====================================================================
   เคสที่ 3 — ข้อมูลสกปรกแบบที่พบในไฟล์จริง
   ===================================================================== */
export function messyBackup(): any {
  return emptyBackup({
    shop: {
      name: 'อู่ข้อมูลเพี้ยน',
      taxId: '0105-561-000-444',          // มีขีดคั่น ต้องเหลือแต่ตัวเลข
      addr: '', tel: '', tel2: '', vatRate: 7, whtRate: 3, priceTier: 'Z',   // priceTier ไม่ถูกต้อง
      logo: 'data:image/png;base64,iVBORw0KGgo=',                            // ต้องเตือนเรื่องโลโก้
      proposerName: '',
    },
    products: [
      product('1', { code: 'DUP-001' }),
      product('2', { code: 'DUP-001' }),   // รหัสซ้ำ
      product('3', { code: 'DUP-001' }),   // ซ้ำอีก
      product('4', { qty: -3 }),           // สต๊อกติดลบ (ขายเกินที่มี)
      product('5', { qty: 0 }),            // ไม่มีของ ไม่ต้องลงรายการยกมา
    ],
    customers: [
      // นิติบุคคลที่ไม่มีชื่อบริษัท
      customer('1', { type: 'company', orgName: '', firstName: '', lastName: '', code: 'X-001' }),
      // บุคคลที่ไม่มีชื่อเลย
      customer('2', { type: 'person', firstName: '', lastName: '', orgName: '', code: 'X-002' }),
      // เลขผู้เสียภาษีไม่ครบ 13 หลัก
      customer('3', { taxId: '123', code: 'X-003' }),
      // รหัสผู้ติดต่อซ้ำ
      customer('4', { code: 'X-003' }),
      // ไม่มีรถ
      customer('5', { code: 'X-005', vehicles: [] }),
    ],
    receipts: [
      // อ้างสินค้าที่ถูกลบไปแล้ว
      receipt('1', {
        items: [{ pid: 'ไม่มีอยู่จริง', code: 'GONE', name: 'สินค้าที่ถูกลบ', unit: 'ชิ้น', qty: 1, price: 900 }],
      }),
      // มีรายการชื่อว่าง และยอดชำระศูนย์/ติดลบที่ต้องข้าม
      receipt('2', {
        items: [{ pid: null, code: '-', name: '', unit: '', qty: 1, price: 100 }],
        payments: [
          { id: 'pay1', date: '2026-01-15', amount: 0, method: 'เงินสด', ref: '', atIssue: true },
          { id: 'pay2', date: '2026-01-16', amount: -50, method: 'เงินสด', ref: 'คืนเงิน', atIssue: false },
          { id: 'pay3', date: '2026-01-17', amount: 107, method: 'เงินโอน', ref: '', atIssue: false },
        ],
      }),
      // ตัวเลขมาเป็นข้อความพร้อมคอมมา
      receipt('3', {
        items: [{ pid: null, code: '-', name: 'อะไหล่', unit: 'ชิ้น', qty: '2', price: '1,250.50' }],
        discount: '100',
      }),
    ],
    expenses: [
      // assetLife ติดมากับหมวดที่ไม่ใช่สินทรัพย์ — ต้องไม่ถูกบันทึก (ติด CHECK)
      expense('1', { cat: 'rent', assetLife: 7, whtRate: 5 }),
      // หมวดสินทรัพย์ที่มีอายุการใช้งานจริง
      expense('2', { cat: 'asset', assetLife: 10, whtRate: 0 }),
    ],
    quotes: [
      quote('1', { status: 'open' }),      // ชุด seedDemo ไม่มีสถานะนี้เลย
      quote('2', { status: 'billed' }),
    ],
    ignoredItems: ['  ค่าแรง  ทั่วไป ', 'ค่าแรง ทั่วไป', 'ค่าแรง ทั่วไป', 'ล้างแอร์'],   // ซ้ำหลังตัดช่องว่าง
    lic: { installedAt: '2025-06-01', key: 'DGL-ABCD-EFGH', expires: '2027-06-01' },
    seq: { q: 2, r: 3, c: 5, p: 0, v: 0, e: 2, iv: 0, ivt: 0 },
  });
}

/* =====================================================================
   เคสที่ 4 — ชนิดเอกสารขัดกับโหมดภาษี
   enforceVat() ของโปรแกรมเดิมบังคับไว้ แต่ไฟล์ที่ถูกแก้มือ/รุ่นเก่าอาจหลุด
   ===================================================================== */
export function wrongVatModeBackup(): any {
  return emptyBackup({
    invoices: [
      { ...receipt('1'), id: 'iv1', kind: 'IV', no: 'IV-202601-001', vatMode: 'ex' },    // IV ต้องไม่มี VAT
      { ...receipt('2'), id: 'iv2', kind: 'IVT', no: 'IVT-202601-001', vatMode: 'none' }, // IVT ต้องมี VAT
    ],
    seq: { q: 0, r: 0, c: 0, p: 0, v: 0, e: 0, iv: 1, ivt: 1 },
  });
}

/* =====================================================================
   เคสที่ 5 — เลขที่เอกสารซ้ำ
   ตารางใหม่บังคับ UNIQUE (tenant_id, kind, doc_no) แต่ของเดิมไม่ได้บังคับอะไรเลย
   ===================================================================== */
export function duplicateDocNoBackup(): any {
  return emptyBackup({
    receipts: [
      receipt('1', { no: 'RC-202601-001' }),
      receipt('2', { no: 'RC-202601-001' }),   // เลขซ้ำ
      receipt('3', { no: 'RC-202601-001' }),   // ซ้ำอีก
      receipt('4', { no: '' }),                // ไม่มีเลขที่เลย
      receipt('5', { no: '' }),
    ],
    seq: { q: 0, r: 5, c: 0, p: 0, v: 0, e: 0, iv: 0, ivt: 0 },
  });
}

/* =====================================================================
   เคสที่ 6 — เอกสารเยอะพอให้ต้องแบ่งก้อนตอน INSERT
   ตัวแทรกแบ่งก้อนที่ ~1,363 แถว ถ้าลำดับ QT → IV → RC ผิด
   ใบเสร็จในก้อนแรกจะอ้างใบส่งมอบที่ยังไม่ถูกแทรก แล้ว FK พัง
   ===================================================================== */
export function largeChainBackup(count = 900): any {
  const quotes: any[] = [];
  const invoices: any[] = [];
  const receipts: any[] = [];

  for (let i = 0; i < count; i++) {
    const q = quote(String(i), { no: `QT-202601-${i}`, status: 'billed' });
    quotes.push(q);

    const inv = {
      ...receipt(String(i)), id: `inv-${i}`, kind: 'IVT', no: `IVT-202601-${i}`,
      quoteId: q.id, vatMode: 'ex',
    };
    invoices.push(inv);

    receipts.push(receipt(String(i), {
      id: `rc-${i}`, no: `RC-202601-${i}`, invId: inv.id, quoteId: q.id,
    }));
  }

  return emptyBackup({
    quotes, invoices, receipts,
    seq: { q: count, r: count, c: 0, p: 0, v: 0, e: 0, iv: 0, ivt: count },
  });
}
