import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ยิงบาร์โค้ดเข้าเอกสาร — ทดสอบแบบที่ปืนยิงทำจริง
 *
 * ปืนยิงคือคีย์บอร์ดที่พิมพ์เร็วมากแล้วกด Enter ปิดท้าย เทสต์นี้จึงพิมพ์ด้วย
 * `type()` แล้วกด Enter ไม่ใช่ยัดค่าลงช่องตรง ๆ — **สิ่งที่ต้องพิสูจน์คือ
 * Enter ของปืนไม่ไปกดปุ่มบันทึกของฟอร์ม** ซึ่งเป็นกับดักคลาสสิกของช่องกรอก
 * ที่อยู่ในฟอร์ม และเป็นอาการที่เห็นก็ต่อเมื่อลองยิงจริง
 */

let token: string;
let barcode: string;
let code: string;

test.beforeAll(async () => {
  token = await makeSession();

  /* ติดบาร์โค้ดให้สินค้าตัวหนึ่งในข้อมูลตัวอย่าง แล้วใช้ตัวนั้นยิง */
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  barcode = `E2E${Date.now()}`;
  const { rows } = await c.query(
    `update products set barcode = $1
      where id = (select id from products where active order by code limit 1)
      returning code`, [barcode]);
  code = rows[0].code;
  await c.end();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const scan = async (page: import('@playwright/test').Page, text: string) => {
  /* **พิมพ์ลงตัวที่โฟกัสอยู่ ไม่คลิกช่องก่อน** — ปืนยิงไม่มีมือไปคลิกจอ
     ถ้าคลิกก่อนทุกนัด เทสต์จะซ่อมโฟกัสให้เองและมองไม่เห็นบั๊กโฟกัสหลุด */
  await page.keyboard.type(text, { delay: 0 });
  await page.keyboard.press('Enter');
};

/**
 * ช่องจำนวนของบรรทัดที่มีรหัสนี้ — หาคอลัมน์จากหัวตาราง ไม่นับลำดับช่องกรอก
 *
 * ตารางรายการแบบใหม่ (ชุดแก้ 13 ก.ย.) มีช่อง รหัส · ชื่อ · จำนวน · หน่วย … และบรรทัดว่างรออยู่เสมอ
 * เทสต์เดิมนับ nth(3) จากแถวแรกของ .tbl ตัวแรก ซึ่งตอนนี้ได้ช่องหน่วย — ผ่านหรือพังด้วยเหตุผลผิดทั้งคู่
 */
async function qtyOf(page: Page, productCode: string) {
  const table = page.locator('table.lines');
  const headers = (await table.locator('thead th').allInnerTexts()).map((h) => h.trim());
  const col = headers.indexOf('จำนวน');
  expect(col, `หัวตาราง: ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
  const row = table.locator('tbody tr', { has: page.locator(`input[value="${productCode}"]`) });
  await expect(row).toHaveCount(1);
  return row.locator('td').nth(col).locator('input');
}

/** รหัสที่ถูกเติมในตารางรายการ (บรรทัดว่างไม่นับ) */
const filledCodes = (page: Page) =>
  page.locator('table.lines tbody tr td:nth-child(2) input').evaluateAll(
    (els) => els.map((e) => (e as HTMLInputElement).value.trim()).filter(Boolean));

test('ยิงแล้วเข้าเป็นบรรทัดทันที และไม่เผลอบันทึกเอกสาร', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await expect(page.locator('#scan')).toBeFocused();

  await scan(page, barcode);

  /* บรรทัดเข้าจริง */
  await expect(page.locator('table.lines input[value="' + code + '"]')).toHaveCount(1);
  /* ยังอยู่หน้าเดิม — Enter ของปืนต้องไม่ไปกดปุ่มบันทึก */
  await expect(page).toHaveURL(/\/income\/new/);
  /* โฟกัสกลับมาที่ช่องยิงเอง พร้อมยิงตัวถัดไป */
  await expect(page.locator('#scan')).toBeFocused();
  await expect(page.locator('#scan')).toHaveValue('');
});

test('ยิงซ้ำเพิ่มจำนวนในบรรทัดเดิม ไม่เพิ่มบรรทัดใหม่', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await scan(page, barcode);
  await scan(page, barcode);
  await scan(page, barcode);

  await expect(page.locator('table.lines input[value="' + code + '"]')).toHaveCount(1);
  await expect(await qtyOf(page, code)).toHaveValue('3');
  /* ตัวอักษรของนัดถัดไปต้องไม่หลงไปอยู่ในช่องอื่น — เคยเจอ: Enter ของนัดแรกย้ายโฟกัสออกจากช่องยิง
     นัดที่สองและสามจึงถูกพิมพ์ลงช่องรหัสของบรรทัดแรก ปืนดังครบทุกนัด แต่ในใบมีของชิ้นเดียว */
  expect(await filledCodes(page)).toEqual([code]);
  await expect(page.locator('#scan')).toBeFocused();
});

test('พิมพ์จำนวนนำหน้าแล้วยิง ได้ตามจำนวน', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await scan(page, `40*${barcode}`);

  await expect(await qtyOf(page, code)).toHaveValue('40');
});

test('ยิงไม่เจอ ไม่เพิ่มบรรทัด และเสนอทางไปสร้างสินค้าใหม่', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await scan(page, 'ไม่มีรหัสนี้จริง');

  /* ตารางแบบใหม่มีบรรทัดว่างรออยู่เสมอ — ตรวจว่าไม่มีบรรทัดไหนถูกเติมรหัส ไม่ใช่นับแถว */
  expect(await filledCodes(page)).toEqual([]);
  const link = page.locator('a', { hasText: 'เพิ่มเป็นสินค้าใหม่' });
  await expect(link).toBeVisible();
  /* พาบาร์โค้ดที่ยิงไปด้วย จะได้ไม่ต้องพิมพ์ซ้ำแล้วเสี่ยงพิมพ์ผิด */
  await expect(link).toHaveAttribute('href', /barcode=/);
});

test('ยิงเข้าใบซื้อได้ด้วย', async ({ page }) => {
  await page.goto('/expense/new?kind=PO');
  await scan(page, barcode);
  await expect(page.locator('table.lines input[value="' + code + '"]')).toHaveCount(1);
});
