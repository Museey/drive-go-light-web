import { expect, test } from '@playwright/test';
import { makeSession } from './session';

/**
 * ทะเบียนลูกค้า / ผู้ขาย: คอลัมน์ปุ่มกว้างพอดีปุ่ม ไม่เหลือช่องว่างท้ายตาราง
 * (ผู้ใช้แจ้งพร้อมภาพ 18 ก.ย. 2569 — คอลัมน์ปุ่มกว้าง 176px ทั้งที่ปุ่มกว้าง 128px)
 *
 * ที่ว่างที่เหลือยังไปอยู่คอลัมน์ทะเบียนเหมือนเดิม — ผู้ใช้ยืนยัน 18 ก.ย. 2569 ว่าคอลัมน์ชื่อ
 * ต้องพอดีข้อมูล ไม่ขยายตามจอ (กติกาเดิม คุมด้วย more-ui.spec.ts)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ตารางรายคนมีเฉพาะจอ 1280 ขึ้นไป — วัดหลายความกว้างในโปรเจกต์เดียว');
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

for (const width of [1280, 1520, 1920]) {
  for (const kind of ['customer', 'vendor']) {
    test(`${kind} กว้าง ${width}: คอลัมน์ปุ่มพอดีปุ่ม · ปุ่มไม่ถูกตัด · ไม่ล้นกรอบ`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/customers?kind=${kind}`);

      const m = await page.locator('table.cust').evaluate((el) => {
        const t = el as HTMLTableElement;
        const wrap = t.closest('.tablewrap') as HTMLElement;
        const heads = [...t.querySelectorAll('thead th')].map((h) => h.getBoundingClientRect().width);
        const row = t.querySelector('tbody tr') as HTMLElement;
        const acts = row.querySelector('.row-acts') as HTMLElement;
        const cell = acts.closest('td') as HTMLElement;
        const names = [...t.querySelectorAll('thead th')].map((h) => h.textContent?.trim() ?? '');
        return {
          overflow: wrap.scrollWidth - wrap.clientWidth,
          heads: heads.map(Math.round),
          names,
          actsW: acts.getBoundingClientRect().width,
          cellW: cell.getBoundingClientRect().width,
          cellClip: cell.scrollWidth - cell.clientWidth,
          rowH: Math.round(row.getBoundingClientRect().height),
        };
      });

      expect(m.overflow, 'ตารางไม่ล้นกรอบ').toBeLessThanOrEqual(0);
      expect(m.cellClip, 'ปุ่มต้องไม่ถูกตัดขอบ').toBeLessThanOrEqual(0);

      /* คอลัมน์ปุ่ม = ความกว้างปุ่มบวกระยะขอบในช่องเท่านั้น ไม่เหลือที่ว่าง */
      expect(m.cellW - m.actsW, `คอลัมน์ปุ่มเหลือที่ว่าง ${Math.round(m.cellW - m.actsW)}px`)
        .toBeLessThanOrEqual(16);

      /* ปุ่มอยู่ชิดขอบขวาของตาราง — ช่องว่างที่เคยเหลือไปอยู่คอลัมน์ทะเบียนตามกติกาเดิม */
      const iName = m.names.findIndex((n) => n === 'ชื่อ');
      expect(m.heads[iName], 'คอลัมน์ชื่อยังพอดีข้อมูล ไม่ขยายตามจอ').toBeLessThanOrEqual(260);
    });
  }
}
