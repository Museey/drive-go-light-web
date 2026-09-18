import { expect, test } from '@playwright/test';
import { makeSession } from './session';

/**
 * โลโก้ของเว็บ — ไอคอนแท็บเบราว์เซอร์ และไอคอนตอนเพิ่มลงหน้าจอโฮม (ผู้ใช้ส่งภาพ 18 ก.ย. 2569)
 * ตรวจจากหน้าจริง: หน้ามีลิงก์ไอคอนและ manifest · ไฟล์เปิดได้จริงและเป็น PNG
 */

let token: string;
test.beforeAll(async () => { token = await makeSession(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'dgl_session', value: token, url: 'http://localhost:3100' }]);
});

test('หน้าเว็บมีไอคอนแท็บ · ไอคอน iPhone · manifest — ทุกไฟล์โหลดได้จริง', async ({ page, request }) => {
  await page.goto('/');

  const hrefs = async (sel: string) =>
    page.locator(sel).evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute('href') ?? ''));

  const [icon] = await hrefs('link[rel="icon"]');
  expect(icon, 'ไม่มีไอคอนแท็บในหน้า').toBeTruthy();
  const [apple] = await hrefs('link[rel="apple-touch-icon"]');
  expect(apple, 'ไม่มีไอคอนสำหรับเพิ่มลงหน้าจอโฮมของ iPhone').toBeTruthy();
  const [mf] = await hrefs('link[rel="manifest"]');
  expect(mf, 'ไม่มี manifest ในหน้า').toBeTruthy();

  for (const href of [icon, apple]) {
    const res = await request.get(href!);
    expect(res.status(), href!).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }

  const res = await request.get(mf!);
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toBe('DriveGoLight!');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);

  for (const i of manifest.icons) {
    const file = await request.get(i.src);
    expect(file.status(), i.src).toBe(200);
    expect(file.headers()['content-type']).toContain('image/png');
    expect((await file.body()).subarray(0, 8).toString('hex'), `${i.src} ไม่ใช่ PNG`).toBe('89504e470d0a1a0a');
  }
});

test('หน้าเข้าสู่ระบบ (ยังไม่ล็อกอิน) ก็มีไอคอน — ผู้ใช้เพิ่มลงหน้าจอโฮมจากหน้านี้ได้', async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto('/login');
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await fresh.close();
});
