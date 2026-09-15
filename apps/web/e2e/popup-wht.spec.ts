import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * popup บันทึก · หัก ณ ที่จ่าย 1,000 บาท · หน้าเอกสารไม่มี VAT · ตารางลูกค้า · หน้ารายรับเปิดมาเห็นหัว
 * (PLAN-save-popup-wht-2569-09-16.md) — วัดจากหน้าจริงทั้ง 3 ขนาดจอ
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/* ---------- ข้อ 6 — เปิดหน้าที่มีช่องยิงบาร์โค้ด ต้องเห็นหัวเอกสาร ---------- */

for (const path of ['/income?kind=QT', '/income?kind=IVT', '/income?kind=IV', '/income?kind=RC', '/income/walkin', '/expense?kind=PO']) {
  test(`เปิด ${path} แล้วเห็นหัวเอกสาร ไม่เลื่อนไปกลางหน้า · ช่องยิงยังพร้อมยิง`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('#scan'), 'ช่องยิงบาร์โค้ดยังได้โฟกัสทันที').toBeFocused();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => Math.round(window.scrollY)), 'หน้าต้องอยู่บนสุด').toBe(0);
  });
}

/* ---------- ข้อ 4 — หน้าเปิดดูเอกสารไม่คิดภาษี ---------- */

test('หน้าเปิดดูใบส่งมอบไม่มี VAT: ไม่แสดงมูลค่าก่อนภาษี / ภาษีมูลค่าเพิ่ม · ใบกำกับภาษียังแสดง', async ({ page }) => {
  const ids = await db((c) => c.query(
    `select kind::text, (array_agg(id order by doc_date desc))[1] as id from documents
      where kind in ('IV', 'IVT') and purged_at is null
        and ((kind = 'IV' and vat_mode = 'none') or (kind = 'IVT' and vat_mode <> 'none'))
      group by kind`));
  const by = Object.fromEntries(ids.rows.map((r) => [r.kind, r.id]));
  test.skip(!by.IV || !by.IVT, 'ข้อมูลตัวอย่างไม่มีใบ IV/IVT');

  await page.goto(`/income/${by.IV}`);
  const totals = page.locator('.totals').first();
  await expect(totals.getByText('รวมทั้งสิ้น')).toBeVisible();
  await expect(totals.getByText('มูลค่าก่อนภาษี')).toHaveCount(0);
  await expect(totals.getByText(/ภาษีมูลค่าเพิ่ม/)).toHaveCount(0);

  await page.goto(`/income/${by.IVT}`);
  await expect(page.locator('.totals').first().getByText('มูลค่าก่อนภาษี')).toBeVisible();
});

/* ---------- ข้อ 5 — ทะเบียนลูกค้า ---------- */

test('ทะเบียนลูกค้า: คอลัมน์ทะเบียนแสดงทะเบียนรถจริง ไม่ใช่ "รถ n คัน"', async ({ page }) => {
  const r = await db((c) => c.query(
    `select k.code, v.plate_a, v.plate_b from contacts k join vehicles v on v.contact_id = k.id
      where k.kind = 'customer' and coalesce(v.plate_b, '') <> '' order by k.code, v.created_at limit 1`));
  test.skip(!r.rows[0], 'ข้อมูลตัวอย่างไม่มีลูกค้าที่มีรถ');
  const { code, plate_a: a, plate_b: b } = r.rows[0];

  await page.goto(`/customers?kind=customer&q=${encodeURIComponent(code)}`);
  const row = page.locator('table.hist tbody tr').filter({ hasText: code }).first();
  await expect(row).toContainText(`${a} ${b}`.trim());
  await expect(row).not.toContainText(/รถ \d+ คัน/);
});

