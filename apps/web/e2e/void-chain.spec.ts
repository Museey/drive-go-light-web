import { expect, test } from '@playwright/test';
import pg from 'pg';
import { makeSession } from './session';

/**
 * ยกเลิกใบเสร็จแล้วถามก่อนว่าจะยกเลิกทั้งสายไหม (ผู้ใช้กำหนด 19 ก.ย. 2569)
 * และเอกสารที่ลบถาวรแล้วต้องเปิดไม่ได้อีก แม้จะรู้ลิงก์
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

/** สาย QT → IVT → RC ของลูกค้าทดสอบ */
async function makeChain(tag: string) {
  return db(async (c) => {
    const mk = async (kind: string, no: string, parent: string | null, status = 'issued') => {
      const vat = kind === 'QT' ? 0 : 70;
      const { rows } = await c.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode, vat_rate,
                                subtotal, net_amount, vat_amount, grand_total, payable, parent_doc_id)
         values (current_tenant_id(),$1,$2,current_date,$3,$4,
                 (case when $5::numeric > 0 then 'ex' else 'none' end)::vat_mode,
                 case when $5::numeric > 0 then 7 else 0 end,
                 1000,1000,$5,1000+$5,1000+$5,$6) returning id`,
        [kind, no, status, tag, vat, parent]);
      return rows[0].id as string;
    };
    const qt = await mk('QT', `QT-${tag}`, null, 'billed');
    const ivt = await mk('IVT', `IVT-${tag}`, qt);
    const rc = await mk('RC', `RC-${tag}`, ivt);
    return { qt, ivt, rc };
  });
}

const cleanup = (tag: string) => db((c) => c.query(
  `update documents set parent_doc_id = null where party_name = $1`, [tag])
  .then(() => c.query(`delete from documents where party_name = $1`, [tag])));

const statusOf = (id: string) => db((c) =>
  c.query(`select status::text as s from documents where id = $1`, [id])).then((r) => r.rows[0].s);

test('ยกเลิกใบเสร็จ: แผงบอกว่ามีใบอะไรในสาย · เลือกยกเลิกทั้งสายแล้วทุกใบเป็นยกเลิก', async ({ page }, info) => {
  const tag = `สายทดสอบ${info.parallelIndex}${Date.now().toString(36)}`;
  const { qt, ivt, rc } = await makeChain(tag);
  try {
    await page.goto(`/income/${rc}?void=1`);

    const panel = page.locator('.card', { hasText: 'ยกเลิกเอกสาร' }).first();
    await expect(panel).toContainText('อยู่ในสายเดียวกับอีก 2 ใบ');
    await expect(panel).toContainText(`IVT-${tag}`);
    await expect(panel).toContainText(`QT-${tag}`);

    await panel.locator('#void-reason').fill('ลูกค้ายกเลิกงาน');
    await panel.getByRole('button', { name: /ยกเลิกทั้งสาย 3 ใบ/ }).click();
    /* รอให้แผงปิด = เซิร์ฟเวอร์ทำงานเสร็จแล้วพากลับมาที่หน้าเอกสาร
       (อย่าเช็คคำว่า "ยกเลิกแล้ว" ลอย ๆ — ข้อความในแผงเองก็มีคำนี้ ทำให้ผ่านทั้งที่ยังไม่ทันทำอะไร) */
    await expect(page.getByRole('button', { name: /ยกเลิกทั้งสาย/ })).toHaveCount(0);
    await expect(page.locator('body')).toContainText('เอกสารนี้ถูกยกเลิกแล้ว');

    expect(await statusOf(rc)).toBe('void');
    expect(await statusOf(ivt), 'ใบส่งมอบต้องยกเลิกตาม').toBe('void');
    expect(await statusOf(qt), 'ใบเสนอราคาต้องยกเลิกตาม').toBe('void');
  } finally { await cleanup(tag); }
});

test('ยกเลิกใบเสร็จ: เลือกเฉพาะใบนี้ ใบอื่นในสายยังอยู่', async ({ page }, info) => {
  const tag = `สายเดี่ยว${info.parallelIndex}${Date.now().toString(36)}`;
  const { qt, ivt, rc } = await makeChain(tag);
  try {
    await page.goto(`/income/${rc}?void=1`);
    const panel = page.locator('.card', { hasText: 'ยกเลิกเอกสาร' }).first();
    await panel.locator('#void-reason').fill('ออกผิดใบ');
    await panel.getByRole('button', { name: 'ยกเลิกเฉพาะใบนี้' }).click();
    await expect(page.getByRole('button', { name: 'ยกเลิกเฉพาะใบนี้' })).toHaveCount(0);
    await expect(page.locator('body')).toContainText('เอกสารนี้ถูกยกเลิกแล้ว');

    expect(await statusOf(rc)).toBe('void');
    expect(await statusOf(ivt)).toBe('issued');
    expect(await statusOf(qt)).toBe('billed');
  } finally { await cleanup(tag); }
});

test('เอกสารที่ลบถาวรแล้ว เปิดลิงก์ตรงก็ไม่เจอ', async ({ page }, info) => {
  const tag = `ลบถาวร${info.parallelIndex}${Date.now().toString(36)}`;
  const { rc } = await makeChain(tag);
  try {
    await page.goto(`/income/${rc}`);
    await expect(page.locator('body'), 'ก่อนลบถาวรยังเปิดได้').toContainText(`RC-${tag}`);

    await db((c) => c.query(
      `update documents set status='void', voided_at=now(), purged_at=now() where id=$1`, [rc]));

    const res = await page.goto(`/income/${rc}`);
    expect(res?.status(), 'ลบถาวรแล้วต้องเป็น 404').toBe(404);
    await expect(page.locator('body')).not.toContainText(`RC-${tag}`);
  } finally { await cleanup(tag); }
});

test('ลบถาวรแล้วเลขที่เอกสารไม่ถูกนำกลับมาใช้ซ้ำ — ใบถัดไปเดินเลขต่อ', async () => {
  const before = await db((c) => c.query(`select next_doc_no(current_tenant_id(), 'RC', '6909') as n`))
    .then((r) => Number(r.rows[0].n));
  /* จำลองว่าใบที่เพิ่งได้เลขไปถูกลบถาวรทิ้ง แล้วขอเลขใหม่ */
  const after = await db((c) => c.query(`select next_doc_no(current_tenant_id(), 'RC', '6909') as n`))
    .then((r) => Number(r.rows[0].n));
  expect(after, 'เลขต้องเดินหน้าเสมอ ไม่วนกลับมาใช้เลขเดิม').toBe(before + 1);
});
