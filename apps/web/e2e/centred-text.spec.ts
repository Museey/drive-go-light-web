import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * ข้อความต้องอยู่กลางกรอบของตัวเองในแนวตั้ง
 *
 * **อาการที่เจอ** — ป้ายและปุ่มแคปซูลสูง 44px แต่ตัวหนังสือติดขอบบน ช่องว่างล่าง
 * ใหญ่กว่าบนเกือบ 10 เท่า เกิดจากกฎเป้ากดขั้นต่ำที่เพิ่มความสูงให้ .chip
 * แต่ .chip ยังเป็น inline-block ซึ่งไม่จัดของข้างในให้อยู่กลาง
 *
 * ตรวจแบบวัดจริงบนหน้าจอ ไม่ใช่อ่าน CSS — ต้นเหตุแบบนี้มาได้หลายทาง
 * (min-height, flex ที่ยืดลูกให้สูงเท่าพี่น้อง, style ในบรรทัด) และตัวอ่าน CSS
 * มองไม่เห็นทางที่สองกับสาม ชุดทดสอบนี้รันครบทุกขนาดจอตาม projects ของ config
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

type Offender = { sel: string; text: string; h: number; top: number; bottom: number };

/** กล่องที่มองเห็นขอบหรือพื้น สูง 20–100px ซึ่งข้อความเบี้ยวจากกลางเกิน 6px */
async function offCentre(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const SKIP = new Set(['TD', 'TH', 'TR', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'INPUT',
      'TEXTAREA', 'SELECT', 'OPTION', 'svg', 'path', 'SCRIPT', 'STYLE', 'BR', 'IMG', 'CANVAS']);
    const out: Offender[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (SKIP.has(el.tagName)) continue;
      /* การ์ดจัดชิดบนโดยตั้งใจ — ความสูงมาจากการ์ดข้างเคียงในกริด */
      if (el.classList.contains('card')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 20 || r.height > 100) continue;
      const bt = parseFloat(cs.borderTopWidth) || 0;
      const bb = parseFloat(cs.borderBottomWidth) || 0;
      const bg = cs.backgroundColor;
      const boxed = bt > 0 || bb > 0 || (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent');
      if (!boxed || !el.textContent?.trim()) continue;
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const rects = [...rng.getClientRects()].filter((x) => x.height > 0 && x.width > 0);
      if (!rects.length) continue;
      const top = Math.min(...rects.map((x) => x.top)) - (r.top + bt + (parseFloat(cs.paddingTop) || 0));
      const bottom = (r.bottom - bb - (parseFloat(cs.paddingBottom) || 0)) - Math.max(...rects.map((x) => x.bottom));
      if (Math.abs(bottom - top) > 6) {
        out.push({
          sel: el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + c).join(''),
          text: el.textContent.trim().slice(0, 30),
          h: Math.round(r.height), top: Math.round(top), bottom: Math.round(bottom),
        });
      }
    }
    return out;
  });
}

const summary = (xs: Offender[]) =>
  xs.slice(0, 8).map((x) => `${x.sel} "${x.text}" สูง ${x.h} ว่างบน ${x.top} ว่างล่าง ${x.bottom}`).join('\n');

/* ครอบคลุมทุกกลุ่มที่การวัดทั้งระบบเจอ — ป้ายในตาราง ปุ่มแคปซูลตัวกรอง
   ป้ายสถานะหน้าเอกสาร กล่องค่าที่ทำหน้าตาเหมือนช่องกรอก และหน้าพิมพ์ */
const PAGES = ['/', '/customers', '/income', '/expense', '/finance/ap', '/stock', '/stock/expiry', '/license'];

for (const path of PAGES) {
  test(`ข้อความอยู่กลางกรอบ — ${path}`, async ({ page }) => {
    await page.goto(path);
    const bad = await offCentre(page);
    expect(bad, summary(bad)).toEqual([]);
  });
}

/* หน้ารายใบ — เอารหัสจากลิงก์แรกในหน้ารายการ ข้อมูลตัวอย่างสุ่มรหัสใหม่ทุกครั้ง */
const DETAIL: [string, RegExp][] = [
  ['/income', /^\/income\/[0-9a-f-]{36}$/],
  ['/expense', /^\/expense\/[0-9a-f-]{36}$/],
  ['/stock', /^\/stock\/[0-9a-f-]{36}$/],
];

for (const [list, pattern] of DETAIL) {
  test(`ข้อความอยู่กลางกรอบ — รายใบจาก ${list} พร้อมหน้าแก้ไขและหน้าพิมพ์`, async ({ page }) => {
    await page.goto(list);
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    const href = hrefs.find((h) => pattern.test(h));
    expect(href, `ไม่เจอลิงก์รายใบใน ${list} — ข้อมูลตัวอย่างหายหรือเปล่า`).toBeTruthy();

    for (const suffix of ['', '/edit', '/print']) {
      const res = await page.goto(href + suffix);
      if (res?.status() === 404) continue; /* สินค้าไม่มีหน้าแก้ไข/พิมพ์แยก */
      const bad = await offCentre(page);
      expect(bad, `${href}${suffix}\n${summary(bad)}`).toEqual([]);
    }
  });
}
