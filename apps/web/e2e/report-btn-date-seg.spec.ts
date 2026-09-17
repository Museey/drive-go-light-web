import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ปุ่มพิมพ์รายงานซ้ำ · ช่วงวันที่เป็นแถบปุ่มต่อกันทุกหน้า (PLAN-report-btn-date-seg-2569-09-17.md)
 * ผู้ใช้ส่งภาพหน้ารายจ่าย (ชิปแยก + ป้าย "ช่วงวันที่") และภาพแถบของหน้ายอดขาย — "ให้เป็นเหมือนรูปที่ 2"
 * ตรวจเฉพาะเดสก์ท็อป — จอแคบเป็น dropdown เดียว ไม่ได้แตะ
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'หัวหน้าและแถบช่วงวันที่แบบเต็มมีเฉพาะจอ 1280 ขึ้นไป');
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

for (const path of ['/finance/ar', '/finance/ap', '/finance/sales', '/finance/pl']) {
  test(`${path}: ปุ่มพิมพ์รายงานในหัวหน้ามีปุ่มเดียว`, async ({ page }) => {
    await page.goto(path);
    const buttons = page.locator('.topbar').getByRole('button', { name: /พิมพ์รายงาน/ });
    await expect(buttons.first()).toBeVisible();
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveText('🖨 พิมพ์รายงาน');
  });
}

const LABELS = ['ทั้งหมด', 'วันนี้', 'เดือนนี้', 'เดือนที่แล้ว', 'ปีนี้', 'ปีที่แล้ว'];

/** [หน้า, ค่าตัวกรองที่ต้องติดไปตอนกดช่วงวันที่] */
const PAGES: [string, Record<string, string>][] = [
  ['/income?kind=RC&hist=1', { kind: 'RC', hist: '1' }],
  ['/income/walkin?hist=1', { hist: '1' }],
  ['/income/billing?hist=1', { hist: '1' }],
  ['/expense?kind=PO&hist=1', { kind: 'PO', hist: '1' }],
  ['/stock/claim', {}],
  ['/stock/vclaim', {}],
  ['/stock/count', {}],
  ['/settings/trash', {}],
];

const bg = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);

for (const [path, keep] of PAGES) {
  test(`${path}: ช่วงวันที่เป็นแถบปุ่มต่อกันแบบหน้ายอดขาย · ไม่มีป้าย "ช่วงวันที่" · กดแล้วกรองและคงตัวกรองเดิม`, async ({ page }) => {
    await page.goto(path);
    const bar = page.locator('.toolbar.dfilter');
    const seg = bar.locator('nav.seg');
    await expect(seg).toBeVisible();
    await expect(seg.locator('a.seg-btn')).toHaveText(LABELS);
    await expect(bar.locator('.chip', { hasText: 'เดือนนี้' }), 'ไม่มีชิปแบบเดิมเหลือ').toHaveCount(0);
    await expect(bar.getByText('ช่วงวันที่', { exact: true })).toHaveCount(0);

    /* หน้าตาเดียวกับหน้ายอดขาย — กรอบเขียวมุมมน ปุ่มต่อกัน อันที่เลือกพื้นเขียวเข้ม */
    await expect(seg.locator('a[aria-current="true"]')).toHaveText('ทั้งหมด');
    const selectedBg = await bg(page, '.dfilter nav.seg a[aria-current="true"]');
    await page.goto('/finance/sales');
    expect(selectedBg, 'สีปุ่มที่เลือกเท่าหน้ายอดขาย').toBe(await bg(page, 'nav.seg a[aria-current="true"]'));
    await page.goto(path);

    await page.locator('.toolbar.dfilter nav.seg a.seg-btn', { hasText: 'เดือนนี้' }).click();
    await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-01/);
    await expect(page).toHaveURL(/[?&]to=\d{4}-\d{2}-\d{2}/);
    for (const [k, v] of Object.entries(keep)) await expect(page).toHaveURL(new RegExp(`[?&]${k}=${v}(&|$)`));
    await expect(page.locator('.toolbar.dfilter nav.seg a[aria-current="true"]')).toHaveText('เดือนนี้');
  });
}
