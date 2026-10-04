import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ตัดสต๊อกตั้งแต่ออกใบส่งมอบ + เตือนให้ออกใบเสร็จ (ผู้ใช้กำหนด 4 ต.ค. 2569)
 * แผน PLAN-stock-at-delivery-2569-10-04.md · กติกาอยู่ที่ lib/sales-stock.ts
 *
 * ทำตามขั้นที่หน้าเคาน์เตอร์ทำจริง: ออกใบส่งมอบ → เห็นเตือนทุกจุด → ออกใบเสร็จต่อ → สต๊อกตัดครั้งเดียว
 * บันทึกเอกสารจริงและอ่านยอดคงเหลือจากวิวเดียวกับหน้าจอ — ตรวจขนาดจอเดียว (เดสก์ท็อป)
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกเอกสารและตัดสต๊อกจริง — ตรวจขนาดจอเดียว');
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** สินค้าที่มีของพอให้ตัด — รหัสต้องไม่เป็นต้นของรหัสตัวอื่น จะได้เลือกจากผลค้นหาได้ตัวเดียวแน่นอน */
const pickPart = () => db(async (c) => (await c.query(
  `select p.id, p.code from products p join product_stock s on s.product_id = p.id
    where p.active and s.qty_on_hand >= 20
      and not exists (select 1 from products o where o.id <> p.id and o.code ilike p.code || '%')
    order by p.code limit 1`)).rows[0] as { id: string; code: string } | undefined);

const onHand = (productId: string) => db(async (c) =>
  Number((await c.query(`select qty_on_hand from product_stock where product_id = $1`, [productId])).rows[0].qty_on_hand));

const docOf = (tag: string, kind: string) => db(async (c) =>
  (await c.query(`select id, doc_no from documents where party_name = $1 and kind = $2 and status <> 'void'`,
    [tag, kind])).rows[0] as { id: string; doc_no: string } | undefined);

/** ล้างเอกสารทดสอบ — แถวสต๊อกก่อน (อ้างเอกสารแบบ restrict) แล้วใบลูกก่อนใบแม่ · คงเหลือกลับเท่าเดิม */
const cleanup = (tag: string) => db(async (c) => {
  const ids = (await c.query(`select id from documents where party_name = $1`, [tag])).rows.map((r) => r.id);
  if (!ids.length) return;
  await c.query(`delete from stock_moves where doc_id = any($1)`, [ids]);
  for (let i = 0; i < 4; i++) {
    await c.query(
      `delete from documents d where d.id = any($1)
         and not exists (select 1 from documents x where x.parent_doc_id = d.id)`, [ids]);
  }
});

const confirmSave = (page: Page) => page.getByRole('dialog', { name: 'ยืนยันการบันทึก' });
const lineRows = (page: Page) =>
  page.locator('table.lines').filter({ has: page.locator('tbody td.c-qty input') }).first().locator('tbody tr')
    .filter({ has: page.locator('td.c-qty input') });

/** เลือกสินค้าจากผลค้นหาในบรรทัดแรก แล้วตั้งจำนวน */
async function partLine(page: Page, code: string, qty: number) {
  const row = lineRows(page).first();
  await row.locator('td.c-code input').fill(code);
  await page.locator('.hits5 tr.pick').filter({ hasText: code }).first().click();
  await expect(row.locator('td.c-name input.in').first()).not.toHaveValue('');
  await row.locator('td.c-qty input').fill(String(qty));
}

