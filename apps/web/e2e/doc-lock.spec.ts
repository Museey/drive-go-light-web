import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ยอดชำระบนใบเสร็จ · ปุ่มย้อนกลับหน้าพิมพ์ · สถานะ "เรียบร้อย" · ล็อกเอกสารที่บันทึกแล้ว
 * (PLAN-doc-lock-receipt-pay-2569-09-17.md) — ทำตามขั้นตอนที่ผู้ใช้ทดสอบแล้วเจอปัญหา
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

const confirmSave = (page: Page) => page.getByRole('dialog', { name: 'ยืนยันการบันทึก' });
const gate = (page: Page) => page.getByRole('dialog', { name: 'เอกสารได้บันทึกเรียบร้อยแล้ว' });
const tagOf = (name: string, idx: number) => `${name}${idx}${Date.now().toString(36)}`;

/** ลบเอกสารทดสอบทั้งสาย — ใบลูกก่อนใบแม่ (parent_doc_id อ้างถึงกัน) */
const cleanup = (tag: string) => db(async (c) => {
  const t = await c.query(`select tenant_id from users where role = 'owner' order by created_at limit 1`);
  await c.query(`select set_config('app.tenant_id', $1, false)`, [t.rows[0].tenant_id]);
  for (let i = 0; i < 4; i++) {
    await c.query(
      `delete from documents d where d.party_name = $1
         and not exists (select 1 from documents x where x.parent_doc_id = d.id)`, [tag]);
  }
});

/** กรอกบรรทัดสินค้าที่พิมพ์ชื่อเอง (ไม่ผูกทะเบียน ไม่ตัดสต๊อก) ไม่ใช่ค่าแรง — ไม่มีหัก ณ ที่จ่ายมาปนตัวเลข */
async function partLine(page: Page, price: number) {
  const row = page.locator('table.lines tbody tr').first();
  await row.locator('td.c-name input').fill('ผ้าเบรกหน้าทดสอบ');
  await row.locator('td.c-price input').fill(String(price));
}

const baht = (s: string) => Number(s.replace(/[^\d.]/g, ''));

/* ---------- ข้อ 1 — ขายหน้าร้านชำระบางส่วน → พิมพ์ ---------- */