test('ทะเบียนลูกค้า: ค่าเริ่มต้นซ่อน ที่อยู่ · เครดิต · ยอดสะสม — ติ๊กเปิดแล้วขึ้นและจำค่า', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าที่ตั้งเป็นของทั้งอู่ — ตรวจขนาดจอเดียว กันขนาดจออื่นที่รันพร้อมกันเห็นค่าที่กำลังเปลี่ยน');
  const reset = () => db((c) => c.query(`update tenants set ui_prefs = coalesce(ui_prefs, '{}'::jsonb) - 'custHide'`));
  await reset();
  try {
    await page.goto('/customers?kind=customer');
    const head = (label: string) => page.locator('table.hist thead th').filter({ hasText: new RegExp(`^${label}$`) });
    await expect(head('ที่อยู่')).toHaveCount(0);
    await expect(head('เครดิต')).toHaveCount(0);
    await expect(head('ยอดสะสม')).toHaveCount(0);
    await expect(head('คงค้าง'), 'คอลัมน์ที่ไม่ได้สั่งซ่อนยังอยู่').toHaveCount(1);
    await expect(head('โทรศัพท์')).toHaveCount(1);

    await page.getByRole('button', { name: /ตั้งค่าการแสดงผล/ }).click();
    await page.locator('label.tile').filter({ hasText: /^ที่อยู่$/ }).locator('input').check();
    await page.getByRole('button', { name: 'บันทึกการแสดงผล' }).click();
    await expect(head('ที่อยู่')).toHaveCount(1);

    await page.reload();
    await expect(head('ที่อยู่'), 'จำค่าหลังรีเฟรช').toHaveCount(1);
    await expect(head('เครดิต')).toHaveCount(0);
  } finally {
    await reset();
  }
});

test('ทะเบียนสินค้า: การ์ดตั้งค่าการแสดงผลยังใช้ได้หลังแยกเป็นของใช้ร่วม', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าที่ตั้งเป็นของทั้งอู่ — ตรวจขนาดจอเดียว');
  const saved = await db((c) => c.query(`select ui_prefs -> 'stockHide' as hide from tenants limit 1`));
  const restore = () => db((c) => c.query(
    `update tenants set ui_prefs = case when $1::jsonb is null then coalesce(ui_prefs, '{}'::jsonb) - 'stockHide'
       else jsonb_set(coalesce(ui_prefs, '{}'::jsonb), '{stockHide}', $1::jsonb, true) end`,
    [saved.rows[0]?.hide == null ? null : JSON.stringify(saved.rows[0].hide)]));
  try {
    await db((c) => c.query(`update tenants set ui_prefs = coalesce(ui_prefs, '{}'::jsonb) - 'stockHide'`));
    await page.goto('/stock');
    /* หน้านี้มีตารางหมวดหมู่ด้วย (หัวคอลัมน์ "หมวดหมู่" เหมือนกัน) — ดูเฉพาะตารางสินค้า */
    const products = page.locator('table').filter({ has: page.locator('thead th', { hasText: /^ชื่อสินค้า$/ }) });
    await expect(products, 'หาตารางสินค้าเจอ — ไม่งั้นข้อต่อไปผ่านเปล่า ๆ').toHaveCount(1);
    const head = products.locator('thead th').filter({ hasText: /^หมวดหมู่$/ });
    await expect(head, 'พื้นฐานไม่มีคอลัมน์หมวดหมู่').toHaveCount(0);
    await page.getByRole('button', { name: /ตั้งค่าการแสดงผล/ }).click();
    await expect(page.getByRole('heading', { name: 'ตั้งค่าการแสดงผลรายการสินค้า' })).toBeVisible();
    await page.locator('label.tile').filter({ hasText: /^หมวดหมู่$/ }).locator('input').check();
    await page.getByRole('button', { name: 'บันทึกการแสดงผล' }).click();
    await expect(head).toHaveCount(1);
  } finally {
    await restore();
  }
});

test('ทะเบียนลูกค้า: ตัวอักษรใหญ่ขึ้น — ชื่อ 16px · ข้อมูล 15px', async ({ page }) => {
  await page.goto('/customers?kind=customer');
  const row = page.locator('table.hist tbody tr').first();
  expect(await row.locator('td').nth(1).locator('b').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px');
  expect(await row.locator('td').nth(2).evaluate((e) => getComputedStyle(e).fontSize)).toBe('15px');
});

/* ---------- ข้อ 1–2 — การ์ดบันทึกแล้ว (ขนาดนามบัตรกลางจอ) ---------- */

const savedCard = (page: Page) => page.getByRole('dialog', { name: /บันทึก/ });

/** การ์ดอยู่กลางจอ และไม่กว้างเกินนามบัตร (มือถือเว้นขอบจอข้างละ 16px) */
async function expectCentredCard(page: Page) {
  const c = savedCard(page);
  await expect(c).toBeVisible();
  const box = (await c.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2), 'กึ่งกลางแนวนอน').toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2), 'กึ่งกลางแนวตั้ง').toBeLessThanOrEqual(2);
  expect(box.width, `กว้าง ${Math.round(box.width)}px — ขนาดนามบัตรไม่เกิน 380`).toBeLessThanOrEqual(Math.min(380, vp.width - 32) + 1);
}

