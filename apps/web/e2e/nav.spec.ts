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

/**
 * ถามตาม "ความกว้างจอ" ไม่ใช่ชื่อโปรเจกต์ — แท็บเล็ตใช้หน้าตาเดียวกับมือถือแล้ว
 * (ต้นแบบของทีม 16 ก.ย. 2569 · สเปก §5.2) เปลี่ยนขนาดใน playwright.config
 * แล้วเทสต์ยังถามคำถามเดิม
 */
const แคบ = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280;

const boxOf = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON());

test.describe('การนำทาง', () => {
  test('มีรูปแบบการนำทางที่เหมาะกับขนาดจอ และมีอันเดียว', async ({ page }, info) => {
    await page.goto('/');
    const railShown = await page.locator('.rail').isVisible();
    const tabbarShown = await page.locator('.tabbar').isVisible();

    if (แคบ(page)) {
      expect(tabbarShown, 'มือถือ/แท็บเล็ตต้องมีแถบล่าง').toBe(true);
      expect(railShown, 'มือถือ/แท็บเล็ตต้องไม่มีแถบเมนูด้านบน/ซ้าย').toBe(false);
    } else {
      expect(railShown, 'เดสก์ท็อปต้องมีแถบเมนูบน').toBe(true);
      expect(tabbarShown, 'เดสก์ท็อปต้องไม่มีแถบล่าง').toBe(false);
    }
  });

  /** ข้อที่เจอตอนวัดของเดิม — เมนูหลุดออกนอกจอโดยไม่มีอะไรบอก */
  test('ปุ่มเมนูทุกปุ่มอยู่ในจอ ไม่มีตัวไหนหลุดออกไปทางขวา', async ({ page }, info) => {
    await page.goto('/');
    const sel = แคบ(page) ? '.tabbar .tab' : '.rail .navbtn, .rail .signout';
    const boxes = await page.locator(sel).evaluateAll(
      (els) => els.map((e) => e.getBoundingClientRect().toJSON()));

    expect(boxes.length, 'ต้องมีปุ่มให้ตรวจจริง').toBeGreaterThan(2);
    const w = page.viewportSize()!.width;
    const หลุด = boxes.filter((b) => b.right > w + 1 || b.left < -1);
    expect(หลุด, `มีปุ่มหลุดออกนอกจอ ${หลุด.length} ปุ่ม`).toEqual([]);
  });

  test('เข้าถึงทุกเมนูได้โดยไม่ต้องเดาว่าปัดแถบได้', async ({ page }, info) => {
    await page.goto('/');
    if (!แคบ(page)) {
      /* เดสก์ท็อป — เมนูหลักครบทุกตัวในแถบบน ไม่ต้องเปิดลิ้นชัก */
      expect(await page.locator('.rail .railnav .navbtn').count()).toBeGreaterThan(5);
      return;
    }
    /* มือถือ/แท็บเล็ต — เปิดลิ้นชักจากแถบล่างช่อง "เพิ่มเติม" */
    const opener = page.locator('.tabbar .tab', { hasText: 'เพิ่มเติม' });
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

      const มือถือ = แคบ(page);

      if (มือถือ) {
        const opener = page.locator('.tabbar .tab', { hasText: 'เพิ่มเติม' });
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
           กดฉากหลังตรงช่องที่โผล่จริง (ขอบขวา) ไม่ใช่จุดกึ่งกลางซึ่งอยู่ใต้ลิ้นชัก */
        await expect(page.locator('.scrim')).toBeVisible();
        expect(box.right, 'ลิ้นชักต้องเหลือช่องให้กดปิดข้าง ๆ').toBeLessThan(vw.width - 20);
        await page.mouse.click(vw.width - 10, Math.round(vw.height / 2));
        await expect(panel).toHaveCount(0);

        /* ปุ่มปิดในลิ้นชักก็ต้องใช้ได้เหมือนกัน */
        await opener.click();
        await expect(page.locator('.drawer')).toBeVisible();
        await page.locator('.drawer .close').click();
        await expect(page.locator('.drawer')).toHaveCount(0);
        return;
      }

      /* เดสก์ท็อป — เมนูหลักอยู่บนเป็น "ลิงก์" กดแล้วนำทาง ไม่มีแผงลอย
         ที่จะไปทับปุ่มหลักของหน้าได้อีก จึงตรวจว่า (1) ไม่มี .mmenu หลงเหลือ
         (2) เมนูหลักเป็นลิงก์ครบ (3) ปุ่มหลักของหน้ายังกดได้จริง */
      expect(await page.locator('.mmenu').count(), 'ไม่ควรมีแผงเมนูหล่นแล้ว').toBe(0);

      const links = page.locator('.rail .railnav a.navbtn[href]');
      expect(await links.count(), 'เมนูหลักต้องเป็นลิงก์ที่นำทางได้').toBeGreaterThan(5);

      const cta = page.locator('.topbar .btn').first();
      if (await cta.count() > 0) {
        await expect(cta, 'ปุ่มหลักของหน้าต้องกดได้ ไม่มีของลอยทับ').toBeInViewport();
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
        /* ปุ่มย้อนกลับลอยมุมขวาล่างเป็นของที่ตั้งใจให้ลอย (โปร่งแสง) — มีเทสต์ของตัวเองข้างล่าง */
        if (el.classList.contains('scrim') || el.classList.contains('drawer')
          || el.classList.contains('backfab')) continue;
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

test.describe('ปุ่มย้อนกลับลอย', () => {
  test('ทุกจอแสดงมุมขวาล่าง (มือถือลอยเหนือแถบล่าง) โปร่งแสง และไม่ทับปุ่มหลักของหน้า — เป็นปุ่มย้อนกลับเดียวของระบบ', async ({ page }, info) => {
    await page.goto('/income?kind=RC');
    const fab = page.locator('.backfab');
    await expect(fab).toBeVisible();
    /* ต้องไม่มีปุ่ม "← กลับ…" ซ้ำที่หัวหน้าอีก */
    await expect(page.locator('.topbar').getByText(/^← /)).toHaveCount(0);
    if (info.project.name === 'มือถือ') {
      const vw = page.viewportSize()!;
      const box = await boxOf(page, '.backfab');
      const tab = await boxOf(page, '.tabbar');
      expect(box.bottom, 'ต้องอยู่เหนือแถบล่าง').toBeLessThanOrEqual(tab.top + 1);
      expect(box.right, 'ต้องชิดขวา').toBeGreaterThan(vw.width - 120);
      return;
    }
    const vw = page.viewportSize()!;
    const box = await boxOf(page, '.backfab');
    expect(box.right, 'ต้องชิดขวา').toBeGreaterThan(vw.width - 120);
    expect(box.bottom, 'ต้องชิดล่าง').toBeGreaterThan(vw.height - 120);

    /* โปร่งแสงจริง — alpha ของพื้นหลังต้องน้อยกว่า 1 */
    const bg = await fab.evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = Number((bg.match(/rgba?\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? '1');
    expect(alpha, `พื้นหลัง ${bg} ต้องโปร่งแสง`).toBeLessThan(1);

    const cta = page.locator('.topbar .btn').first();
    if (await cta.count() > 0) {
      const c = await cta.evaluate((el) => el.getBoundingClientRect().toJSON());
      const hit = !(box.right <= c.left || box.left >= c.right || box.bottom <= c.top || box.top >= c.bottom);
      expect(hit, 'ปุ่มย้อนกลับทับปุ่มหลักของหน้า').toBe(false);
    }
  });
});

test.describe('เป้ากดบนจอสัมผัส', () => {
  test('ทุกอย่างที่กดได้สูงอย่างน้อย 44px', async ({ page }, info) => {
    test.skip(info.project.name === 'เดสก์ท็อป', 'เมาส์กดแม่นกว่านิ้ว ไม่ต้องใช้กติกานี้');
    await page.goto('/income?kind=RC');

    const เล็ก = await page.evaluate(() => {
      const out: string[] = [];
      /* เฉพาะป้ายที่กดได้ — ป้ายสถานะธรรมดาไม่ใช่เป้ากด เคยนับรวมไว้ที่นี่
         แล้วกลายเป็นเหตุผลให้ป้ายในตารางทุกแถวสูง 44px ตัวหนังสือค้างขอบบน */
      const sel = 'a.btn, button, .navbtn, .tab, a.chip, button.chip, label.chip, '
        + 'input:not([type=hidden]), select';
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
