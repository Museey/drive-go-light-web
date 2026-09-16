import { expect, test, type Page } from '@playwright/test';
import { ensureBillnote } from './billnote';
import { makeSession } from './session';

/**
 * หน้ากระดาษพิมพ์บนจอแคบ (เฟส 6)
 *
 * ผู้ใช้เลือกคงแบบบีบกระดาษลงความกว้างจอตามต้นแบบ (`.frame.m .paper`) — แก้เฉพาะของที่ล้นขอบกล่อง
 * ที่วัดได้ก่อนแก้: เลขผู้เสียภาษี 13 หลัก · ป้าย "วันครบกำหนดชำระ" · เลขตัวถัง เลยเส้นขอบกล่องออกไป
 *
 * **ตอนสั่งพิมพ์จริงต้องไม่เปลี่ยน** — ข้อสุดท้ายจำลองโหมดพิมพ์ที่ความกว้าง A4 แล้วตรวจว่ากฎของจอแคบไม่รั่วมาถึง
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); await ensureBillnote(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/** ลิงก์เอกสารใบแรกจากหน้ารายการ — อ่าน href จากการ์ดหรือตาราง (อันไหนก็ได้ที่อยู่ในหน้า) */
async function firstDoc(page: Page, listPath: string, pattern: RegExp): Promise<string> {
  await page.goto(listPath);
  const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  const hit = hrefs.find((h) => pattern.test(h));
  if (!hit) throw new Error(`ไม่พบเอกสารในหน้า ${listPath}`);
  return hit;
}

const PAPERS = [
  { name: 'ใบเสร็จ', list: '/income?kind=RC&hist=1', doc: /^\/income\/[0-9a-f-]{36}$/ },
  { name: 'ใบส่งมอบ + VAT', list: '/income?kind=IVT&hist=1', doc: /^\/income\/[0-9a-f-]{36}$/ },
  { name: 'ใบเสนอราคา', list: '/income?kind=QT&hist=1', doc: /^\/income\/[0-9a-f-]{36}$/ },
  { name: 'ใบซื้อ', list: '/expense?kind=PO&hist=1', doc: /^\/expense\/[0-9a-f-]{36}$/ },
  { name: 'ใบวางบิล', list: '/income/billing?hist=1', doc: /^\/income\/billing\/[0-9a-f-]{36}$/ },
];

/** ข้อความที่เลยขอบกล่องที่มีเส้นขอบใกล้สุด — วัดกรอบของตัวข้อความจริง (Range) ไม่ใช่กรอบของอิลิเมนต์ */
const spills = (page: Page) => page.evaluate(() => {
  const paper = document.querySelector('.paper');
  if (!paper) return ['ไม่พบ .paper'];
  const bordered = (el: Element | null): Element => {
    for (let e = el; e && e !== paper; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (parseFloat(cs.borderRightWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0) return e;
    }
    return paper;
  };
  const out: string[] = [];
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    if (!text || !n.parentElement || n.parentElement.offsetParent === null) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const t = r.getBoundingClientRect();
    if (t.width === 0) continue;
    const box = bordered(n.parentElement).getBoundingClientRect();
    if (t.right > box.right + 1 || t.left < box.left - 1) out.push(`"${text.slice(0, 30)}" เลยขอบ ${Math.round(t.right - box.right)}px`);
  }
  return out;
});

for (const p of PAPERS) {
  test(`${p.name}: จอแคบไม่มีข้อความเลยขอบกล่อง`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'แท็บเล็ตขึ้นไปกระดาษกว้างพอ ไม่ได้บีบ');
    const href = await firstDoc(page, p.list, p.doc);
    await page.goto(`${href}/print`);
    await expect(page.locator('.paper').first()).toBeVisible();
    expect(await spills(page)).toEqual([]);
  });
}

test('โหมดพิมพ์ที่ความกว้าง A4: กฎตัดบรรทัดของจอแคบไม่รั่วมาถึงกระดาษ', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'ถามครั้งเดียวพอ');
  const href = await firstDoc(page, '/income?kind=RC&hist=1', /^\/income\/[0-9a-f-]{36}$/);
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  await page.goto(`${href}/print`);

  const leaked = await page.evaluate(() =>
    [...document.querySelectorAll('.paper, .paper *')]
      .map((e) => ({ tag: `${e.tagName}.${(e as HTMLElement).className}`, wrap: getComputedStyle(e).overflowWrap, brk: getComputedStyle(e).wordBreak }))
      .filter((x) => x.wrap !== 'normal' || (x.brk !== 'normal' && x.brk !== 'keep-all'))
      .map((x) => `${x.tag} overflow-wrap:${x.wrap} word-break:${x.brk}`));
  /* ค่าที่วัดได้ก่อนแก้ (16 ก.ย. 2569) — ช่องค่าบางช่องของกระดาษตั้งใจให้ตัดคำได้ทุกตำแหน่งอยู่แล้ว
     ถ้ากฎของจอแคบรั่วมาโหมดพิมพ์ รายการนี้จะยาวขึ้น */
  expect([...new Set(leaked)].sort(), 'กระดาษตอนพิมพ์ต้องตัดบรรทัดแบบเดิม').toEqual([
    'SPAN. overflow-wrap:anywhere word-break:normal',
    'SPAN.mono overflow-wrap:anywhere word-break:normal',
  ]);

  /* ผังหัวกระดาษและป้ายชื่อช่องตอนพิมพ์ — จอแคบจะปล่อยให้ตัดแถว/ตัดบรรทัด แต่ A4 ต้องเป็นแบบเดิม */
  const layout = await page.evaluate(() => ({
    headWrap: [...new Set([...document.querySelectorAll('.paper .doc-head')].map((e) => getComputedStyle(e).flexWrap))],
    metaMin: [...new Set([...document.querySelectorAll('.paper .doc-meta')].map((e) => getComputedStyle(e).minWidth))],
    labelSpace: [...new Set([...document.querySelectorAll('.paper .kv b')].map((e) => getComputedStyle(e).whiteSpace))],
    signWrap: [...new Set([...document.querySelectorAll('.paper .sign')].map((e) => getComputedStyle(e).flexWrap))],
  }));
  expect(layout).toEqual({ headWrap: ['nowrap'], metaMin: ['228px'], labelSpace: ['nowrap'], signWrap: ['nowrap'] });
});
