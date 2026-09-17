import { expect, test, type Page } from '@playwright/test';
import { ensureBillnote } from './billnote';
import { makeSession } from './session';

/**
 * รายการเอกสารบนจอแคบเป็นการ์ด (เฟส 2 — ต้นแบบของทีม `a.mdoc`)
 *
 * ตารางประวัติมีสิบสองคอลัมน์ บนจอ 375 ต้องเลื่อนซ้ายขวาเพื่ออ่านให้ครบใบเดียว
 * ต้นแบบจึงเปลี่ยนเป็นการ์ดใบละบล็อก — เลขที่ · ชื่อ · ทะเบียน · วันที่ · ยอด · คงค้าง
 *
 * ถามตามความกว้างจอ ไม่ใช่ชื่อโปรเจกต์ (สเปก §2 · เหมือน mobile-shell.spec)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); await ensureBillnote(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;

const LISTS = [
  { name: 'รายรับ', path: '/income?kind=RC&hist=1', doc: /\/income\/[0-9a-f-]{20,}$/, newHref: '/income?kind=RC' },
  { name: 'รายจ่าย', path: '/expense?kind=PO&hist=1', doc: /\/expense\/[0-9a-f-]{20,}$/, newHref: '/expense?kind=PO' },
  { name: 'ใบวางบิล', path: '/income/billing?hist=1', doc: /\/income\/billing\/[0-9a-f-]{20,}$/, newHref: '/income/billing?vat=yes' },
];

for (const list of LISTS) {
  test(`${list.name}: จอแคบเห็นการ์ด · เดสก์ท็อปเห็นตารางเหมือนเดิม`, async ({ page }) => {
    await page.goto(list.path);
    const cards = page.locator('.doc-cards');
    const table = page.locator('table.hist');

    if (แคบ(page)) {
      await expect(cards).toBeVisible();
      await expect(table).toBeHidden();
      const n = await page.locator('.doc-cards .dcard').count();
      expect(n, 'ต้องมีการ์ดให้ตรวจจริง').toBeGreaterThan(0);
      /* หัวข้อกลุ่มบอกจำนวนตามต้นแบบ — ตัวเลขต้องตรงกับจำนวนการ์ดในหน้านี้ */
      const head = await page.locator('.list-head .cnt').innerText();
      expect(Number(head.replace(/[^\d]/g, '')), `หัวข้อบอก "${head}" แต่มี ${n} การ์ด`).toBe(n);
    } else {
      await expect(table).toBeVisible();
      await expect(cards).toBeHidden();
    }
  });

  test(`${list.name}: ปุ่ม "สร้างใหม่" อยู่ในหัวข้อกลุ่มเฉพาะจอแคบ`, async ({ page }) => {
    await page.goto(list.path);
    const btn = page.locator('.list-head .new-btn');
    if (!แคบ(page)) {
      await expect(btn).toBeHidden();
      return;
    }
    await expect(btn).toBeVisible();
    const href = await btn.getAttribute('href');
    expect(href, 'ปลายทางต้องเป็นฟอร์มของชนิดที่กรองอยู่').toBe(list.newHref);
  });
}

test('การ์ดเอกสารขายมีข้อมูลครบ และกดทั้งใบเปิดเอกสารนั้น', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้ตาราง');
  await page.goto('/income?kind=RC&hist=1');

  const card = page.locator('.doc-cards .dcard').first();
  await expect(card.locator('.kindchip')).toHaveText('RC');
  await expect(card.locator('.no')).toHaveText(/^RC-\d{6}-\d+/);
  expect((await card.locator('.nm').innerText()).trim().length, 'ต้องมีชื่อลูกค้า').toBeGreaterThan(0);
  await expect(card.locator('.r3 .d'), 'วันที่แบบไทย').toHaveText(/\d{1,2} .+ 25\d\d/);
  await expect(card.locator('.r3 .amt')).toHaveText(/[\d,]+\.\d\d/);

  const no = (await card.locator('.no').innerText()).trim();
  await card.click();
  await expect(page).toHaveURL(LISTS[0]!.doc);
  await expect(page.locator('body'), 'เปิดใบที่กดจริง').toContainText(no);
});

