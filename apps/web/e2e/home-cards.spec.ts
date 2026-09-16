import { expect, test, type Page } from '@playwright/test';
import { makeSession, makeStaffSession } from './session';

/**
 * หน้าแรกบนจอแคบ (เฟส 5 — ต้นแบบของทีม `mHome`)
 *
 * การ์ดใหญ่เก้าใบซ่อน แทนด้วยการ์ดเล็กตามต้นแบบทั้งหมด (ผู้ใช้เลือก)
 * **ทุกการ์ดเล็กต้องพาไปที่เดียวกับปุ่มบนการ์ดใหญ่** และบอกตัวเลขเดียวกัน —
 * ไม่งั้นคนเปิดหน้าแรกจากมือถือกับจากคอมจะเห็นร้านคนละร้าน
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;
const num = (s: string | null) => Number((s ?? '').replace(/[^\d.-]/g, '')) || 0;
const login = (page: Page, t: string) =>
  page.context().addCookies([{ name: 'dgl_session', value: t, url: 'http://localhost:3100' }]);

/** ปลายทางของปุ่มบนการ์ดใหญ่เดิม — ตรึงไว้ที่นี่ที่เดียว แล้วถามทั้งการ์ดเล็กและการ์ดใหญ่ */
const ปลายทาง: Record<string, string> = {
  sales: '/income?kind=RC&hist=1',
  spend: '/expense',
  ar: '/finance/ar',
  ap: '/finance/ap',
  reorder: '/stock?reorder=1',
  openqt: '/income?kind=QT&open=1&hist=1',
  pending: '/stock/pending',
  dead: '/stock?flag=dead',
};

test('จอแคบ: การ์ดใหญ่ซ่อน · การ์ดเล็กครบทุกหมวดและพาไปที่เดียวกับการ์ดใหญ่', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้การ์ดใหญ่');
  await login(page, token);
  await page.goto('/');

  await expect(page.locator('.hgrid')).toBeHidden();
  const home = page.locator('.mhome');
  await expect(home).toBeVisible();
  for (const h of ['ภาพรวมการเงิน', 'ลูกหนี้จากการขาย', 'เจ้าหนี้การค้า', 'ค้างดำเนินการ', 'ภาษีงวดล่าสุด']) {
    await expect(home.locator('.m-sec h2', { hasText: h }), `หมวด ${h}`).toHaveCount(1);
  }
  for (const [k, href] of Object.entries(ปลายทาง)) {
    await expect(home.locator(`a.mstat[data-k="${k}"]`), `การ์ด ${k}`).toHaveAttribute('href', href);
  }
  await expect(page.locator('.mhome-hide'), 'ตารางสินค้าที่ควรสั่ง/เอกสารในระบบ ไม่อยู่บนจอแคบ').toHaveCount(2);
  for (const el of await page.locator('.mhome-hide').all()) await expect(el).toBeHidden();
});

test('เดสก์ท็อป: ปุ่มบนการ์ดใหญ่ยังพาไปที่เดิม · ตารางยังอยู่ · ไม่เห็นการ์ดเล็ก', async ({ page }) => {
  test.skip(แคบ(page), 'ข้อนี้ถามเฉพาะเดสก์ท็อป');
  await login(page, token);
  await page.goto('/');

  await expect(page.locator('.hgrid')).toBeVisible();
  await expect(page.locator('.mhome')).toBeHidden();
  const gos = await page.locator('.hcard header a.go').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  for (const [k, href] of Object.entries(ปลายทาง)) expect(gos, `ปุ่มการ์ดใหญ่ ${k}`).toContain(href);
  await expect(page.locator('.mhome-hide'), 'ตารางสินค้าที่ควรสั่ง + เอกสารในระบบ').toHaveCount(2);
  for (const el of await page.locator('.mhome-hide').all()) await expect(el).toBeVisible();
});

