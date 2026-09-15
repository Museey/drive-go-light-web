import { expect, test, type Page } from '@playwright/test';
import { makeSession } from './session';

/**
 * แสดงผลได้ทุกขนาดจอ — กันอาการที่สำรวจเจอ 75 หน้า × 11 ความกว้าง (PLAN-responsive-audit.md)
 *
 * วัดจากกรอบจริงในเบราว์เซอร์ ไม่ใช่อ่าน CSS — ต้นเหตุที่เจอทั้งหมดเป็นกฎที่ "เขียนถูก"
 * แต่ถูกกฎอื่นทับ (specificity, selector กว้างเกิน) ซึ่งอ่านไฟล์ CSS แล้วไม่เห็น
 *
 *   1. ทั้งหน้าไม่เลื่อนซ้ายขวา (ตารางเลื่อนในกรอบของตัวเองได้)
 *   2. ตัวหนังสือในปุ่มแถว/ตัวแบ่งหน้า/แถบพิมพ์/ปุ่มหัวหน้า/เมนูบน/ชิปตัวกรอง ไม่ตกบรรทัด
 *   3. ช่องตารางไม่รับ padding ของกรอบหน้า (.wrap) — แถวไม่บวม
 *   4. เป้ากดในแถวตาราง ≥ 44px เมื่อจอ < 1280
 *   + ชิปตัวกรองเรียงแนวนอน · แถบเมนูบนไม่ทับกล่องขวา
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

/** ปุ่ม/ป้ายที่ต้องอยู่บรรทัดเดียว — คำสั้นทั้งหมด ตกบรรทัดแปลว่าถูกบีบ */
const ONE_LINE = [
  '.row-acts .btn', '.pager .btn', '.pager .chip', '.printbar .btn', '.topbar .btn',
  '.rail .navbtn', '.toolbar > .chip', '.tag-row > .chip',
].join(', ');

/** เป้ากดที่ต้องสูง ≥ 44px บนจอสัมผัส — ปุ่มในแถวตารางและปุ่มลบบรรทัด */
const TARGETS = '.row-acts .btn, td > button.lnk, .pager .btn, .pager a.chip';

type Issue = { kind: string; what: string };

