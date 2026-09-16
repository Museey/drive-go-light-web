import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * โครงหน้าจอตามต้นแบบของทีม (เฟส 1 — 16 ก.ย. 2569)
 *
 * ต้นแบบ dgl-prototype-2569-09-13-mobile.html สลับโหมดด้วยบรรทัดเดียว:
 *   frame.className = 'frame ' + (d === 't' ? 'm mt' : d)
 * **โหมดแท็บเล็ตคือโหมดมือถือ** ต่างกันแค่ความกว้างกรอบและเนื้อหากว้างสุด 560px
 * ของเรากลับเปิดโหมดเดสก์ท็อป (แถบเมนูบน + เมนูย่อยคอลัมน์ซ้าย) ตั้งแต่ 768px
 * จุดตัดจึงย้ายไป 1280px — เทสต์นี้คุมว่าแท็บเล็ตได้หน้าตาเดียวกับมือถือจริง ๆ
 *
 * เทียบตามความกว้างจอของแต่ละโปรเจกต์ ไม่ใช่ชื่อโปรเจกต์ — เปลี่ยนขนาดใน
 * playwright.config แล้วเทสต์ยังถามคำถามเดิม
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/** ลำดับช่องแถบล่างตามต้นแบบ */
const TABS = ['หน้าแรก', 'ลูกค้า', 'รายรับ', 'สินค้า', 'รายจ่าย', 'เพิ่มเติม'];

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

test('จอต่ำกว่า 1280 ใช้แถบล่าง — 1280 ขึ้นไปใช้แถบเมนูบนเหมือนเดิม', async ({ page }) => {
  await page.goto('/');
  if (isDesktop(page)) {
    await expect(page.locator('.rail'), 'เดสก์ท็อปต้องไม่เปลี่ยน').toBeVisible();
    await expect(page.locator('.tabbar')).toBeHidden();
  } else {
    await expect(page.locator('.tabbar'), 'แท็บเล็ตต้องได้แถบล่างเหมือนมือถือ').toBeVisible();
    await expect(page.locator('.rail')).toBeHidden();
    /* เมนูย่อยเป็นของเดสก์ท็อป — ต่ำกว่า 1280 ต้องอยู่ใต้หัวหน้าตามเดิม
       ทั้งกฎ CSS (คอลัมน์เดียว) และ SubnavPortal ใน JS ต้องสลับที่จุดเดียวกัน */
    await page.goto('/customers');
    const subwrap = page.locator('.subwrap').first();
    if (await subwrap.count()) {
      const cols = await subwrap.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
      expect(cols.split(' ').length, `subwrap = ${cols}`).toBe(1);
    }
    await expect(page.locator('#topbar-subnav .subnav'), 'เมนูย่อยต้องไม่ถูกย้ายขึ้นหัวหน้า').toHaveCount(0);
    await expect(page.locator('.subwrap .subnav')).toHaveCount(1);
    /* หัวหน้าต้องไม่บวมเพราะของที่ย้ายมาผิดที่ (เคยสูง 246px ที่ /income/walkin) */
    await page.goto('/income/walkin');
    const h = (await page.locator('.topbar').boundingBox())!.height;
    expect(Math.round(h), `หัวหน้าสูง ${Math.round(h)}px`).toBeLessThanOrEqual(120);
  }
});

test('แถบล่างหกช่องเรียงตามต้นแบบ หน้าแรก · ลูกค้า · รายรับ · สินค้า · รายจ่าย · เพิ่มเติม', async ({ page }) => {
  test.skip(isDesktop(page), 'เดสก์ท็อปไม่มีแถบล่าง');
  await page.goto('/');
  const labels = await page.locator('.tabbar .tab b').allInnerTexts();
  expect(labels.map((s) => s.trim())).toEqual(TABS);
  /* ทุกช่องกดได้จริง ไม่ใช่แค่มีตัวหนังสือ */
  for (const tab of await page.locator('.tabbar .tab').all()) {
    const box = await tab.boundingBox();
    expect(box!.height, 'เป้ากดสูงพอ').toBeGreaterThanOrEqual(44);
  }
});

test('แท็บเล็ต — เนื้อหากว้างสุด 560px กึ่งกลางจอ', async ({ page }) => {
  const width = page.viewportSize()!.width;
  test.skip(width < 768 || width >= 1280, 'เฉพาะช่วงแท็บเล็ต');
  await page.goto('/');
  const box = (await page.locator('.main > .wrap').boundingBox())!;
  expect(Math.round(box.width), 'กว้างไม่เกิน 560').toBeLessThanOrEqual(560);
  const left = box.x;
  const right = width - (box.x + box.width);
  expect(Math.abs(left - right), `ซ้าย ${left} ขวา ${right} ต้องเท่ากัน`).toBeLessThanOrEqual(2);
});

test('ปุ่มเครื่องมือของหน้า — ต่ำกว่า 1280 ย้ายเข้าลิ้นชัก "เพิ่มเติม"', async ({ page }) => {
  await page.goto('/finance/ar');
  /* หน้านี้มีปุ่มพิมพ์สองตัว — เอาตัวที่อยู่ในชุดเครื่องมือของหัวหน้า (PrintReport) */
  const head = page.locator('.topbar').getByRole('button', { name: '🖨 พิมพ์รายงาน' });

  if (isDesktop(page)) {
    await expect(head, 'เดสก์ท็อปยังอยู่ที่หัวหน้าเหมือนเดิม').toBeVisible();
    return;
  }

  await expect(head, 'จอแคบ — หัวหน้าต้องไม่มีปุ่มเครื่องมือ').toBeHidden();

  await page.getByRole('button', { name: 'เพิ่มเติม' }).click();
  const tools = page.locator('.drawer .tools');
  await expect(tools).toContainText('เครื่องมือของหน้านี้');
  await expect(tools.getByRole('button', { name: '🖨 พิมพ์รายงาน' })).toBeVisible();
  /* ลิงก์ส่งออกพาไปที่เดิม พร้อมตัวกรองของหน้า */
  const csv = tools.getByRole('link', { name: /CSV/ });
  if (await csv.count()) {
    await expect(csv).toHaveAttribute('href', /^\/finance\/ar\/csv/);
  }
});

test('หัวหน้าจอบนจอแคบ — ชื่อ 18px คำบรรยาย 12.5px', async ({ page }) => {
  test.skip(isDesktop(page), 'เดสก์ท็อปใช้ขนาดเดิม');
  await page.goto('/finance/ar');
  const size = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((el) => getComputedStyle(el).fontSize);
  expect(await size(page.locator('.topbar h1'))).toBe('18px');
  const sub = page.locator('.topbar .sub');
  if (await sub.count()) expect(await size(sub)).toBe('12.5px');
});
