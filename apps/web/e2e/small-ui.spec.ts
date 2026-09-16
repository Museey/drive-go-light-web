import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ปรับแก้เล็ก 10 ข้อ (PLAN-small-ui-2569-09-15.md) — ข้อที่เห็นบนจอ วัดจากหน้าจริงทั้ง 3 ขนาดจอ
 * ข้อ 5 (ลำดับใบวางบิล) อยู่ใน test/billnotes.test.ts · ข้อ 8 (autocomplete) และข้อ 9 (ห้าม type="date")
 * บังคับที่ไฟล์โค้ดใน test/form-hygiene.test.ts
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const DARK = 'rgb(15, 92, 62)';          /* --steel-dk */

const bg = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);

/* ข้อ 1–2 */
for (const [path, word] of [['/finance/ar', 'รับชำระ'], ['/finance/ap', 'จ่ายชำระ']] as const) {
  test(`ปุ่ม${word}ในแถวเป็นสีเขียว — ${path}`, async ({ page }) => {
    await page.goto(path);
    const btn = page.locator('table tbody button', { hasText: word }).first();
    await expect(btn).toBeVisible();
    const color = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const ok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ok').trim());
    expect(ok).not.toBe('');
    expect(color, `ปุ่ม${word} ${color}`).toBe(await page.evaluate((v) => {
      const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c;
    }, ok));
    /* ปุ่มชำระหลายใบด้านบนก็เขียว */
    const bulk = page.locator('button', { hasText: `${word}หลายใบพร้อมกัน` });
    if (await bulk.count()) expect(await bulk.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(color);
  });
}

/* ข้อ 3 */
test('ผู้ติดต่อ: เลือกผู้ขายแล้วไม่มีส่วนรถที่ดูแล · สลับกลับเป็นลูกค้าแล้วมี', async ({ page }) => {
  await page.goto('/customers/new?kind=customer');
  await expect(page.getByText('รถที่ดูแล')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ เพิ่มรถ' })).toBeVisible();

  await page.getByRole('button', { name: 'ผู้ขาย', exact: true }).click();
  await expect(page.getByText('รถที่ดูแล')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ เพิ่มรถ' })).toHaveCount(0);

  await page.getByRole('button', { name: 'ลูกค้า', exact: true }).click();
  await expect(page.getByText('รถที่ดูแล')).toBeVisible();
});

/* ข้อ 4 — ช่องกรอกต้องฟังความกว้างคอลัมน์ (เดิมทุกช่อง 172px ตาราง 1,419px ในกรอบ 1,234px) */
const LINE_PAGES = ['/income?kind=QT', '/expense?kind=PO', '/stock/claim/new', '/stock/kits/new'];
for (const path of LINE_PAGES) {
  test(`ตารางรายการ: ชื่อกว้างสุด ช่องตัวเลขพอดีหลักที่กำหนด — ${path}`, async ({ page }, info) => {
    await page.goto(path);
    const table = page.locator('table.lines').filter({ has: page.locator('tbody input') }).first();
    await expect(table).toBeVisible();

    const row = table.locator('tbody tr').first();
    const fill = async (cls: string, text: string) => {
      const input = row.locator(`td.${cls} input.in`).first();
      if (!(await input.count())) return null;
      await input.fill(text);
      return input.evaluate((el: HTMLInputElement) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    };
    for (const [cls, text] of [['c-qty', '999999'], ['c-unit', 'กิโลกรัม'], ['c-disc', '9999']] as const) {
      const m = await fill(cls, text);
      if (m) expect(m.scroll, `${cls} "${text}" ถูกตัด (${m.scroll} > ${m.client})`).toBeLessThanOrEqual(m.client + 1);
    }

    const widths = await table.evaluate((t): Record<string, number> => Object.fromEntries(
      [...t.querySelectorAll('thead th')].map((th) => [th.className.match(/c-[a-z]+/)?.[0] ?? '', th.getBoundingClientRect().width])
        .filter(([k]) => k),
    ));
    const name = widths['c-name']!;
    for (const [k, w] of Object.entries(widths)) {
      if (k !== 'c-name') expect(name, `ชื่อสินค้า ${Math.round(name)}px ต้องกว้างกว่า ${k} ${Math.round(w)}px`).toBeGreaterThan(w);
    }
    if (widths['c-qty']) expect(widths['c-qty']).toBeLessThanOrEqual(90);
    if (widths['c-disc']) expect(widths['c-disc']).toBeLessThanOrEqual(72);

    /* เดสก์ท็อป: ตารางพอดีกรอบ ไม่ต้องเลื่อน */
    if (info.project.name === 'เดสก์ท็อป') {
      const fit = await table.evaluate((t) => t.getBoundingClientRect().width - t.parentElement!.getBoundingClientRect().width);
      expect(fit, `ตารางล้นกรอบ ${Math.round(fit)}px`).toBeLessThanOrEqual(1);
    }
  });
}

/* ข้อ 6 */
test('หน้าแรก: ช่วงเวลาเป็นแถบปุ่มต่อกัน 6 ปุ่ม · อันที่เลือกเขียวเข้ม', async ({ page }) => {
  await page.goto('/');
  const seg = page.locator('nav.seg');
  await expect(seg).toBeVisible();
  const btns = seg.locator('a.seg-btn');
  await expect(btns).toHaveText(['ทั้งหมด', 'วันนี้', 'เดือนนี้', 'เดือนที่แล้ว', 'ปีนี้', 'ปีที่แล้ว']);
  await expect(seg.locator('a[aria-current="true"]')).toHaveCount(1);
  expect(await bg(page, 'nav.seg a[aria-current="true"]')).toBe(DARK);

  const tops = await btns.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length);
  /* แถบปุ่มช่วงเวลาเรียงเดียวได้เฉพาะเดสก์ท็อป — แท็บเล็ตเนื้อหากว้าง 560px จึงตกสองแถวเหมือนมือถือ */
  expect(tops, 'จำนวนแถวของแถบ').toBe(page.viewportSize()!.width < 1280 ? 2 : 1);

  /* ป้าย "ถึง" อยู่แถวเดียวกับช่องของมัน */
  const pair = await page.locator('.range-f').nth(1).evaluate((el) => {
    const [label, field] = [el.children[0]!, el.children[1]!].map((c) => c.getBoundingClientRect());
    return Math.abs((label.top + label.bottom) / 2 - (field.top + field.bottom) / 2);
  });
  expect(pair).toBeLessThan(6);
});

test('ช่องค้นหา: ไอคอนและกรอบเขียวเข้ม', async ({ page }) => {
  await page.goto('/customers');
  const s = page.locator('input.in.search').first();
  const cs = await s.evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, icon: getComputedStyle(el).backgroundImage }));
  expect(cs.border).toBe(DARK);
  expect(cs.icon).toContain('%230F5C3E');
});

