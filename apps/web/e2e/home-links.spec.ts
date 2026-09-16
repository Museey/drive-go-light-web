import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ลิงก์จากหน้าแรกต้องพาไป "ประวัติ" ไม่ใช่ฟอร์มสร้างเอกสารใหม่ (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * เมนู 03/04 เปิดมาเป็นฟอร์มสร้างใหม่เสมอ (histFirst = hist=1 หรือไม่ได้เลือกชนิด)
 * ลิงก์ที่ส่งแค่ ?kind= จึงได้ฟอร์มเปล่า — คนกดจากหน้าแรกตั้งใจดูรายการที่มีอยู่
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/**
 * หน้าประวัติ = ไม่มีฟอร์มสร้างเอกสารใหม่ และมีรายการให้ดู (ไม่มีรายการตรงเงื่อนไขก็เป็นข้อความว่าง)
 * `rows` = รู้มาก่อนว่าต้องมีรายการ — กันเคสหน้าโล่งแล้วเทสต์ผ่านเปล่า ๆ
 *
 * รายการแสดงคนละแบบตามขนาดจอตั้งแต่ 16 ก.ย. 2569 (สเปก §13.9):
 * ต่ำกว่า 1280 เป็นการ์ด · 1280 ขึ้นไปเป็นตาราง — ถามคำถามเดิมกับของที่หน้านั้นแสดงจริง
 */
const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;
const รายการ = (page: Page) => แคบ(page) ? '.doc-cards .dcard' : 'table.hist tbody tr';

async function expectHistoryPage(page: Page, rows: boolean) {
  await expect(page).toHaveURL(/[?&]hist=1/);
  await expect(page.locator('#new-doc, #new-buy'), 'ต้องไม่ใช่ฟอร์มสร้างเอกสารใหม่').toHaveCount(0);
  if (rows) {
    await expect(page.locator(รายการ(page)).first()).toBeVisible();
  } else {
    await expect(page.locator(`${แคบ(page) ? '.doc-cards' : 'table.hist'}, .empty`).first()).toBeVisible();
  }
}

test('สรุปยอดขาย → "ดูใบเสร็จทั้งหมด" ไปประวัติใบเสร็จ ไม่ใช่ฟอร์มใบเสร็จใหม่', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /ดูใบเสร็จทั้งหมด/ }).click();

  await expect(page).toHaveURL(/\/income\?.*kind=RC/);
  await expectHistoryPage(page, true);
  /* ตัวกรองชนิดยังติดไป — ทุกใบเป็นใบเสร็จ (ชิปชนิดอยู่ทั้งบนการ์ดและในตาราง) */
  const kinds = await page.locator(แคบ(page)
    ? '.doc-cards .dcard .kindchip'
    : 'table.hist tbody tr td:nth-child(2)').allInnerTexts();
  expect(kinds.length).toBeGreaterThan(0);
  expect(kinds.every((k) => k.includes('RC')), kinds.join(' · ')).toBe(true);
});

test('งานค้างส่งมอบ → "ดูรายการ" ไปประวัติใบเสนอราคาที่ยังค้าง', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.hcard').filter({ hasText: 'งานค้างส่งมอบ' });
  test.skip(!(await card.count()), 'บัญชีนี้ไม่เห็นการ์ดงานค้างส่งมอบ');
  /* ตัวเลขบนการ์ดบอกว่าควรมีกี่ใบ — ถ้ามี ต้องเห็นรายการจริงในหน้าปลายทาง */
  const count = Number((await card.locator('.big').innerText()).replace(/[^\d]/g, '')) || 0;
  await card.getByRole('link', { name: /ดูรายการ/ }).click();

  await expect(page).toHaveURL(/\/income\?.*kind=QT/);
  await expect(page, 'ตัวกรองเฉพาะงานค้างยังติดไป').toHaveURL(/[?&]open=1/);
  await expectHistoryPage(page, count > 0);
  await expect(page.locator('input[name="open"]'), 'ช่องติ๊ก "เฉพาะงานค้างส่งมอบ" ติ๊กไว้').toBeChecked();
});

test('ตาราง "เอกสารในระบบ" → "ดูรายการ" ทุกแถวไปประวัติของชนิดนั้น', async ({ page }) => {
  await page.goto('/');
  const table = page.locator('table').filter({ has: page.locator('thead th', { hasText: 'ชนิดเอกสาร' }) });
  await expect(table, 'หาตารางเอกสารในระบบเจอ').toHaveCount(1);

  const linkRows = table.locator('tbody tr').filter({ has: page.getByRole('link', { name: 'ดูรายการ' }) });
  const n = await linkRows.count();
  expect(n, 'ต้องมีแถวที่กดดูรายการได้').toBeGreaterThan(0);

  for (let i = 0; i < n; i++) {
    await page.goto('/');
    const row = linkRows.nth(i);
    const label = (await row.locator('td').first().innerText()).trim();
    const count = Number((await row.locator('td').nth(1).innerText()).replace(/[^\d]/g, '')) || 0;
    await row.getByRole('link', { name: 'ดูรายการ' }).click();
    await expect(page, `แถว ${label}`).toHaveURL(/\/(income|expense)\?.*kind=/);
    await expectHistoryPage(page, count > 0);
  }
});
