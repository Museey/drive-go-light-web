import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ร้านจด / ไม่จดภาษีมูลค่าเพิ่ม (PLAN-vat-registered-2569-10-02.md) — ทำตามที่ผู้ใช้จะใช้จริงบนหน้าจอ
 *
 * ค่านี้เป็นของทั้งอู่ ทุกข้อที่เปลี่ยนจึง **คืนเป็น "จด" ใน finally เสมอ**
 * ไม่งั้นสเปกอื่นที่รันต่อจะเจอเมนู 03.2 หายแล้วแดงโดยไม่เกี่ยวกับตัวเอง
 * ข้อที่บันทึกเอกสารหรือกดบันทึกตั้งค่าร้านตรวจขนาดจอเดียว (เดสก์ท็อป) เหมือน popup-wht.spec
 */

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

const OWNER_TENANT = `(select tenant_id from users where role = 'owner' order by created_at limit 1)`;
const setVat = (on: boolean) => db((c) => c.query(`update tenants set vat_registered = $1 where id = ${OWNER_TENANT}`, [on]));
const vatOf = () => db(async (c) =>
  (await c.query(`select vat_registered from tenants where id = ${OWNER_TENANT}`)).rows[0].vat_registered as boolean);

const confirmSave = (page: Page) => page.getByRole('dialog', { name: 'ยืนยันการบันทึก' });
const tagOf = (name: string) => `${name}${Date.now().toString(36)}`;

/** ลบเอกสารทดสอบ — ต่อในนาม superuser แต่ตั้งอู่ไว้ให้เหมือน doc-lock.spec */
const cleanup = (tag: string) => db(async (c) => {
  await c.query(`delete from payments where doc_id in (select id from documents where party_name = $1)`, [tag]);
  await c.query(`delete from documents where party_name = $1`, [tag]);
});

/** บรรทัดสินค้าที่พิมพ์ชื่อเอง ไม่ใช่ค่าแรง — ไม่มีหัก ณ ที่จ่ายมาปนยอด */
async function partLine(page: Page, price: number) {
  const row = page.locator('table.lines tbody tr').first();
  await row.locator('td.c-name input').fill('ผ้าเบรกหน้าทดสอบ VAT');
  await row.locator('td.c-price input').fill(String(price));
}

const docOf = (tag: string) => db(async (c) =>
  (await c.query(
    `select id, kind::text as kind, vat_mode::text as vat_mode, vat_amount::float as vat, grand_total::float as grand
       from documents where party_name = $1`, [tag])).rows[0] as
    { id: string; kind: string; vat_mode: string; vat: number; grand: number } | undefined);

/* ===================================================================== */

test('ตั้งค่าร้าน: เลือกไม่จด → บันทึก → ค่าในฐานเปลี่ยน · เลือกจดกลับได้', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าของทั้งอู่ — ตรวจขนาดจอเดียว');
  const notReg = page.getByRole('radio', { name: 'ไม่จดภาษีมูลค่าเพิ่ม' });
  const reg = page.getByRole('radio', { name: 'จดภาษีมูลค่าเพิ่ม', exact: true });
  try {
    await page.goto('/settings');
    await expect(reg, 'อู่เดิมเริ่มที่ "จด" (ไมเกรชัน 036)').toBeChecked();

    await notReg.check();
    await expect(page.getByText('เอกสารรายรับใบใหม่ทุกใบไม่คิด VAT')).toBeVisible();
    await page.getByRole('button', { name: 'บันทึกข้อมูลร้าน' }).click();
    await expect(page.getByText('บันทึกข้อมูลร้านเรียบร้อย')).toBeVisible();
    expect(await vatOf()).toBe(false);

    await page.reload();
    await expect(notReg).toBeChecked();
    await reg.check();
    await page.getByRole('button', { name: 'บันทึกข้อมูลร้าน' }).click();
    await expect(page.getByText('บันทึกข้อมูลร้านเรียบร้อย')).toBeVisible();
    expect(await vatOf()).toBe(true);
  } finally {
    await setVat(true);
  }
});

test('ร้านไม่จด: เมนู 03.2 ใบกำกับภาษีหาย เหลือ 03.3 · ช่อง VAT ล็อกไม่คิดภาษี · ลิงก์ IVT เก่าพาไป IV', async ({ page }) => {
  await setVat(false);
  try {
    await page.goto('/income?kind=QT');
    const vat = page.locator('#vatMode');
    await expect(vat).toBeDisabled();
    await expect(vat).toHaveValue('none');
    await expect(vat.locator('option')).toHaveCount(1);
    await expect(page.getByText('ร้านไม่ได้จดภาษีมูลค่าเพิ่ม — เอกสารไม่คิด VAT')).toBeVisible();

    /* ทุกที่ที่มีเมนู (แถบซ้าย แถบบน ลิ้นชัก) อยู่ใน DOM เดียวกัน — ไม่มีลิงก์ไป 03.2 เลยสักที่ */
    await expect(page.locator('a[href="/income?kind=IVT"]')).toHaveCount(0);
    await expect(page.locator('a[href="/income?kind=IV"]').first(), '03.3 ใบส่งมอบไม่มี VAT ยังอยู่').toBeAttached();

    await page.goto('/income/new?kind=IVT&blank=1');
    await expect(page).toHaveURL(/[?&]kind=IV(&|$)/);
    await expect(page.locator('#vatMode')).toHaveValue('none');
    await expect(page.getByRole('link', { name: 'ใบส่งมอบงาน / ใบกำกับภาษี' }), 'ชิปชนิดเอกสารไม่มีใบกำกับภาษี').toHaveCount(0);
  } finally {
    await setVat(true);
  }
});

