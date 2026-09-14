import { expect, test } from '@playwright/test';
import { makeSession } from './session';

/**
 * ลิงก์พิมพ์ผิดหรือหน้าที่ยังไม่มี ต้องได้ 404 ไม่ใช่ 500
 *
 * เจอจริงตอนนำชุดแก้ 13–14 ก.ย. เข้า — เมนู 03.5 ชี้ /income/walkin ซึ่งยังไม่มีไฟล์
 * จึงตกไปที่ /income/[id] แล้วรหัส "walkin" ถูกส่งให้ Postgres ตรง ๆ → หน้าพังเป็น 500
 * หน้า [id] ทุกหน้าเป็นแบบนี้มาก่อนชุดแก้แล้ว test/id-guard.test.ts ตรวจโค้ด ส่วนนี้ตรวจผลจริง
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const BAD = 'not-a-uuid';
const ID_ROUTES = [
  `/income/${BAD}`, `/income/${BAD}/edit`, `/income/${BAD}/print`,
  `/expense/${BAD}`, `/expense/${BAD}/edit`, `/expense/${BAD}/print`,
  `/income/billing/${BAD}`, `/income/billing/${BAD}/print`,
  `/customers/${BAD}`, `/stock/${BAD}`, `/stock/${BAD}/barcode`,
  `/stock/claim/${BAD}`, `/stock/claim/${BAD}/print`,
  `/stock/count/${BAD}`, `/stock/count/${BAD}/print`,
];

test('หน้ารายใบที่รหัสไม่ใช่ uuid ตอบ 404 ทุกหน้า', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'สถานะ HTTP ไม่ขึ้นกับขนาดจอ ตรวจรอบเดียวพอ');
  /* เปิด 15 หน้าในข้อเดียว — บนเซิร์ฟเวอร์ dev ที่เพิ่งเริ่ม แต่ละหน้าคอมไพล์ครั้งแรกหลายวินาที
     เวลาตั้งต้น 30 วินาทีจึงหมดก่อนครบ (เจอในการรันทั้งชุดหลัง merge · รันซ้ำเครื่องอุ่นแล้วใช้ 7 วินาที) */
  test.setTimeout(120_000);
  const wrong: string[] = [];
  for (const path of ID_ROUTES) {
    const res = await page.goto(path);
    if (res?.status() !== 404) wrong.push(`${path} → ${res?.status()}`);
  }
  expect(wrong).toEqual([]);
});

test('หน้าใหม่สองหน้าของชุดแก้เปิดได้จริง ไม่ตกไปหน้ารายใบ', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'สถานะ HTTP ไม่ขึ้นกับขนาดจอ ตรวจรอบเดียวพอ');
  for (const [path, heading] of [['/income/walkin', 'ขายหน้าร้าน'], ['/settings/trash', 'เอกสารที่ลบ/ยกเลิก']] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('.topbar h1'), path).toHaveText(heading);
  }
});
