/**
 * ล็อกเอกสารที่บันทึกแล้ว (แผน 17 ก.ย. 2569) — กติกาตามต้นแบบ
 *
 *   - ใบที่มีใบต่ออยู่แล้ว ออกใบต่อซ้ำไม่ได้ · ยกเลิกใบต่อแล้วออกใหม่ได้
 *   - แก้ในใบเดิมได้แม้ออกใบต่อแล้ว · ใบเสร็จและใบที่รับเงินแล้วแก้ไม่ได้
 *   - ยกเลิกได้แม้มีใบต่อ · ยกเลิกใบต่อแล้วใบเสนอราคากลับเป็นค้างส่งมอบ
 *   - กู้คืนใบต่อจากถังขยะ ต้องไม่ทำให้ใบต้นทางมีใบต่อสองใบ
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { activeChildWith, claimParentWith, editRuleWith } from '../src/lib/doc-lock';
import { voidSalesDocWith } from '../src/lib/sales-void';
import { restoreFromTrashWith } from '../src/lib/trash-core';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ล็อกเอกสารที่บันทึกแล้ว', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let appUrl: string;
  let tenantId: string;

  const addDoc = async (kind: string, no: string, parent: string | null = null): Promise<string> => {
    const { rows } = await app.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, parent_doc_id, status, vat_mode, payable, grand_total)
       values (current_tenant_id(), $1, $2, current_date, $3, 'issued', $4, 1000, 1000) returning id`,
      [kind, no, parent, kind === 'IV' ? 'none' : 'ex']);
    /* ตอนบันทึกใบต่อจริง ใบเสนอราคาต้นทางถูกตั้งเป็น billed — ทำแบบเดียวกัน */
    if (parent) await app.query(`update documents set status = 'billed' where id = $1 and kind = 'QT'`, [parent]);
    return rows[0].id as string;
  };
  const statusOf = async (id: string) =>
    (await app.query(`select status::text as s from documents where id = $1`, [id])).rows[0].s as string;
  const tx = async <T>(c: pg.Client, fn: () => Promise<T>): Promise<T> => {
    await c.query('begin');
    try { const r = await fn(); await c.query('commit'); return r; } catch (e) { await c.query('rollback'); throw e; }
  };
  const voidDoc = (id: string) => tx(app, () => voidSalesDocWith(app, id, 'ทดสอบ', null));
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ทดสอบล็อกเอกสาร') returning id`)).rows[0].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    appUrl = url.toString();
    app = new pg.Client({ connectionString: appUrl });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await app.query('delete from payments');
    await app.query('delete from documents');
  });

  /* ---------------- ออกใบต่อซ้ำ ---------------- */

  it('ใบเสนอราคาที่มีใบส่งมอบแล้ว ออกใบต่ออีกไม่ได้ — บอกว่าออกใบไหนไปแล้ว', async () => {
    const qt = await addDoc('QT', 'QT-1');
    await expect(tx(app, () => claimParentWith(app, qt))).resolves.toBeUndefined();
    await addDoc('IVT', 'IVT-1', qt);

    const err = await failure(tx(app, () => claimParentWith(app, qt)));
    expect(err?.message).toBe('QT-1 ออกใบส่งมอบงาน / ใบกำกับภาษี IVT-1 ต่อไปแล้ว — เปิดใบนั้น หรือยกเลิกใบนั้นก่อนจึงจะออกใหม่ได้');
    expect(await activeChildWith(app, qt)).toMatchObject({ docNo: 'IVT-1', kind: 'IVT' });
  });

  it('ใบส่งมอบที่มีใบเสร็จแล้ว ออกใบเสร็จอีกไม่ได้ · ยกเลิกใบเสร็จแล้วออกใหม่ได้', async () => {
    const iv = await addDoc('IV', 'IV-1');
    const rc = await addDoc('RC', 'RC-1', iv);
    expect((await failure(tx(app, () => claimParentWith(app, iv))))?.message).toMatch(/^IV-1 ออกใบเสร็จรับเงิน RC-1 ต่อไปแล้ว/);

    await voidDoc(rc);
    await expect(tx(app, () => claimParentWith(app, iv))).resolves.toBeUndefined();
    expect(await activeChildWith(app, iv)).toBeNull();
  });

  it('สองเครื่องกดออกใบต่อจากใบเดียวกันพร้อมกัน — ได้ใบเดียว', async () => {
    const qt = await addDoc('QT', 'QT-RACE');
    const other = new pg.Client({ connectionString: appUrl });
    await other.connect();
    try {
      await other.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
      await app.query('begin');
      await other.query('begin');
      await claimParentWith(app, qt);
      await app.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, parent_doc_id, status, vat_mode)
         values (current_tenant_id(), 'IVT', 'IVT-A', current_date, $1, 'issued', 'ex')`, [qt]);
      /* เครื่องที่สองต้องรอเครื่องแรก — ถ้าไม่รอ ทั้งคู่เห็นว่ายังว่างแล้วผ่านทั้งคู่ */
      const second = claimParentWith(other, qt).then(() => 'ok', (e: Error) => e.message);
      await new Promise((r) => setTimeout(r, 300));
      await app.query('commit');
      const got = await second;
      await other.query('rollback');
      expect(got).toMatch(/^QT-RACE ออกใบส่งมอบงาน \/ ใบกำกับภาษี IVT-A ต่อไปแล้ว/);
    } finally {
      await other.end();
    }
  });

  /* ---------------- แก้ไข ---------------- */

  it('แก้ในใบเดิมได้แม้ออกใบต่อแล้ว (ใบเสนอราคา ใบส่งมอบ ใบกำกับภาษี)', async () => {
    const qt = await addDoc('QT', 'QT-2');
    const iv = await addDoc('IVT', 'IVT-2', qt);
    await addDoc('RC', 'RC-2', iv);
    expect(await editRuleWith(app, qt)).toEqual({ ok: true });
    expect(await editRuleWith(app, iv)).toEqual({ ok: true });
  });

  it('ใบเสร็จ · ใบที่รับเงินแล้ว · ใบที่ยกเลิก แก้ไม่ได้ พร้อมเหตุผล', async () => {
    const rc = await addDoc('RC', 'RC-3');
    expect(await editRuleWith(app, rc)).toEqual({
      ok: false, reason: 'ใบเสร็จตัดสต๊อกแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่',
    });

    const iv = await addDoc('IV', 'IV-3');
    await app.query(
      `insert into payments (tenant_id, doc_id, paid_on, amount, method) values (current_tenant_id(), $1, current_date, 100, 'เงินสด')`, [iv]);
    expect(await editRuleWith(app, iv)).toEqual({
      ok: false, reason: 'ใบนี้รับเงินแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่',
    });

    const qt = await addDoc('QT', 'QT-3');
    await voidDoc(qt);
    expect(await editRuleWith(app, qt)).toEqual({ ok: false, reason: 'เอกสารนี้ถูกยกเลิกแล้ว' });
  });

  /* ---------------- ยกเลิก ---------------- */

  it('ยกเลิกใบที่มีใบต่อได้ — ใบต่อยังอยู่', async () => {
    const qt = await addDoc('QT', 'QT-4');
    const iv = await addDoc('IVT', 'IVT-4', qt);
    await voidDoc(qt);
    expect(await statusOf(qt)).toBe('void');
    expect(await statusOf(iv)).toBe('issued');
  });

  it('ยกเลิกใบส่งมอบ → ใบเสนอราคากลับเป็นค้างส่งมอบ · ยังมีใบต่ออีกใบ → ไม่กลับ', async () => {
    const qt = await addDoc('QT', 'QT-5');
    const iv = await addDoc('IVT', 'IVT-5', qt);
    await voidDoc(iv);
    expect(await statusOf(qt)).toBe('issued');

    /* ข้อมูลเก่าที่มีใบต่อสองใบ (ก่อนมีการกัน) — ยกเลิกใบเดียวยังไม่ถือว่ากลับมาค้าง */
    const qt2 = await addDoc('QT', 'QT-6');
    const a = await addDoc('IV', 'IV-6A', qt2);
    await addDoc('IVT', 'IVT-6B', qt2);
    await voidDoc(a);
    expect(await statusOf(qt2)).toBe('billed');
  });

  /* ---------------- กู้คืนจากถังขยะ ---------------- */

  it('กู้คืนใบต่อที่ยกเลิกไป ขณะที่ใบต้นทางมีใบต่อใบใหม่แล้ว — ไม่ได้', async () => {
    const qt = await addDoc('QT', 'QT-7');
    const first = await addDoc('IVT', 'IVT-7A', qt);
    await voidDoc(first);
    await addDoc('IVT', 'IVT-7B', qt);

    const err = await failure(tx(app, () => restoreFromTrashWith(app, 'doc', first, null)));
    expect(err?.message).toBe('กู้คืนไม่ได้ — QT-7 ออกใบส่งมอบงาน / ใบกำกับภาษี IVT-7B ต่อไปแล้ว');
    expect(await statusOf(first)).toBe('void');
  });

  it('กู้คืนใบต่อที่ใบต้นทางยังว่าง — ใบเสนอราคากลับเป็นออกใบต่อแล้ว', async () => {
    const qt = await addDoc('QT', 'QT-8');
    const iv = await addDoc('IVT', 'IVT-8', qt);
    await voidDoc(iv);
    expect(await statusOf(qt)).toBe('issued');

    await tx(app, () => restoreFromTrashWith(app, 'doc', iv, null));
    expect(await statusOf(iv)).toBe('issued');
    expect(await statusOf(qt)).toBe('billed');
  });
});
