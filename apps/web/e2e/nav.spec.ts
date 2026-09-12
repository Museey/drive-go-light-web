import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * เมนูต้องไม่บังกัน — ตรวจบนเบราว์เซอร์จริงทั้งสามขนาดจอ
 *
 * ทุกข้อในไฟล์นี้วัด**กรอบจริงของอิลิเมนต์** ไม่ใช่ตรวจว่ามีคลาสหรือมีกฎ CSS อยู่
 * เพราะคำถามคือ "บนจอจริงมันทับกันไหม" ซึ่งกฎ CSS ตอบแทนไม่ได้
 *
 * ก่อนรัน — ต้องมีข้อมูลตัวอย่างในฐาน (tools/dev-seed.sh) และตั้ง DATABASE_URL
 */

const PAGES = [
  { path: '/', ชื่อ: 'หน้าแรก' },
  { path: '/income?kind=RC', ชื่อ: 'รายรับ' },
  { path: '/stock', ชื่อ: 'ทะเบียนสินค้า' },
];

let token: string;
test.beforeAll(async () => { token = await makeSession(); });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: 'dgl_session', value: token, url: 'http://localhost:3100',
  }]);
});

/** กรอบสองอันซ้อนกันไหม */
const overlaps = (a: DOMRect, b: DOMRect) =>
  !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

const boxOf = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON());

test.describe('การนำทาง', () => {
  test('มีรูปแบบการนำทางที่เหมาะกับขนาดจอ และมีอันเดียว', async ({ page }, info) => {
    await page.goto('/');
    const railShown = await page.locator('.rail').isVisible();
    const tabbarShown = await page.locator('.tabbar').isVisible();

    if (info.project.name === 'มือถือ') {
      expect(tabbarShown, 'มือถือต้องมีแถบล่าง').toBe(true);
      expect(railShown, 'มือถือต้องไม่มีแถบเมนูด้านบน/ซ้าย').toBe(false);
    } else {
      expect(railShown, 'แท็บเล็ตและเดสก์ท็อปต้องมีแถบเมนู').toBe(true);
      expect(tabbarShown, 'จอใหญ่ต้องไม่มีแถบล่าง').toBe(false);
    }
  });

  /** ข้อที่เจอตอนวัดของเดิม — เมนูหลุดออกนอกจอโดยไม่มีอะไรบอก */
  test('ปุ่มเมนูทุกปุ่มอยู่ในจอ ไม่มีตัวไหนหลุดออกไปทางขวา', async ({ page }, info) => {
    await page.goto('/');
    const sel = info.project.name === 'มือถือ' ? '.tabbar .tab' : '.rail .navbtn, .rail .signout';
    const boxes = await page.locator(sel).evaluateAll(
      (els) => els.map((e) => e.getBoundingClientRect().toJSON()));

    expect(boxes.length, 'ต้องมีปุ่มให้ตรวจจริง').toBeGreaterThan(2);
    const w = page.viewportSize()!.width;
    const หลุด = boxes.filter((b) => b.right > w + 1 || b.left < -1);
    expect(หลุด, `มีปุ่มหลุดออกนอกจอ ${หลุด.length} ปุ่ม`).toEqual([]);
  });

  test('เข้าถึงทุกเมนูได้โดยไม่ต้องเดาว่าปัดแถบได้', async ({ page }, info) => {
    await page.goto('/');
    if (info.project.name === 'เดสก์ท็อป') {
      /* เดสก์ท็อปเห็นครบในแถบซ้ายอยู่แล้ว */
      expect(await page.locator('.rail .railnav .navbtn').count()).toBeGreaterThan(5);
      return;
    }
    /* มือถือและแท็บเล็ตต้องมีทางเปิดลิ้นชักที่เห็นได้ทันที */
    const opener = info.project.name === 'มือถือ'
      ? page.locator('.tabbar .tab', { hasText: 'เพิ่มเติม' })
      : page.locator('.rail .drawer-open');
    await expect(opener).toBeVisible();
    await opener.click();
    await expect(page.locator('.drawer')).toBeVisible();
    expect(await page.locator('.drawer .lead').count()).toBeGreaterThan(5);
  });
});