test('ใบส่งมอบตัดสต๊อกตอนบันทึก · เตือนให้ออกใบเสร็จ · ใบเสร็จที่ออกต่อไม่ตัดซ้ำ', async ({ page }) => {
  const part = await pickPart();
  test.skip(!part, 'ข้อมูลตัวอย่างไม่มีสินค้าที่มีของพอ');
  const tag = `ลูกค้าตัดสต๊อกส่งมอบ${Date.now().toString(36)}`;
  const start = await onHand(part!.id);
  try {
    /* ---- ออกใบส่งมอบ (ไม่มี VAT) ---- */
    await page.goto('/income?kind=IV');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await partLine(page, part!.code, 3);
    await page.getByRole('button', { name: 'บันทึกใบส่งมอบงาน / ใบแจ้งหนี้' }).click();
    const dialog = confirmSave(page);
    await expect(dialog.getByRole('note'), 'แผงยืนยันบอกว่าตัดสต๊อกและต้องออกใบเสร็จ')
      .toContainText('ตัดสต๊อกทันที — เมื่อเก็บเงินลูกค้า ต้องออกใบเสร็จรับเงินต่อจากใบนี้');
    await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();

    await expect.poll(() => docOf(tag, 'IV'), { timeout: 10_000 }).toBeTruthy();
    const iv = (await docOf(tag, 'IV'))!;
    expect(await onHand(part!.id), 'ตัดสต๊อกตั้งแต่บันทึกใบส่งมอบ').toBe(start - 3);

    /* ---- หน้าเอกสาร: แถบเตือนพร้อมปุ่มออกใบเสร็จ ---- */
    await page.goto(`/income/${iv.id}`);
    const due = page.locator('.receipt-due');
    await expect(due).toContainText('ยังไม่ได้ออกใบเสร็จรับเงิน');
    await expect(due).toContainText('ตัดสต๊อกไปแล้ว');
    await expect(page.locator('.chip.doc-status').first()).toHaveText('รอออกใบเสร็จ');

    /* ---- รายการ: ป้ายรอออกใบเสร็จ · ตัวกรองจากการ์ดหน้าแรกเจอใบนี้ ---- */
    await page.goto(`/income?kind=IV&hist=1&q=${encodeURIComponent(tag)}`);
    await expect(page.locator('table.hist tbody tr').filter({ hasText: iv.doc_no }))
      .toContainText('รอออกใบเสร็จ');
    await page.goto('/');
    const card = page.locator('.hcard').filter({ hasText: 'ใบส่งมอบรอออกใบเสร็จ' });
    await expect(card.locator('.big')).not.toHaveText(/^0\b/);
    await card.getByRole('link', { name: /ดูรายการ/ }).click();
    await expect(page).toHaveURL(/[?&]norc=1/);
    await expect(page.getByRole('checkbox', { name: 'เฉพาะที่รอออกใบเสร็จ' }), 'ช่องติ๊กตัวกรองติ๊กไว้').toBeChecked();
    await expect(page.locator('table.hist tbody tr').filter({ hasText: iv.doc_no }),
      'ใบส่งมอบนี้อยู่ในรายการที่รอออกใบเสร็จ').toHaveCount(1);

    /* ---- ออกใบเสร็จต่อจากใบส่งมอบ: ไม่ตัดซ้ำ ---- */
    await page.goto(`/income/${iv.id}`);
    await page.locator('.receipt-due').getByRole('link', { name: 'ออกใบเสร็จรับเงิน' }).click();
    await expect(page).toHaveURL(/kind=RC/);
    await expect(page.getByText('สต๊อกตัดไปแล้วตอนออกใบส่งมอบ ใบนี้ไม่ตัดซ้ำ')).toBeVisible();
    await page.getByRole('button', { name: 'รับเงินสดเต็มจำนวน' }).click();
    await page.getByRole('button', { name: 'บันทึกใบเสร็จรับเงิน' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect.poll(() => docOf(tag, 'RC'), { timeout: 10_000 }).toBeTruthy();
    expect(await onHand(part!.id), 'ใบเสร็จที่ออกต่อจากใบส่งมอบไม่ตัดซ้ำ').toBe(start - 3);

    /* ---- ออกใบเสร็จแล้ว: เตือนหาย · ป้ายเป็นเรียบร้อย ---- */
    await page.goto(`/income/${iv.id}`);
    await expect(page.locator('.receipt-due')).toHaveCount(0);
    await expect(page.locator('.chip.doc-status').first()).toHaveText('เรียบร้อย');
  } finally {
    await cleanup(tag);
  }
  expect(await onHand(part!.id), 'ล้างเอกสารทดสอบแล้วคงเหลือกลับเท่าเดิม').toBe(start);
});

test('แก้จำนวนในใบส่งมอบ — ระบบคืนของเดิมแล้วตัดใหม่ สต๊อกเท่ากับรายการใหม่', async ({ page }) => {
  const part = await pickPart();
  test.skip(!part, 'ข้อมูลตัวอย่างไม่มีสินค้าที่มีของพอ');
  const tag = `ลูกค้าแก้ใบส่งมอบ${Date.now().toString(36)}`;
  const start = await onHand(part!.id);
  try {
    await page.goto('/income?kind=IV');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await partLine(page, part!.code, 2);
    await page.getByRole('button', { name: 'บันทึกใบส่งมอบงาน / ใบแจ้งหนี้' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect.poll(() => docOf(tag, 'IV'), { timeout: 10_000 }).toBeTruthy();
    const iv = (await docOf(tag, 'IV'))!;
    expect(await onHand(part!.id)).toBe(start - 2);

    await page.goto(`/income/${iv.id}/edit`);
    await lineRows(page).first().locator('td.c-qty input').fill('5');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).first().click();
    await confirmSave(page).getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect.poll(() => onHand(part!.id), { timeout: 10_000 }).toBe(start - 5);
  } finally {
    await cleanup(tag);
  }
  expect(await onHand(part!.id)).toBe(start);
});
