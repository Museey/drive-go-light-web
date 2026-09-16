import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ตั้งรหัสผ่านตามลิงก์ · ออกจากระบบ (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * - เปิดอู่ใหม่ ตั้งรหัสตามลิงก์ แล้วเข้าไปอยู่อู่อื่น — เพราะเบราว์เซอร์ยังล็อกอินอู่เดิมค้างอยู่
 *   และ /login เด้งคนที่มีเซสชันไปหน้าแรกทันที
 * - กดออกจากระบบแล้วไป https://localhost:10000/login — เพราะประกอบ URL จาก request.url
 *   ซึ่งบน Render เป็นที่อยู่ภายในหลัง proxy
 */

const PASSWORD = 'อู่ทดสอบ-Rahat-2569';

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** อู่ใหม่ + บัญชีเจ้าของ + ลิงก์ตั้งรหัสผ่าน — เหมือนที่คอนโซลเปิดอู่ให้ */
async function newShopWithSetupLink(tag: string) {
  const email = `${tag}@example.com`;
  const name = `อู่ทดสอบ ${tag}`;
  const raw = randomBytes(32).toString('base64url');
  const tenant = await db(async (c) => {
    const t = await c.query('insert into tenants (name) values ($1) returning id', [name]);
    const u = await c.query(
      `insert into users (tenant_id, code, name, email, role, active)
       values ($1, 'OWNER', 'เจ้าของทดสอบ', $2, 'owner', true) returning id`,
      [t.rows[0].id, email]);
    await c.query(`select auth.issue_setup_token($1, $2, 'initial', now() + interval '1 day')`,
      [u.rows[0].id, createHash('sha256').update(raw).digest()]);
    return t.rows[0].id as string;
  });
  return { tenant, email, name, raw };
}

test('ตั้งรหัสผ่านตามลิงก์ทั้งที่ยังล็อกอินอู่เดิม — เข้าอู่ของลิงก์ให้เลย', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ชื่ออู่บนแถบบนมีเฉพาะเดสก์ท็อป · มือถืออยู่ในลิ้นชัก');
  const shop = await newShopWithSetupLink(`zs${info.parallelIndex}${Date.now().toString(36)}`);
  /* เซสชันของอู่เดิมเป็นของเทสต์นี้เอง — ข้อนี้เพิกถอนมัน เทสต์ข้ออื่นจึงต้องไม่ใช้ร่วม */
  const old = await makeSession();
  await context.addCookies([{ name: 'dgl_session', value: old, url: 'http://localhost:3100' }]);
  try {
    await page.goto('/');
    const before = (await page.locator('.brand .shop').first().innerText()).trim();
    expect(before, 'เริ่มจากล็อกอินอู่เดิมอยู่').not.toBe(shop.name);

    await page.goto(`/setup/${shop.raw}`);
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านครั้งแรก' })).toBeVisible();
    await page.locator('#password').fill(PASSWORD);
    await page.locator('#confirm').fill(PASSWORD);
    await page.getByRole('button', { name: /ตั้งรหัสผ่าน/ }).click();

    /* ตั้งเสร็จต้องเข้าระบบให้เลย ไม่ต้องกรอกอีเมล/รหัสซ้ำ (ผู้ใช้กำหนด 16 ก.ย. 2569)
       เดิมเด้งเข้าอู่เดิมเพราะเซสชันเก่ายังอยู่ · รอบถัดมาพาไปหน้าล็อกอินซึ่งยังต้องพิมพ์ซ้ำ */
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.locator('.brand .shop').first(), 'เข้าอู่ของลิงก์').toHaveText(shop.name);

    /* เซสชันของอู่เดิมต้องถูกเพิกถอนในฐาน ไม่ใช่แค่คุกกี้ถูกเขียนทับ */
    const left = await db((c) => c.query(
      'select count(*)::int n from auth.sessions where token_hash = $1',
      [createHash('sha256').update(old).digest()]));
    expect(left.rows[0].n, 'เซสชันเดิมต้องถูกเพิกถอน').toBe(0);
  } finally {
    await db((c) => c.query('delete from tenants where id = $1', [shop.tenant]));
  }
});

test('ออกจากระบบ: Location ต้องเป็น path ล้วน ไม่มีชื่อโฮสต์ภายในของเซิร์ฟเวอร์', async ({ page, context }) => {
  /* เซสชันของตัวเอง — ออกจากระบบแล้วจะได้ไม่ล้มเทสต์ข้ออื่นที่ใช้เซสชันร่วมกัน */
  await context.addCookies([{ name: 'dgl_session', value: await makeSession(), url: 'http://localhost:3100' }]);

  const res = await page.request.post('/logout', { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers().location, 'บน Render request.url เป็น https://localhost:10000').toBe('/login');
});

test('กดปุ่มออกจากระบบแล้วอยู่ที่หน้าล็อกอินของโฮสต์เดิม', async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'มือถือ/แท็บเล็ตปุ่มออกจากระบบอยู่ในลิ้นชัก');
  await context.addCookies([{ name: 'dgl_session', value: await makeSession(), url: 'http://localhost:3100' }]);

  await page.goto('/');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(`${baseURL}/login`);
  await expect(page.locator('input[name="email"]')).toBeVisible();
});
