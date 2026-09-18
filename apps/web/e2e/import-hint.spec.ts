import { expect, test } from '@playwright/test';
import { makeSession } from './session';

/**
 * ข้อความบนหน้า 07.3 ต้องตรงกับกติกาจริง (ผู้ใช้แจ้ง 18 ก.ย. 2569)
 *
 * เดิมการ์ดสินค้าเขียนว่า "ครั้งละไม่เกิน 3,000 รายการต่อไฟล์" ซึ่งไม่มีอยู่จริง —
 * ของจริงคือสินค้าที่ใช้งานทั้งอู่ต้องไม่เกิน 3,000 ไฟล์ทั้งไฟล์ถูกนับรวมกับของเดิม
 * ส่วนทะเบียนลูกค้า/ผู้ขายมีเพดานต่อไฟล์จริง แต่เดิมไม่ได้บอกไว้ตรงไหนเลย
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const num = (s: string) => Number(s.replace(/[^\d]/g, ''));

test('การ์ดนำเข้าสินค้าบอกที่ว่างที่เหลือจริงของทั้งอู่ ไม่ใช่เพดานต่อไฟล์', async ({ page }) => {
  await page.goto('/stock');
  const sub = await page.locator('.sub').first().innerText();
  const active = num((/ใช้งานอยู่\s*([\d,]+)/.exec(sub) ?? ['', '0'])[1]);
  expect(active, 'ข้อมูลตัวอย่างต้องมีสินค้าอยู่บ้าง ไม่งั้นเทียบแล้วไม่ได้ความ').toBeGreaterThan(0);

  await page.goto('/settings/import');
  const hint = page.locator('.card').filter({ hasText: 'สินค้าและอะไหล่' }).locator('.hint').first();
  const text = await hint.innerText();

  expect(text, 'ไม่มีเพดานต่อไฟล์สำหรับสินค้า').not.toContain('ต่อไฟล์');
  expect(text).toContain(`${active.toLocaleString('en-US')} / 3,000`);
  expect(text, 'บอกที่ว่างที่เหลือจริง').toContain((3000 - active).toLocaleString('en-US'));
});

test('การ์ดทะเบียนลูกค้าและผู้ขายบอกเพดานต่อไฟล์ที่บังคับจริง', async ({ page }) => {
  await page.goto('/settings/import');
  for (const title of ['ทะเบียนลูกค้า', 'ทะเบียนผู้ขาย']) {
    const hint = page.locator('.card').filter({ hasText: title }).locator('.hint').first();
    await expect(hint, title).toContainText('ครั้งละไม่เกิน 3,000 รายต่อไฟล์');
  }
});
