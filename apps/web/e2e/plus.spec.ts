import { expect, test } from '@playwright/test';
import pg from 'pg';
import { makeSession, makeStaffSession } from './session';

/**
 * DriveGo Light Plus (ไมเกรชัน 041) — ทำตามที่ผู้ใช้จะใช้จริงบนหน้าจอ
 *
 *   อู่ Light   เปิดหน้าฟีเจอร์ Plus แล้วเจอการ์ดชวนอัปเกรด ไม่ใช่หน้าข้อผิดพลาด
 *   อู่ Plus    พนักงาน → งวดเงินเดือน → สลิป → ภ.ง.ด.1 → 50 ทวิ · นัดหมาย · รายงานภาษี
 *
 * แพ็กเกจเป็นของทั้งอู่ ทุกข้อที่ตั้งเป็น Plus จึง **ลบแถวที่เพิ่มใน finally เสมอ**
 * ข้อที่บันทึกข้อมูลตรวจขนาดจอเดียว (เดสก์ท็อป) เหมือน vat-registered.spec
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
const NOTE = 'e2e-plus';

/** ตั้งอู่เป็น Plus ด้วยแถวที่หมดอายุช้ากว่าทุกแถว — คืนค่าด้วย unsetPlus() */
const setPlus = () => db((c) => c.query(
  `insert into subscriptions (tenant_id, plan, started_on, expires_on, note)
   values (${OWNER_TENANT}, 'plus-yearly', current_date, current_date + 3650, $1)`, [NOTE]));
const unsetPlus = () => db((c) => c.query(`delete from subscriptions where note = $1`, [NOTE]));

/*
 * ฐานข้อมูลทดสอบอาจเป็น Plus อยู่แล้ว (เช่น เคยอนุมัติคำขอต่ออายุแพ็กเกจ Plus ไว้) — ข้อของ "อู่ Light"
 * จะตกทั้งที่ระบบถูก จึงพักแถว Plus ของเดิมเป็น Light ไว้ตลอดไฟล์นี้ แล้วคืนให้ตอนจบ
 * ทำเครื่องหมายในหมายเหตุ: ถ้ารอบก่อนล้มกลางทาง รอบนี้ก็ยังคืนได้
 */
const PARKED = ' [e2e-parked-plus]';
test.beforeAll(() => db((c) => c.query(
  `update subscriptions set plan = 'light-yearly', note = coalesce(note, '') || $2
    where tenant_id = ${OWNER_TENANT} and plan = 'plus-yearly' and note is distinct from $1`, [NOTE, PARKED])));
test.afterAll(() => db((c) => c.query(
  `update subscriptions set plan = 'plus-yearly', note = nullif(replace(note, $1, ''), '')
    where note like '%' || $1`, [PARKED])));

const tagOf =(name: string) => `${name}${Date.now().toString(36)}`;

const PLUS_PAGES = [
  ['/finance/payroll', 'เงินเดือนและพนักงาน'],
  ['/finance/payroll/employees', 'เงินเดือนและพนักงาน'],
  ['/finance/tax', 'เอกสารภาษี'],
  ['/customers/appointments', 'นัดหมายและแจ้งเตือนลูกค้า'],
] as const;

/* ===================================================================== */

