import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ปุ่มแบ่งหน้าของประวัติต้องอยู่ในประวัติ (ผู้ใช้แจ้ง 3 ต.ค. 2569)
 *
 * รายรับแต่ละชนิด รายจ่าย และใบวางบิล เปิดมาโดยไม่มี hist=1 คือฟอร์มสร้างใบใหม่
 * ปุ่ม 10/20/30 กับ ก่อนหน้า/ถัดไป ในการ์ดประวัติเคยไม่พา hist=1 ไปด้วย
 * ลูกค้ากด "ถัดไป" ในประวัติใบส่งมอบ (ไม่มี VAT) แล้วได้ฟอร์มสร้างใบส่งมอบแทนหน้าถัดไป
 *
 * ตรวจที่ URL ก่อนอย่างอื่น — ถ้า hist=1 หลุด หน้าที่ได้คือฟอร์มแน่นอน (ดู histFirst ของแต่ละหน้า)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const pager = (page: Page) => page.locator('.pager').last();

/** อยู่ในประวัติจริง: URL ยังมี hist=1 · มีแถวแบ่งหน้า · ไม่มีฟอร์มสร้างใบใหม่ */
async function expectHistory(page: Page, form: string) {
  await expect(page, 'hist=1 หลุด = เด้งไปฟอร์มสร้างใบใหม่').toHaveURL(/[?&]hist=1(&|$)/);
  await expect(pager(page)).toBeVisible();
  await expect(page.locator(form), 'ฟอร์มสร้างใบใหม่ต้องไม่ขึ้นแทนประวัติ').toHaveCount(0);
}

/** กดจำนวนแถวต่อหน้าทุกปุ่มแล้วยังอยู่ในประวัติ — 10 คือค่าตั้งต้น จึงไม่มี size ใน URL */
async function clickSizes(page: Page, form: string) {
  for (const n of ['20', '30', '10']) {
    await pager(page).getByRole('link', { name: n, exact: true }).click();
    if (n === '10') await expect(page).not.toHaveURL(/[?&]size=/);
    else await expect(page).toHaveURL(new RegExp(`[?&]size=${n}(&|$)`));
    await expectHistory(page, form);
  }
}

/** ถัดไป → ก่อนหน้า ได้หน้าที่ถูกต้องและยังอยู่ในประวัติ */
async function clickNextPrev(page: Page, form: string) {
  await expect(pager(page)).toContainText('หน้า 1 จาก');
  const next = pager(page).getByRole('link', { name: 'ถัดไป' });
  test.skip(await next.count() === 0, 'ข้อมูลตัวอย่างมีไม่ถึงสองหน้า');
  await next.click();
  await expect(pager(page)).toContainText('หน้า 2 จาก');
  await expectHistory(page, form);
  await pager(page).getByRole('link', { name: 'ก่อนหน้า' }).click();
  await expect(pager(page)).toContainText('หน้า 1 จาก');
  await expectHistory(page, form);
}

/* ---------- รายรับ ---------- */

/* IV = ที่ลูกค้าแจ้ง · ที่เหลือใช้โค้ดชุดเดียวกัน ต้องไม่เป็นอีก */
for (const kind of ['IV', 'IVT', 'QT', 'RC']) {
  test(`รายรับ ${kind}: กด 20 · 30 · 10 แล้วยังเป็นประวัติ ไม่ใช่ฟอร์มสร้างใหม่`, async ({ page }) => {
    await page.goto(`/income?kind=${kind}&hist=1`);
    await expectHistory(page, '#new-doc');
    await clickSizes(page, '#new-doc');
    await expect(page, 'ชนิดเอกสารไม่หลุด').toHaveURL(new RegExp(`[?&]kind=${kind}(&|$)`));
  });
}

test('รายรับ: ถัดไป / ก่อนหน้า ในประวัติใบเสร็จ ได้หน้าถัดไปจริง ไม่ใช่ฟอร์ม', async ({ page }) => {
  await page.goto('/income?kind=RC&hist=1');
  await clickNextPrev(page, '#new-doc');
});

test('รายรับ: จำนวนแถวที่เลือกไว้ติดไปกับปุ่มถัดไป', async ({ page }) => {
  await page.goto('/income?kind=RC&hist=1&size=20');
  const next = pager(page).getByRole('link', { name: 'ถัดไป' });
  test.skip(await next.count() === 0, 'ข้อมูลตัวอย่างมีไม่ถึงสองหน้า');
  await next.click();
  await expect(page).toHaveURL(/[?&]size=20(&|$)/);
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expectHistory(page, '#new-doc');
});

/* ---------- รายจ่าย — หน้าแบบเดียวกัน ---------- */

test('รายจ่าย: จำนวนแถวและถัดไป/ก่อนหน้า ในประวัติใบซื้อยังอยู่ในประวัติ', async ({ page }) => {
  await page.goto('/expense?kind=PO&hist=1');
  await expectHistory(page, '#new-buy');
  await clickSizes(page, '#new-buy');
  await clickNextPrev(page, '#new-buy');
});

test('รายจ่าย: ชิปหมวดค่าใช้จ่ายในประวัติ กรองแล้วยังอยู่ในประวัติ', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ชิปหมวดอยู่ในแถบเครื่องมือ — ตรวจขนาดจอเดียว');
  await page.goto('/expense?kind=EX&hist=1');
  await page.locator('.toolbar a.chip').first().click();
  await expect(page).toHaveURL(/[?&]cat=/);
  await expectHistory(page, '#new-buy');
});

/* ---------- ใบวางบิล ---------- */

test('ใบวางบิล: กด 20 · 30 · 10 ในประวัติแล้วยังอยู่ในประวัติ ไม่ใช่ฟอร์มสร้างใบวางบิล', async ({ page }) => {
  await page.goto('/income/billing?hist=1');
  await expectHistory(page, '#new-bill');
  await clickSizes(page, '#new-bill');
});
