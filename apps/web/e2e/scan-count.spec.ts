import { expect, test } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ยิงบาร์โค้ดเข้าใบตรวจนับ — ทางนี้อู่ใช้อยู่แล้วจริง
 *
 * ใบตรวจนับเป็นช่องยิงตัวแรกของระบบ และมีบั๊กเดียวกับที่เพิ่งเจอในหน้าเอกสาร
 * คือล้างช่องหลังเซิร์ฟเวอร์ตอบ ทำให้นัดที่มาถึงก่อนผลกลายเป็นรหัสสองตัวติดกัน
 * เทสต์นี้ยิงรัวแบบปืนจริง (delay 0 ไม่รอผลระหว่างนัด) เพื่อกันไม่ให้กลับมาอีก
 */

let token: string;
let barcode: string;
let code: string;

test.beforeAll(async () => {
  token = await makeSession();
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  barcode = `CNT${Date.now()}`;
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

test('ยิงรัวเข้าใบตรวจนับ นับครบทุกนัด', async ({ page }) => {
  await page.goto('/stock/count');
  await page.getByRole('button', { name: '+ ตรวจนับสินค้า' }).click();
  await page.getByRole('button', { name: 'เปิดใบ' }).click();
  await expect(page).toHaveURL(/\/stock\/count\/[0-9a-f-]{36}/);

  /* โฟกัสอยู่ที่ช่องยิงตั้งแต่เปิดใบ — ไม่ต้องเอามือมาคลิก */
  await expect(page.locator('#scan')).toBeFocused();

  await scan(page, barcode);
  await scan(page, barcode);
  await scan(page, barcode);

  /* บรรทัดเดียว นับได้ 3 — ไม่ใช่ 2 เพราะนัดกลางหล่นหาย */
  const row = page.locator('.tbl tbody tr', { has: page.locator(`text=${code}`) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('input').first()).toHaveValue('3');

  /* ช่องยิงว่างและยังโฟกัสอยู่ พร้อมนัดถัดไป */
  await expect(page.locator('#scan')).toHaveValue('');
  await expect(page.locator('#scan')).toBeFocused();
});
