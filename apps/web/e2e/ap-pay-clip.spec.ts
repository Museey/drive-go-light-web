import { expect, test } from '@playwright/test';
import { makeSession } from './session';

/**
 * ปุ่ม "จ่ายชำระ" หน้าเจ้าหนี้ถูกตัดขอบขวาที่จอกว้าง 1280 (PLAN-ap-pay-button-clip-2569-09-17.md)
 * ต้นเหตุ: ชิป "เกิน N วัน" ต่อท้ายวันที่ในบรรทัดเดียว ช่องครบกำหนดกว้าง 194px ตารางล้นกรอบ 39px
 * แก้: ชิปลงบรรทัดใต้วันที่ ทั้งเจ้าหนี้และลูกหนี้
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

for (const width of [1280, 1366, 1920]) {
  for (const path of ['/finance/ap', '/finance/ar']) {
    test(`${path} กว้าง ${width}: ตารางไม่ล้นกรอบ · ปุ่มท้ายแถวอยู่ในกรอบทั้งปุ่ม · ชิปเกินกำหนดอยู่ใต้วันที่`, async ({ page }, info) => {
      test.skip(info.project.name !== 'เดสก์ท็อป', 'ตารางรายใบมีเฉพาะจอ 1280 ขึ้นไป — วัดหลายความกว้างในโปรเจกต์เดียว');
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);

      const wrap = page.locator('.doc-table').first();
      await expect(wrap.locator('tbody tr').first()).toBeVisible();

      const m = await wrap.evaluate((w) => {
        const el = w as HTMLElement;
        const frame = el.getBoundingClientRect();
        const buttons = [...el.querySelectorAll('tbody tr td:last-child .btn')].map((b) => b.getBoundingClientRect());
        return {
          over: el.scrollWidth - el.clientWidth,
          buttons: buttons.length,
          worstRight: Math.max(...buttons.map((b) => b.right)) - frame.right,
        };
      });
      expect(m.buttons, 'ต้องมีแถวที่มีปุ่มให้วัด').toBeGreaterThan(0);
      expect(m.over, `ตารางล้นกรอบ ${m.over}px`).toBeLessThanOrEqual(0);
      expect(m.worstRight, 'ปุ่มท้ายแถวเลยขอบขวาของกรอบ').toBeLessThanOrEqual(0);

      /* ชิปเกินกำหนดอยู่บรรทัดใต้วันที่ ไม่ใช่ต่อท้ายข้าง ๆ */
      const chip = wrap.locator('tbody td .chip.due').first();
      if (await chip.count()) {
        const pos = await chip.evaluate((c) => {
          const td = c.closest('td')!;
          const range = document.createRange();
          range.setStart(td.firstChild!, 0);
          range.setEnd(td.firstChild!, td.firstChild!.textContent!.length);
          const date = range.getBoundingClientRect();
          return { chipTop: c.getBoundingClientRect().top, dateBottom: date.bottom };
        });
        expect(pos.chipTop, 'ชิปต้องอยู่ใต้บรรทัดวันที่').toBeGreaterThanOrEqual(pos.dateBottom - 1);
      }
    });
  }
}