test('ใบเสนอราคาไม่มีบรรทัดคงค้าง · ใบเสร็จบอกคงค้างหรือชำระครบ', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปใช้ตาราง');

  await page.goto('/income?kind=QT&hist=1');
  const qt = page.locator('.doc-cards .dcard');
  expect(await qt.count(), 'ต้องมีใบเสนอราคาให้ตรวจ').toBeGreaterThan(0);
  await expect(qt.locator('.out'), 'ใบเสนอราคายังไม่ใช่หนี้').toHaveCount(0);

  await page.goto('/income?kind=RC&hist=1');
  const outs = await page.locator('.doc-cards .dcard .out').allInnerTexts();
  expect(outs.length, 'ใบเสร็จต้องบอกสถานะยอดทุกใบ').toBeGreaterThan(0);
  expect(outs.every((t) => /คงค้าง|ชำระครบ/.test(t)), outs.join(' · ')).toBe(true);
});

test('ตัวกรองช่วงเวลาบนจอแคบเป็น dropdown เดียว', async ({ page }) => {
  await page.goto('/income?kind=RC&hist=1');
  const picker = page.locator('.mdate');
  /* เดสก์ท็อปเป็นแถบปุ่มต่อกันแบบหน้ายอดขาย (17 ก.ย. 2569 — เดิมชิปแยก) */
  const chips = page.locator('.toolbar.dfilter nav.seg a.seg-btn', { hasText: 'เดือนที่แล้ว' });

  if (!แคบ(page)) {
    await expect(picker, 'เดสก์ท็อปยังใช้ชิปเหมือนเดิม').toBeHidden();
    await expect(chips.first()).toBeVisible();
    /* กรองวันที่จากหน้าประวัติต้องอยู่หน้าประวัติต่อ ไม่เด้งไปฟอร์มสร้างใบใหม่ */
    await chips.first().click();
    await expect(page).toHaveURL(/[?&]hist=1/);
    await expect(page.locator('table.hist, .empty').first()).toBeVisible();
    return;
  }

  await expect(picker).toBeVisible();
  await expect(chips.first(), 'จอแคบไม่แสดงชิปช่วงวันที่ซ้ำ').toBeHidden();

  await picker.locator('select').selectOption({ label: 'เดือนที่แล้ว' });
  await page.waitForURL(/[?&]from=\d{4}-\d{2}-\d{2}/);
  await expect(page).toHaveURL(/[?&]to=\d{4}-\d{2}-\d{2}/);
  await expect(page, 'ต้องยังอยู่หน้าประวัติ ไม่เด้งไปฟอร์มสร้างใบใหม่').toHaveURL(/[?&]hist=1/);
  await expect(page, 'ตัวกรองชนิดเอกสารต้องติดไปด้วย').toHaveURL(/[?&]kind=RC/);
  /* เลือกแล้วค่าที่เห็นต้องเป็นค่าที่เลือก ไม่เด้งกลับ */
  await expect(page.locator('.mdate select')).toHaveValue(/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/);
});

/**
 * แถบค้นหาหน้ารายรับบนจอแคบ (ผู้ใช้ส่งภาพเครื่องจริง 16 ก.ย. 2569)
 * "ย้าย รวมใบที่ยกเลิก ลงมาติดกับพิมพ์ แล้วขยายช่องค้นหาครับ"
 */
const incomeSearch = (page: Page) => page.locator('form[action="/income"]').filter({ has: page.locator('input[name="q"]') });

