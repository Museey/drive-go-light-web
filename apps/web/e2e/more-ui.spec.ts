import { expect, test, type Page, type TestInfo } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ปรับแก้อีก 8 ข้อ (PLAN-more-ui-2569-09-15.md) — วัดจากหน้าจริงทั้ง 3 ขนาดจอ
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/** หัวการ์ดฟอร์มสร้างเอกสาร + เลขที่ตัวอย่างที่ขึ้นในหน้า */
const formState = (page: Page) => page.evaluate(() => ({
  head: [...document.querySelectorAll('.card > header h2')].map((h) => h.textContent?.trim() ?? '')
    .find((t) => t.startsWith('สร้าง')) ?? '',
  docNo: (document.body.innerText.match(/\b(QT|IVT|IV|RC|PO|EX)\d{10}\b/) ?? [''])[0],
}));

/** ลิงก์ไปชนิดเอกสาร — แท็บเมนูย่อย (แท็บเล็ต/เดสก์ท็อปอยู่ในหัวหน้า · มือถือเป็นไทล์ใต้หัวหน้า) */
const tab = (page: Page, href: string) =>
  page.locator(`.subnav a[href$="${href}"]`).filter({ visible: true }).first();

/* ข้อ 8 — กดย้ายชนิดเอกสารในหน้าเดียวกัน (ไม่รีเฟรช) ฟอร์มต้องเปลี่ยนตาม */
test('รายรับ: กดแท็บใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ ฟอร์มเปลี่ยนตามทุกครั้ง', async ({ page }) => {
  await page.goto('/income?kind=QT');
  await expect.poll(async () => (await formState(page)).head).toBe('สร้างใบเสนอราคา');
  expect((await formState(page)).docNo).toMatch(/^QT/);

  await tab(page, '/income?kind=IVT').click();
  await expect(page).toHaveURL(/kind=IVT/);
  await expect.poll(async () => (await formState(page)).docNo, { message: 'เลขที่ต้องเป็น IVT' }).toMatch(/^IVT/);
  expect((await formState(page)).head).not.toBe('สร้างใบเสนอราคา');

  await tab(page, '/income?kind=RC').click();
  await expect(page).toHaveURL(/kind=RC/);
  await expect.poll(async () => (await formState(page)).docNo, { message: 'เลขที่ต้องเป็น RC' }).toMatch(/^RC/);
  expect((await formState(page)).head).toBe('สร้างใบเสร็จรับเงิน');
});

test('รายจ่าย: กดจากใบซื้อไปค่าใช้จ่าย ฟอร์มเปลี่ยนตาม', async ({ page }) => {
  await page.goto('/expense?kind=PO');
  await expect.poll(async () => (await formState(page)).docNo).toMatch(/^PO/);

  await tab(page, '/expense?kind=EX').click();
  await expect(page).toHaveURL(/kind=EX/);
  await expect.poll(async () => (await formState(page)).docNo, { message: 'เลขที่ต้องเป็น EX' }).toMatch(/^EX/);
  expect((await formState(page)).head).not.toBe('สร้างใบซื้อสินค้า');
});

/* ข้อ 1 — กดติดเฉพาะช่องสี่เหลี่ยม */
test('สินค้า: ช่องติ๊กเปิดใช้งาน คลิกข้อความไม่สลับ คลิกช่องสลับ', async ({ page }) => {
  await page.goto('/stock/new');
  const box = page.locator('input[name="active"]');
  await expect(box).toBeChecked();
  await page.getByText('เปิดใช้งาน — สินค้าที่ปิดจะไม่ขึ้นในรายการ').click();
  await expect(box, 'คลิกข้อความแล้วช่องต้องไม่เปลี่ยน').toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
});

/* ข้อ 3 — คอลัมน์ชื่อพอดีข้อมูล ไม่ขยายตามจอ */
test('ทะเบียนลูกค้า: คอลัมน์ชื่อไม่กว้างเกินข้อมูล และชื่อไม่ถูกตัด', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ตารางพอดีหน้าเฉพาะเดสก์ท็อป · จอเล็กเลื่อนในกรอบตาราง');
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/customers');
    const m = await page.locator('table.hist').first().evaluate((t) => {
      const cell = t.querySelector('tbody tr td:nth-child(2)') as HTMLElement;
      const names = [...t.querySelectorAll('tbody tr td:nth-child(2) > b')] as HTMLElement[];
      return {
        col: cell.getBoundingClientRect().width,
        clipped: names.filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > (b.parentElement as HTMLElement).getBoundingClientRect().right + 1).length,
      };
    });
    expect(m.col, `กว้าง ${w}: คอลัมน์ชื่อ ${Math.round(m.col)}px`).toBeLessThanOrEqual(260);
    expect(m.clipped, `กว้าง ${w}: ชื่อถูกตัด`).toBe(0);
  }
});

