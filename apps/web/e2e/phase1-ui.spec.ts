import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ชุดแก้ 10 ข้อ เฟส 1 (PLAN-batch10-2569-09-19.md)
 * ข้อ 9 ลำดับคอลัมน์ชุดอะไหล่ · ข้อ 3 Enter ในช่องค้นหา · ข้อ 2 ปุ่มวิธีรับชำระ
 * ข้อ 1 เลื่อนหาข้อความผิดพลาด · ข้อ 6 รายการในแผงยืนยัน · ข้อ 5 เลขผู้เสียภาษี 13 ช่อง
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/* ---------- ข้อ 9 — ลำดับคอลัมน์ในชุดอะไหล่ ---------- */
test('ชุดอะไหล่: คอลัมน์เรียง ลำดับ · รายการ · จำนวน · หน่วย · ทุน', async ({ page }) => {
  await page.goto('/stock/kits/new');
  const heads = await page.locator('table.lines thead th').allInnerTexts();
  expect(heads.map((h) => h.trim()).filter(Boolean))
    .toEqual(['#', 'รายการในชุด', 'จำนวน', 'หน่วย', 'ทุน/หน่วย', 'รวม']);

  /* ช่องกรอกในแถวต้องเรียงตามหัวตาราง ไม่ใช่สลับหัวอย่างเดียว */
  const names = await page.locator('table.lines tbody tr').first()
    .locator('input:not([type=hidden])').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name));
  expect(names).toEqual(['it0_name', 'it0_qty', 'it0_unit', 'it0_cost']);
});

/* ---------- ข้อ 3 — Enter ในช่องค้นหา = ค้นเลย ---------- */
const SEARCHES: [string, string, string][] = [
  ['/customers?kind=customer', 'form.desk-only input[name=q]', '5466'],
  ['/customers?kind=vendor', 'form.desk-only input[name=q]', 'อะไหล่'],
];

