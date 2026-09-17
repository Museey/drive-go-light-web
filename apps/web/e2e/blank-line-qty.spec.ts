import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * บรรทัดรายการที่ยังไม่กรอก จำนวนเป็น 0 (PLAN-blank-line-qty-zero-2569-09-17.md)
 * ผู้ใช้ส่งภาพหน้าซื้อสินค้า: บรรทัดว่างขึ้นจำนวน 1 — ใช้กับทุกฟอร์มที่มีตารางรายการ
 * เริ่มมีของแล้วขึ้น 1 ให้เอง · ลบจนว่างกลับเป็น 0
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const FORMS = [
  { path: '/expense?kind=PO', label: 'ซื้อสินค้า' },
  { path: '/expense?kind=EX', label: 'บันทึกค่าใช้จ่าย' },
  { path: '/income?kind=QT', label: 'ใบเสนอราคา' },
  { path: '/income/walkin', label: 'ขายหน้าร้าน' },
  { path: '/stock/claim/new', label: 'ใบเคลมสินค้า' },
  { path: '/stock/kits/new', label: 'ชุดอะไหล่' },
];

const rows = (page: Page) =>
  page.locator('table.lines').filter({ has: page.locator('tbody td.c-qty input') }).first().locator('tbody tr')
    .filter({ has: page.locator('td.c-qty input') });
const qtyOf = (page: Page, i: number) => rows(page).nth(i).locator('td.c-qty input');
const nameOf = (page: Page, i: number) => rows(page).nth(i).locator('td.c-name input.in').first();

for (const f of FORMS) {
  test(`${f.label}: บรรทัดว่างจำนวน 0 · พิมพ์ชื่อแล้วขึ้น 1 · ลบชื่อกลับเป็น 0`, async ({ page }) => {
    await page.goto(f.path);
    await expect(rows(page).first()).toBeVisible();

    const n = await rows(page).count();
    for (let i = 0; i < n; i++) await expect(qtyOf(page, i), `บรรทัด ${i + 1} ยังไม่กรอก`).toHaveValue('0');

    await nameOf(page, 0).fill('รายการทดสอบจำนวน');
    await expect(qtyOf(page, 0), 'เริ่มมีของ → 1 ให้เอง').toHaveValue('1');
    if (n > 1) await expect(qtyOf(page, 1), 'บรรทัดอื่นยังว่าง').toHaveValue('0');

    await nameOf(page, 0).fill('');
    await expect(qtyOf(page, 0), 'ลบจนว่าง → 0').toHaveValue('0');

    /* พิมพ์จำนวนไว้ก่อนแล้วค่อยพิมพ์ชื่อ — ต้องคงจำนวนที่พิมพ์ */
    await qtyOf(page, 0).fill('4');
    await nameOf(page, 0).fill('รายการทดสอบจำนวน');
    await expect(qtyOf(page, 0)).toHaveValue('4');
  });
}

test('ซื้อสินค้า: เลือกสินค้าจากผลค้นหาในบรรทัดว่าง ได้จำนวน 1 · + เพิ่มบรรทัด ได้ 0', async ({ page }) => {
  await page.goto('/expense?kind=PO');
  const code = rows(page).first().locator('td.c-code input');
  await code.fill('FLT');
  const hit = page.locator('.hits5 tr.pick').first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(nameOf(page, 0)).not.toHaveValue('');
  await expect(qtyOf(page, 0)).toHaveValue('1');

  const before = await rows(page).count();
  await page.getByRole('button', { name: '+ เพิ่มบรรทัด' }).click();
  await expect(rows(page)).toHaveCount(before + 1);
  await expect(qtyOf(page, before)).toHaveValue('0');
});

test('ใบเสนอราคา: + ค่าแรง ได้ 1 (บรรทัดมีชื่อตั้งแต่สร้าง) · พิมพ์ชื่อแล้วบันทึกได้โดยไม่ต้องกรอกจำนวน', async ({ page }) => {
  await page.goto('/income?kind=QT');
  const before = await rows(page).count();
  await page.getByRole('button', { name: /ค่าแรง/ }).first().click();
  await expect(rows(page)).toHaveCount(before + 1);
  await expect(qtyOf(page, before)).toHaveValue('1');

  await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill('ลูกค้าทดสอบจำนวน');
  await nameOf(page, 0).fill('ผ้าเบรกทดสอบ');
  await page.getByRole('button', { name: 'บันทึกใบเสนอราคา' }).click();
  await expect(page.getByRole('dialog', { name: 'ยืนยันการบันทึก' }), 'ไม่ติด "จำนวนต้องมากกว่า 0"').toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: 'จำนวน' })).toHaveCount(0);
});
