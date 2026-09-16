import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ลูกค้า/ผู้ขายบนจอแคบ (เฟส 4 — ต้นแบบของทีม `mCustomers` / `mCustomerDetail`)
 *
 * รายชื่อ: ตารางแปดคอลัมน์ → การ์ดใบละคน · หน้ารายคน: เปิดมาเป็นการ์ดอ่าน แล้วค่อยกดแก้ไข (ผู้ใช้เลือก)
 * ถามตามความกว้างจอ ไม่ใช่ชื่อโปรเจกต์ (สเปก §2)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;
/** ลูกค้าในชุดข้อมูลตัวอย่างที่มีเอกสารและมียอดค้าง — ให้ข้อตรวจตัวเลขมีของให้เทียบจริง */
const มีประวัติ = '/customers?kind=customer&q=' + encodeURIComponent('สยามโลจิสติกส์');
const baht = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

async function openContact(page: Page) {
  await page.goto(มีประวัติ);
  await page.locator('.contact-cards .mparty').first().click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{20,}/);
}

test('รายชื่อบนจอแคบ: แถบค้นหา + ปุ่มเพิ่ม · การ์ดใบแรกอยู่ในหน้าจอแรก · ตารางซ่อน', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await page.goto('/customers?kind=customer');

  const bar = page.locator('.mcbar');
  await expect(bar.locator('input[name="q"]')).toBeVisible();
  await expect(bar.locator('.mc-add'), 'ปุ่มเพิ่มพาไปฟอร์มลูกค้า').toHaveAttribute('href', '/customers/new?kind=customer');
  await expect(page.locator('table.cust')).toBeHidden();

  const first = page.locator('.contact-cards .mparty').first();
  await expect(first).toBeVisible();
  const y = (await first.boundingBox())!.y;
  expect(y, `การ์ดใบแรกอยู่ที่ ${Math.round(y)}px`).toBeLessThan(page.viewportSize()!.height - 58);

  await page.goto('/customers?kind=vendor');
  await expect(page.locator('.mcbar .mc-add'), 'หน้าผู้ขายต้องเพิ่มเป็นผู้ขาย').toHaveAttribute('href', '/customers/new?kind=vendor');
});

test('การ์ดผู้ติดต่อ: ชื่อ · ชิปชนิด · รหัส · ทะเบียนรถ · ลูกศร — กดแล้วเปิดรายคน', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await page.goto(มีประวัติ);

  const card = page.locator('.contact-cards .mparty').first();
  await expect(card.locator('.nm')).toHaveText(/สยามโลจิสติกส์/);
  await expect(card.locator('.meta .chip')).toHaveText('ลูกค้า');
  await expect(card.locator('.meta')).toContainText(/CUS-\d+/);
  await expect(card.locator('.meta'), 'ลูกค้ามีรถ — บรรทัดรองต้องมีทะเบียน').toContainText(/[ก-ฮ]{1,3}\s?\d{1,4}/);
  await expect(card.locator('.chev')).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{20,}$/);
});

test('หน้ารายคนบนจอแคบ: การ์ดข้อมูลก่อน ฟอร์มซ่อน · กดแก้ไขแล้วฟอร์มโผล่ · กลับรายชื่อได้', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเปิดฟอร์มเลยเหมือนเดิม');
  await openContact(page);

  const view = page.locator('.mdetail');
  await expect(view).toBeVisible();
  await expect(view.locator('.dh')).toContainText(/สยามโลจิสติกส์/);
  await expect(view.locator('.mkv .k').first()).toHaveText('รหัส');
  /* โหมดแก้ไขมีสองก้อน — ฟอร์ม และการ์ดลบผู้ติดต่อ — ต้องไม่เห็นทั้งคู่ตอนเปิดมาเพื่อดู */
  const edit = page.locator('.contact-edit');
  expect(await edit.count(), 'ต้องมีฟอร์มและการ์ดลบให้ตรวจ').toBe(2);
  for (const el of await edit.all()) await expect(el, 'ยังไม่กดแก้ไข ต้องไม่เห็นฟอร์มและปุ่มลบ').toBeHidden();

  await page.getByRole('link', { name: /แก้ไขข้อมูลผู้ติดต่อ/ }).click();
  await expect(page).toHaveURL(/[?&]edit=1/);
  for (const el of await page.locator('.contact-edit').all()) await expect(el).toBeVisible();
  await expect(page.locator('.contact-edit input[name="tel"]').first(), 'ฟอร์มกรอกได้จริง').toBeVisible();
  await expect(page.locator('.mdetail'), 'โหมดแก้ไขไม่ต้องมีการ์ดอ่านซ้ำ').toBeHidden();

  await page.locator('.mback').first().click();
  await expect(page).toHaveURL(/\/customers(\?|$)/);
});

