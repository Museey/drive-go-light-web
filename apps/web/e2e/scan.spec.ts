import { expect, test } from '@playwright/test';
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

test('ยิงแล้วเข้าเป็นบรรทัดทันที และไม่เผลอบันทึกเอกสาร', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await expect(page.locator('#scan')).toBeFocused();

  await scan(page, barcode);

  /* บรรทัดเข้าจริง */
  await expect(page.locator('.tbl input[value="' + code + '"]')).toHaveCount(1);
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

  await expect(page.locator('.tbl input[value="' + code + '"]')).toHaveCount(1);
  const qty = page.locator('.tbl tbody tr').first().locator('input').nth(3);
  await expect(qty).toHaveValue('3');
});

test('พิมพ์จำนวนนำหน้าแล้วยิง ได้ตามจำนวน', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await scan(page, `40*${barcode}`);

  const qty = page.locator('.tbl tbody tr').first().locator('input').nth(3);
  await expect(qty).toHaveValue('40');
});

test('ยิงไม่เจอ ไม่เพิ่มบรรทัด และเสนอทางไปสร้างสินค้าใหม่', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await scan(page, 'ไม่มีรหัสนี้จริง');

  await expect(page.locator('.tbl tbody tr')).toHaveCount(0);
  const link = page.locator('a', { hasText: 'เพิ่มเป็นสินค้าใหม่' });
  await expect(link).toBeVisible();
  /* พาบาร์โค้ดที่ยิงไปด้วย จะได้ไม่ต้องพิมพ์ซ้ำแล้วเสี่ยงพิมพ์ผิด */
  await expect(link).toHaveAttribute('href', /barcode=/);
});

test('ยิงเข้าใบซื้อได้ด้วย', async ({ page }) => {
  await page.goto('/expense/new?kind=PO');
  await scan(page, barcode);
  await expect(page.locator('.tbl input[value="' + code + '"]')).toHaveCount(1);
});
