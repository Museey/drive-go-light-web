import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ใบที่บันทึกล่าสุดอยู่บนสุด · เจ้าหนี้ใบล่าสุดอยู่บน · หน้าละ 10 ทุกรายการ
 * (PLAN-expense-order-ap-pagesize-2569-09-17.md) — ผู้ใช้ทดลองซื้อสินค้าแล้วหาใบที่เพิ่งบันทึกไม่เจอ
 *
 * ใส่ใบ "ย้อนวันที่" ที่บันทึกตอนนี้ — ข้อมูลตัวอย่างวันที่ใหม่กว่าทุกใบ ถ้ายังเรียงตามวันที่เอกสาร ใบนี้จะไม่อยู่บนสุด
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const t = await c.query(`select tenant_id from users where role = 'owner' order by created_at limit 1`);
    await c.query(`select set_config('app.tenant_id', $1, false)`, [t.rows[0].tenant_id]);
    return await fn(c);
  } finally { await c.end(); }
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;
/** แถวแรกของรายการ — ตาราง (เดสก์ท็อป) หรือการ์ด (จอแคบ) */
const firstRow = (page: Page, table = 'table.hist') => wide(page)
  ? page.locator(`${table} tbody tr`).first()
  : page.locator('.doc-cards .dcard').first();

const stamp = (idx: number) => `${idx}${Date.now().toString(36)}`;

/** เอกสารย้อนวันที่ที่เพิ่งบันทึก */
const addBackdated = (kind: string, no: string, party: string, extra: { partyId?: string; credit?: boolean } = {}) =>
  db((c) => c.query(
    `insert into documents (tenant_id, kind, doc_no, doc_date, due_date, credit_days, status, party_id, party_name, vat_mode,
                            subtotal, net_amount, grand_total, payable)
     values (current_tenant_id(), $1, $2, '2025-01-05', $3, $4, 'issued', $5, $6, $7, 500, 500, 500, 500) returning id`,
    [kind, no, extra.credit ? '2025-02-04' : '2025-01-05', extra.credit ? 30 : 0, extra.partyId ?? null, party,
     kind === 'IV' ? 'none' : 'ex'])).then((r) => r.rows[0].id as string);

const removeDocs = (party: string) => db((c) => c.query(`delete from documents where party_name = $1`, [party]));

test('ซื้อสินค้า: ใบเครดิตย้อนวันที่ที่เพิ่งบันทึก อยู่บนสุดของประวัติใบซื้อ · ประวัติรายจ่ายทั้งหมด · หน้าเจ้าหนี้', async ({ page }, info) => {
  const party = `ร้านเรียงล่าสุด${stamp(info.parallelIndex)}`;
  const no = `PONEW${stamp(info.parallelIndex)}`;
  try {
    await addBackdated('PO', no, party, { credit: true });

    await page.goto('/expense?kind=PO&hist=1');
    await expect(firstRow(page), 'ประวัติใบซื้อ').toContainText(no);
    await page.goto('/expense?hist=1');
    await expect(firstRow(page), 'ประวัติรายจ่ายทั้งหมด').toContainText(no);

    await page.goto('/finance/ap');
    if (wide(page)) {
      await expect(page.locator('.doc-table table.tbl tbody tr').first(), 'เจ้าหนี้ — เดิมอยู่ล่างสุด').toContainText(no);
    } else {
      /* จอแคบเป็นการ์ดรายคน (เรียงยอดค้าง) — ใบในหน้ารายคนเรียงล่าสุดบน */
      await page.goto(`/finance/ap?party=${encodeURIComponent(`n:${party}`)}`);
      await expect(page.locator('.doc-cards .dcard').first()).toContainText(no);
    }
  } finally {
    await removeDocs(party);
  }
});

test('รายรับ: ใบย้อนวันที่ที่เพิ่งบันทึก อยู่บนสุดของประวัติทั้งหมด · ขายหน้าร้าน · เอกสารขายในหน้ายอดขาย · ลูกหนี้', async ({ page }, info) => {
  const party = `ลูกค้าเรียงล่าสุด${stamp(info.parallelIndex)}`;
  const rc = `RCNEW${stamp(info.parallelIndex)}`;
  const iv = `IVNEW${stamp(info.parallelIndex)}`;
  try {
    await addBackdated('IV', iv, party, { credit: true });
    await addBackdated('RC', rc, party);

    await page.goto('/income?hist=1');
    await expect(firstRow(page), 'ประวัติรายรับทั้งหมด').toContainText(rc);
    await page.goto('/income/walkin?hist=1');
    await expect(firstRow(page), 'ขายหน้าร้าน').toContainText(rc);
    await page.goto('/income?kind=IV&hist=1');
    await expect(firstRow(page), 'แท็บใบส่งมอบ').toContainText(iv);

    await page.goto('/finance/sales');
    await expect(firstRow(page, '.doc-table table.tbl'), 'เอกสารขายรายใบ').toContainText(rc);

    if (wide(page)) {
      await page.goto('/finance/ar');
      await expect(page.locator('.doc-table table.tbl tbody tr').first(), 'ลูกหนี้').toContainText(rc);
    }
  } finally {
    await removeDocs(party);
  }
});

test('หน้าลูกค้า: ประวัติซื้อขายเรียงใบที่บันทึกล่าสุดบน', async ({ page }, info) => {
  const code = `ZN${stamp(info.parallelIndex).toUpperCase()}`;
  const party = `ลูกค้าประวัติ${code}`;
  let contactId = '';
  try {
    contactId = await db((c) => c.query(
      `insert into contacts (tenant_id, code, kind, type, org_name) values (current_tenant_id(), $1, 'customer', 'company', $2) returning id`,
      [code, party])).then((r) => r.rows[0].id);
    /* ใบเก่า: บันทึกเมื่อวาน วันที่เอกสารใหม่ · ใบใหม่: บันทึกตอนนี้ ย้อนวันที่ */
    await db((c) => c.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name, vat_mode, payable, grand_total, created_at)
       values (current_tenant_id(), 'RC', $1, current_date, 'issued', $2, $3, 'ex', 100, 100, now() - interval '1 day')`,
      [`RCOLD${code}`, contactId, party]));
    await addBackdated('RC', `RCNEW${code}`, party, { partyId: contactId });

    await page.goto(`/customers/${contactId}`);
    const first = wide(page)
      ? page.locator('.contact-view table tbody tr').first()
      : page.locator('.contact-view .doc-cards .dcard').first();
    await expect(first).toContainText(`RCNEW${code}`);
  } finally {
    await removeDocs(party);
    await db((c) => c.query(`delete from contacts where code = $1`, [code]));
  }
});

for (const path of ['/customers', '/finance/sales']) {
  test(`หน้าละ 10 — ${path} · ตัวเลือก 10 / 20 / 30`, async ({ page }) => {
    await page.goto(path);
    const count = path.startsWith('/customers')
      ? (wide(page) ? page.locator('table.cust tbody tr') : page.locator('.contact-cards .mparty'))
      : (wide(page) ? page.locator('.doc-table table.tbl tbody tr') : page.locator('.doc-cards .dcard'));
    await expect(count.first()).toBeVisible();
    expect(await count.count(), 'เปิดมา 10 แถว').toBe(10);

    const sizes = page.locator('.tag-row').filter({ hasText: 'แสดงต่อหน้า' }).first();
    await expect(sizes.locator('a.chip')).toHaveText(['10', '20', '30']);
  });
}
