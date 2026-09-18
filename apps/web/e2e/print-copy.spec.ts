import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * พิมพ์เอกสารได้ต้นฉบับแล้วตามด้วยสำเนา (ผู้ใช้กำหนด 19 ก.ย. 2569)
 * คำกำกับอยู่ใต้เลขที่เอกสาร · เอกสารหลายหน้าให้ต้นฉบับครบทุกหน้าก่อน แล้วค่อยสำเนาทั้งชุด
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'หน้ากระดาษ A4 ตรวจที่ขนาดเดียวพอ — เลย์เอาต์พิมพ์ไม่ขึ้นกับจอ');
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

/** ป้ายต้นฉบับ/สำเนาของทุกแผ่นในหน้านี้ เรียงตามลำดับที่พิมพ์ออกมา */
const tags = (page: Page) => page.locator('.paper .copy-tag').allInnerTexts();

test('ใบเสร็จ: พิมพ์ออกมาสองชุด ต้นฉบับแล้วสำเนา · ป้ายอยู่ใต้เลขที่เอกสาร', async ({ page }) => {
  const id = await db((c) => c.query(
    `select id from documents where kind = 'RC' and status = 'issued' and purged_at is null
      order by created_at desc limit 1`)).then((r) => r.rows[0].id);

  await page.goto(`/income/${id}/print`);
  await expect(page.locator('.paper')).toHaveCount(2);
  expect(await tags(page)).toEqual(['ต้นฉบับ', 'สำเนา']);

  /* ป้ายต้องอยู่ "ใต้เลขที่เอกสาร" จริง ๆ ไม่ใช่มุมไหนก็ได้ */
  const pos = await page.locator('.paper').first().evaluate((el) => {
    const no = el.querySelector('.docno-big') as HTMLElement;
    const tag = el.querySelector('.copy-tag') as HTMLElement;
    const a = no.getBoundingClientRect();
    const b = tag.getBoundingClientRect();
    return { below: b.top >= a.bottom - 1, sameCol: Math.abs(b.right - a.right) < 40 };
  });
  expect(pos.below, 'ป้ายอยู่ใต้เลขที่').toBe(true);
  expect(pos.sameCol, 'ป้ายอยู่คอลัมน์เดียวกับเลขที่').toBe(true);
});

test('ใบซื้อ: พิมพ์ออกมาสองชุดเหมือนกัน', async ({ page }) => {
  const id = await db((c) => c.query(
    `select id from documents where kind = 'PO' and status = 'issued' and purged_at is null
      order by created_at desc limit 1`)).then((r) => r.rows[0].id);

  await page.goto(`/expense/${id}/print`);
  await expect(page.locator('.paper')).toHaveCount(2);
  expect(await tags(page)).toEqual(['ต้นฉบับ', 'สำเนา']);
});

test('เอกสารที่ยาวหลายหน้า: ต้นฉบับครบทุกหน้าก่อน แล้วค่อยสำเนาทั้งชุด', async ({ page }, info) => {
  const tag = `ลูกค้าพิมพ์ยาว${info.parallelIndex}${Date.now().toString(36)}`;
  const id = await db(async (c) => {
    const d = await c.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode,
                              subtotal, net_amount, grand_total, payable)
       values (current_tenant_id(),'RC',$1,current_date,'issued',$2,'none',30000,30000,30000,30000) returning id`,
      [`RCLONG${Date.now().toString(36)}`, tag]);
    for (let i = 1; i <= 20; i++) {
      await c.query(
        `insert into doc_items (tenant_id, doc_id, line_no, code, oem, name, unit, qty, unit_price, is_service, disc_pct)
         values (current_tenant_id(), $1, $2, '', '', $3, 'ชิ้น', 1, 1500, false, 0)`,
        [d.rows[0].id, i, `รายการทดสอบที่ ${i}`]);
    }
    return d.rows[0].id as string;
  });

  try {
    await page.goto(`/income/${id}/print`);
    const all = await tags(page);
    expect(all.length, 'สองชุด ชุดละหลายหน้า').toBeGreaterThan(2);
    expect(all.length % 2, 'จำนวนแผ่นต้องหารสองลงตัว').toBe(0);

    const half = all.length / 2;
    expect(all.slice(0, half).every((t) => t === 'ต้นฉบับ'), 'ครึ่งแรกเป็นต้นฉบับทั้งหมด').toBe(true);
    expect(all.slice(half).every((t) => t === 'สำเนา'), 'ครึ่งหลังเป็นสำเนาทั้งหมด').toBe(true);
  } finally {
    await db((c) => c.query(`delete from documents where party_name = $1`, [tag]));
  }
});

test('ใบวางบิลและใบเคลม: พิมพ์สองชุดเหมือนกัน', async ({ page }, info) => {
  const tag = `พิมพ์สำเนา${info.parallelIndex}${Date.now().toString(36)}`;
  const made = await db(async (c) => {
    const doc = (await c.query(
      `select id from documents where kind in ('IV','IVT') and status = 'issued' and purged_at is null
        order by created_at desc limit 1`)).rows[0];
    const bn = (await c.query(
      `insert into billnotes (tenant_id, no, bill_date, due_date, party_name, total_snapshot)
       values (current_tenant_id(), $1, current_date, current_date + 30, $2, 1000) returning id`,
      [`BNCOPY${Date.now().toString(36)}`, tag])).rows[0];
    await c.query(`insert into billnote_docs (tenant_id, billnote_id, doc_id) values (current_tenant_id(),$1,$2)`,
      [bn.id, doc.id]);

    const product = (await c.query(`select id, code, name from products limit 1`)).rows[0];
    const cl = (await c.query(
      `insert into claims (tenant_id, no, side, kind, claim_date, party_name, reason)
       values (current_tenant_id(), $1, 'customer', 'warranty', current_date, $2, 'ทดสอบพิมพ์สำเนา') returning id`,
      [`CLCOPY${Date.now().toString(36)}`, tag])).rows[0];
    await c.query(
      `insert into claim_items (tenant_id, claim_id, line_no, product_id, name, qty, unit_cost)
       values (current_tenant_id(), $1, 1, $2, $3, 1, 100)`, [cl.id, product.id, product.name]);
    return { bn: bn.id as string, cl: cl.id as string };
  });

  try {
    await page.goto(`/income/billing/${made.bn}/print`);
    expect(await tags(page), 'ใบวางบิล').toEqual(['ต้นฉบับ', 'สำเนา']);

    await page.goto(`/stock/claim/${made.cl}/print`);
    expect(await tags(page), 'ใบเคลม').toEqual(['ต้นฉบับ', 'สำเนา']);
  } finally {
    await db(async (c) => {
      await c.query(`delete from billnote_docs where billnote_id = $1`, [made.bn]);
      await c.query(`delete from billnotes where id = $1`, [made.bn]);
      await c.query(`delete from claim_items where claim_id = $1`, [made.cl]);
      await c.query(`delete from claims where id = $1`, [made.cl]);
    });
  }
});
