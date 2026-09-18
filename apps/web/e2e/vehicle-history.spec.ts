import { expect, test } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ค้น 4 ตัวท้าย → การ์ดรถ → ประวัติของรถคันนั้น (ผู้ใช้กำหนด 19 ก.ย. 2569)
 * "ลูกค้าเข้ามา หลักการทำงานจะค้นจากเลขทะเบียนรถ 4 ตัวท้าย เป็นหลัก"
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

/** ลูกค้าหนึ่งรายที่มีรถสองคัน แต่ละคันมีใบของตัวเอง */
async function twoCars(tag: string, tail: string, tail2: string) {
  return db(async (c) => {
    const k = await c.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values (current_tenant_id(), $1, 'customer', 'company', $2) returning id`, [`V${tail}`, tag]);
    const veh = async (a: string, b: string, brand: string) => (await c.query(
      `insert into vehicles (tenant_id, contact_id, brand, model, color, plate_a, plate_b, plate_province)
       values (current_tenant_id(), $1, $2, 'Revo', 'ขาว', $3, $4, 'กรุงเทพมหานคร') returning id`,
      [k.rows[0].id, brand, a, b])).rows[0].id as string;
    const v1 = await veh('ขน', tail, 'Toyota');
    const v2 = await veh('ขน', tail2, 'Isuzu');

    const doc = async (no: string, plate: string, total: number) => c.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name, vat_mode,
                              vehicle_plate, subtotal, net_amount, grand_total, payable)
       values (current_tenant_id(),'RC',$1,current_date,'issued',$2,$3,'none',$4,$5,$5,$5,$5)`,
      [no, k.rows[0].id, tag, plate, total]);
    await doc(`RCA${tail}`, `ขน ${tail}`, 1500);
    await doc(`RCB${tail}`, `ขน ${tail}`, 2500);
    await doc(`RCC${tail}`, `ขน ${tail2}`, 900);
    return { contact: k.rows[0].id as string, v1, v2 };
  });
}

const cleanup = (tag: string) => db(async (c) => {
  await c.query(`delete from documents where party_name = $1`, [tag]);
  await c.query(`delete from vehicles where contact_id in (select id from contacts where org_name = $1)`, [tag]);
  await c.query(`delete from contacts where org_name = $1`, [tag]);
});

test('ค้น 4 ตัวท้าย: ขึ้นการ์ดรถ กดแล้วเห็นเฉพาะใบของรถคันนั้น', async ({ page }, info) => {
  const tail = String(4000 + info.parallelIndex * 7 + (Date.now() % 900));
  const tail2 = String(Number(tail) + 1);
  const tag = `ลูกค้ารถสองคัน${tail}`;
  await twoCars(tag, tail, tail2);

  try {
    await page.goto(`/customers?kind=customer&q=${tail}`);

    const card = page.locator('.vcard', { hasText: `ขน ${tail}` });
    await expect(card, 'ค้น 4 ตัวท้ายแล้วต้องมีการ์ดรถ').toHaveCount(1);
    await expect(card).toContainText('Toyota');
    await expect(card).toContainText(tag);
    await expect(card, 'สองใบของคันนี้').toContainText('2 ใบ');

    await card.click();
    await expect(page).toHaveURL(/\/vehicles\//);
    await expect(page.locator('body')).toContainText(`ขน ${tail}`);

    const nos = await page.locator('table tbody tr td:first-child a').allInnerTexts();
    expect(nos.map((s) => s.trim()).sort(), 'เฉพาะใบของคันนี้ ไม่ปนคันที่สอง')
      .toEqual([`RCA${tail}`, `RCB${tail}`].sort());
  } finally { await cleanup(tag); }
});

test('กดทะเบียนในตารางทะเบียนลูกค้า ไปหน้าประวัติรถคันนั้น', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ตารางรายคนมีเฉพาะจอ 1280 ขึ้นไป');
  const tail = String(5000 + info.parallelIndex * 7 + (Date.now() % 900));
  const tail2 = String(Number(tail) + 1);
  const tag = `ลูกค้ากดทะเบียน${tail}`;
  const { v1 } = await twoCars(tag, tail, tail2);

  try {
    await page.goto(`/customers?kind=customer&q=${encodeURIComponent(tag)}`);
    await page.locator('table.cust tbody tr').first().locator(`a.plate-link`).first().click();
    await expect(page).toHaveURL(new RegExp(`/vehicles/${v1}`));
  } finally { await cleanup(tag); }
});