test('อู่ Light: ทุกหน้าของฟีเจอร์ Plus แสดงการ์ดชวนอัปเกรด และไม่ล้นจอ', async ({ page }) => {
  await unsetPlus();
  for (const [path, feature] of PLUS_PAGES) {
    await page.goto(path);
    const card = page.locator('[data-plus-upsell]');
    await expect(card, `${path} ต้องมีการ์ดชวนอัปเกรด`).toBeVisible();
    await expect(card).toContainText(feature);
    await expect(card.getByRole('link', { name: 'ดูแพ็กเกจและติดต่ออัปเกรด' })).toHaveAttribute('href', '/license#plus');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} ล้นจอแนวนอน`).toBeLessThanOrEqual(1);
  }
});

test('อู่ Light: ไฟล์ CSV ภาษี สลิป และ 50 ทวิ เปิดตรง ๆ ไม่ได้', async ({ page, request }) => {
  await unsetPlus();
  const csv = await request.get('/finance/tax/csv?doc=vat-out', {
    headers: { cookie: `dgl_session=${token}` },
  });
  expect(csv.status()).toBe(403);

  await page.goto('/finance/tax/cert?employee=00000000-0000-4000-8000-000000000000&year=2026');
  await expect(page).toHaveURL(/\/finance\/tax$/);
  await page.goto('/finance/payroll/00000000-0000-4000-8000-000000000000/print');
  await expect(page).toHaveURL(/\/finance\/payroll$/);
});

test('หน้าลิขสิทธิ์บอกสถานะ Light Plus ตามแพ็กเกจจริง', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าของทั้งอู่ — ตรวจขนาดจอเดียว');
  try {
    await unsetPlus();
    await page.goto('/license');
    await expect(page.locator('#plus')).toContainText('ยังไม่ได้เปิดใช้');
    await setPlus();
    await page.goto('/license');
    await expect(page.locator('#plus')).toContainText('เปิดใช้อยู่');
    await expect(page.locator('#plus')).not.toContainText('ยังไม่ได้เปิดใช้');
  } finally {
    await unsetPlus();
  }
});

test('อู่ Plus: เพิ่มพนักงาน → เปิดงวด → แก้ล่วงเวลา → บันทึก → สลิป → ภ.ง.ด.1 → 50 ทวิ', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกข้อมูลของทั้งอู่ — ตรวจขนาดจอเดียว');
  const name = tagOf('ช่างทดสอบ');
  /* เดือนที่ไม่ชนกับงวดจริงของใคร — ลบทิ้งใน finally */
  const period = '2031-01';
  try {
    await setPlus();

    /* ทะเบียนพนักงาน */
    await page.goto('/finance/payroll/employees/new');
    await page.getByLabel('ชื่อ-นามสกุล *').fill(name);
    await page.getByLabel('เลขประจำตัวผู้เสียภาษี').fill('1234567890123');
    await page.getByLabel('เงินเดือน (บาท/เดือน) *').fill('18000');
    await page.getByLabel('หักภาษี ณ ที่จ่าย (%)').fill('3');
    await page.getByRole('button', { name: 'บันทึกพนักงาน' }).click();
    await expect(page).toHaveURL(/\/finance\/payroll\/employees\?saved=1/);
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('18,000.00');

    /* เปิดงวด — ใส่ตรงเพราะตัวเลือกบนหน้าจอมีแค่หกเดือนล่าสุด ส่วนหน้าแก้งวดคือของจริง */
    const runId = await db(async (c) => {
      const emp = await c.query(`select id, tenant_id from employees where name = $1`, [name]);
      const run = await c.query(
        `insert into payroll_runs (tenant_id, period, pay_date, note) values ($1, $2, '2031-01-31', $3) returning id`,
        [emp.rows[0].tenant_id, period, NOTE]);
      await c.query(
        `insert into payroll_items (tenant_id, run_id, employee_id, line_no, name, tax_id, base, sso, wht)
         values ($1, $2, $3, 1, $4, '1234567890123', 18000, 875, 540)`,
        [emp.rows[0].tenant_id, run.rows[0].id, emp.rows[0].id, name]);
      return run.rows[0].id as string;
    });

    await page.goto(`/finance/payroll/${runId}`);
    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toContainText('16,585.00');
    await row.getByLabel(`ล่วงเวลา ของ ${name}`).fill('1500');
    /* ยอดสุทธิคิดสดระหว่างพิมพ์ ก่อนกดบันทึก */
    await expect(row).toContainText('18,085.00');
    await page.getByRole('button', { name: 'บันทึกงวดเงินเดือน' }).click();
    await expect(page.getByText('บันทึกงวดเงินเดือนแล้ว')).toBeVisible();

    const saved = await db(async (c) =>
      (await c.query(`select overtime::float as ot, net::float as net from payroll_items where run_id = $1`, [runId])).rows[0]);
    expect(saved).toEqual({ ot: 1500, net: 18085 });

    /* สลิป */
    await page.goto(`/finance/payroll/${runId}/print`);
    const slip = page.locator('.paper').first();
    await expect(slip).toContainText('สลิปเงินเดือน');
    await expect(slip).toContainText(name);
    await expect(slip).toContainText('18,085.00');

    /* ภ.ง.ด.1 ของงวดเดียวกัน */
    await page.goto(`/finance/tax?doc=pnd1&month=${period}`);
    const taxRow = page.getByRole('row', { name: new RegExp(name) });
    await expect(taxRow).toContainText('19,500.00');
    await expect(taxRow).toContainText('540.00');

    /* สปส.1-10 */
    await page.goto(`/finance/tax?doc=sso&month=${period}`);
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('875.00');

    /* 50 ทวิ ทั้งปี — สองฉบับ */
    await page.goto(`/finance/tax?doc=pnd1&month=${period}`);
    await page.getByRole('row', { name: new RegExp(name) }).getByRole('link', { name: '50 ทวิ' }).click();
    await expect(page.locator('.paper')).toHaveCount(2);
    await expect(page.locator('.paper').first()).toContainText('หนังสือรับรองการหักภาษี ณ ที่จ่าย');
    await expect(page.locator('.paper').first()).toContainText(name);
    await expect(page.locator('.paper').first()).toContainText('ปีภาษี 2574');
  } finally {
    await db(async (c) => {
      await c.query(`delete from payroll_runs where note = $1`, [NOTE]);
      await c.query(`delete from employees where name = $1`, [name]);
    });
    await unsetPlus();
  }
});

test('อู่ Plus: เปิดงวดจากหน้าจอ — ได้พนักงานที่ใช้งานอยู่พร้อมค่าเสนอ และเดือนนั้นหายจากตัวเลือก', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกข้อมูลของทั้งอู่ — ตรวจขนาดจอเดียว');
  const name = tagOf('ช่างเปิดงวด');
  let runPeriod = '';
  try {
    await setPlus();
    await db((c) => c.query(
      `insert into employees (tenant_id, code, name, base_salary, sso_enabled, wht_rate)
       values (${OWNER_TENANT}, $1, $2, 12000, true, 0)`, [`E2E-${Date.now().toString(36)}`, name]));

    await page.goto('/finance/payroll');
    const select = page.getByLabel('งวดเดือน');
    runPeriod = await select.inputValue();
    await page.getByRole('button', { name: '+ เปิดงวดเงินเดือน' }).click();
    await expect(page).toHaveURL(/\/finance\/payroll\/[0-9a-f-]{36}$/);
    const row = page.getByRole('row', { name: new RegExp(name) });
    /* 12,000 − ประกันสังคม 600 */
    await expect(row).toContainText('11,400.00');

    await page.goto('/finance/payroll');
    await expect(page.locator(`#period option[value="${runPeriod}"]`)).toHaveCount(0);
  } finally {
    await db(async (c) => {
      if (runPeriod) await c.query(`delete from payroll_runs where tenant_id = ${OWNER_TENANT} and period = $1`, [runPeriod]);
      await c.query(`delete from employees where name = $1`, [name]);
    });
    await unsetPlus();
  }
});