for (const [path, sel, word] of SEARCHES) {
  test(`${path}: พิมพ์แล้วกด Enter ค้นหาเลย ไม่ต้องกดปุ่ม`, async ({ page }, info) => {
    test.skip(info.project.name !== 'เดสก์ท็อป', 'ช่องค้นหาของเดสก์ท็อป — จอแคบใช้ช่องอื่นที่ Enter ทำงานอยู่แล้ว');
    await page.goto(path);
    await page.locator(sel).fill(word);
    await page.locator(sel).press('Enter');
    await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
}

/* ---------- ข้อ 2 — ปุ่มวิธีรับชำระบอกว่าเลือกอะไรอยู่ ---------- */
const PAY_BTNS = ['รับเงินสดเต็มจำนวน', 'รับโอนเต็มจำนวน', 'ชำระบางส่วน — กรอกยอด', 'ยังไม่รับเงิน (เครดิต)'];

/** กรอกบรรทัดแรกของเอกสาร — ช่องในตารางรายการเป็น React ล้วน ไม่มี name ให้อ้าง */
async function fillLine(page: Page, price: number) {
  const row = page.locator('table.lines tbody tr').first();
  await row.locator('td.c-name input').fill('ค่าแรงทดสอบ');
  await row.locator('td.c-qty input').fill('1');
  await row.locator('td.c-price input').fill(String(price));
  await row.locator('td.c-price input').blur();
}

const pressed = (page: Page, label: string) =>
  page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed');

test('ใบเสร็จ: ปุ่มวิธีรับชำระที่เลือกอยู่ต่างจากปุ่มอื่น', async ({ page }) => {
  await page.goto('/income/walkin');   /* ขายหน้าร้าน = ฟอร์มใบเสร็จที่ไม่ต้องเลือกใบต้นทาง */
  /* ต้องมียอดก่อน ไม่งั้น "เต็มจำนวน" กับ "ยังไม่รับ" แยกกันไม่ออก */
  await fillLine(page, 1000);

  for (const label of PAY_BTNS) {
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(await pressed(page, label), `กด "${label}" แล้วปุ่มนี้ต้องติด`).toBe('true');
    for (const other of PAY_BTNS.filter((b) => b !== label)) {
      expect(await pressed(page, other), `"${other}" ต้องไม่ติดพร้อมกัน`).not.toBe('true');
    }
  }

  /* สีของปุ่มที่ติดต้องต่างจากปุ่มที่ไม่ติดจริง ไม่ใช่ติดแต่ aria */
  const bg = async (label: string) => page.getByRole('button', { name: label, exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole('button', { name: PAY_BTNS[0], exact: true }).click();
  expect(await bg(PAY_BTNS[0])).not.toBe(await bg(PAY_BTNS[1]));
});

test('ใบเสร็จ: กรอกยอดรับเองบางส่วนแล้ว ปุ่ม "ชำระบางส่วน" ติดเอง · ยอดเต็มกลับไปติดเงินสดเต็มจำนวน', async ({ page }) => {
  await page.goto('/income/walkin');
  await fillLine(page, 1000);
  await page.getByRole('button', { name: PAY_BTNS[0], exact: true }).click();

  const cash = page.locator('#pay-เงินสด');
  /* ยอดเต็มคือยอดสุทธิของใบ (มี VAT รวมแล้ว) — อ่านจากช่องที่ปุ่ม "เต็มจำนวน" เพิ่งเติมให้ */
  const full = await cash.inputValue();
  expect(Number(full)).toBeGreaterThan(0);

  await cash.fill('400');
  await cash.blur();
  expect(await pressed(page, PAY_BTNS[2]), 'รับไม่ครบ = ชำระบางส่วน').toBe('true');
  expect(await pressed(page, PAY_BTNS[0])).not.toBe('true');

  await cash.fill(full);
  await cash.blur();
  expect(await pressed(page, PAY_BTNS[0]), 'รับครบ = เงินสดเต็มจำนวน').toBe('true');
});

/* ---------- ข้อ 1 — บันทึกไม่ผ่านแล้วเลื่อนไปหาข้อความผิดพลาด ---------- */
test('ฟอร์มสินค้า: บันทึกไม่ผ่าน ข้อความผิดพลาดต้องอยู่ในจอและได้โฟกัส', async ({ page }) => {
  await page.goto('/stock');
  /* รหัสที่มีอยู่แล้วในทะเบียน — บันทึกซ้ำจะถูกปฏิเสธ */
  const dupCode = (await page.locator('table.tbl tbody tr td.mono a').first().innerText()).trim();
  expect(dupCode.length).toBeGreaterThan(0);

  await page.goto('/stock/new');
  await page.locator('#code').fill(dupCode);
  await page.locator('#name').fill('สินค้าทดสอบข้อความผิดพลาด');

  /* ผู้ใช้อยู่ล่างสุดของฟอร์มตอนกดบันทึก — ข้อความอยู่บนสุด จึงอยู่นอกจอ */
  const save = page.getByRole('button', { name: /บันทึก/ }).first();
  await save.scrollIntoViewIfNeeded();
  await save.click();

  const err = page.locator('.err').first();
  await expect(err).toBeVisible();
  /* เลื่อนแบบ smooth ใช้เวลาสักครู่ — รอให้หยุดก่อนค่อยวัด */
  await expect.poll(async () => err.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  }), { message: 'กล่องข้อความผิดพลาดต้องถูกเลื่อนเข้ามาในจอให้เอง' }).toBe(true);
  await expect(err).toBeFocused();
});

/* ---------- ข้อ 6 — แผงยืนยันก่อนบันทึกแสดงรายการที่เปิดบิล ---------- */
test('แผงยืนยันใบเสนอราคา: แสดงรายการที่เปิดบิล ไม่ใช่พื้นที่ว่าง', async ({ page }) => {
  await page.goto('/income/new?kind=QT&blank=1');
  await page.locator('input[placeholder="พิมพ์ชื่อเพื่อค้นหา"]').fill('ลูกค้าทดสอบแผงยืนยัน');
  const rows = page.locator('table.lines tbody tr');
  await rows.nth(0).locator('td.c-name input').fill('ผ้าเบรกหน้า');
  await rows.nth(0).locator('td.c-qty input').fill('2');
  await rows.nth(0).locator('td.c-price input').fill('850');
  await rows.nth(1).locator('td.c-name input').fill('ค่าแรงเปลี่ยนผ้าเบรก');
  await rows.nth(1).locator('td.c-qty input').fill('1');
  await rows.nth(1).locator('td.c-price input').fill('300');
  await rows.nth(1).locator('td.c-price input').blur();

  await page.getByRole('button', { name: /บันทึกใบเสนอราคา/ }).click();
  const panel = page.locator('.confirm');
  await expect(panel).toBeVisible();

  const items = panel.locator('.confirm-items');
  await expect(items, 'ต้องมีรายการในแผง').toBeVisible();
  await expect(items).toContainText('ผ้าเบรกหน้า');
  await expect(items).toContainText('ค่าแรงเปลี่ยนผ้าเบรก');
  await expect(items, 'ยอดรวมบรรทัดแรก 2 × 850').toContainText('1,700.00');
  await expect(items).toContainText('300.00');
});

/* ---------- ข้อ 5 — เลขประจำตัวผู้เสียภาษี 13 ช่อง ---------- */
test('เพิ่มลูกค้า: เลขผู้เสียภาษีเป็น 13 ช่อง · พิมพ์แล้วเลื่อนช่องเอง · วางทั้งชุดได้ · บันทึกได้ครบ 13 หลัก', async ({ page }, info) => {
  const code = `ZT${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  await page.goto('/customers/new?kind=customer');

  const boxes = page.locator('.taxid .taxid-box');
  await expect(boxes).toHaveCount(13);

  /* 13 ช่องต้องอยู่ในบรรทัดเดียวไม่ล้นขอบ แม้จอมือถือ 375 */
  const fit = await page.locator('.taxid').evaluate((el) => ({
    over: el.scrollWidth - el.clientWidth,
    narrowest: Math.min(...[...el.querySelectorAll('input.taxid-box')].map((b) => b.getBoundingClientRect().width)),
  }));
  expect(fit.over, 'แถวช่องเลขภาษีล้นขอบ').toBeLessThanOrEqual(0);
  expect(fit.narrowest, 'ช่องแคบจนกดไม่ได้').toBeGreaterThan(12);

  /* พิมพ์ทีละหลัก โฟกัสต้องเลื่อนเอง */
  await boxes.nth(0).click();
  for (const d of '0105561000444') await page.keyboard.type(d);
  expect(await page.locator('input[name="taxId"]').inputValue()).toBe('0105561000444');

  /* วางทั้งชุดแบบมีขีดคั่น ทับของเดิม */
  await boxes.nth(0).click();
  await page.evaluate(() => {
    const el = document.querySelector('.taxid .taxid-box') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData('text', '0-9999-88888-77-6');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  expect(await page.locator('input[name="taxId"]').inputValue()).toBe('0999988888776');

  await page.locator('#code').fill(code);
  await page.locator('#firstName').fill('ทดสอบเลขภาษี');
  await page.getByRole('button', { name: 'เพิ่มผู้ติดต่อ' }).click();

  /* บันทึกแล้วกลับไปหน้าทะเบียน — เปิดใบที่เพิ่งบันทึกดูว่าเลขครบ 13 หลัก */
  await expect(page).toHaveURL(/\/customers/);
  await page.goto(`/customers?kind=customer&q=${code}`);
  const wide = (page.viewportSize()?.width ?? 0) >= 1280;
  await (wide ? page.locator('table.cust tbody tr').first() : page.locator('.contact-cards .mparty').first()).click();
  await expect(page.locator('body')).toContainText('0999988888776');
});
