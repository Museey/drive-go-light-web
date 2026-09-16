import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ทะเบียนสินค้าบนจอแคบ (เฟส 3 — ต้นแบบของทีม `mStock`)
 *
 * ของเดิมเปิดหน้ามาเจอไทล์เมนูย่อยสิบใบ + ไทล์ตัวกรองแปดใบ ต้องเลื่อนราว 700px
 * กว่าจะเห็นสินค้าใบแรก — ต้นแบบย้ายทั้งสองก้อนไปหลังปุ่มสลับ "ค้นหาสินค้า | เมนูและตัวกรอง"
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;

test('เปิดหน้าสินค้ามาเห็นสินค้าใบแรกทันที ไม่ต้องเลื่อน', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await page.goto('/stock');

  const first = page.locator('.stock-cards .pcard').first();
  await expect(first).toBeVisible();
  const box = (await first.boundingBox())!;
  const h = page.viewportSize()!.height;
  /* แถบล่าง 58px บังอยู่ท้ายจอ — ต้องเห็นการ์ดใบแรกเหนือแถบนั้น */
  expect(box.y, `การ์ดใบแรกอยู่ที่ ${Math.round(box.y)}px จอสูง ${h}px`).toBeLessThan(h - 58);
});

test('ปุ่มสลับ: แท็บเมนูและตัวกรองเก็บของที่เคยอยู่บนสุดไว้ครบ', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปไม่มีปุ่มสลับ');
  await page.goto('/stock');

  const seg = page.locator('.mseg');
  await expect(seg.locator('a')).toHaveCount(2);
  await expect(seg.locator('a.on')).toHaveText(/ค้นหาสินค้า/);
  await expect(page.locator('.subnav'), 'แท็บรายการไม่โชว์เมนูย่อย').toBeHidden();

  await seg.getByText(/เมนูและตัวกรอง/).click();
  await expect(page).toHaveURL(/[?&]menu=1/);
  await expect(page.locator('.subnav')).toBeVisible();
  expect(await page.locator('.subnav a').count(), 'เมนูย่อยครบ').toBeGreaterThan(5);
  await expect(page.locator('.stock-cards'), 'แท็บเมนูไม่โชว์รายการสินค้า').toBeHidden();

  /* จำนวนต่อหน้าอยู่ในแท็บนี้ (ผู้ใช้เลือก) — แถวแบ่งหน้าเดิมซ่อนบนจอแคบแล้ว */
  const size = page.locator('.tag-row').filter({ hasText: 'แสดงต่อหน้า' });
  await expect(size.first()).toBeVisible();
  await size.first().getByRole('link', { name: '20', exact: true }).click();
  await expect(page).toHaveURL(/[?&]size=20/);
  expect(await page.locator('.subnav a').count(), 'ยังอยู่แท็บเมนู').toBeGreaterThan(5);

  /* ตัวกรองทุกตัวต้องอยู่ในแท็บนี้ — ของเดิมอยู่บนสุดของหน้า ถ้าตกหล่นไปตัวใดตัวหนึ่ง
     คนใช้มือถือจะกรองด้วยตัวนั้นไม่ได้เลย และไม่มีอะไรบอกว่ามันหายไป */
  const tiles = page.locator('.tiles');
  for (const label of ['ทั้งหมด', 'ถึงจุดสั่งซื้อ', 'ถึงจุดสั่งซื้อ (Min)', 'เกินระดับสูงสุด (Max)',
                       'ไม่เคลื่อนไหว ≥ 6 เดือน', 'ใกล้หมดอายุ', 'หมดอายุแล้ว']) {
    await expect(tiles.getByRole('link', { name: label, exact: true }),
                 `ไทล์ตัวกรอง "${label}"`).toHaveCount(1);
  }

  /* กดตัวกรองแล้วกลับไปที่รายการพร้อมตัวกรองและแถบบอก */
  await tiles.getByRole('link', { name: 'ใกล้หมดอายุ', exact: true }).click();
  await expect(page).toHaveURL(/[?&]flag=expiring/);
  await expect(page).not.toHaveURL(/[?&]menu=1/);
  await expect(page.locator('.mfilter')).toContainText('ใกล้หมดอายุ');

  await page.goto('/stock?menu=1');
  await tiles.getByRole('link', { name: 'ถึงจุดสั่งซื้อ', exact: true }).click();
  await expect(page).toHaveURL(/[?&]reorder=1/);
  await expect(page.locator('.mfilter')).toBeVisible();
});