/**
 * การ์ดของทุกหน้าที่การบันทึกพากลับมา — ใส่ค่า saved/savedId ด้วยข้อมูลจริงในฐาน
 * ข้อมูลในการ์ดต้องมาจากฐาน (เลขที่ตรงกับ id) ไม่ใช่จาก URL
 */
const LANDINGS = [
  { path: '/income?kind=QT', kind: 'sales', sql: `select id, doc_no as no from documents where kind in ('QT','IV','IVT','RC') and purged_at is null order by doc_date desc limit 1`, print: /^\/income\/[0-9a-f-]{36}\/print$/, edit: 'แก้ไขเอกสาร' },
  { path: '/income/walkin', kind: 'sales', sql: `select id, doc_no as no from documents where kind = 'RC' and purged_at is null order by doc_date desc limit 1`, print: /^\/income\/[0-9a-f-]{36}\/print$/, edit: 'แก้ไขเอกสาร' },
  { path: '/expense?kind=PO', kind: 'buy', sql: `select id, doc_no as no from documents where kind in ('PO','EX') and purged_at is null order by doc_date desc limit 1`, print: /^\/expense\/[0-9a-f-]{36}\/print$/, edit: 'แก้ไขเอกสาร' },
  /* ข้อมูลตัวอย่างไม่มีใบวางบิล ใบเคลม ชุดอะไหล่ — สร้างแถวทดสอบเอง ($1 = อู่ · $2 = รหัสไม่ซ้ำ) แล้วลบทิ้งหลังจบ */
  { path: '/income/billing?vat=yes', kind: 'bill', table: 'billnotes', sql: `insert into billnotes (tenant_id, no, party_name) values ($1, $2, 'ลูกค้าทดสอบการ์ด') returning id, no`, print: /^\/income\/billing\/[0-9a-f-]{36}\/print$/, edit: 'แก้ไขเอกสาร' },
  { path: '/stock/claim/new?side=customer', kind: 'claim', table: 'claims', sql: `insert into claims (tenant_id, no, side, kind, reason, party_name) values ($1, $2, 'customer', 'warranty', 'ทดสอบการ์ด', 'ลูกค้าทดสอบการ์ด') returning id, no`, print: /^\/stock\/claim\/[0-9a-f-]{36}\/print$/, edit: 'เปิดดูใบเคลม' },
  { path: '/stock/kits/new', kind: 'kit', table: 'kits', sql: `insert into kits (tenant_id, code, name, price) values ($1, $2, 'ชุดทดสอบการ์ด', 990) returning id, code as no`, print: null, edit: 'แก้ไขข้อมูล' },
  { path: '/stock/new', kind: 'product', sql: `select id, code as no from products order by code limit 1`, print: /^\/stock\/[0-9a-f-]{36}\/barcode$/, edit: 'แก้ไขข้อมูล' },
  { path: '/customers/new?kind=customer', kind: 'contact', sql: `select id, code as no from contacts where kind = 'customer' order by code limit 1`, print: null, edit: 'แก้ไขข้อมูล' },
] as { path: string; kind: string; sql: string; table?: string; print: RegExp | null; edit: string }[];

for (const l of LANDINGS) {
  test(`การ์ดบันทึกแล้วที่ ${l.path} (${l.kind}) — ข้อมูลจากฐาน ปุ่มพิมพ์/แก้ไขถูกใบ`, async ({ page }, info) => {
    const r = await db(async (c) => {
      if (!l.table) return c.query(l.sql);
      const t = await c.query(`select tenant_id from users where role = 'owner' order by created_at limit 1`);
      return c.query(l.sql, [t.rows[0].tenant_id, `ZT-${l.kind}-${info.parallelIndex}${Date.now().toString(36)}`]);
    });
    test.skip(!r.rows[0], `ข้อมูลตัวอย่างไม่มี ${l.kind}`);
    const { id, no } = r.rows[0];
    try {
    const sep = l.path.includes('?') ? '&' : '?';
    await page.goto(`${l.path}${sep}saved=${l.kind}&savedId=${id}`);

    await expectCentredCard(page);
    const c = savedCard(page);
    await expect(c.getByRole('heading')).toHaveText(['contact', 'product', 'kit'].includes(l.kind) ? 'บันทึกข้อมูลแล้ว' : 'บันทึกเอกสารเรียบร้อย');
    /* 2 วินาทีแรกยังไม่มีปุ่ม — ข้อความบันทึกแล้วแสดงเดี่ยว ๆ ก่อน (ผู้ใช้กำหนด) */
    await expect(c.getByRole('button', { name: 'ปิด' })).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'ปิด' })).toBeVisible({ timeout: 4000 });
    await expect(c).toContainText(no);

    const edit = c.getByRole('link', { name: l.edit });
    await expect(edit).toBeVisible();
    expect(await edit.getAttribute('href')).toContain(id);
    const print = c.getByRole('link', { name: /พิมพ์/ });
    if (l.print) {
      await expect(print).toHaveAttribute('href', l.print);
      expect(await print.getAttribute('href')).toContain(id);
    } else {
      await expect(print).toHaveCount(0);
    }

    /* ปิดแล้วลบค่าบันทึกออกจาก URL — รีเฟรชไม่เด้งซ้ำ */
    await page.keyboard.press('Escape');
    await expect(c).toHaveCount(0);
    await expect(page).not.toHaveURL(/saved=/);
    await page.reload();
    await expect(savedCard(page)).toHaveCount(0);
    } finally {
      if (l.table) await db((c) => c.query(`delete from ${l.table} where id = $1`, [id]));
    }
  });
}

