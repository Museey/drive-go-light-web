/**
 * บัญชีธนาคารของอู่
 *
 * รุ่น 6.4 พิมพ์ชื่อธนาคาร เลขที่บัญชี และชื่อบัญชีลงบนใบเสร็จ ใบวางบิล
 * และแบบฟอร์มเปล่า ของเราไม่มีเลยทั้งคอลัมน์ ช่องกรอก และบรรทัดบนกระดาษ —
 * **อู่ออกใบเสร็จแล้วลูกค้าไม่รู้ว่าจะโอนเงินไปที่ไหน**
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('บัญชีธนาคารของอู่', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่มีบัญชี'), ('อู่ยังไม่กรอก') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  const bankOf = async (t: string) => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
    const { rows } = await app.query(
      `select bank_name, bank_account_no, bank_account_name
         from tenants where id = current_tenant_id()`);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    return rows[0];
  };

  it('อู่ที่ยังไม่กรอก ได้ค่าว่าง ไม่ใช่ null — หน้าพิมพ์จะได้ไม่ต้องกัน null', async () => {
    expect(await bankOf(otherTenant)).toEqual({
      bank_name: '', bank_account_no: '', bank_account_name: '',
    });
  });

  it('กรอกแล้วบันทึกได้ครบสามช่อง', async () => {
    await app.query(
      `update tenants set bank_name=$1, bank_account_no=$2, bank_account_name=$3
        where id = current_tenant_id()`,
      ['กสิกรไทย', '123-4-56789-0', 'อู่ ช่างเอ ออโต้เซอร์วิส']);

    expect(await bankOf(tenantId)).toEqual({
      bank_name: 'กสิกรไทย',
      bank_account_no: '123-4-56789-0',
      bank_account_name: 'อู่ ช่างเอ ออโต้เซอร์วิส',
    });
  });

  /*
   * ไม่บังคับรูปแบบเลขบัญชี เพราะแต่ละธนาคารเขียนไม่เหมือนกัน
   * บางที่มีขีด บางที่ไม่มี ความยาวต่างกัน — บังคับผิดแล้วอู่กรอกของจริงไม่ได้
   */
  it('เลขบัญชีรูปแบบไหนก็รับ', async () => {
    for (const acc of ['1234567890', '123-4-56789-0', '0123456789012', 'xxx-x-xxxxx-x']) {
      await expect(app.query(
        `update tenants set bank_account_no=$1 where id = current_tenant_id()`, [acc],
      )).resolves.toBeTruthy();
    }
  });

  it('บัญชีของอู่หนึ่งไม่โผล่ให้อีกอู่เห็น', async () => {
    await app.query(
      `update tenants set bank_name='กสิกรไทย' where id = current_tenant_id()`);
    expect((await bankOf(otherTenant)).bank_name).toBe('');
  });
});

describe('ไมเกรชัน 014', () => {
  it('เพิ่มคอลัมน์ครบสามช่องและตั้งค่าปริยายเป็นข้อความว่าง', () => {
    const sql = readFileSync(resolve(ROOT, 'db/014_shop_bank.sql'), 'utf8');
    for (const col of ['bank_name', 'bank_account_no', 'bank_account_name']) {
      expect(sql).toContain(`add column if not exists ${col}`);
    }
    /* if not exists ทำให้รันซ้ำได้ ซึ่งจำเป็นเพราะตัวรันจดว่ารันแล้วในทรานแซกชันเดียวกัน */
    expect(sql.match(/add column if not exists/g)).toHaveLength(3);
  });

  it('ภาพรวมสคีมา 001 มีคอลัมน์เดียวกัน — ติดตั้งใหม่ต้องได้ผลเท่าอัปเกรด', () => {
    const init = readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8');
    for (const col of ['bank_name', 'bank_account_no', 'bank_account_name']) {
      expect(init).toContain(col);
    }
  });
});
