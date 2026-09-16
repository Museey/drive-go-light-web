import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ฟอร์มบนจอแคบ (เฟส 6 — ต้นแบบของทีม `.frame.m .card .row-fields` · `.field .in` · `.formbar`)
 *
 * - ช่องกรอกคอลัมน์เดียวทุกช่อง (ผู้ใช้เลือก)
 * - ตัวหนังสือในช่อง ≥ 16px — **iPhone ซูมหน้าจอเองทุกครั้งที่แตะช่องที่ตัวหนังสือเล็กกว่านั้น**
 * - ปุ่มท้ายฟอร์มเรียงลงเต็มแถว
 * เดสก์ท็อปต้องเหมือนเดิมทุกค่า (วัดไว้ก่อนแก้: ตัวหนังสือ 14px · ช่องสูง 44px)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;

const FORMS = [
  { name: 'ใบเสร็จ', path: '/income?kind=RC' },
  { name: 'ใบซื้อ', path: '/expense?kind=PO' },
  { name: 'สินค้าใหม่', path: '/stock/new' },
  { name: 'ผู้ติดต่อใหม่', path: '/customers/new?kind=customer' },
];

/** ช่องที่ผู้ใช้กรอกจริงในการ์ดฟอร์ม — ไม่นับช่องติ๊ก/ปุ่มเลือก/ไฟล์ และช่องในตารางรายการสินค้า */
const inputsOf = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('.card .field :is(input.in, select, textarea)')]
    .filter((e) => (e as HTMLElement).offsetParent !== null)
    .filter((e) => !['hidden', 'checkbox', 'radio', 'file'].includes((e as HTMLInputElement).type))
    .map((e) => ({
      name: (e as HTMLInputElement).name || (e as HTMLElement).id || e.tagName,
      font: parseFloat(getComputedStyle(e).fontSize),
      h: Math.round(e.getBoundingClientRect().height),
      tag: e.tagName,
    })));

for (const f of FORMS) {
  test(`${f.name}: จอแคบช่องกรอกคอลัมน์เดียว · เดสก์ท็อปยังวางหลายคอลัมน์`, async ({ page }) => {
    await page.goto(f.path);
    /* แถวที่มีมากกว่าหนึ่งช่องบนบรรทัดเดียวกัน (ตำแหน่งบนเท่ากัน) */
    const sideBySide = await page.evaluate(() =>
      [...document.querySelectorAll('.card .row-fields')]
        .filter((row) => (row as HTMLElement).offsetParent !== null)
        .filter((row) => {
          const tops = [...row.children]
            .filter((c) => (c as HTMLElement).offsetParent !== null && c.getBoundingClientRect().height > 0)
            .map((c) => Math.round(c.getBoundingClientRect().top));
          return new Set(tops).size < tops.length;
        }).length);

    if (แคบ(page)) expect(sideBySide, 'จอแคบต้องไม่มีแถวที่วางช่องคู่กัน').toBe(0);
    else expect(sideBySide, 'เดสก์ท็อปยังวางหลายช่องต่อแถว').toBeGreaterThan(0);
  });

  test(`${f.name}: ขนาดช่องกรอก — จอแคบตัวหนังสือ ≥ 16px สูง ≥ 48px · เดสก์ท็อปค่าเดิม`, async ({ page }) => {
    await page.goto(f.path);
    const inputs = await inputsOf(page);
    expect(inputs.length, 'ต้องมีช่องให้ตรวจ').toBeGreaterThan(3);

    if (แคบ(page)) {
      const small = inputs.filter((i) => i.font < 16).map((i) => `${i.name} ${i.font}px`);
      expect(small, 'ช่องที่ iPhone จะซูมเองเมื่อแตะ').toEqual([]);
      const short = inputs.filter((i) => i.h < 48).map((i) => `${i.name} ${i.h}px`);
      expect(short, 'ช่องที่เตี้ยกว่า 48px').toEqual([]);
    } else {
      expect([...new Set(inputs.map((i) => i.font))], 'เดสก์ท็อปตัวหนังสือเดิม').toEqual([14]);
      expect(inputs.filter((i) => i.tag !== 'TEXTAREA').every((i) => i.h === 44), 'เดสก์ท็อปช่องสูงเดิม').toBe(true);
    }
  });

  test(`${f.name}: ปุ่มท้ายฟอร์ม — จอแคบเรียงลงเต็มแถวสูง ≥ 50px · เดสก์ท็อปแถวเดียว`, async ({ page }) => {
    await page.goto(f.path);
    const bar = page.locator('.card .formbar').first();
    await bar.scrollIntoViewIfNeeded();
    const m = await bar.evaluate((b) => {
      const inner = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const w = inner.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return {
        w,
        btns: [...b.children].filter((c) => (c as HTMLElement).offsetParent !== null).map((c) => {
          const r = c.getBoundingClientRect();
          return { text: (c.textContent ?? '').trim(), top: Math.round(r.top), w: r.width, h: r.height, primary: c.classList.contains('primary') };
        }),
      };
    });
    expect(m.btns.length).toBeGreaterThan(1);

    if (แคบ(page)) {
      expect(new Set(m.btns.map((b) => b.top)).size, 'ปุ่มละแถว').toBe(m.btns.length);
      for (const b of m.btns) {
        expect(Math.round(b.w), `ปุ่ม "${b.text}" กว้างเต็มแถบ`).toBeGreaterThanOrEqual(Math.floor(m.w) - 1);
        expect(b.h, `ปุ่ม "${b.text}" สูงพอกดด้วยนิ้ว`).toBeGreaterThanOrEqual(50);
      }
      expect(m.btns[0]!.primary, 'ปุ่มบันทึกอยู่บนสุด (ลำดับเดิม)').toBe(true);
    } else {
      expect(new Set(m.btns.map((b) => b.top)).size, 'เดสก์ท็อปปุ่มเรียงแถวเดียว').toBe(1);
    }
  });
}

test('ปุ่มย้อนกลับลอยไม่บังปุ่มบันทึกเมื่อเลื่อนสุดหน้า', async ({ page }) => {
  await page.goto('/income?kind=RC');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const save = await page.locator('.card .formbar .btn.primary').first().boundingBox();
  const fab = await page.locator('.backfab').boundingBox();
  test.skip(!save || !fab, 'หน้านี้ไม่มีปุ่มลอย');
  const ทับ = save!.y < fab!.y + fab!.height && fab!.y < save!.y + save!.height
    && save!.x < fab!.x + fab!.width && fab!.x < save!.x + save!.width;
  expect(ทับ, `ปุ่มลอย ${JSON.stringify(fab)} · ปุ่มบันทึก ${JSON.stringify(save)}`).toBe(false);
});
