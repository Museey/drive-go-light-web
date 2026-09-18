import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ตัวเลขใหญ่ใต้ "สรุปยอดขาย" หน้าแรก = ยอดสุทธิรับ แบบรุ่น 6.4 (ผู้ใช้กำหนด 18 ก.ย. 2569)
 * (PLAN-home-sales-logo-2569-09-18.md)
 *
 * ผูกหน้าแรกเข้ากับหน้า 06.1 โดยตรง — สุทธิรับ = รวมทั้งสิ้น − ถูกหัก ณ ที่จ่าย
 * ถ้าวันหลังมีใครแก้ฐานของหน้าใดหน้าหนึ่ง อีกหน้าจะฟ้องทันที
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const money = (s: string) => Number(s.replace(/[^\d.-]/g, ''));

/** ตัวเลขบนการ์ด "สรุปยอดขาย" ของหน้าแรก */
async function homeCard(page: Page) {
  await page.goto('/');
  const card = page.locator('.hcard').filter({ hasText: 'สรุปยอดขาย' }).first();
  const rowOf = (label: string) => card.locator('.row').filter({ hasText: label }).locator('b');
  return {
    big: money(await card.locator('.big').innerText()),
    count: money(await rowOf('จำนวนใบ').innerText()),
    avg: money(await rowOf('เฉลี่ยต่อใบ').innerText()),
    mobile: money(await page.locator('.mstat[data-k="sales"] .val').innerText()),
  };
}

test('ยอดขายหน้าแรกเท่ากับสุทธิรับของหน้า 06.1 · การ์ดเล็กจอแคบบอกเลขเดียวกัน', async ({ page }) => {
  const home = await homeCard(page);

  await page.goto('/finance/sales');
  const total = page.locator('.sales-monthly tbody tr').last();
  const cells = await total.locator('td').allInnerTexts();
  expect(cells[0], 'แถวสุดท้ายคือแถวรวม').toContain('รวม');
  const [, docs, , , grand, wht] = cells.map(money);
  const payable = Math.round((grand - wht) * 100) / 100;

  expect(payable, 'ข้อมูลตัวอย่างต้องมีทั้ง VAT และหัก ณ ที่จ่าย ไม่งั้นเทียบแล้วไม่ได้ความ')
    .not.toBe(money((await page.locator('.grid.g4 .stat .value').first().innerText())));
  expect(home.big, 'ยอดขายหน้าแรก = รวมทั้งสิ้น − ถูกหัก ณ ที่จ่าย').toBe(payable);
  expect(home.count).toBe(docs);
  expect(home.avg, 'เฉลี่ยต่อใบคิดจากยอดเดียวกัน').toBe(Math.round((payable / docs) * 100) / 100);
  expect(home.mobile, 'การ์ดเล็กของจอแคบต้องบอกเลขเดียวกับการ์ดใหญ่').toBe(home.big);
});