test('เพิ่มลูกค้าใหม่: บันทึกแล้วการ์ด "บันทึกข้อมูลแล้ว" กลางจอ · ฟอร์มด้านหลังเปล่าพร้อมรายถัดไป', async ({ page }, info) => {
  const tag = `ทดสอบการ์ด${info.parallelIndex}${Date.now().toString(36)}`;
  try {
    await page.goto('/customers/new?kind=customer');
    /* รหัสไม่ซ้ำกันเอง — ขนาดจอที่รันพร้อมกันได้รหัสถัดไปตัวเดียวกัน บันทึกทีหลังจะชนรหัสซ้ำ */
    const code = `ZC${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
    await page.locator('input[name="code"]').fill(code);
    await page.locator('input[name="firstName"]').fill(tag);
    await page.getByRole('button', { name: 'เพิ่มผู้ติดต่อ' }).click();

    /* เดิม: ไปหน้าผู้ติดต่อคนนั้น จอกระพริบเหมือนไม่ได้บันทึก (ผู้ใช้แจ้ง) */
    await expect(page).toHaveURL(/\/customers\/new\?kind=customer&saved=contact&savedId=[0-9a-f-]{36}/);
    await expectCentredCard(page);
    const c = savedCard(page);
    await expect(c.getByRole('heading')).toHaveText('บันทึกข้อมูลแล้ว');
    await expect(page.locator('input[name="firstName"]'), 'ฟอร์มด้านหลังเป็นใบเปล่า').toHaveValue('');
    await expect(page.locator('input[name="code"]'), 'ช่องรหัสกลับเป็นรหัสถัดไป ไม่ค้างรหัสที่เพิ่งบันทึก').not.toHaveValue(code);

    const edit = c.getByRole('link', { name: 'แก้ไขข้อมูล' });
    await expect(edit).toBeVisible({ timeout: 4000 });
    await expect(c).toContainText(code);
    await expect(c).toContainText(tag);
    await expect(edit).toHaveAttribute('href', /^\/customers\/[0-9a-f-]{36}$/);
    await expect(c.getByRole('link', { name: /พิมพ์/ }), 'ผู้ติดต่อไม่มีปุ่มพิมพ์').toHaveCount(0);

    await c.getByRole('button', { name: 'ปิด' }).click();
    await expect(c).toHaveCount(0);
    await expect(page).toHaveURL(/\/customers\/new\?kind=customer$/);
  } finally {
    await db((c) => c.query(`delete from contacts where first_name = $1`, [tag]));
  }
});

test('ใบเสนอราคาใหม่: บันทึก → การ์ด ฟอร์มด้านหลังเปล่า · กดแก้ไขเอกสาร บันทึกการแก้ไขแล้วกลับหน้าที่มาพร้อมการ์ด', async ({ page }, info) => {
  const tag = `ลูกค้าทดสอบการ์ด ${info.parallelIndex}${Date.now().toString(36)}`;
  const confirm = () => page.getByRole('dialog', { name: 'ยืนยันการบันทึก' });
  try {
    await page.goto('/income?kind=QT');
    await expect(page.locator('#scan')).toBeFocused();
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await serviceLine(page, 500);
    await page.getByRole('button', { name: 'บันทึกใบเสนอราคา' }).click();
    await confirm().getByRole('button', { name: 'บันทึก', exact: true }).click();

    await expect(page).toHaveURL(/\/income\?kind=QT&saved=sales&savedId=[0-9a-f-]{36}/);
    await expectCentredCard(page);
    const c = savedCard(page);
    await expect(c.getByRole('heading')).toHaveText('บันทึกเอกสารเรียบร้อย');
    await expect(page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first(), 'ฟอร์มด้านหลังเป็นใบเปล่า').toHaveValue('');

    const edit = c.getByRole('link', { name: 'แก้ไขเอกสาร' });
    await expect(edit).toBeVisible({ timeout: 4000 });
    await expect(c).toContainText(tag);
    const print = c.getByRole('link', { name: /พิมพ์เอกสาร/ });
    await expect(print).toHaveAttribute('target', '_blank');
    await expect(print).toHaveAttribute('href', /^\/income\/[0-9a-f-]{36}\/print$/);

    /* แก้ไขของเดิม → การ์ดเดียวกัน แล้วกลับหน้าที่กดแก้ไขมา (ผู้ใช้เลือก) */
    await edit.click();
    await expect(page).toHaveURL(/\/income\/[0-9a-f-]{36}\/edit$/);
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).first().click();
    await confirm().getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page).toHaveURL(/\/income\?kind=QT&saved=sales&savedId=[0-9a-f-]{36}$/);
    await expect(savedCard(page)).toBeVisible();
  } finally {
    await db((c) => c.query(`delete from documents where party_name = $1`, [tag]));
  }
});

test('การ์ดบันทึกแล้ว: id ปลอม · id คนละชนิด · ชนิดไม่รู้จัก — ไม่แสดงการ์ด', async ({ page }) => {
  const r = await db((c) => c.query(`select id from documents where kind = 'PO' and purged_at is null limit 1`));
  test.skip(!r.rows[0], 'ข้อมูลตัวอย่างไม่มีใบซื้อ');
  for (const q of [
    'saved=sales&savedId=00000000-0000-4000-8000-000000000000',
    `saved=sales&savedId=${r.rows[0].id}`,
    `saved=evil&savedId=${r.rows[0].id}`,
    'saved=sales&savedId=not-a-uuid',
  ]) {
    await page.goto(`/income?kind=QT&${q}`);
    await expect(page.locator('#scan')).toBeFocused();
    await expect(savedCard(page), q).toHaveCount(0);
  }
});

/* ---------- ข้อ 3 — หัก ณ ที่จ่ายเฉพาะค่าบริการ 1,000 บาทขึ้นไป ---------- */

async function serviceLine(page: Page, price: number) {
  const row = page.locator('table.lines tbody tr').first();
  await row.locator('td.c-name input').fill('ค่าแรงเปลี่ยนน้ำมันเครื่อง');
  await row.locator('td.c-price input').fill(String(price));
  const svc = row.locator('input[type="checkbox"][title^="ค่าแรง"]');
  if (!(await svc.isChecked())) await svc.check();
}

test('ใบเสร็จ: ข้อความแดง (ค่าบริการ 1,000 บาทขึ้นไป) ใต้ช่องหัก ณ ที่จ่าย', async ({ page }) => {
  await page.goto('/income?kind=RC');
  const hint = page.locator('.field').filter({ has: page.locator('#whtRate') }).getByText('(ค่าบริการ 1,000 บาทขึ้นไป)');
  await expect(hint).toBeVisible();
  const color = await hint.evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  expect(r, `สีแดง: ${color}`).toBeGreaterThan(150);
  expect(g!).toBeLessThan(90);
  expect(b!).toBeLessThan(90);
});

test('ใบเสร็จ: ค่าแรง 800 บาท ไม่หัก ณ ที่จ่าย บอกเหตุผล · 1,000 บาทหัก 3%', async ({ page }) => {
  await page.goto('/income?kind=RC');
  await expect(page.locator('#scan')).toBeFocused();
  await expect(page.locator('#whtRate')).toHaveValue('3');
  const sum = page.locator('.card.sumbox');

  await serviceLine(page, 800);
  await expect(sum.getByText(/หัก ณ ที่จ่าย 3%/)).toHaveCount(0);
  await expect(sum.getByText(/ไม่ถึง 1,000 บาท/)).toBeVisible();
  await expect(sum.locator('.row.grand').first()).toContainText('856.00');

  await serviceLine(page, 1000);
  await expect(sum.getByText(/หัก ณ ที่จ่าย 3%/)).toBeVisible();
  await expect(sum.getByText(/ไม่ถึง 1,000 บาท/)).toHaveCount(0);
  await expect(sum.locator('.row.grand').last()).toContainText('1,040.00');
});
