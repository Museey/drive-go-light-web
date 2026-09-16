import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * จำกัดสินค้าที่ใช้งาน 3,000 รายการต่ออู่ — สิ่งที่ผู้ใช้เห็น
 *
 * ตัวนับที่หัวทะเบียนสินค้า · ฟอร์มเพิ่มสินค้า / CSV / กู้คืนไฟล์ตอนเกิน ได้ข้อความไทย ไม่ใช่หน้า 500
 * ตรรกะเต็มอยู่ใน test/product-limit-*.test.ts — ที่นี่ตรวจว่าข้อความไปถึงหน้าจอจริง
 *
 * เติมสินค้าชั่วคราวรหัส E2E-LIM-* ให้อู่ตัวอย่างครบ 3,000 แล้วลบทิ้งหลังจบ (เทสต์รันทีละตัว — workers: 1)
 */

/* Playwright โหลดสเปกแบบ CommonJS — ใช้ __dirname ได้ import.meta ไม่ได้ */
const ROOT = resolve(__dirname, '../../..');
const PREFIX = 'E2E-LIM-';

let token: string;

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

const tenantOf = (c: pg.Client) =>
  c.query(`select tenant_id from users where role = 'owner' order by created_at limit 1`)
    .then((r) => r.rows[0].tenant_id as string);

const activeCount = () => db(async (c) => Number((await c.query(
  `select count(*) from products where tenant_id = $1 and active`, [await tenantOf(c)])).rows[0].count));

const removeFiller = () => db(async (c) => {
  await c.query(`delete from products where code like $1`, [`${PREFIX}%`]);
});

/** เติมสินค้าที่ใช้งานจนครบ 3,000 พอดี */
const fillToLimit = () => db(async (c) => {
  const tenant = await tenantOf(c);
  const have = Number((await c.query(
    `select count(*) from products where tenant_id = $1 and active`, [tenant])).rows[0].count);
  await c.query(
    `insert into products (tenant_id, code, name, unit)
     select $1, $2 || g, 'สินค้าเติมทดสอบ ' || g, 'ชิ้น' from generate_series(1, $3::int) g`,
    [tenant, PREFIX, 3000 - have]);
});

const header = (page: Page) => page.locator('.topbar .sub');