test('แถบบอกตัวกรองที่เปิดอยู่ · กดล้างแล้วกลับมาทั้งหมด', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้ไทล์บอกอยู่แล้ว');
  await page.goto('/stock?reorder=1');

  const bar = page.locator('.mfilter');
  await expect(bar).toContainText('สินค้าที่ต้องสั่งซื้อ');
  await bar.getByRole('link', { name: /ล้าง/ }).click();
  await expect(page).toHaveURL(/\/stock$/);
  await expect(page.locator('.mfilter')).toHaveCount(0);
});

test('การ์ดสินค้า: ชื่อ · รหัส · ราคา · คงเหลือ — ถึงจุดสั่งซื้อคงเหลือเป็นสีแดง', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await page.goto('/stock?reorder=1');

  const card = page.locator('.stock-cards .pcard').first();
  await expect(card.locator('.nm')).not.toHaveText('');
  await expect(card.locator('.code')).toHaveText(/\S/);
  await expect(card.locator('.price')).toHaveText(/[\d,]+\.\d\d/);
  const qty = card.locator('.qty');
  await expect(qty).toHaveText(/คงเหลือ/);
  await expect(qty, 'ของที่ถึงจุดสั่งซื้อต้องถูกทำเครื่องหมาย').toHaveClass(/low/);

  /* สีที่เห็นจริงต้องเป็นสีเตือนของระบบ ไม่ใช่แค่มีคลาส */
  const [got, want] = await page.evaluate(() => {
    const el = document.querySelector('.stock-cards .pcard .qty.low')!;
    const probe = document.createElement('span');
    probe.style.color = 'var(--due)';
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el).color, want];
  });
  expect(got, 'คงเหลือของที่ต้องสั่งซื้อต้องเป็นสีเตือน').toBe(want);
});

test('กดการ์ดแล้วเปิดหน้าสินค้าใบนั้น', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปเป็นตาราง');
  await page.goto('/stock');
  const card = page.locator('.stock-cards .pcard').first();
  const code = (await card.locator('.code').innerText()).trim();
  await card.click();
  await expect(page).toHaveURL(/\/stock\/[0-9a-f-]{20,}$/);
  await expect(page.locator('body')).toContainText(code);
});

test('ปุ่มแบ่งหน้าแบบลอย — หน้าแรกกดย้อนไม่ได้ · กดถัดไปเปลี่ยนหน้าจริง · ไม่บังการ์ดใบสุดท้าย', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้แถวแบ่งหน้าเดิม');
  await page.goto('/stock');

  const pager = page.locator('.mpager');
  await expect(pager).toBeVisible();
  await expect(pager.locator('.mpg.off'), 'หน้าแรกย้อนกลับไม่ได้').toHaveCount(1);
  await expect(page.locator('.pager'), 'แถวแบ่งหน้าเดิมซ่อนบนจอแคบ').toBeHidden();

  const before = (await page.locator('.pcard .code').first().innerText()).trim();
  await pager.getByText(/ถัดไป/).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  const after = (await page.locator('.pcard .code').first().innerText()).trim();
  expect(after, 'เปลี่ยนหน้าแล้วต้องได้สินค้าคนละชุด').not.toBe(before);

  /* ปุ่มลอยทับเนื้อหาไม่ได้ — เลื่อนสุดหน้าแล้วการ์ดใบสุดท้ายต้องยังกดได้ */
  await page.locator('.pcard').last().scrollIntoViewIfNeeded();
  const last = (await page.locator('.pcard').last().boundingBox())!;
  const bar = (await pager.boundingBox())!;
  const ทับ = last.y < bar.y + bar.height && bar.y < last.y + last.height
    && last.x < bar.x + bar.width && bar.x < last.x + last.width;
  expect(ทับ, `ปุ่มลอย ${JSON.stringify(bar)} ทับการ์ด ${JSON.stringify(last)}`).toBe(false);
});

test('เดสก์ท็อปไม่เปลี่ยน — ตาราง ไทล์ และแถวแบ่งหน้าเหมือนเดิม', async ({ page }) => {
  test.skip(แคบ(page), 'ข้อนี้ถามเฉพาะเดสก์ท็อป');
  await page.goto('/stock');
  await expect(page.locator('.stock-table table')).toBeVisible();
  await expect(page.locator('.stock-cards')).toBeHidden();
  /* ของพวกนี้เรนเดอร์เสมอแล้วซ่อนด้วย CSS (ไม่วัดจอใน JS ตามสเปก §2) — เดสก์ท็อปต้องไม่เห็น */
  for (const sel of ['.mseg', '.mfilter', '.mpager', '.list-head']) {
    await expect(page.locator(sel).first(), `${sel} ต้องไม่โผล่บนเดสก์ท็อป`).toBeHidden();
  }
  await expect(page.locator('.tiles').first()).toBeVisible();
  await expect(page.locator('.pager').first()).toBeVisible();
});