test.describe('ของที่ลอยทับต้องไม่บังของสำคัญ', () => {
  for (const p of PAGES) {
    test(`เปิดเมนูที่ ${p.ชื่อ} แล้วไม่บังปุ่มหลักและไม่ล้นขอบจอ`, async ({ page }, info) => {
      await page.goto(p.path);

      const มือถือ = info.project.name === 'มือถือ';
      const แท็บเล็ต = info.project.name === 'แท็บเล็ต';

      if (มือถือ || แท็บเล็ต) {
        const opener = มือถือ
          ? page.locator('.tabbar .tab', { hasText: 'เพิ่มเติม' })
          : page.locator('.rail .drawer-open');
        await opener.click();
        const panel = page.locator('.drawer');
        await expect(panel).toBeVisible();

        const box = await boxOf(page, '.drawer');
        const vw = page.viewportSize()!;
        expect(box.left, 'ลิ้นชักล้นขอบซ้าย').toBeGreaterThanOrEqual(-1);
        expect(box.right, 'ลิ้นชักล้นขอบขวา').toBeLessThanOrEqual(vw.width + 1);
        expect(box.top, 'ลิ้นชักล้นขอบบน').toBeGreaterThanOrEqual(-1);

        /* ลิ้นชักบังเนื้อหาโดยตั้งใจ — แต่ต้องมีทางออกที่เห็นได้สองทาง
           ฉากหลังที่โผล่ข้างลิ้นชัก และปุ่มปิดในตัวลิ้นชักเอง

           กดฉากหลังตรง**ช่องที่โผล่จริง** ไม่ใช่จุดกึ่งกลางของมัน —
           ลิ้นชักกว้าง 88vw ตรงกลางฉากหลังจึงอยู่ใต้ลิ้นชัก
           (ถ้ากดตรงกลางแล้วผ่าน แปลว่าฉากหลังทับลิ้นชักอยู่ ซึ่งผิด) */
        await expect(page.locator('.scrim')).toBeVisible();
        const vw2 = page.viewportSize()!;
        expect(box.right, 'ลิ้นชักต้องเหลือช่องให้กดปิดข้าง ๆ').toBeLessThan(vw2.width - 20);
        await page.mouse.click(vw2.width - 10, Math.round(vw2.height / 2));
        await expect(panel).toHaveCount(0);

        /* ปุ่มปิดในลิ้นชักก็ต้องใช้ได้เหมือนกัน */
        await opener.click();
        await expect(page.locator('.drawer')).toBeVisible();
        await page.locator('.drawer .close').click();
        await expect(page.locator('.drawer')).toHaveCount(0);
        return;
      }

      /* เดสก์ท็อป — แผงเมนูย่อยต้องไม่ทับปุ่มหลักของหน้า */
      const cta = page.locator('.topbar .btn').first();
      const มีปุ่มหลัก = await cta.count() > 0;

      for (const btn of await page.locator('.rail .navbtn[aria-haspopup="true"]').all()) {
        await btn.click();
        const panel = page.locator('.mmenu');
        await expect(panel).toBeVisible();

        const box = await boxOf(page, '.mmenu');
        const vw = page.viewportSize()!;
        expect(box.right, 'แผงล้นขอบขวา').toBeLessThanOrEqual(vw.width + 1);
        expect(box.left, 'แผงล้นขอบซ้าย').toBeGreaterThanOrEqual(-1);
        expect(box.bottom, 'แผงล้นขอบล่าง').toBeLessThanOrEqual(vw.height + 1);
        expect(box.top, 'แผงล้นขอบบน').toBeGreaterThanOrEqual(-1);

        if (มีปุ่มหลัก) {
          const c = await cta.evaluate((el) => el.getBoundingClientRect().toJSON());
          expect(overlaps(box as DOMRect, c as DOMRect), 'แผงทับปุ่มหลักของหน้า').toBe(false);
        }

        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
      }
    });
  }

  test('ไม่มีอะไรลอยทับปุ่มหรือลิงก์ในเนื้อหา', async ({ page }) => {
    await page.goto('/income?kind=RC');

    /* ไล่ทุกอย่างที่ลอยอยู่ แล้วดูว่าจุดกึ่งกลางของมันไปตกบนอะไร
       ของเดิมปุ่มย้อนกลับลอยทับตัวกรองวันที่บนมือถือ และทับลิงก์เลขที่เอกสารบนแท็บเล็ต */
    const ชน = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (el.classList.contains('scrim') || el.classList.contains('drawer')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        /* แถบนำทางกินพื้นที่ของตัวเองโดยตั้งใจ และเนื้อหาเว้นที่ให้แล้ว */
        if (el.closest('.tabbar') || el.closest('.rail')) continue;

        const under = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const hit = under.find((u) => !el.contains(u) && u !== el
          && (u.matches('a, button, input, select') || !!u.closest('a, button')));
        if (hit) out.push(`${el.className} ทับ ${hit.tagName}.${(hit as HTMLElement).className}`);
      }
      return out;
    });

    expect(ชน).toEqual([]);
  });
});

test.describe('เป้ากดบนจอสัมผัส', () => {
  test('ทุกอย่างที่กดได้สูงอย่างน้อย 44px', async ({ page }, info) => {
    test.skip(info.project.name === 'เดสก์ท็อป', 'เมาส์กดแม่นกว่านิ้ว ไม่ต้องใช้กติกานี้');
    await page.goto('/income?kind=RC');

    const เล็ก = await page.evaluate(() => {
      const out: string[] = [];
      const sel = 'a.btn, button, .navbtn, .tab, .chip, input:not([type=hidden]), select';
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.getAttribute('type') === 'checkbox' || el.getAttribute('type') === 'radio') continue;
        if (r.height < 44) out.push(`${el.tagName}.${el.className} สูง ${Math.round(r.height)}`);
      }
      return out;
    });

    expect(เล็ก.slice(0, 8), `มีเป้ากดเล็กกว่า 44px ${เล็ก.length} จุด`).toEqual([]);
  });
});

test.describe('หัวหน้าและปุ่มหลัก', () => {
  test('เลื่อนลงไปไกลแล้วปุ่มหลักยังอยู่ให้กด', async ({ page }) => {
    await page.goto('/income?kind=RC');
    const cta = page.locator('.topbar .btn').first();
    if (await cta.count() === 0) test.skip();

    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(150);
    await expect(cta).toBeInViewport();
  });
});