test('ร้านที่จด (ค่าตั้งต้น): เมนู 03.2 อยู่ · ใบเสนอราคาเลือก VAT ได้สามแบบเหมือนเดิม', async ({ page }) => {
  await page.goto('/income?kind=QT');
  const vat = page.locator('#vatMode');
  await expect(vat).toBeEnabled();
  await expect(vat).toHaveValue('ex');
  await expect(vat.locator('option')).toHaveCount(3);
  await expect(page.locator('a[href="/income?kind=IVT"]').first()).toBeAttached();
});

test('ร้านไม่จด: ขายหน้าร้านบันทึกแล้วไม่มี VAT ในฐานข้อมูล', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกเอกสารจริง — ตรวจขนาดจอเดียว');
  const tag = tagOf('ลูกค้าร้านไม่จดVAT');
  await setVat(false);
  try {
    await page.goto('/income/walkin');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await partLine(page, 1070);
    await page.getByRole('button', { name: 'บันทึกใบเสร็จรับเงิน' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();

    await expect.poll(() => docOf(tag), { timeout: 10_000 }).toMatchObject({ kind: 'RC', vat_mode: 'none', vat: 0, grand: 1070 });
  } finally {
    await setVat(true);
    await cleanup(tag);
  }
});

test('ร้านไม่จด: เปิดแก้ใบเก่าที่มี VAT — ยอดเดิม เลือกได้แค่ตามเดิมหรือไม่คิดภาษี', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกเอกสารจริง — ตรวจขนาดจอเดียว');
  const tag = tagOf('ลูกค้าใบเก่ามีVAT');
  try {
    /* ออกใบเสนอราคาตอนร้านยังจด — ค่าตั้งต้นคือราคายังไม่รวมภาษี */
    await page.goto('/income?kind=QT');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await partLine(page, 1000);
    await page.getByRole('button', { name: 'บันทึกใบเสนอราคา' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect.poll(() => docOf(tag), { timeout: 10_000 }).toMatchObject({ vat_mode: 'ex', grand: 1070 });
    const { id } = (await docOf(tag))!;

    await setVat(false);
    await page.goto(`/income/${id}/edit`);
    const vat = page.locator('#vatMode');
    await expect(vat).toBeEnabled();
    await expect(vat).toHaveValue('ex');
    await expect(vat.locator('option')).toHaveText(['ไม่คิดภาษี', 'ราคายังไม่รวมภาษี']);
    await expect(page.getByText('ใบนี้ออกไว้ตอนร้านยังจด VAT')).toBeVisible();
    await expect(page.locator('.sumbox .row.grand').first(), 'ยอดเดิมไม่เปลี่ยนเอง').toContainText('1,070.00');

    /* เอา VAT ออกแล้วบันทึก — ยอดลดตามที่เห็นในแผงยืนยัน */
    await vat.selectOption('none');
    await expect(page.locator('.sumbox .row.grand').first()).toContainText('1,000.00');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).first().click();
    await confirmSave(page).getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect.poll(() => docOf(tag), { timeout: 10_000 }).toMatchObject({ vat_mode: 'none', grand: 1000 });
  } finally {
    await setVat(true);
    await cleanup(tag);
  }
});

test('ร้านไม่จด: หน้าแรก · 06.1 ยอดขาย · ฟอร์มเปล่า ไม่พูดถึง VAT ที่ร้านไม่มี', async ({ page }) => {
  await setVat(false);
  try {
    await page.goto('/');
    await expect(page.locator('.topbar .sub').first()).toContainText('ไม่จดภาษีมูลค่าเพิ่ม');

    await page.goto('/finance/sales');
    await expect(page.getByRole('heading', { name: 'ยอดขายรายเดือน' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ภาษีมูลค่าเพิ่มรายงวด' })).toHaveCount(0);

    await page.goto('/forms?kind=invoice');
    await expect(page.locator('.paper h1')).toHaveText('ใบส่งมอบ / ใบแจ้งหนี้');
    await expect(page.locator('.paper').getByText('ภาษีมูลค่าเพิ่ม 7%')).toHaveCount(0);
  } finally {
    await setVat(true);
  }

  /* กลับเป็นจดแล้วทุกอย่างกลับมาเหมือนเดิม */
  await page.goto('/finance/sales');
  await expect(page.getByRole('heading', { name: 'ภาษีมูลค่าเพิ่มรายงวด' })).toBeVisible();
  await page.goto('/forms?kind=invoice');
  await expect(page.locator('.paper h1')).toHaveText('ใบส่งมอบ / ใบกำกับภาษี');
});