/* ข้อ 7 */
/* หน้ารายการเมนู 03 ไม่มี dropdown เดือนแล้ว (ปรับแก้อีก 8 ข้อ ข้อ 7) — ตรวจที่หน้ารายจ่ายซึ่งยังมี */
test('ตัวกรองวันที่: dropdown เดือนขึ้นว่า "เดือน"', async ({ page }) => {
  await page.goto('/expense?kind=PO&hist=1');
  await expect(page.locator('select[name="month"] option').first()).toHaveText('เดือน');
});

/* ข้อ 9 */
test('ช่องวันที่เป็นปฏิทินไทย พ.ศ. — ฟอร์มรับชำระ', async ({ page }) => {
  await page.goto('/finance/ar');
  await page.locator('table tbody button', { hasText: 'รับชำระ' }).first().click();
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  const field = page.locator('.datein').first();
  await expect(field.locator('input.in')).toHaveAttribute('placeholder', 'วว/ดด/ปป');
  await field.getByRole('button', { name: 'เลือกจากปฏิทิน' }).click();
  const head = await page.locator('.thcal-h b').first().innerText();
  expect(head).toMatch(/^(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม) 25\d\d$/);
});

/* ข้อ 10 */
test('สินค้าใหม่: วันหมดอายุถามทีละขั้น · เลือก "ไม่มี" แล้วส่งค่าว่างจริง', async ({ page }) => {
  await page.goto('/stock/new');
  /* exact — "มีวันหมดอายุ" เป็นส่วนหนึ่งของ "ไม่มีวันหมดอายุ" */
  const none = page.getByRole('radio', { name: 'ไม่มีวันหมดอายุ', exact: true });
  const has = page.getByRole('radio', { name: 'มีวันหมดอายุ', exact: true });
  await expect(none).toBeChecked();
  await expect(page.getByLabel('อายุการเก็บ (เดือน)')).toHaveCount(0);

  await has.check();
  await expect(page.getByLabel('อายุการเก็บ (เดือน)')).toBeVisible();
  await expect(page.getByText('วันหมดอายุของยอดยกมา')).toBeVisible();
  await page.getByLabel('อายุการเก็บ (เดือน)').fill('12');

  await none.check();
  const sent = await page.locator('form').filter({ has: page.locator('[name="costMethod"]') }).first()
    .evaluate((f: HTMLFormElement) => {
      const fd = new FormData(f);
      return { shelf: fd.getAll('shelfLifeMonths'), exp: fd.getAll('openingExpiresOn') };
    });
  expect(sent.shelf).toEqual(['']);
  expect(sent.exp).toEqual(['']);

  await expect(page.getByRole('heading', { name: /ผู้ขายของสินค้านี้ \(มีได้หลายราย\)/ })).toBeVisible();
  const add = page.getByRole('button', { name: '+ เพิ่มรายชื่อเอง' });
  await expect(add).toHaveClass(/\bok\b/);
});
