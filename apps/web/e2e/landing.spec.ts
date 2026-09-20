import { expect, test } from '@playwright/test';

/**
 * หน้าแนะนำระบบสำหรับผู้เข้าชม — ตรวจบนเบราว์เซอร์จริงทั้งสามขนาดจอ
 *
 * ชุดนี้**ไม่ใส่คุกกี้เซสชัน** ต่างจากสเปกอื่นทั้งหมดในโฟลเดอร์นี้ เพราะทั้งเรื่อง
 * คือ "คนที่ยังไม่เคยใช้ระบบเปิดเข้ามาแล้วเจออะไร"
 *
 * สองข้อที่ต้องวัดจากเบราว์เซอร์จริง อ่านไฟล์ CSS แทนไม่ได้
 *   1. หน้าล้นออกด้านข้างหรือไม่ — กฎที่เขียนไว้ถูก แต่กล่องใดกล่องหนึ่งดันกว้างเกินได้เสมอ
 *   2. ปุ่มเข้าสู่ระบบสูงถึงเป้ากดขั้นต่ำหรือไม่ — ความสูงจริงมาจากทั้งแพดดิงและบรรทัดตัวอักษร
 */

/* เป้ากดขั้นต่ำบนจอสัมผัส — เลขเดียวกับที่ระบบใช้ทั้งเว็บ (ดู .navbtn ใน globals.css) */
const TAP = 44;

for (const path of ['/', '/welcome']) {
  test(`${path} เปิดได้โดยไม่ต้องล็อกอิน และเป็นหน้าแนะนำระบบ`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), 'ต้องไม่เด้งไปหน้าล็อกอิน').toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    /* แถบเมนูของระบบมีชื่ออู่อยู่บนนั้น — หลุดมาหน้านี้ไม่ได้เด็ดขาด */
    await expect(page.locator('.rail, .tabbar'), 'ห้ามมีแถบเมนูของระบบ').toHaveCount(0);
  });
}

test('ปุ่มเข้าสู่ระบบพาไปหน้าล็อกอินของระบบ ไม่ใช่ฟอร์มของตัวเอง', async ({ page, baseURL }) => {
  await page.goto('/');

  /* ทุกปุ่มในหน้าต้องชี้ที่เดียวกัน — ปุ่มที่ลืมแก้ตอนย้ายเส้นทางคือจุดที่พังเงียบที่สุด */
  const logins = page.getByRole('link', { name: 'เข้าสู่ระบบ' });
  expect(await logins.count(), 'ต้องมีปุ่มเข้าสู่ระบบอย่างน้อยหนึ่งปุ่ม').toBeGreaterThan(0);
  for (const href of await logins.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
    expect(href).toBe('/login');
  }

  /* หน้านี้ต้องไม่มีช่องกรอกรหัสผ่านของตัวเอง — การล็อกอินมีที่เดียวคือ /login */
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  await logins.first().click();
  await expect(page).toHaveURL(`${baseURL}/login`);
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

test('หน้าไม่ล้นออกด้านข้าง', async ({ page }) => {
  await page.goto('/welcome');
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `กว้าง ${scroll} เกินจอ ${client}`).toBeLessThanOrEqual(client);
});

/**
 * วัดเฉพาะของที่หน้าตาเป็น "ปุ่ม" (`.btn`) ไม่รวมลิงก์ตัวหนังสือในย่อหน้าและท้ายหน้า
 * เพราะกฎ 44px เป็นเรื่องของเป้ากด ไม่ใช่เรื่องความสูงของบรรทัดตัวอักษร —
 * บังคับกับลิงก์ในย่อหน้าด้วยจะได้ย่อหน้าที่บรรทัดห่างจนอ่านไม่รู้เรื่อง
 */
test('ปุ่มทุกปุ่มสูงถึงเป้ากดขั้นต่ำ', async ({ page }) => {
  await page.goto('/welcome');
  const btns = page.locator('.lp .btn');

  const n = await btns.count();
  expect(n, 'ต้องมีปุ่มในหน้า').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const label = (await btns.nth(i).innerText()).trim();
    const box = await btns.nth(i).boundingBox();
    expect(box, `ปุ่ม "${label}" วัดกรอบไม่ได้`).not.toBeNull();
    expect(Math.round(box!.height), `ปุ่ม "${label}" สูง ${box!.height}px`).toBeGreaterThanOrEqual(TAP);
  }
});