test('อู่ Plus: เพิ่มนัด → อยู่ในที่จะถึง → กดเสร็จ → ย้ายไปเสร็จ/ยกเลิก', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'บันทึกข้อมูลของทั้งอู่ — ตรวจขนาดจอเดียว');
  const title = tagOf('เช็กระยะทดสอบ');
  try {
    await setPlus();
    await page.goto('/customers/appointments/new');
    await page.getByLabel('เรื่องที่นัด *').fill(title);
    await page.getByLabel('ชื่อลูกค้า').fill('ลูกค้านัดทดสอบ');
    await page.getByLabel('ทะเบียนรถ').fill('9กก 9999');
    await page.getByRole('button', { name: 'บันทึกนัด' }).click();
    await expect(page).toHaveURL(/\/customers\/appointments\?saved=1/);

    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toContainText('ลูกค้านัดทดสอบ');
    await expect(row).toContainText('ยังไม่ได้แจ้ง');

    await row.getByRole('button', { name: 'แจ้งแล้ว', exact: true }).click();
    await expect(row).toContainText('แจ้งลูกค้าแล้ว');

    await row.getByRole('button', { name: 'เสร็จ', exact: true }).click();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);

    await page.goto('/customers/appointments?view=done');
    await expect(page.getByRole('row', { name: new RegExp(title) })).toContainText('เสร็จแล้ว');
  } finally {
    await db((c) => c.query(`delete from appointments where title = $1`, [title]));
    await unsetPlus();
  }
});

test('อู่ Plus: ฟอร์มนัดที่กรอกไม่ครบบอกช่องที่ผิด และค่าที่กรอกยังอยู่', async ({ page }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าของทั้งอู่ — ตรวจขนาดจอเดียว');
  try {
    await setPlus();
    await page.goto('/customers/appointments/new?kind=remind');
    await expect(page.getByLabel('ชนิด')).toHaveValue('remind');
    await page.getByLabel('เรื่องที่นัด *').fill('ต่อ พ.ร.บ. ทดสอบฟอร์ม');
    await page.getByRole('button', { name: 'บันทึกนัด' }).click();
    await expect(page.locator('.err[role="alert"]')).toContainText('อย่างน้อยหนึ่งอย่าง');
    await expect(page.getByLabel('เรื่องที่นัด *')).toHaveValue('ต่อ พ.ร.บ. ทดสอบฟอร์ม');
    await expect(page.getByLabel('ชนิด')).toHaveValue('remind');
  } finally {
    await unsetPlus();
  }
});

