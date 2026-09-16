import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ลูกหนี้/เจ้าหนี้/ยอดขายบนจอแคบ (เฟส 5 — ต้นแบบของทีม `mFinance`)
 *
 * ลูกหนี้/เจ้าหนี้เป็นการ์ดรายคน กดแล้วเห็นใบค้างของคนนั้นพร้อมปุ่มรับชำระ (ผู้ใช้เลือก)
 * ยอดรวมบนการ์ดรายคนต้องเท่ายอด "ค้างทั้งหมด" ทุกสตางค์
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;
const num = (s: string | null) => Number((s ?? '').replace(/[^\d.-]/g, '')) || 0;

for (const side of [
  { path: '/finance/ar', name: 'ลูกหนี้', totalLabel: 'ลูกหนี้คงค้างทั้งหมด' },
  { path: '/finance/ap', name: 'เจ้าหนี้', totalLabel: 'เจ้าหนี้คงค้างทั้งหมด' },
]) {
  test(`${side.name}: การ์ดรายคนเรียงยอดมากไปน้อย · ผลรวมเท่ายอดค้างทั้งหมด`, async ({ page }) => {
    test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตารางรายใบ');
    await page.goto(side.path);

    await expect(page.locator(`${side.path === '/finance/ar' ? '.tbl' : '.tbl'}`).first()).toBeHidden();
    const amounts = (await page.locator('.party-cards a.mparty .amt .n').allInnerTexts()).map(num);
    expect(amounts.length, 'ต้องมีการ์ดให้ตรวจ').toBeGreaterThan(0);
    expect(amounts, 'เรียงยอดมากไปน้อย').toEqual([...amounts].sort((a, b) => b - a));

    const total = num(await page.locator('.stat', { hasText: side.totalLabel }).locator('.value').innerText());
    const sum = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
    expect(sum, `ผลรวมการ์ด ${sum} · ค้างทั้งหมด ${total}`).toBeCloseTo(total, 2);
  });

  test(`${side.name}: กดการ์ดรายคน → เหลือใบของคนนั้น · มีปุ่มจ่ายทุกใบ · กลับทุกรายได้`, async ({ page }) => {
    test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตารางรายใบ');
    await page.goto(side.path);

    const card = page.locator('.party-cards a.mparty').first();
    const amount = num(await card.locator('.amt .n').innerText());
    /* บรรทัดรองเป็น "5 ใบ · เกินกำหนด 5 ใบ" — เอาเฉพาะตัวเลขแรกคือจำนวนใบทั้งหมด */
    const count = Number((await card.locator('.meta').innerText()).match(/(\d+)\s*ใบ/)![1]);
    await card.click();
    await expect(page).toHaveURL(/[?&]party=/);

    /* จัดกลุ่มด้วยทะเบียนผู้ติดต่อ (เหมือนหน้าแรกเดสก์ท็อป) ไม่ใช่ชื่อที่พิมพ์บนใบ —
       ใบค่าใช้จ่ายที่ผูกผู้ขายไว้แต่พิมพ์ชื่อผู้รับเงินอื่นจึงอยู่กลุ่มเดียวกันได้
       ถามสิ่งที่ต้องเป็นจริงเสมอแทน: จำนวนใบและยอดค้างรวมตรงกับการ์ดที่กดเข้ามา */
    const docs = page.locator('.party-docs .pdoc');
    await expect(docs).toHaveCount(count);
    const outs = (await docs.locator('.dcard .out').allInnerTexts()).map(num);
    const sum = Math.round(outs.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum, `ยอดค้างรวมของใบ ${sum} · บนการ์ด ${amount}`).toBeCloseTo(amount, 2);
    await expect(docs.locator('button.pay-btn'), 'ปุ่มรับ/จ่ายชำระทุกใบ').toHaveCount(count);

    /* ปุ่มต้องเปิดฟอร์มชำระได้จริง ไม่ใช่แค่มีปุ่ม */
    await docs.first().locator('button.pay-btn').click();
    await expect(docs.first().locator('form input[name="amount"]')).toBeVisible();

    await page.getByRole('link', { name: /ทุกราย/ }).click();
    await expect(page).not.toHaveURL(/[?&]party=/);
    await expect(page.locator('.party-cards a.mparty').first()).toBeVisible();
  });
}

test('เดสก์ท็อป: ?party= กรองตารางเหลือคนนั้น · ไม่มีการ์ดรายคน', async ({ page }) => {
  test.skip(แคบ(page), 'ข้อนี้ถามเฉพาะเดสก์ท็อป');
  await page.goto('/finance/ar');
  await expect(page.locator('.party-cards')).toBeHidden();
  const all = await page.locator('table.tbl tbody tr').count();

  /* คีย์ของคนแรกอ่านจากการ์ดรายคนที่ซ่อนอยู่ในหน้าเดียวกัน */
  const href = await page.locator('.party-cards a.mparty').first().getAttribute('href');
  const name = (await page.locator('.party-cards a.mparty .nm').first().textContent())!.trim();
  await page.goto(href!);
  const rows = page.locator('table.tbl tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  expect(n, 'ต้องเหลือน้อยกว่าทุกใบ').toBeLessThan(all);
  const names = await rows.locator('td:nth-child(3)').allInnerTexts();
  expect(names.every((x) => x.trim() === name), names.join(' · ')).toBe(true);
});

test('ยอดขาย: เอกสารรายใบเป็นการ์ดบนจอแคบ · ตารางรายเดือนยังเป็นตาราง', async ({ page }) => {
  await page.goto('/finance/sales');
  const docCards = page.locator('.sales-docs .doc-cards .dcard');
  const docTable = page.locator('.sales-docs table');
  const monthly = page.locator('.sales-monthly table');

  await expect(monthly, 'ตารางรายเดือนอยู่ทุกขนาดจอ').toBeVisible();
  if (แคบ(page)) {
    expect(await docCards.count()).toBeGreaterThan(0);
    await expect(docTable).toBeHidden();
  } else {
    await expect(docTable).toBeVisible();
    await expect(page.locator('.sales-docs .doc-cards')).toBeHidden();
  }
});
