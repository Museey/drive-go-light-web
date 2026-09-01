/**
 * กู้คืนข้อมูลจากไฟล์สำรองทับอู่ที่มีอยู่แล้ว
 *
 * เรื่องนี้ลบข้อมูลจริงก่อนเขียนทับ ถ้าพลาดคืออู่เสียงานทั้งหมด
 * จึงต้องพิสูจน์สามข้อ: ของเดิมหายจริง ของใหม่เข้าครบจริง
 * และผู้ใช้งานกับการสมัครใช้บริการต้องไม่ถูกแตะ ไม่งั้นอู่เข้าระบบไม่ได้หลังกู้
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { exportBackupWith } from '../src/lib/backup';
import { parseBackupFile, previewBackup, restoreIntoTenant } from '../src/lib/restore-core';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('กู้คืนข้อมูลทับอู่เดิม', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let source: string;
  let target: string;
  let targetUserId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));

    /* อู่ต้นทาง — ข้อมูลชุดเต็มจากไฟล์ทดสอบ */
    source = (await importBackup(app, fixture, { openingStockDate: '2026-08-28' })).tenantId;

    /* อู่ปลายทาง — มีข้อมูลของตัวเองอยู่ก่อน จะถูกทับ */
    target = (await importBackup(app, fixture, {
      tenantName: 'อู่ปลายทาง', openingStockDate: '2026-08-28',
    })).tenantId;

    /* ปลายทางมีผู้ใช้ที่ตั้งรหัสผ่านแล้วและมีการสมัครใช้บริการอยู่ — สองอย่างนี้ห้ามหาย */
    const user = await admin.query(
      `insert into users (tenant_id, code, name, email, role, perms, password_hash)
       values ($1, 'U99', 'เจ้าของอู่ปลายทาง', 'target@example.com', 'owner',
               array['customer','income','expense','stock','finance','settings'], 'scrypt$x')
       returning id`,
      [target],
    );
    targetUserId = user.rows[0].id;
    await admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, 'light-yearly', current_date, current_date + 365)`,
      [target],
    );

    /* ปลายทางมีเอกสารที่ต้นทางไม่มี ไว้ดูว่าถูกลบจริง */
    await admin.query(
      `insert into contacts (tenant_id, code, kind, first_name)
       values ($1, 'CUS-9999', 'customer', 'ลูกค้าที่ต้องหายไป')`,
      [target],
    );

    /* ปลายทางเคยวางบิลไว้ — billnote_docs.doc_id เป็น on delete restrict
       ถ้าลำดับการล้างไม่ตัดสายใบวางบิลก่อน การกู้คืนจะล้มด้วย foreign key */
    const bn = await admin.query(
      `insert into billnotes (tenant_id, no, bill_date, party_name)
       values ($1, 'BN-ปลายทาง-001', '2026-08-01', 'ลูกค้าที่ต้องหายไป') returning id`,
      [target],
    );
    const someDoc = await admin.query(
      `select id from documents where tenant_id = $1 limit 1`, [target],
    );
    await admin.query(
      `insert into billnote_docs (tenant_id, billnote_id, doc_id) values ($1,$2,$3)`,
      [target, bn.rows[0].id, someDoc.rows[0].id],
    );

    /* ต้นทางก็มีใบวางบิลของตัวเอง ไว้ดูว่าตามมาครบ */
    await app.query(`select set_config('app.tenant_id', $1, false)`, [source]);
    const srcDocs = await admin.query(
      `select id from documents where tenant_id = $1 and kind = 'IVT' order by doc_no limit 2`,
      [source],
    );
    const srcBn = await admin.query(
      `insert into billnotes (tenant_id, no, bill_date, party_name, total_snapshot)
       values ($1, 'BN-ต้นทาง-001', '2026-08-02', 'ลูกค้าต้นทาง', 4500) returning id`,
      [source],
    );
    for (const d of srcDocs.rows) {
      await admin.query(
        `insert into billnote_docs (tenant_id, billnote_id, doc_id) values ($1,$2,$3)`,
        [source, srcBn.rows[0].id, d.id],
      );
    }

    /* กู้คืนไฟล์ของต้นทางทับปลายทาง */
    const exported = await exportBackupWith(app);
    const file = parseBackupFile(JSON.stringify(exported));

    await app.query(`select set_config('app.tenant_id', $1, false)`, [target]);
    await app.query('begin');
    await restoreIntoTenant(app, target, file);
    await app.query('commit');
  }, 240_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  async function summary(tenantId: string) {
    const { rows } = await admin.query(
      `select
         (select count(*) from products   where tenant_id = $1)::int as products,
         (select count(*) from contacts   where tenant_id = $1)::int as contacts,
         (select count(*) from vehicles   where tenant_id = $1)::int as vehicles,
         (select count(*) from documents  where tenant_id = $1)::int as documents,
         (select count(*) from doc_items  where tenant_id = $1)::int as items,
         (select count(*) from payments   where tenant_id = $1)::int as payments,
         (select coalesce(sum(grand_total), 0) from documents where tenant_id = $1) as total,
         (select coalesce(sum(qty_delta), 0) from stock_moves where tenant_id = $1) as stock`,
      [tenantId],
    );
    return rows[0];
  }

  it('ข้อมูลปลายทางเหมือนไฟล์ที่กู้คืนมาทุกตาราง', async () => {
    const a = await summary(source);
    const b = await summary(target);

    expect(b.products).toBe(a.products);
    expect(b.contacts).toBe(a.contacts);
    expect(b.vehicles).toBe(a.vehicles);
    expect(b.documents).toBe(a.documents);
    expect(b.items).toBe(a.items);
    expect(b.payments).toBe(a.payments);
    expect(n(b.total)).toBe(n(a.total));
    expect(n(b.stock)).toBe(n(a.stock));
    expect(a.documents).toBeGreaterThan(700);
  });

  it('ข้อมูลเดิมของปลายทางถูกลบจริง ไม่ใช่เขียนซ้อนทับกัน', async () => {
    const { rows } = await admin.query(
      `select count(*)::int as c from contacts
        where tenant_id = $1 and first_name = 'ลูกค้าที่ต้องหายไป'`,
      [target],
    );
    expect(rows[0].c).toBe(0);
  });

  /**
   * ใบวางบิลของปลายทางล็อกเอกสารไว้ด้วย on delete restrict
   * ถ้าลำดับการล้างผิด การกู้คืนจะพังทั้งชุด — และพังตอนที่ผู้ใช้กดปุ่มจริงเท่านั้น
   */
  it('ใบวางบิลเดิมของปลายทางถูกล้างทิ้ง แล้วรับใบวางบิลจากไฟล์มาแทน', async () => {
    const { rows } = await admin.query(
      `select no, total_snapshot,
              (select count(*)::int from billnote_docs bd where bd.billnote_id = b.id) as docs
         from billnotes b where b.tenant_id = $1 order by no`,
      [target],
    );
    expect(rows.map((r) => r.no)).toEqual(['BN-ต้นทาง-001']);
    expect(n(rows[0].total_snapshot)).toBe(4500);
    expect(rows[0].docs).toBe(2);
  });

  it('ผู้ใช้งานและรหัสผ่านไม่ถูกแตะ — ไม่งั้นอู่เข้าระบบไม่ได้หลังกู้', async () => {
    const { rows } = await admin.query(
      `select code, email, role::text as role, password_hash from users where id = $1`,
      [targetUserId],
    );
    expect(rows[0]).toMatchObject({
      code: 'U99', email: 'target@example.com', role: 'owner', password_hash: 'scrypt$x',
    });
  });

  it('การสมัครใช้บริการของปลายทางยังอยู่ ไม่ถูกแทนที่ด้วยลิขสิทธิ์ในไฟล์', async () => {
    const { rows } = await admin.query(
      `select count(*)::int as c from subscriptions where tenant_id = $1`, [target],
    );
    expect(rows[0].c).toBe(1);
  });

  it('อู่ต้นทางไม่ถูกแตะเลย', async () => {
    const a = await summary(source);
    expect(a.documents).toBeGreaterThan(700);
    const { rows } = await admin.query(
      `select name from tenants where id = $1`, [source],
    );
    expect(rows[0].name).not.toBe('อู่ปลายทาง');
  });

  it('ไฟล์ที่ไม่ใช่ไฟล์สำรองถูกปฏิเสธก่อนแตะข้อมูล', () => {
    expect(() => parseBackupFile('ไม่ใช่ JSON')).toThrow(/ไม่ใช่ไฟล์ JSON/);
    expect(() => parseBackupFile('{"shop":{}}')).toThrow(/ไฟล์สำรองไม่ถูกต้อง/);
  });

  it('ตรวจไฟล์ก่อนได้โดยไม่แตะข้อมูลเดิม', async () => {
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const before = await summary(target);

    const p = previewBackup(JSON.stringify(fixture));
    expect(p.counts.products).toBeGreaterThan(0);
    expect(p.dropped).toEqual([]);
    expect(p.needsAcknowledgement).toBe(false);

    /* สำคัญ: ตรวจแล้วข้อมูลต้องเท่าเดิมทุกตาราง */
    expect(await summary(target)).toEqual(before);
  });

  it('ไฟล์แบบ 6.4 บอกล่วงหน้าว่ากลุ่มไหนจะไม่ตามมา และต้องให้ยืนยันก่อน', () => {
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const v64 = {
      ...fixture,
      billnotes: [{ id: 'b1' }, { id: 'b2' }],
      claims: [{ id: 'c1' }],
      counts: [{ id: 'ct1' }],
      moves: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    };

    const p = previewBackup(JSON.stringify(v64));
    /* ใบวางบิลรองรับแล้วตั้งแต่ช่วงที่ 3 จึงไม่อยู่ในรายการที่จะหาย */
    expect(p.dropped.map((g) => [g.key, g.count])).toEqual([
      ['claims', 1], ['counts', 1], ['moves', 3],
    ]);
    expect(p.needsAcknowledgement).toBe(true);
  });
});