test.beforeAll(async () => {
  token = await makeSession();
  await removeFiller();
});
test.afterAll(async () => { await removeFiller(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

test('หัวทะเบียนสินค้า: ใช้งานอยู่ N / 3,000 รายการ · ตัวกรองไม่เปลี่ยน N แต่บอกจำนวนที่ตรงเงื่อนไข', async ({ page }) => {
  const n = (await activeCount()).toLocaleString('en-US');
  await page.goto('/stock');
  await expect(header(page)).toContainText(`ใช้งานอยู่ ${n} / 3,000 รายการ`);
  await expect(header(page)).not.toContainText('ตรงเงื่อนไข');

  await page.goto('/stock?q=' + encodeURIComponent('เบรก'));
  await expect(header(page), 'ตัวนับทั้งอู่ไม่ขึ้นกับคำค้น').toContainText(`ใช้งานอยู่ ${n} / 3,000 รายการ`);
  const m = (await header(page).innerText()).match(/ตรงเงื่อนไข ([\d,]+) รายการ/);
  expect(m, 'มีตัวกรองต้องบอกจำนวนที่ตรง').toBeTruthy();
  expect(Number(m![1].replace(/,/g, ''))).toBeLessThan(Number(n.replace(/,/g, '')));
});

test.describe('ครบ 3,000 แล้ว', () => {
  test.beforeAll(fillToLimit);
  test.afterAll(removeFiller);

  test('หัวทะเบียนขึ้น 3,000 / 3,000 · ฟอร์มเพิ่มสินค้าขึ้นข้อความไทย ค่าที่กรอกไม่หาย', async ({ page }) => {
    await page.goto('/stock');
    await expect(header(page)).toContainText('ใช้งานอยู่ 3,000 / 3,000 รายการ');

    await page.goto('/stock/new');
    await page.locator('#code').fill('E2E-OVER-1');
    await page.locator('#name').fill('ของที่เพิ่มไม่ได้');
    await page.locator('form button[type="submit"].primary').first().click();

    const err = page.locator('.err').filter({ hasText: 'สินค้าที่ใช้งานครบ 3,000 รายการแล้ว' });
    await expect(err).toBeVisible();
    await expect(err).toHaveText('สินค้าที่ใช้งานครบ 3,000 รายการแล้ว — ปิดใช้งานสินค้าที่เลิกขายก่อนจึงจะเพิ่มได้');
    await expect(page.locator('#name'), 'ค่าที่กรอกไว้ต้องอยู่ครบ').toHaveValue('ของที่เพิ่มไม่ได้');
    await expect(page.locator('.field.bad #code'), 'ไม่ใช่ความผิดของช่องรหัส').toHaveCount(0);
    expect(await activeCount()).toBe(3000);
  });

  test('นำเข้า CSV ที่มีรหัสใหม่ — ปฏิเสธทั้งไฟล์ บอกว่าเกินกี่รายการ', async ({ page }, info) => {
    const file = info.outputPath('over.csv');
    writeFileSync(file, 'รหัสสินค้า,ชื่อสินค้า,หน่วยนับ,ราคา A\r\nE2E-CSV-1,ของใหม่ 1,ชิ้น,10\r\nE2E-CSV-2,ของใหม่ 2,ชิ้น,10\r\n');

    await page.goto('/settings/import');
    const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'สินค้าและอะไหล่' }) });
    await card.locator('input[type="file"]').setInputFiles(file);
    await card.getByRole('button', { name: 'นำเข้าไฟล์' }).click();

    await expect(card.locator('.err')).toHaveText(
      'ไฟล์นี้จะทำให้มีสินค้าใช้งาน 3,002 รายการ เกิน 2 รายการ — ไม่ได้นำเข้าเลย');
    expect(await db(async (c) => Number((await c.query(
      `select count(*) from products where code like 'E2E-CSV-%'`)).rows[0].count))).toBe(0);
  });
});

test('กู้คืนไฟล์ที่มีสินค้าใช้งานเกิน — หน้าตรวจไฟล์บอกเลย ไม่มีช่องยืนยันให้กด', async ({ page }, info) => {
  const backup = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
  const base = backup.products[0];
  const extra = Array.from({ length: 3050 - backup.products.length }, (_, i) =>
    ({ ...base, id: `lim${i}`, code: `LIM-${i}`, name: `สินค้าเกิน ${i}`, pics: [] }));
  backup.products = [...backup.products, ...extra];
  const file = info.outputPath('over-backup.json');
  writeFileSync(file, JSON.stringify(backup));
  const before = await activeCount();

  await page.goto('/settings/import');
  await page.getByRole('button', { name: 'กู้คืนข้อมูลจากไฟล์สำรอง' }).click();
  await page.locator('#restoreFile').setInputFiles(file);
  /* หน้านี้มีปุ่ม "ตรวจไฟล์" ของนำเข้าลูกค้า/ผู้ขายด้วย — เจาะฟอร์มกู้คืน */
  await page.locator('form', { has: page.locator('#restoreFile') }).getByRole('button', { name: 'ตรวจไฟล์' }).click();

  const msg = page.locator('.restore-limit');
  await expect(msg).toContainText('ไฟล์นี้มีสินค้าใช้งาน 3,050 รายการ เกินกำหนด 3,000 — ไม่ได้กู้คืน ข้อมูลเดิมยังอยู่ครบ');
  await expect(page.locator('#confirm'), 'กู้คืนไม่ได้ ไม่ต้องให้พิมพ์ยืนยัน').toHaveCount(0);
  await expect(page.getByRole('button', { name: 'กู้คืนทับข้อมูลเดิม' })).toHaveCount(0);
  expect(await activeCount(), 'ข้อมูลเดิมไม่ถูกแตะ').toBe(before);
});