async function layoutIssues(page: Page, touch: boolean): Promise<Issue[]> {
  return page.evaluate(({ ONE_LINE, TARGETS, touch }) => {
    const out: { kind: string; what: string }[] = [];
    const vw = innerWidth;
    const name = (el: Element) =>
      el.tagName.toLowerCase() + [...el.classList].slice(0, 3).map((c) => '.' + c).join('')
      + ` "${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /* บนกระดาษ A4 คุมด้วยกติกาการพิมพ์ ไม่ใช่ขนาดจอ */
    const onPaper = (el: Element) => !!el.closest('.paper');

    /* 1 */
    const sw = document.documentElement.scrollWidth;
    if (sw > vw + 1) out.push({ kind: 'ทั้งหน้าเลื่อนซ้ายขวา', what: `${sw} > ${vw}` });

    /* 2 — นับบรรทัดจากกล่องตัวอักษรที่ซ้อนกันในแนวตั้ง (เลขเมนูตัวเล็กอยู่บรรทัดเดียวกับชื่อ) */
    const lines = (el: Element) => {
      const rects: { top: number; bottom: number }[] = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent?.trim() || !n.parentElement || !shown(n.parentElement)) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const x of rg.getClientRects()) if (x.width > 1 && x.height > 1) rects.push({ top: x.top, bottom: x.bottom });
      }
      rects.sort((a, b) => a.top - b.top);
      const ls: { top: number; bottom: number }[] = [];
      for (const x of rects) {
        const l = ls[ls.length - 1];
        if (l && Math.min(l.bottom, x.bottom) - Math.max(l.top, x.top) > 0.5 * Math.min(l.bottom - l.top, x.bottom - x.top)) {
          l.top = Math.min(l.top, x.top); l.bottom = Math.max(l.bottom, x.bottom);
        } else ls.push({ ...x });
      }
      return ls.length;
    };
    for (const el of document.querySelectorAll(ONE_LINE)) {
      if (!shown(el) || onPaper(el)) continue;
      const n = lines(el);
      if (n > 1) out.push({ kind: 'ตกบรรทัด', what: `${name(el)} ${n} บรรทัด กว้าง ${Math.round(el.getBoundingClientRect().width)}` });
    }
    /* ไทล์ครึ่งแถวบนมือถือ — ชื่อยาวขึ้นบรรทัดสองได้ ไม่เกินนั้น (เคย 3 บรรทัด: "05.11 + เพิ่มรายการสินค้าใหม่") */
    for (const el of document.querySelectorAll('.tiles .tile')) {
      if (!shown(el) || onPaper(el)) continue;
      const n = lines(el);
      if (n > 2) out.push({ kind: 'ไทล์ตกบรรทัด', what: `${name(el)} ${n} บรรทัด กว้าง ${Math.round(el.getBoundingClientRect().width)}` });
    }
    /* หัวหน้า — ข้อความต้องอยู่กลางแนวตั้ง (ตัวดันขวาขึ้นแถวว่างเคยทำให้ว่างบน 0 ล่าง 12) */
    for (const t of document.querySelectorAll('.main > .topbar')) {
      if (!shown(t)) continue;
      const cs = getComputedStyle(t);
      const r = t.getBoundingClientRect();
      const rg = document.createRange();
      rg.selectNodeContents(t);
      const rects = [...rg.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      if (!rects.length) continue;
      const top = Math.min(...rects.map((x) => x.top)) - (r.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth));
      const bottom = (r.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth)) - Math.max(...rects.map((x) => x.bottom));
      if (Math.abs(bottom - top) > 6) out.push({ kind: 'หัวหน้าไม่อยู่กลาง', what: `ว่างบน ${Math.round(top)} ล่าง ${Math.round(bottom)} สูง ${Math.round(r.height)}` });
    }
    /* ปุ่มในแถวต้องอยู่ในช่องของตัวเองครบ — ช่องตาราง overflow: hidden ปุ่มที่ล้นถูกตัดหายโดยไม่ตกบรรทัด
       (ปุ่ม 2×2 ที่กลายเป็นแถวเดียว: "แก้ไข/พิมพ์/เปิด" ล้นขอบการ์ดขวาที่ 1280) */
    for (const el of document.querySelectorAll('.row-acts .btn')) {
      const td = el.closest('td');
      if (!td || !shown(el) || onPaper(el)) continue;
      const r = el.getBoundingClientRect();
      const c = td.getBoundingClientRect();
      if (r.right > c.right + 1 || r.left < c.left - 1) {
        out.push({ kind: 'ปุ่มล้นช่อง', what: `${name(el)} ขวา ${Math.round(r.right)} ช่องถึง ${Math.round(c.right)}` });
      }
    }
    /* เมนูย่อยมือถือเป็นไทล์สองคอลัมน์ — ชื่อยาวขึ้นบรรทัดสองได้ แต่ไม่เกินนั้น
       (เคย 3–5 บรรทัด เพราะไอคอน + เลขเมนูกินที่ไปเกินครึ่งไทล์ เหลือให้ชื่อราว 57px) */
    for (const el of document.querySelectorAll('.subnav a .sl')) {
      if (!shown(el) || el.closest('.topbar')) continue;
      const n = lines(el);
      if (n > 2) out.push({ kind: 'เมนูย่อยตกบรรทัด', what: `${name(el)} ${n} บรรทัด กว้าง ${Math.round(el.getBoundingClientRect().width)}` });
    }

    /* 3 — แถวตารางสูงผิดปกติ (เกณฑ์เดียวกับการสำรวจ 140px) — ปุ่มในแถวเรียงลงทีละปุ่มเคยทำให้แถวสูง 153px */
    for (const tr of document.querySelectorAll('tbody tr')) {
      if (!shown(tr) || onPaper(tr) || tr.children.length < 2) continue;
      const h = tr.getBoundingClientRect().height;
      if (h > 140) { out.push({ kind: 'แถวสูงผิดปกติ', what: `${name(tr.children[0])} สูง ${Math.round(h)}` }); break; }
    }
    /* ช่องตารางต้องไม่มี padding ล่างเกินช่องข้างเคียง (เคยได้ 80px จาก .main .wrap) */
    for (const td of document.querySelectorAll('td')) {
      if (!shown(td) || onPaper(td)) continue;
      const pb = parseFloat(getComputedStyle(td).paddingBottom) || 0;
      if (pb > 24) { out.push({ kind: 'ช่องตารางบวม', what: `${name(td)} padding-bottom ${pb}` }); break; }
    }

    /* 4 */
    if (touch) {
      for (const el of document.querySelectorAll(TARGETS)) {
        if (!shown(el) || onPaper(el)) continue;
        const h = el.getBoundingClientRect().height;
        if (h < 43.5) out.push({ kind: 'เป้ากดเตี้ย', what: `${name(el)} สูง ${Math.round(h)}` });
      }
    }

    /* ชิปตัวกรองกลุ่มเดียวกันต้องเรียงแนวนอน — เคยยืดเต็มจอเรียงลงทีละปุ่ม */
    for (const bar of document.querySelectorAll('.toolbar, .tag-row')) {
      const chips = [...bar.querySelectorAll(':scope > a.chip, :scope > .tag-row > a.chip')].filter(shown);
      if (chips.length < 2) continue;
      const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
      if (tops.size === chips.length) {
        out.push({ kind: 'ชิปเรียงลงทีละปุ่ม', what: `${name(chips[0])} ${chips.length} ปุ่ม ${tops.size} แถว` });
      }
    }
    return out;
  }, { ONE_LINE, TARGETS, touch });
}

const report = (xs: Issue[]) => xs.slice(0, 12).map((x) => `${x.kind}: ${x.what}`).join('\n');

/* หน้าที่มีต้นเหตุครบทุกกลุ่ม — ปุ่มในแถว (ก) · ช่องชื่อตัดบรรทัด (ข) · ชิป (ง) · เมนูย่อย (จ)
   หน้าพิมพ์รายงาน (ฉ) · ตัวแบ่งหน้า/ปุ่มหัวหน้า (ช) · ปุ่มลบบรรทัด (ซ) */
const PAGES = [
  '/', '/customers', '/income?kind=RC&hist=1', '/income/walkin', '/income/walkin?hist=1', '/expense?kind=PO&hist=1',
  '/income/billing?hist=1', '/stock', '/stock?cols=1', '/stock/kits', '/stock/pending', '/stock/claim', '/stock/claim/new',
  '/stock/count', '/stock/new', '/settings/trash', '/finance/sales',
  '/customers/print', '/expense/print', '/finance/print', '/stock/print', '/stock/sheet',
  '/stock/expiry/print', '/stock/pending/print', '/stock/barcodes',
];

for (const path of PAGES) {
  test(`แสดงผลพอดีจอ — ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const vw = page.viewportSize()!.width;
    const bad = await layoutIssues(page, vw < 1280);
    expect(bad, report(bad)).toEqual([]);
  });
}