test('ขายหน้าร้านชำระบางส่วน → หน้าพิมพ์ใบเสร็จมี ชำระแล้ว + คงค้างชำระ · มีปุ่มย้อนกลับ · ไม่ติดไปบนกระดาษ', async ({ page }, info) => {
  const tag = tagOf('ลูกค้าหน้าร้านทดสอบ', info.parallelIndex);
  try {
    await page.goto('/income/walkin');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    await partLine(page, 1500);
    await page.getByRole('button', { name: 'ชำระบางส่วน — กรอกยอด' }).click();
    await page.locator('[id="pay-เงินสด"]').fill('500');
    await page.getByRole('button', { name: '🖨 พิมพ์เอกสาร' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();

    await expect(page).toHaveURL(/\/income\/[0-9a-f-]{36}\/print/);
    const totals = page.locator('table.totals2').last();
    /* ขายหน้าร้านคิด VAT 7% ตั้งต้น — ยอดรวมจึงไม่ใช่ 1,500 คงค้าง = รวมทั้งสิ้น − 500 */
    const grand = baht(await totals.locator('tr').filter({ hasText: 'รวมทั้งสิ้น' }).locator('td').last().innerText());
    expect(grand).toBeGreaterThan(500);
    expect(baht(await totals.locator('tr.pay-paid td').last().innerText())).toBe(500);
    expect(baht(await totals.locator('tr.pay-out td').last().innerText())).toBeCloseTo(grand - 500, 2);
    await expect(totals.locator('tr.pay-wht'), 'ไม่มีหัก ณ ที่จ่าย ไม่ต้องมีบรรทัดหัก').toHaveCount(0);

    const back = page.locator('.backfab');
    await expect(back).toBeVisible();
    const box = (await back.boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(vh - (box.y + box.height), 'หน้าพิมพ์ไม่มีแถบล่าง ปุ่มชิดล่าง').toBeLessThan(30);

    await page.emulateMedia({ media: 'print' });
    await expect(back, 'ปุ่มไม่ติดไปบนกระดาษ').toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    await back.click();
    await expect(page).toHaveURL(/\/income\/walkin/);
  } finally {
    await cleanup(tag);
  }
});

test('ใบเสร็จชำระครบ: คงค้างชำระ 0.00 · ใบเสนอราคาพิมพ์ไม่มีบรรทัดชำระ', async ({ page }) => {
  const r = await db((c) => c.query(
    `select (select d.id from documents d where d.kind = 'RC' and d.status <> 'void' and d.purged_at is null
               and d.wht_amount = 0
               and (select coalesce(sum(amount), 0) from payments p where p.doc_id = d.id) >= d.payable
             order by d.doc_date desc limit 1) as rc,
            (select id from documents where kind = 'QT' and purged_at is null order by doc_date desc limit 1) as qt`));
  test.skip(!r.rows[0].rc || !r.rows[0].qt, 'ข้อมูลตัวอย่างไม่มีใบที่ต้องใช้');

  await page.goto(`/income/${r.rows[0].rc}/print`);
  const totals = page.locator('table.totals2').last();
  expect(baht(await totals.locator('tr.pay-out td').last().innerText())).toBe(0);
  expect(baht(await totals.locator('tr.pay-paid td').last().innerText()))
    .toBe(baht(await totals.locator('tr').filter({ hasText: 'รวมทั้งสิ้น' }).locator('td').last().innerText()));

  await page.goto(`/income/${r.rows[0].qt}/print`);
  await expect(page.locator('tr.pay-paid, tr.pay-out')).toHaveCount(0);
  await expect(page.locator('.backfab')).toBeVisible();
});

test('หน้าพิมพ์ที่เปิดในแท็บใหม่ — ปุ่มย้อนกลับพาไปหน้าเอกสาร', async ({ page, context }) => {
  const r = await db((c) => c.query(
    `select id from documents where kind = 'RC' and purged_at is null order by doc_date desc limit 1`));
  /* เปิดแท็บใหม่แบบที่ปุ่ม "พิมพ์เอกสาร" (target=_blank) ทำ — แท็บใหม่ไม่มีหน้าก่อนหน้าในประวัติ */
  await page.goto('/income?hist=1');
  const opened = context.waitForEvent('page');
  await page.evaluate((href) => { window.open(href, '_blank', 'noopener'); }, `/income/${r.rows[0].id}/print`);
  const fresh = await opened;
  await fresh.waitForLoadState();
  await fresh.locator('.backfab').click();
  await expect(fresh).toHaveURL(new RegExp(`/income/${r.rows[0].id}$`));
  await fresh.close();
});

/* ---------- ข้อ 2–4 — ใบเสนอราคา → ใบกำกับภาษี → ใบเสร็จ ---------- */

test('ใบเสนอราคา → ใบกำกับภาษี → ใบเสร็จชำระบางส่วน: ประวัติ "เรียบร้อย" · ออกใบต่อซ้ำไม่ได้ · ใบเสร็จพิมพ์ยอดค้าง', async ({ page }, info) => {
  const tag = tagOf('ประเสริฐ ทองมากทดสอบ', info.parallelIndex);
  try {
    /* ใบเสนอราคาผ่านหน้าจอจริง */
    await page.goto('/income?kind=QT');
    await page.getByPlaceholder('พิมพ์ชื่อเพื่อค้นหา').first().fill(tag);
    /* ใบกำกับภาษีบังคับเลขประจำตัวผู้เสียภาษีของลูกค้า — กรอกตั้งแต่ใบเสนอราคา ใบต่อคัดลอกไป */
    await page.locator('.field').filter({ hasText: 'เลขประจำตัวผู้เสียภาษี' }).locator('input').first().fill('0105561234567');
    await partLine(page, 2000);
    await page.getByRole('button', { name: 'บันทึกใบเสนอราคา' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page).toHaveURL(/saved=sales&savedId=/);
    const qt = new URL(page.url()).searchParams.get('savedId')!;

    /* ออกใบกำกับภาษีจากหน้าใบเสนอราคา — เปิดฟอร์มเดียวกันค้างไว้อีกแท็บก่อน (สองเครื่อง/สองแท็บ) */
    await page.goto(`/income/${qt}`);
    await page.getByRole('link', { name: 'ออกใบส่งมอบงาน / ใบกำกับภาษี' }).click();
    await expect(page).toHaveURL(new RegExp(`from=${qt}`));
    const other = await page.context().newPage();
    await other.goto(page.url());
    await expect(other.locator('table.lines')).toBeVisible();

    await page.getByRole('button', { name: 'บันทึกใบส่งมอบงาน / ใบกำกับภาษี' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page).toHaveURL(/saved=sales&savedId=/);
    const ivt = new URL(page.url()).searchParams.get('savedId')!;

    /* แท็บที่เปิดค้างไว้กดบันทึกทีหลัง — เซิร์ฟเวอร์ต้องปฏิเสธ ไม่ใช่ได้ใบส่งมอบใบที่สอง */
    await other.getByRole('button', { name: 'บันทึกใบส่งมอบงาน / ใบกำกับภาษี' }).click();
    await confirmSave(other).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(other.locator('.err').filter({ hasText: 'ต่อไปแล้ว' })).toBeVisible();
    await other.close();
    const count = await db((c) => c.query(
      `select count(*)::int as n from documents where party_name = $1 and kind = 'IVT'`, [tag]));
    expect(count.rows[0].n, 'ใบส่งมอบจากใบเสนอราคาเดียวมีได้ใบเดียว').toBe(1);

    /* ใบเสนอราคาไม่อยู่ในตัวกรอง "เฉพาะงานค้างส่งมอบ" แล้ว (หน้าแรกนับจากสถานะเดียวกัน) */
    await page.goto(`/income?kind=QT&open=1&hist=1&q=${encodeURIComponent(tag)}`);
    await expect(page.locator(`a[href="/income/${qt}/print"], .doc-cards a[href="/income/${qt}"]`)).toHaveCount(0);

    /* ใบเสนอราคาที่ออกใบต่อแล้ว: ไม่มีปุ่มออกใบต่อ · ชิปเรียบร้อย */
    await page.goto(`/income/${qt}`);
    await expect(page.getByRole('link', { name: /^ออกใบ/ }), 'ออกใบต่อซ้ำไม่ได้').toHaveCount(0);
    await expect(page.locator('.chip.doc-status')).toHaveText('เรียบร้อย');

    /* พิมพ์ URL ออกใบต่อเอง → บอกเลยว่าออกต่อไปแล้ว ไม่มีฟอร์มให้กรอก */
    await page.goto(`/income/new?kind=IV&from=${qt}`);
    await expect(page.locator('.chain-taken')).toContainText('ต่อไปแล้ว');
    await expect(page.locator('table.lines')).toHaveCount(0);

    /* ประวัติแท็บทั้งหมด (ไม่ใช่แท็บใบเสนอราคา — ตรงนี้เคยขึ้นค้างส่งมอบ) */
    await page.goto(`/income?hist=1&q=${encodeURIComponent(tag)}`);
    const chipOf = async (id: string) => {
      const wide = (page.viewportSize()?.width ?? 0) >= 1280;
      return wide
        ? page.locator('table.hist tbody tr').filter({ has: page.locator(`a[href="/income/${id}/print"]`) }).locator('.chip').last()
        : page.locator(`.doc-cards a[href="/income/${id}"] .chip`).last();
    };
    await expect(await chipOf(qt), 'ใบเสนอราคาที่ออกใบส่งมอบแล้ว').toHaveText('เรียบร้อย');
    await expect(await chipOf(ivt), 'ใบกำกับภาษีที่บันทึกแล้ว').toHaveText('เรียบร้อย');

    /* ใบเสร็จจากใบกำกับภาษี ชำระบางส่วน แล้วพิมพ์ */
    await page.goto(`/income/${ivt}`);
    await page.getByRole('link', { name: 'ออกใบเสร็จรับเงิน' }).click();
    await page.getByRole('button', { name: 'ชำระบางส่วน — กรอกยอด' }).click();
    await page.locator('[id="pay-เงินสด"]').fill('700');
    await page.getByRole('button', { name: '🖨 พิมพ์เอกสาร' }).click();
    await confirmSave(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page).toHaveURL(/\/income\/[0-9a-f-]{36}\/print/);
    const totals = page.locator('table.totals2').last();
    const grand = baht(await totals.locator('tr').filter({ hasText: 'รวมทั้งสิ้น' }).locator('td').last().innerText());
    expect(baht(await totals.locator('tr.pay-paid td').last().innerText())).toBe(700);
    expect(baht(await totals.locator('tr.pay-out td').last().innerText())).toBeCloseTo(grand - 700, 2);

    /* ใบกำกับภาษีที่ออกใบเสร็จแล้ว ก็ออกใบเสร็จซ้ำไม่ได้ */
    await page.goto(`/income/${ivt}`);
    await expect(page.getByRole('link', { name: /^ออกใบ/ })).toHaveCount(0);
  } finally {
    await cleanup(tag);
  }
});

/* ---------- ข้อ 3 — popup แก้ไข / ยกเลิก ---------- */

test('กดแก้ไขใบที่ออกใบต่อแล้ว → popup → แก้ไขเอกสาร แก้ในใบเดิม เลขที่เดิม · popup → ยกเลิกเอกสาร → ประวัติขึ้นยกเลิก', async ({ page }, info) => {
  const tag = tagOf('ลูกค้าล็อกทดสอบ', info.parallelIndex);
  try {
    const ids = await db(async (c) => {
      const t = await c.query(`select tenant_id from users where role = 'owner' order by created_at limit 1`);
      await c.query(`select set_config('app.tenant_id', $1, false)`, [t.rows[0].tenant_id]);
      const mk = async (kind: string, no: string, parent: string | null) => (await c.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, parent_doc_id, status, party_name, vat_mode,
                                subtotal, net_amount, grand_total, payable)
         values (current_tenant_id(), $1, $2, current_date, $3, $4, $5, $6, 1000, 1000, 1000, 1000) returning id, doc_no`,
        [kind, no, parent, kind === 'QT' && parent === null ? 'billed' : 'issued', tag, kind === 'IV' ? 'none' : 'ex'])).rows[0];
      const q = await mk('QT', `QTLOCK${info.parallelIndex}${Date.now().toString(36)}`, null);
      const i = await mk('IV', `IVLOCK${info.parallelIndex}${Date.now().toString(36)}`, q.id);
      const r = await mk('RC', `RCLOCK${info.parallelIndex}${Date.now().toString(36)}`, null);
      for (const d of [q, i, r]) {
        await c.query(
          `insert into doc_items (tenant_id, doc_id, line_no, code, oem, name, unit, qty, unit_price, is_service, disc_pct)
           values (current_tenant_id(), $1, 1, '', '', 'รายการทดสอบ', 'ชิ้น', 1, 1000, false, 0)`, [d.id]);
      }
      return { qt: q, iv: i, rc: r };
    });

    /* แก้ไข → popup ถามก่อน ไม่ใช่เข้าฟอร์มทันที */
    await page.goto(`/income/${ids.qt.id}`);
    await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    const g = gate(page);
    await expect(g).toBeVisible();
    await expect(g).toContainText('ต้องการแก้ไขใช่หรือไม่');
    await expect(g).toContainText(ids.qt.doc_no);
    await g.getByRole('button', { name: 'ปิด' }).click();
    await expect(g).toHaveCount(0);

    await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    await gate(page).getByRole('link', { name: 'แก้ไขเอกสาร' }).click();
    await expect(page).toHaveURL(new RegExp(`/income/${ids.qt.id}/edit$`));
    await page.locator('table.lines tbody tr').first().locator('td.c-price input').fill('1200');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).first().click();
    await confirmSave(page).getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page).toHaveURL(/saved=sales/);
    const after = await db((c) => c.query(
      `select count(*)::int as n, max(doc_no) as no, max(grand_total) as total from documents where party_name = $1 and kind = 'QT'`, [tag]));
    expect(after.rows[0], 'แก้ในใบเดิม ไม่ได้สร้างใบใหม่').toMatchObject({ n: 1, no: ids.qt.doc_no });
    expect(Number(after.rows[0].total)).not.toBe(1000);

    /* popup → ยกเลิกเอกสาร (ใบที่มีใบต่อก็ยกเลิกได้ตามต้นแบบ) */
    await page.goto(`/income/${ids.qt.id}`);
    await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    await gate(page).getByRole('button', { name: 'ยกเลิกเอกสาร' }).click();
    await page.locator('#void-reason').fill('ทดสอบยกเลิกจาก popup');
    await page.getByRole('button', { name: 'ยืนยันยกเลิกเอกสาร' }).click();
    await expect(page.getByText('เอกสารนี้ถูกยกเลิกแล้ว')).toBeVisible();
    await expect(page.locator('.chip.doc-status')).toHaveText('ยกเลิก');

    await page.goto(`/income?hist=1&voided=1&q=${encodeURIComponent(tag)}`);
    const wide = (page.viewportSize()?.width ?? 0) >= 1280;
    const qtChip = wide
      ? page.locator('table.hist tbody tr').filter({ hasText: ids.qt.doc_no }).locator('.chip').last()
      : page.locator(`.doc-cards a[href="/income/${ids.qt.id}"] .chip`).last();
    await expect(qtChip).toHaveText('ยกเลิก');
    const ivStatus = await db((c) => c.query(`select status::text as s from documents where id = $1`, [ids.iv.id]));
    expect(ivStatus.rows[0].s, 'ใบต่อยังอยู่').toBe('issued');

    /* ใบเสร็จ: popup เปิดได้ แต่แก้ไขเอกสารจาง พร้อมเหตุผล */
    await page.goto(`/income/${ids.rc.id}`);
    await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    await expect(gate(page)).toContainText('ใบเสร็จตัดสต๊อกแล้ว แก้ไม่ได้');
    await expect(gate(page).locator('.btn.off')).toHaveText('แก้ไขเอกสาร');
    await expect(gate(page).getByRole('link', { name: 'แก้ไขเอกสาร' })).toHaveCount(0);
  } finally {
    await cleanup(tag);
  }
});

test('แถวประวัติ: ปุ่มแก้ไขเปิด popup (ไม่พาเข้าฟอร์มทันที และไม่เปิดหน้าเอกสาร)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1280, 'ปุ่มในแถวมีเฉพาะตาราง (เดสก์ท็อป)');
  await page.goto('/income?kind=QT&hist=1');
  const btn = page.locator('table.hist tbody tr .act-edit').first();
  await btn.click();
  await expect(gate(page)).toBeVisible();
  await gate(page).locator('header').click();
  /* การนำทางของแถวเกิดหลังคลิก — ตรวจ URL ทันทียังเป็นหน้าเดิมเสมอ ต้องรอให้ถ้ามันจะไป มันไปก่อน */
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname + new URL(page.url()).search, 'คลิกใน popup ต้องไม่ไหลไปเปิดหน้าเอกสารของแถว')
    .toBe('/income?kind=QT&hist=1');
  await expect(gate(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gate(page)).toHaveCount(0);
});