test('ตัวเลขบนการ์ดเล็กเท่าการ์ดใหญ่ — ยอดขาย · ลูกหนี้ · เจ้าหนี้ · ภาษี', async ({ page }) => {
  test.skip(!แคบ(page), 'ถามบนจอแคบ ที่การ์ดทั้งสองแบบอยู่ในหน้าเดียวกัน');
  await login(page, token);
  await page.goto('/');

  /* การ์ดใหญ่ซ่อนอยู่แต่ยังอยู่ในหน้า — อ่านด้วย textContent */
  const big = (title: string) => page.locator('.hcard', { hasText: title }).locator('.big').first().textContent();
  const small = (k: string) => page.locator(`.mhome a.mstat[data-k="${k}"] .val`).textContent();

  expect(num(await small('sales'))).toBe(num(await big('สรุปยอดขาย')));
  expect(num(await small('ar'))).toBe(num(await big('สรุปลูกหนี้จากการขาย')));
  expect(num(await small('ap'))).toBe(num(await big('สรุปเจ้าหนี้การค้า')));

  const taxBig = await page.locator('.mhome-tax-src .stat .value').allTextContents();
  const taxSmall = await page.locator('.mtax .mstat .val').allTextContents();
  expect(taxSmall.map(num), 'ภาษีขาย · ภาษีซื้อ · ต้องนำส่ง').toEqual(taxBig.slice(0, 3).map(num));

  /* ป้ายใบที่สามต้องพูดเรื่องเดียวกับการ์ดใหญ่ — "ต้องนำส่ง" กับ "เครดิตยกไป" สลับกันคือบอกให้จ่ายภาษีที่ไม่ต้องจ่าย */
  const bigLabel = (await page.locator('.mhome-tax-src .stat .label').nth(2).textContent())!.trim();
  const smallLabel = (await page.locator('.mtax .mstat.net .lbl').textContent())!.trim();
  expect(smallLabel, `การ์ดใหญ่ "${bigLabel}"`).toBe(bigLabel.includes('ต้องนำส่ง') ? 'ต้องนำส่ง' : 'เครดิตยกไป');
  expect(num(await page.locator('.mhome .mstat[data-k="wht"] .val').textContent()), 'หัก ณ ที่จ่ายที่ต้องนำส่ง')
    .toBe(num(taxBig[3] ?? ''));
});

test('การ์ดลูกหนี้รายคนบนหน้าแรก → หน้าลูกหนี้ที่เหลือเฉพาะคนนั้น', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้การ์ดใหญ่');
  await login(page, token);
  await page.goto('/');

  const card = page.locator('.mhome .m-sec', { hasText: 'ลูกหนี้จากการขาย' }).locator('a.mparty').first();
  const name = (await card.locator('.nm').innerText()).trim();
  await card.click();
  await expect(page).toHaveURL(/\/finance\/ar\?party=/);
  const names = await page.locator('.party-docs .dcard .nm').allInnerTexts();
  expect(names.length, 'ต้องมีใบของคนนั้น').toBeGreaterThan(0);
  expect(names.every((n) => n.trim() === name), names.join(' · ')).toBe(true);
});

test('ช่วงเวลาบนจอแคบเป็น dropdown และยอดขายเปลี่ยนตามช่วง', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้ปุ่มช่วงเวลาเดิม');
  await login(page, token);
  await page.goto('/');

  const before = num(await page.locator('.mhome a.mstat[data-k="sales"] .val').textContent());
  await page.locator('.mdate select').selectOption({ label: 'ปีที่แล้ว' });
  await page.waitForURL(/[?&]from=\d{4}-01-01/);
  const after = num(await page.locator('.mhome a.mstat[data-k="sales"] .val').textContent());
  expect(after, `ยอดขายทั้งหมด ${before} · ปีที่แล้ว ${after}`).not.toBe(before);
});

test('พนักงานที่ปิดสิทธิ์รายงานสรุป ไม่เห็นตัวเงินบนหน้าแรกทั้งสองแบบ', async ({ page }) => {
  const staff = await makeStaffSession({ homeReport: false, menus: { income: true, stock: true } });
  await login(page, staff);
  await page.goto('/');

  await expect(page.locator('.hcard'), 'การ์ดใหญ่').toHaveCount(0);
  await expect(page.locator('.mhome a.mstat[data-k="sales"]'), 'การ์ดเล็กยอดขาย').toHaveCount(0);
  await expect(page.locator('.mtax'), 'การ์ดภาษี').toHaveCount(0);
  await expect(page.locator('.mhome a.mparty'), 'การ์ดลูกหนี้รายคน').toHaveCount(0);
});