async function boxes(page: Page) {
  return incomeSearch(page).evaluate((form) => {
    const r = (e: Element | null) => e ? e.getBoundingClientRect().toJSON() as DOMRect : null;
    const cs = getComputedStyle(form);
    const f = form.getBoundingClientRect();
    const labels = [...form.querySelectorAll('label.chip')].map((l) => ({ text: (l.textContent ?? '').trim(), box: r(l)! }));
    return {
      form: f.toJSON() as DOMRect,
      inner: f.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      search: r(form.querySelector('input[name="q"]'))!,
      voided: labels.find((l) => l.text.includes('รวมใบที่ยกเลิก'))!.box,
      labels,
      print: r([...form.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('พิมพ์รายงาน')) ?? null)!,
    };
  });
}
const sameRow = (a: DOMRect, b: DOMRect) => Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6;

test('รายรับจอแคบ: ช่องค้นหาเต็มแถว · "รวมใบที่ยกเลิก" อยู่แถวเดียวกับปุ่มพิมพ์ใต้ช่องค้นหา', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปอยู่แถวเดียวเหมือนเดิม');
  await page.goto('/income?kind=RC&hist=1');
  const b = await boxes(page);

  expect(Math.round(b.search.width), `ช่องค้นหากว้าง ${Math.round(b.search.width)} จาก ${Math.round(b.inner)}`)
    .toBeGreaterThanOrEqual(Math.floor(b.inner) - 1);
  expect(sameRow(b.voided, b.print), 'ติ๊กกับปุ่มพิมพ์อยู่แถวเดียวกัน').toBe(true);
  expect(b.voided.top, 'ติ๊กอยู่ใต้ช่องค้นหา').toBeGreaterThanOrEqual(b.search.bottom);
});

test('รายรับจอแคบ: หน้าใบเสนอราคามีสองติ๊ก — ทั้งหมดอยู่ใต้ช่องค้นหาและไม่ล้นขอบฟอร์ม', async ({ page }) => {
  test.skip(!แคบ(page), 'เดสก์ท็อปอยู่แถวเดียวเหมือนเดิม');
  await page.goto('/income?kind=QT&hist=1');
  const b = await boxes(page);

  expect(b.labels.map((l) => l.text)).toEqual(['รวมใบที่ยกเลิก', 'เฉพาะงานค้างส่งมอบ']);
  for (const x of [...b.labels.map((l) => l.box), b.print]) {
    expect(x.top, 'อยู่ใต้ช่องค้นหา').toBeGreaterThanOrEqual(b.search.bottom);
    expect(x.right, 'ไม่ล้นขอบขวาของฟอร์ม').toBeLessThanOrEqual(b.form.right + 1);
  }
});

test('รายรับจอแคบ: ค้นหาด้วย Enter และติ๊กรวมใบที่ยกเลิกยังส่งค่าเหมือนเดิม', async ({ page }) => {
  test.skip(!แคบ(page), 'ถามบนจอแคบที่ย้ายตำแหน่ง');
  await page.goto('/income?kind=RC&hist=1');
  const form = incomeSearch(page);
  await form.locator('label.chip', { hasText: 'รวมใบที่ยกเลิก' }).click();
  await form.locator('input[name="q"]').fill('RC-');
  await form.locator('input[name="q"]').press('Enter');
  await expect(page).toHaveURL(/[?&]q=RC-/);
  await expect(page).toHaveURL(/[?&]voided=1/);
});

test('รายรับเดสก์ท็อป: ช่องค้นหา 200px ติ๊กและปุ่มพิมพ์อยู่แถวเดียวเหมือนเดิม', async ({ page }) => {
  test.skip(แคบ(page), 'ข้อนี้ถามเฉพาะเดสก์ท็อป');
  await page.goto('/income?kind=RC&hist=1');
  const b = await boxes(page);
  /* วัดจากหน้าจริงก่อนแก้ (16 ก.ย. 2569) — โค้ดเขียน width: 260 แต่มีกฎ CSS จำกัดไว้ที่ 200px */
  expect(Math.round(b.search.width)).toBe(200);
  expect(sameRow(b.search, b.voided) && sameRow(b.voided, b.print), 'ทั้งสามอยู่แถวเดียว').toBe(true);
});