/* ไทล์วิธีคิดต้นทุน — ข้อความยาวที่สุดในฟอร์ม ต้องไม่เกินสองบรรทัด (เคย 4 บรรทัดที่ 360px) */
test('ไทล์วิธีคิดต้นทุนไม่เกินสองบรรทัด', async ({ page }) => {
  await page.goto('/stock/new');
  const tall = await page.locator('label.tile.radio').evaluateAll((els) =>
    els.map((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const cs = getComputedStyle(el);
      const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return { t: (el.textContent || '').trim(), lines: Math.round(inner / lh) };
    }).filter((x) => x.lines > 2));
  expect(tall, tall.map((x) => `${x.t} ${x.lines} บรรทัด`).join('\n')).toEqual([]);
});

/* แถบเมนูบน — เมนูต้องไม่ล้นกล่องตัวเองจนทับกล่องชื่อ/ลิขสิทธิ์ทางขวา
   ที่ 1280 เคยล้น 158px ("09 ฟอร์มเปล่า" ซ้อน "ทดลองใช้ เหลือ 14 วัน") · 1440 ขึ้นไปไม่ทับ
   วนหลายความกว้างเฉพาะในโปรเจกต์เดสก์ท็อป — แท็บเล็ต/มือถือวัดที่ขนาดของตัวเอง */
test('แถบเมนูบนไม่ทับกล่องขวา', async ({ page }, info) => {
  const widths = info.project.name === 'เดสก์ท็อป' ? [1280, 1366, 1440, 1920] : [page.viewportSize()!.width];
  await page.goto('/');
  for (const w of widths) {
    if (info.project.name === 'เดสก์ท็อป') await page.setViewportSize({ width: w, height: 800 });
    const m = await page.evaluate(() => {
      const nav = document.querySelector('.rail .railnav');
      const foot = document.querySelector('.rail .foot');
      if (!nav || !foot || getComputedStyle(document.querySelector('.rail')!).display === 'none') return null;
      const btns = [...nav.querySelectorAll('.navbtn')];
      const last = btns[btns.length - 1].getBoundingClientRect();
      return {
        overflow: nav.scrollWidth - nav.clientWidth,
        lastRight: Math.round(last.right), footLeft: Math.round(foot.getBoundingClientRect().left),
        pageW: document.documentElement.scrollWidth, vw: innerWidth,
      };
    });
    if (!m) continue;   /* มือถือใช้แถบล่าง */
    expect(m.overflow, `กว้าง ${w}: เมนูล้นกล่อง ${m.overflow}px`).toBeLessThanOrEqual(1);
    expect(m.lastRight, `กว้าง ${w}: ปุ่มเมนูสุดท้ายทับกล่องขวา`).toBeLessThanOrEqual(m.footLeft);
    expect(m.pageW, `กว้าง ${w}: ทั้งหน้าเลื่อนซ้ายขวา`).toBeLessThanOrEqual(m.vw + 1);
  }
});

/* ลิขสิทธิ์บนแถบบน — ข้อความสั้น แต่ข้อความเต็มยังอ่านได้ (title) และชื่อผู้ใช้ยังหาได้ในลิ้นชัก/title */
test('แถบเมนูบนแสดงลิขสิทธิ์แบบสั้น ข้อความเต็มอยู่ใน title', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'กล่องขวาแสดงเฉพาะเดสก์ท็อป');
  await page.goto('/');
  const lic = page.locator('.rail .foot .lic');
  if (await lic.count() === 0) test.skip(true, 'อู่นี้ไม่มีข้อมูลลิขสิทธิ์');
  const text = (await lic.innerText()).trim();
  const title = (await page.locator('.rail .foot .who').getAttribute('title')) ?? '';
  expect(text.length, `ข้อความบนแถบยาวเกิน: ${text}`).toBeLessThanOrEqual(16);
  expect(title).toContain(' · ');           /* ชื่อ · บทบาท */
  expect(title.length).toBeGreaterThan(text.length);
});