test('อู่ Plus: รายงานภาษีขายของเดือนที่มีเอกสาร — ยอดรวมตรงกับฐานข้อมูล และส่งออก CSV ได้', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'ค่าของทั้งอู่ — ตรวจขนาดจอเดียว');
  try {
    await setPlus();
    const want = await db(async (c) => (await c.query(
      `select to_char(doc_date, 'YYYY-MM') as m, sum(vat_amount)::float as vat, count(*)::int as n
         from documents
        where tenant_id = ${OWNER_TENANT} and status <> 'void' and kind = 'IVT' and vat_amount > 0
        group by 1 order by 3 desc limit 1`)).rows[0] as { m: string; vat: number; n: number });
    expect(want, 'ข้อมูลตัวอย่างต้องมีใบกำกับภาษี — รัน tools/dev-seed.sh').toBeTruthy();

    await page.goto(`/finance/tax?doc=vat-out&month=${want.m}`);
    const card = page.locator('.card', { hasText: 'รายงานภาษีขาย' }).last();
    await expect(card.locator('tbody tr')).not.toHaveCount(0);
    /* ใบกำกับภาษี (IVT) เป็นส่วนหนึ่งของเอกสารขาย ยอดในรายงานจึงไม่น้อยกว่ายอดของ IVT อย่างเดียว */
    const total = await card.locator('tbody tr').last().locator('td').nth(2).innerText();
    expect(Number(total.replace(/,/g, ''))).toBeGreaterThanOrEqual(Math.round(want.vat * 100) / 100 - 0.005);

    const csv = await request.get(`/finance/tax/csv?doc=vat-out&month=${want.m}`, {
      headers: { cookie: `dgl_session=${token}` },
    });
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    const text = await csv.text();
    expect(text).toContain('ภาษีมูลค่าเพิ่ม');
    expect(text.trim().split('\n').length).toBeGreaterThan(2);
  } finally {
    await unsetPlus();
  }
});

test('อู่ Plus: หน้ารายการของสามฟีเจอร์ไม่ล้นจอ', async ({ page }) => {
  try {
    await setPlus();
    for (const path of ['/finance/payroll', '/finance/payroll/employees', '/finance/tax', '/customers/appointments']) {
      await page.goto(path);
      await expect(page.locator('[data-plus-upsell]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} ล้นจอแนวนอน`).toBeLessThanOrEqual(1);
    }
  } finally {
    await unsetPlus();
  }
});

test('พนักงานที่ได้เมนูบัญชีทั้งเมนูแต่ไม่ได้ติ๊กแท็บเงินเดือน เข้าหน้าเงินเดือนไม่ได้', async ({ browser }, info) => {
  test.skip(info.project.name !== 'เดสก์ท็อป', 'สิทธิ์ไม่ขึ้นกับขนาดจอ');
  const staff = await makeStaffSession({ menus: { finance: true } });
  const ctx = await browser.newContext();
  try {
    await setPlus();
    await ctx.addCookies([{ name: 'dgl_session', value: staff, url: 'http://localhost:3100' }]);
    const page = await ctx.newPage();
    for (const path of ['/finance/payroll', '/finance/payroll/employees', '/finance/payroll/employees/new']) {
      await page.goto(path);
      await expect(page, `${path} ต้องถูกพากลับหน้าแรก`).toHaveURL(/\/\?denied=finance\.payroll/);
    }
    /* แท็บอื่นของเมนูบัญชียังเข้าได้ตามเดิม */
    await page.goto('/finance/tax');
    await expect(page).toHaveURL(/\/finance\/tax/);
    await expect(page.locator('[data-payroll-blocked]')).toHaveCount(0);

    /* แต่แบบที่แสดงเงินได้ของพนักงานรายคนเปิดไม่ได้ ทุกทางเข้า — หน้าจอ ไฟล์ CSV และ 50 ทวิ ของพนักงาน */
    for (const doc of ['pnd1', 'sso']) {
      await page.goto(`/finance/tax?doc=${doc}`);
      await expect(page.locator('[data-payroll-blocked]'), `${doc} ต้องถูกปิด`).toBeVisible();
      await expect(page.getByRole('link', { name: 'ส่งออก CSV' })).toHaveCount(0);
      const csv = await ctx.request.get(`/finance/tax/csv?doc=${doc}`);
      expect(csv.status(), `CSV ของ ${doc}`).toBe(403);
    }
    const vat = await ctx.request.get('/finance/tax/csv?doc=vat-out');
    expect(vat.status(), 'CSV ภาษีขายยังส่งออกได้').toBe(200);
    await page.goto('/finance/tax/cert?employee=00000000-0000-4000-8000-000000000000&year=2026');
    await expect(page).toHaveURL(/\/\?denied=finance\.payroll/);
  } finally {
    await ctx.close();
    await unsetPlus();
  }
});
