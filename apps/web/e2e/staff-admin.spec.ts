import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession, makeStaffSession } from './session';

/**
 * ตั้งค่าพนักงาน (PLAN-staff-admin-2569-09-19.md)
 * โอนสิทธิ์เจ้าของต้องยืนยันก่อน · ลบพนักงาน · ตำแหน่งงาน · เจ้าของตั้งรหัสผ่านให้
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ตารางพนักงานเต็มรูปแบบมีเฉพาะจอ 1280 ขึ้นไป');
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

const addStaff = (code: string, name: string) => db((c) => c.query(
  `insert into users (tenant_id, code, name, email, role, perms, job_title)
   values (current_tenant_id(), $1, $2, $3, 'staff', '{"menus":{"income":true}}'::jsonb, '')
   returning id`, [code, name, `${code.toLowerCase()}@example.com`])).then((r) => r.rows[0].id as string);

const dropStaff = (code: string) => db((c) => c.query(`delete from users where code = $1`, [code]));

const row = (page: Page, name: string) => page.locator('table.tbl tbody tr').filter({ hasText: name }).first();

test('ตำแหน่งงาน: กรอกแล้วขึ้นในตารางพนักงาน', async ({ page }, info) => {
  const code = `JT${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  const name = `พนักงานตำแหน่ง ${code}`;
  await addStaff(code, name);
  try {
    await page.goto('/settings/users');
    await row(page, name).getByRole('button', { name: 'แก้ไข' }).click();
    await page.locator('input[name="jobTitle"]').fill('ช่างหัวหน้า');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();

    await expect(row(page, name)).toContainText('ช่างหัวหน้า');
  } finally { await dropStaff(code); }
});

test('โอนสิทธิ์เจ้าของ: ต้องยืนยันก่อน · ยืนยันแล้วเหลือเจ้าของคนเดียว', async ({ page }, info) => {
  const code = `OW${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  const name = `พนักงานรับสิทธิ์ ${code}`;
  const staffId = await addStaff(code, name);
  const ownerBefore = await db((c) => c.query(
    `select id, name from users where role = 'owner' limit 1`)).then((r) => r.rows[0]);
  try {
    await page.goto('/settings/users');
    await row(page, name).getByRole('button', { name: 'โอนสิทธิ์เจ้าของ' }).click();

    /* กดปุ่มแล้วต้องยังไม่เปลี่ยนอะไร — ต้นเหตุเดิมคือกดทีเดียวแล้วเปลี่ยนทันที */
    const dialog = page.locator('.confirm', { hasText: 'โอนสิทธิ์เจ้าของกิจการ' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('คุณจะกลายเป็นพนักงาน');
    expect(await db((c) => c.query(`select role::text as r from users where id = $1`, [staffId]))
      .then((r) => r.rows[0].r), 'ยังไม่ยืนยัน ต้องยังไม่เปลี่ยน').toBe('staff');

    await dialog.getByRole('button', { name: 'ยืนยันโอนสิทธิ์' }).click();
    await expect(dialog).toHaveCount(0);

    const owners = await db((c) => c.query(`select id from users where role = 'owner'`));
    expect(owners.rows.map((r) => r.id), 'เหลือเจ้าของคนเดียวคือคนใหม่').toEqual([staffId]);
  } finally {
    /* คืนตำแหน่งเจ้าของให้คนเดิมก่อนลบพนักงานทดสอบ ไม่งั้นอู่ไม่มีเจ้าของ */
    await db((c) => c.query(`update users set role = 'owner' where id = $1`, [ownerBefore.id]));
    await db((c) => c.query(`update users set role = 'staff' where id = $1`, [staffId]));
    await dropStaff(code);
  }
});

test('ลบพนักงาน: ยืนยันแล้วหายจากตาราง', async ({ page }, info) => {
  const code = `DL${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  const name = `พนักงานที่จะลบ ${code}`;
  await addStaff(code, name);
  try {
    await page.goto('/settings/users');
    await row(page, name).getByRole('button', { name: 'ลบ', exact: true }).click();

    const dialog = page.locator('.confirm', { hasText: 'ลบพนักงาน' });
    await expect(dialog).toContainText('ประวัติการแก้ไขที่เคยทำไว้ยังอยู่ครบ');
    await dialog.getByRole('button', { name: 'ยืนยันลบ' }).click();

    await expect(page.locator('table.tbl tbody tr').filter({ hasText: name })).toHaveCount(0);
    const left = await db((c) => c.query(`select count(*)::int as n from users where code = $1`, [code]));
    expect(left.rows[0].n).toBe(0);
  } finally { await dropStaff(code); }
});

test('เจ้าของตั้งรหัสผ่านให้พนักงาน แล้วพนักงานเข้าระบบด้วยรหัสนั้นได้', async ({ page, browser }, info) => {
  const code = `PW${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  const name = `พนักงานรับรหัส ${code}`;
  await addStaff(code, name);
  try {
    await page.goto('/settings/users');
    await row(page, name).getByRole('button', { name: 'ตั้งรหัสผ่านให้' }).click();

    const dialog = page.locator('.confirm', { hasText: 'ตั้งรหัสผ่านให้พนักงาน' });
    await expect(dialog).toContainText('เครื่องที่เคยเข้าไว้จะถูกไล่ออก');
    await dialog.locator('#sp-password').fill('ChangMai-2569!');
    await dialog.locator('#sp-confirm').fill('ChangMai-2569!');
    await dialog.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, name)).toContainText('พร้อมใช้งาน');

    /* เข้าระบบจริงด้วยรหัสที่เพิ่งตั้ง */
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto('/login');
    await p2.locator('#email').fill(`${code.toLowerCase()}@example.com`);
    await p2.locator('#password').fill('ChangMai-2569!');
    await p2.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(p2).toHaveURL(/localhost:3100\/($|\?)/);
    await ctx.close();
  } finally { await dropStaff(code); }
});

test('พนักงานที่มีสิทธิ์ตั้งค่าร้าน (ไม่ใช่เจ้าของ) ไม่มีปุ่มโอนสิทธิ์และตั้งรหัสผ่านให้คนอื่น', async ({ browser }, info) => {
  const code = `NO${info.parallelIndex}${Date.now().toString(36).toUpperCase()}`;
  const name = `พนักงานถูกดู ${code}`;
  await addStaff(code, name);
  const staffToken = await makeStaffSession({
    menus: { settings: true },
    tabs: { 'settings.staff': true },
    edit: { 'settings.staff': true },
  });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'dgl_session', value: staffToken, url: 'http://localhost:3100' }]);
  const page = await ctx.newPage();
  try {
    await page.goto('/settings/users');
    const r = row(page, name);
    await expect(r, 'ยังเห็นตารางพนักงานตามสิทธิ์ที่มี').toBeVisible();
    await expect(r.getByRole('button', { name: 'แก้ไข' }), 'แก้ไขยังทำได้').toHaveCount(1);
    await expect(r.getByRole('button', { name: 'โอนสิทธิ์เจ้าของ' }), 'โอนสิทธิ์ต้องเป็นของเจ้าของเท่านั้น').toHaveCount(0);
    await expect(r.getByRole('button', { name: 'ตั้งรหัสผ่านให้' }), 'ตั้งรหัสให้คนอื่นต้องเป็นของเจ้าของเท่านั้น').toHaveCount(0);
  } finally {
    await ctx.close();
    await dropStaff(code);
  }
});