/* ข้อ 4 — ขีดเหลืองใต้เมนู 06 ทุกหน้าในหมวดการเงิน */
for (const path of ['/finance/sales', '/finance/ar', '/finance/ap', '/finance/pl']) {
  test(`เมนูหลัก 06 มีขีดเหลืองเมื่ออยู่หน้า ${path}`, async ({ page }, info) => {
    test.skip(info.project.name === 'มือถือ', 'มือถือใช้แถบล่าง · เมนู 06 อยู่ในลิ้นชัก');
    await page.goto(path);
    const current = page.locator('.rail .navbtn[aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('aria-label', /^06 /);
    const bar = await current.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    expect(bar).not.toBe('rgba(0, 0, 0, 0)');
  });
}

/* ข้อ 5 — แท่งยอดขายแต่ละเดือนสีต่างกัน ไล่อ่อน → เข้ม */
test('หน้าแรก: แท่งยอดขายหกเดือนสีต่างกัน เดือนปัจจุบันเข้มสุด', async ({ page }) => {
  await page.goto('/');
  const fills = await page.locator('svg[aria-label="ยอดขายหกเดือนล่าสุด"] rect').evaluateAll((els) => els.map((e) => e.getAttribute('fill') ?? ''));
  expect(fills.length).toBeGreaterThanOrEqual(2);
  expect(new Set(fills).size, fills.join(' ')).toBe(fills.length);
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  for (let i = 1; i < fills.length; i++) expect(lum(fills[i]!), `แท่งที่ ${i + 1}`).toBeLessThan(lum(fills[i - 1]!));
});

/* ข้อ 7 — หน้ารายการเอกสารเมนู 03: ไม่มีปุ่มค้นหาซ้ำซ้อน ไม่มี dropdown เดือน */
for (const path of ['/income?kind=RC&hist=1', '/income?hist=1', '/income/billing?hist=1', '/income/walkin?hist=1']) {
  test(`เมนู 03 ค้นหาไม่ซ้ำซ้อน — ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('form button[type="submit"]', { hasText: /^ค้นหา$/ })).toHaveCount(0);
    await expect(page.locator('select[name="month"]')).toHaveCount(0);
    /* ตั้งแต่–ถึง จากปฏิทินยังอยู่ */
    await expect(page.locator('input[name="from"]')).toHaveCount(1);
    await expect(page.locator('input[name="to"]')).toHaveCount(1);
  });
}

test('เมนู 03: พิมพ์คำค้นแล้ว Enter กรองรายการจริง', async ({ page }) => {
  await page.goto('/income?kind=RC&hist=1');
  const first = (await page.locator('table.hist tbody tr td.docno').first().innerText()).trim();
  const q = page.locator('input.in.search[name="q"]').first();
  await q.fill(first);
  await q.press('Enter');
  await expect(page).toHaveURL(new RegExp(`q=${first}`));
  await expect(page.locator('table.hist tbody tr td.docno')).toHaveText([first]);
});

test('ใบวางบิล: พิมพ์คำค้นแล้ว Enter ค้นได้โดยไม่มีปุ่มค้นหา', async ({ page }) => {
  await page.goto('/income/billing?hist=1');
  const q = page.locator('input.in.search[name="q"]').first();
  await q.fill('ไม่มีใบไหนชื่อนี้แน่นอน');
  await q.press('Enter');
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.locator('.empty').filter({ hasText: 'ยังไม่มีใบวางบิล' })).toBeVisible();
});

test('เมนูอื่นยังมี dropdown เดือน (ขอบเขตไม่ลาม) · ฟอร์มใบใหม่ยังค้นลูกค้าแบบ dropdown ได้', async ({ page }) => {
  await page.goto('/expense?kind=PO&hist=1');
  await expect(page.locator('select[name="month"]')).toHaveCount(1);

  await page.goto('/income?kind=QT');
  await expect(page.locator('#scan'), 'รอหน้าพร้อม — ช่องยิงบาร์โค้ดดึงโฟกัสเสร็จ').toBeFocused();
  const cust = page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first();
  await cust.fill('ก');
  await expect(page.locator('.hits5').first(), 'ช่องค้นหาลูกค้าในฟอร์มยังเปิดรายการให้เลือก').toBeVisible();
});

/* ---------- ข้อ 1 · 2 สร้างสินค้าจริงผ่านฟอร์ม แล้วตรวจที่ฐานข้อมูล ---------- */

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const dropProducts = (prefix: string) =>
  db((c) => c.query(`delete from products where code like $1`, [`${prefix}%`]));

/** รหัสไม่ซ้ำกันข้ามขนาดจอที่รันพร้อมกัน */
const codeTag = (info: TestInfo, k: string) =>
  `ZT${k}${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;

async function fillNewProduct(page: Page, code: string) {
  await page.goto('/stock/new');
  await page.locator('#code').fill(code);
  await page.locator('#name').fill(`สินค้าทดสอบ ${code}`);
}

test('สินค้า: ไม่ติ๊กเปิดใช้งาน → บันทึกเป็นปิดจริง และค้นไม่เจอตอนออกเอกสาร (ตัวที่เปิดยังเจอ)', async ({ page }, info) => {
  const tag = codeTag(info, 'A');
  try {
    for (const [code, on] of [[`${tag}-ON`, true], [`${tag}-OFF`, false]] as const) {
      await fillNewProduct(page, code);
      if (!on) await page.locator('input[name="active"]').uncheck();
      await page.getByRole('button', { name: 'บันทึกสินค้า' }).click();
      /* บันทึกแล้วกลับฟอร์มเปล่าพร้อมการ์ด (ผู้ใช้กำหนด 16 ก.ย. 2569 — เดิมไปหน้าสินค้า) */
      await expect(page).toHaveURL(/\/stock\/new\?saved=product&savedId=[0-9a-f-]{36}/);
    }
    const rows = await db((c) => c.query(`select code, active from products where code like $1 order by code`, [`${tag}%`]));
    expect(rows.rows).toEqual([{ code: `${tag}-OFF`, active: false }, { code: `${tag}-ON`, active: true }]);

    await page.goto('/income?kind=QT');
    /* ช่องยิงบาร์โค้ดดึงโฟกัสไปหาตัวเองเมื่อหน้าพร้อม — รอให้ดึงเสร็จก่อน ไม่งั้นข้อความที่พิมพ์ไหลไปเข้าช่องยิง (เหมือน scan.spec) */
    await expect(page.locator('#scan')).toBeFocused();
    await page.getByPlaceholder('พิมพ์รหัส / ชื่อ').first().fill(tag);
    const hits = page.locator('tr.hitrow tr.pick');
    await expect(hits.filter({ hasText: `${tag}-ON` }), 'ตัวที่เปิดต้องค้นเจอ (ยืนยันว่าค้นหาทำงาน)').toHaveCount(1);
    await expect(hits.filter({ hasText: `${tag}-OFF` }), 'ตัวที่ปิดต้องไม่ขึ้น').toHaveCount(0);
  } finally {
    await dropProducts(tag);
  }
});

test('สินค้าใหม่: เลือกรูปในฟอร์มได้เลย บันทึกแล้วหน้าสินค้ามีรูป', async ({ page }, info) => {
  const code = codeTag(info, 'P');
  try {
    await fillNewProduct(page, code);
    const png = await page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = 640; cv.height = 480;
      const x = cv.getContext('2d')!;
      x.fillStyle = '#237F59'; x.fillRect(0, 0, 640, 480);
      x.fillStyle = '#F2C200'; x.fillRect(120, 90, 400, 300);
      return cv.toDataURL('image/png').split(',')[1]!;
    });
    await page.locator('#picPick').setInputFiles({ name: 'part.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.getByAltText('รูปสินค้าที่เลือก')).toBeVisible();

    await page.getByRole('button', { name: 'บันทึกสินค้า' }).click();
    /* บันทึกแล้วกลับฟอร์มเปล่าพร้อมการ์ด (ผู้ใช้กำหนด 16 ก.ย. 2569) — เปิดหน้าสินค้าจาก id ที่บันทึก */
    await expect(page).toHaveURL(/\/stock\/new\?saved=product&savedId=[0-9a-f-]{36}/);
    await page.goto(`/stock/${new URL(page.url()).searchParams.get('savedId')}`);
    const img = page.getByAltText('รูปสินค้า', { exact: true });
    await expect(img).toHaveAttribute('src', /^\/pics\//);
    expect(await img.evaluate((el: HTMLImageElement) => el.decode().then(() => el.naturalWidth))).toBe(640);

    const pic = await db((c) => c.query(
      `select pp.width, pp.height from product_pics pp join products p on p.id = pp.product_id where p.code = $1`, [code]));
    expect(pic.rows).toEqual([{ width: 640, height: 480 }]);
  } finally {
    await dropProducts(code);
  }
});

test('สินค้าใหม่: ไฟล์ที่ไม่ใช่รูปถูกปฏิเสธ ทั้งที่หน้าเว็บและที่เซิร์ฟเวอร์ — ไม่มีสินค้าค้าง', async ({ page }, info) => {
  const code = codeTag(info, 'X');
  try {
    await fillNewProduct(page, code);

    /* หน้าเว็บ: เลือกไฟล์ข้อความ → ย่อไม่ได้ บอกเป็นภาษาไทย */
    await page.locator('#picPick').setInputFiles({ name: 'note.png', mimeType: 'image/png', buffer: Buffer.from('ไม่ใช่รูป') });
    await expect(page.locator('.err').filter({ hasText: 'เปิดไฟล์นี้เป็นรูปไม่ได้' })).toBeVisible();

    /* เซิร์ฟเวอร์: ส่งไบต์ปลอมตรงเข้าช่องซ่อน (เหมือนผู้ส่งข้ามหน้าเว็บ) → ต้องตรวจไบต์จริงแล้วยกเลิกทั้งรายการ */
    const junk = { name: 'full.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image at all') };
    await page.locator('input[name="picFull"]').setInputFiles(junk);
    await page.locator('input[name="picThumb"]').setInputFiles({ ...junk, name: 'thumb.jpg' });
    await page.getByRole('button', { name: 'บันทึกสินค้า' }).click();

    await expect(page.locator('.err').filter({ hasText: 'รูปสินค้าใช้ไม่ได้' })).toBeVisible();
    await expect(page).toHaveURL(/\/stock\/new/);
    await expect(page.locator('#name'), 'ค่าที่กรอกไว้ยังอยู่').toHaveValue(`สินค้าทดสอบ ${code}`);
    const n = await db((c) => c.query(`select count(*)::int as n from products where code = $1`, [code]));
    expect(n.rows[0].n, 'สินค้าต้องไม่ถูกสร้าง').toBe(0);
  } finally {
    await dropProducts(code);
  }
});

test('ใบวางบิล: สลับ IVT → IV ลูกค้าและใบที่ติ๊กไว้ถูกล้าง ไม่ติดไปบันทึกกับใบวางบิลอีกชนิด', async ({ page }) => {
  await page.goto('/income/billing?vat=yes');
  const party = page.locator('#partyKey');
  const first = await party.locator('option').nth(1).getAttribute('value');
  test.skip(!first, 'ไม่มีลูกค้าที่มีใบค้างในข้อมูลตัวอย่าง');
  await party.selectOption(first!);
  await expect(party).toHaveValue(first!);
  await page.locator('form tbody input[type="checkbox"]:not([disabled])').first().check();
  const docs = page.locator('form input[type="hidden"][name="doc"]');
  await expect(docs, 'ติ๊กใบ IVT แล้วต้องมีใบในฟอร์ม (ยืนยันว่าเตรียมสภาพถูก)').toHaveCount(1);

  await page.locator('a.tile.act[href$="vat=no"]').first().click();
  await expect(page).toHaveURL(/vat=no/);
  /* ดู select อย่างเดียวไม่พอ — ลูกค้าที่ค้างไม่มีในรายการ IV เบราว์เซอร์แสดงตัวเลือกว่างทั้งที่ state ยังค้าง
     ใบที่ติ๊กค้างเป็นช่องซ่อน name="doc" ซึ่งจะถูกส่งไปบันทึกจริง */
  await expect(docs, 'ใบ IVT ที่ติ๊กไว้ต้องไม่ติดไปฟอร์ม IV').toHaveCount(0);
  await expect(page.locator('#partyKey')).toHaveValue('');
});