test('ตัวเลขบนการ์ดสองใบตรงกับประวัติซื้อขายที่แสดงจริง · ประวัติเป็นการ์ดเอกสาร', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await openContact(page);

  const cards = page.locator('.contact-view .doc-cards .dcard');
  const n = await cards.count();
  expect(n, 'ลูกค้ารายนี้ต้องมีเอกสาร').toBeGreaterThan(0);
  await expect(page.locator('.contact-view table'), 'จอแคบไม่แสดงตารางประวัติ').toBeHidden();

  const stats = page.locator('.mstat-grid .mstat .val');
  expect(baht(await stats.nth(0).innerText()), 'จำนวนเอกสาร').toBe(n);

  const outs = await cards.locator('.out').allInnerTexts();
  const owe = outs.filter((t) => t.includes('คงค้าง')).reduce((s, t) => s + baht(t), 0);
  expect(baht(await stats.nth(1).innerText()), 'ยอดคงค้าง').toBeCloseTo(owe, 2);
});

test('ปุ่มแบ่งหน้าลอยบนรายชื่อ · "แสดงต่อหน้า" ยังกดได้', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้แถวแบ่งหน้าเดิม');
  await page.goto('/customers?size=5');

  const pager = page.locator('.mpager');
  await expect(pager).toBeVisible();
  await expect(pager.locator('.mpg.off'), 'หน้าแรกย้อนไม่ได้').toHaveCount(1);
  const before = (await page.locator('.mparty .nm').first().innerText()).trim();
  await pager.getByText(/ถัดไป/).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  expect((await page.locator('.mparty .nm').first().innerText()).trim()).not.toBe(before);

  await page.locator('.mparty').last().scrollIntoViewIfNeeded();
  const last = (await page.locator('.mparty').last().boundingBox())!;
  const bar = (await pager.boundingBox())!;
  const ทับ = last.y < bar.y + bar.height && bar.y < last.y + last.height
    && last.x < bar.x + bar.width && bar.x < last.x + last.width;
  expect(ทับ, 'ปุ่มลอยต้องไม่ทับการ์ดใบสุดท้าย').toBe(false);

  const size = page.locator('.tag-row').filter({ hasText: 'แสดงต่อหน้า' }).first();
  await expect(size).toBeVisible();
  await size.getByRole('link', { name: '20', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]size=5/);
});

test('เดสก์ท็อปไม่เปลี่ยน — ตาราง · ฟอร์มเปิดมาเลย · ตารางประวัติ', async ({ page }) => {
  test.skip(แคบ(page), 'ข้อนี้ถามเฉพาะเดสก์ท็อป');
  await page.goto('/customers?kind=customer');
  await expect(page.locator('table.cust')).toBeVisible();
  for (const sel of ['.mcbar', '.contact-cards', '.mpager', '.list-head']) {
    await expect(page.locator(sel).first(), `${sel} ต้องไม่โผล่บนเดสก์ท็อป`).toBeHidden();
  }

  await page.goto(มีประวัติ);
  await page.locator('table.cust tbody tr').first().click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{20,}/);
  for (const el of await page.locator('.contact-edit').all()) {
    await expect(el, 'เดสก์ท็อปเปิดฟอร์มแก้ไขและการ์ดลบทันทีเหมือนเดิม').toBeVisible();
  }
  for (const sel of ['.mdetail', '.mback', '.mstat-grid']) {
    await expect(page.locator(sel).first(), `${sel} ต้องไม่โผล่บนเดสก์ท็อป`).toBeHidden();
  }
  await expect(page.locator('.contact-view table').first(), 'ตารางประวัติยังอยู่').toBeVisible();
});
