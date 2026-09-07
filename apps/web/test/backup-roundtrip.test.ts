/**
 * ส่งออกแล้วนำกลับเข้าใหม่ ยอดต้องเท่าเดิมทุกบาท
 *
 * ไฟล์สำรองคือสัญญาที่ให้ไว้กับลูกค้าว่าข้อมูลเป็นของเขา ไม่ใช่ของเรา
 * ถ้าส่งออกแล้วนำกลับเข้าไม่ได้ หรือได้ตัวเลขไม่ตรง สัญญานั้นก็ไม่มีความหมาย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { readPic, savePic, sha256 } from '../src/lib/pics';
import { exportBackupWith } from '../src/lib/backup';
import { openInvoices, saveBillnote } from '../src/lib/billnotes';
import { saveClaim } from '../src/lib/claims';
import {
  addCountItems, applyCount, createCount, getCount, setCountedQty,
} from '../src/lib/stock-counts';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

const PICS = resolve(here, 'fixtures/pics');
const picFull = new Uint8Array(readFileSync(join(PICS, 'small.jpg')));
const picThumb = new Uint8Array(readFileSync(join(PICS, 'small.png')));

describe.skipIf(!DB_URL)('ส่งออกแล้วนำกลับเข้า', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let firstTenant: string;
  let secondTenant: string;
  let billnoteTotal = 0;
  let billnoteDocNos: string[] = [];
  const claimNos: string[] = [];
  let claimCost = 0;
  let countNo = '';
  let countedTo = 0;
  let picProductCode = '';

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      -- role อยู่ระดับคลัสเตอร์ จึงค้างข้ามการรันเทสต์และอาจถูกใช้โดยฐานข้อมูลอื่นอยู่
      -- ล้างเฉพาะสิทธิ์ในฐานข้อมูลนี้ แล้วให้ app-role.sql สร้างกลับ (รันซ้ำได้)
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

    /* อู่แรก: นำเข้าจากไฟล์ชุดทดสอบ */
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const first = await importBackup(app, fixture, { openingStockDate: '2026-08-28' });
    firstTenant = first.tenantId;

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);

    /* ใส่รูปให้สินค้าตัวหนึ่ง ไฟล์สำรองจะได้มีรูปให้พิสูจน์ว่าไปกลับแล้วยังเท่าเดิม */
    const anyProduct = await app.query('select id, code from products order by code limit 1');
    picProductCode = anyProduct.rows[0].code;
    await savePic(app, anyProduct.rows[0].id, picFull, picThumb);

    /* วางบิลลูกค้าที่ค้างมากที่สุดไว้หนึ่งใบ ไฟล์สำรองจะได้มีใบวางบิลให้พิสูจน์ */
    const open = await openInvoices(app);
    const topParty = open[0]!.partyId ?? null;
    const picked = open
      .filter((v) => (v.partyId ?? null) === topParty)
      .slice(0, 4);
    billnoteTotal = Math.round(picked.reduce((t, v) => t + v.outstanding, 0) * 100) / 100;
    billnoteDocNos = picked.map((v) => v.docNo).sort();
    await saveBillnote(app, {
      billDate: '2026-08-28', dueDate: '2026-09-15',
      partyId: topParty, partyName: picked[0]!.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: 'สมชาย', note: '',
      docIds: picked.map((v) => v.id),
    }, null);

    /* เคลมสินค้าออกไปหนึ่งใบต่อทิศทาง ไฟล์สำรองจะได้มีใบเคลมให้พิสูจน์ */
    /**
     * อ่านผ่าน role ของแอป ไม่ใช่ผู้ดูแล
     *
     * product_stock เป็นวิว ซึ่ง Postgres ประเมินสิทธิ์ด้วย **เจ้าของวิว**
     * ไม่ใช่คนเรียก และเจ้าของวิวก็โดน force row level security เหมือนกัน
     * ผู้ดูแลที่ไม่ได้ตั้ง app.tenant_id จึงได้ศูนย์แถวเสมอ
     *
     * บนเครื่องจริงเป็นแบบนี้อยู่แล้ว — ที่เคยผ่านเพราะฐานทดสอบมีเจ้าของ
     * เป็น superuser ซึ่งข้าม RLS ได้เอง
     */
    const prod = await app.query(
      `select p.id, p.code, p.name, p.unit from products p
       join product_stock s on s.product_id = p.id
       where s.qty_on_hand > 5 limit 1`,
    );
    const part = prod.rows[0];
    const line = (q: number) => [{
      productId: part.id as string, code: part.code as string, oem: '',
      name: part.name as string, unit: part.unit as string, qty: q, unitCost: 0,
    }];
    const cl = await saveClaim(app, {
      side: 'customer', kind: 'warranty', claimDate: '2026-08-28',
      partyId: null, partyName: 'ลูกค้าเคลม', partyTel: '08x-xxx-xxxx',
      refNo: 'RC-อ้างอิง-001', vehicleId: null,
      vehicle: { brand: 'Toyota', model: 'Vios' }, vehiclePlate: 'กข 1234',
      reason: 'อยู่ในระยะรับประกัน', byWhom: 'สมชาย', note: 'ทดสอบ',
      items: line(2),
    }, null);
    claimNos.push(cl.no);
    claimCost = cl.cost;
    const vc = await saveClaim(app, {
      side: 'vendor', kind: 'defect', claimDate: '2026-08-28',
      partyId: null, partyName: 'ร้านอะไหล่', partyTel: '',
      refNo: 'PO-อ้างอิง-001', vehicleId: null, vehicle: null, vehiclePlate: '',
      reason: 'ชำรุดจากโรงงาน', byWhom: '', note: '',
      items: line(1),
    }, null);
    claimNos.push(vc.no);

    /* ตั้งบาร์โค้ดให้สินค้าตัวนั้น ไฟล์สำรองจะได้มีบาร์โค้ดให้พิสูจน์ */
    await admin.query(`update products set barcode = 'DGROUND01' where id = $1`, [part.id]);

    /* ตรวจนับหนึ่งใบและปรับยอดจริง ไฟล์สำรองจะได้มีใบตรวจนับให้พิสูจน์ */
    const ct = await createCount(app, { countDate: '2026-08-28', note: 'ตรวจนับก่อนส่งออก' }, null);
    await addCountItems(app, ct.id, [part.id as string]);
    const opened = await getCount(app, ct.id);
    countedTo = Math.max(0, (opened!.items[0]!.systemQty ?? 0) - 2);
    await setCountedQty(app, opened!.items[0]!.id, countedTo);
    await applyCount(app, ct.id, null);
    countNo = ct.no;

    /* ส่งออกจากอู่แรก แล้วนำเข้าเป็นอู่ที่สอง */
    const exported = await exportBackupWith(app);

    const second = await importBackup(app, exported as never, { openingStockDate: '2026-08-28' });
    secondTenant = second.tenantId;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /** ยอดสรุปของอู่หนึ่งราย อ่านด้วยสิทธิ์ผู้ดูแลเพื่อข้าม RLS ในการเทียบ */
  async function summary(tenantId: string) {
    const { rows } = await admin.query(
      `select
         (select count(*) from products where tenant_id = $1)::int as products,
         (select count(*) from contacts where tenant_id = $1)::int as contacts,
         (select count(*) from vehicles where tenant_id = $1)::int as vehicles,
         (select count(*) from documents where tenant_id = $1)::int as documents,
         (select count(*) from doc_items where tenant_id = $1)::int as items,
         (select count(*) from payments where tenant_id = $1)::int as payments,
         (select coalesce(sum(grand_total), 0) from documents
           where tenant_id = $1 and direction = 'sell' and kind <> 'QT') as sell_total,
         (select coalesce(sum(wht_amount), 0) from documents
           where tenant_id = $1 and direction = 'sell') as sell_wht,
         (select coalesce(sum(payable), 0) from documents
           where tenant_id = $1 and direction = 'buy') as buy_total,
         (select coalesce(sum(amount), 0) from payments where tenant_id = $1) as paid,
         (select coalesce(sum(qty_delta), 0) from stock_moves where tenant_id = $1) as stock`,
      [tenantId],
    );
    return rows[0];
  }

  it('จำนวนแถวเท่ากันทุกตาราง', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(b.products).toBe(a.products);
    expect(b.contacts).toBe(a.contacts);
    expect(b.vehicles).toBe(a.vehicles);
    expect(b.documents).toBe(a.documents);
    expect(b.items).toBe(a.items);
    expect(b.payments).toBe(a.payments);
    expect(a.documents).toBeGreaterThan(700);
  });

  it('ยอดเงินเท่ากันทุกบาท', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(n(b.sell_total)).toBe(n(a.sell_total));
    expect(n(b.sell_wht)).toBe(n(a.sell_wht));
    expect(n(b.buy_total)).toBe(n(a.buy_total));
    expect(n(b.paid)).toBe(n(a.paid));
    expect(n(a.sell_total)).toBeGreaterThan(0);
  });

  it('ยอดสต๊อกรวมเท่ากัน', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);
    expect(n(b.stock)).toBe(n(a.stock));
  });

  it('สายเอกสารยังผูกครบเหมือนเดิม', async () => {
    const count = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select count(*)::int as c from documents d
         join documents p on p.id = d.parent_doc_id
         where d.tenant_id = $1`,
        [tenantId],
      );
      return rows[0].c;
    };
    const a = await count(firstTenant);
    expect(await count(secondTenant)).toBe(a);
    expect(a).toBeGreaterThan(40);
  });

  it('เลขที่เอกสารชุดเดิมถูกยกมาด้วย ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const seqs = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select kind::text as kind, last_no from doc_sequences where tenant_id = $1 order by kind`,
        [tenantId],
      );
      return Object.fromEntries(rows.map((r) => [r.kind, n(r.last_no)]));
    };
    expect(await seqs(secondTenant)).toEqual(await seqs(firstTenant));
  });

  /**
   * ใบวางบิลถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว แปลว่าตัวนำเข้าต้องรับได้จริง
   * ถ้ารับไม่ได้ อู่ที่ย้ายเข้ามาจะเสียใบวางบิลไปเงียบ ๆ โดยไม่มีคำเตือนใด ๆ
   */
  it('ใบวางบิลตามมาครบ ทั้งยอดที่แจ้งและใบที่รวมไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select b.no, b.bill_date::text as bill_date, b.due_date::text as due_date,
                b.by_whom, b.total_snapshot,
                (select array_agg(d.doc_no order by d.doc_no)
                   from billnote_docs bd join documents d on d.id = bd.doc_id
                  where bd.billnote_id = b.id) as docs
         from billnotes b where b.tenant_id = $1 order by b.no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a).toHaveLength(1);
    expect(n(a[0].total_snapshot)).toBe(billnoteTotal);
    expect(a[0].docs.slice().sort()).toEqual(billnoteDocNos);

    expect(b).toHaveLength(1);
    expect(b[0].no).toBe(a[0].no);
    expect(b[0].bill_date).toBe(a[0].bill_date);
    expect(b[0].due_date).toBe(a[0].due_date);
    expect(b[0].by_whom).toBe(a[0].by_whom);
    expect(n(b[0].total_snapshot)).toBe(n(a[0].total_snapshot));
    expect(b[0].docs.slice().sort()).toEqual(billnoteDocNos);
  });

  it('ตัวนับเลขที่ใบวางบิลตามมาด้วย ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const last = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select last_no from billnote_sequences where tenant_id = $1`, [tenantId],
      );
      return rows[0] ? n(rows[0].last_no) : null;
    };
    expect(await last(secondTenant)).toBe(await last(firstTenant));
    expect(await last(firstTenant)).toBeGreaterThan(0);
  });

  /**
   * ใบเคลมถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว ตัวนำเข้าจึงต้องรับได้จริง
   * และต้อง **ไม่ตัดสต๊อกซ้ำ** — ยอดคงเหลือที่ส่งออกไปเป็นยอดหลังหักเคลมแล้ว
   */
  it('ใบเคลมตามมาครบทั้งสองทิศทาง พร้อมต้นทุนที่ตรึงไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select c.no, c.side::text as side, c.kind, c.claim_date::text as claim_date,
                c.party_name, c.ref_no, c.reason, c.vehicle_plate,
                coalesce(sum(i.cost_amount), 0) as cost
         from claims c left join claim_items i on i.claim_id = c.id
         where c.tenant_id = $1 group by c.id order by c.no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a.map((r) => r.no).sort()).toEqual([...claimNos].sort());
    expect(b.map((r) => r.no).sort()).toEqual([...claimNos].sort());

    for (const [i, row] of a.entries()) {
      expect(b[i].no).toBe(row.no);
      expect(b[i].side).toBe(row.side);
      expect(b[i].kind).toBe(row.kind);
      expect(b[i].claim_date).toBe(row.claim_date);
      expect(b[i].party_name).toBe(row.party_name);
      expect(b[i].ref_no).toBe(row.ref_no);
      expect(b[i].reason).toBe(row.reason);
      expect(b[i].vehicle_plate).toBe(row.vehicle_plate);
      expect(n(b[i].cost)).toBe(n(row.cost));
    }
    expect(claimCost).toBeGreaterThan(0);
  });

  it('อู่ที่นำเข้ามาไม่ถูกตัดสต๊อกซ้ำจากใบเคลม', async () => {
    const moves = await admin.query(
      `select count(*)::int as c from stock_moves
       where tenant_id = $1 and claim_id is not null`,
      [secondTenant],
    );
    expect(moves.rows[0].c).toBe(0);
  });

  it('ตัวนับเลขที่ใบเคลมตามมาแยกตามทิศทาง', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select side::text as side, last_no from claim_sequences
         where tenant_id = $1 order by side`,
        [tenantId],
      );
      return rows.map((r) => [r.side, n(r.last_no)]);
    };
    expect(await read(secondTenant)).toEqual(await read(firstTenant));
    expect(await read(firstTenant)).toEqual([['customer', 1], ['vendor', 1]]);
  });

  /**
   * ใบตรวจนับถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว ตัวนำเข้าจึงต้องรับได้จริง
   * และต้อง **ไม่ปรับสต๊อกซ้ำ** — ยอดที่ส่งออกไปเป็นยอดหลังปรับแล้ว
   */
  it('ใบตรวจนับตามมาครบ พร้อมยอดระบบและต้นทุนที่ตรึงไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select c.no, c.count_date::text as count_date, c.note, c.status::text as status,
                i.counted_qty, i.system_qty, i.unit_cost
         from stock_counts c
         join stock_count_items i on i.count_id = c.id
         where c.tenant_id = $1 order by c.no, i.line_no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a).toHaveLength(1);
    expect(a[0].no).toBe(countNo);
    expect(a[0].status).toBe('applied');
    expect(n(a[0].counted_qty)).toBe(countedTo);

    expect(b).toHaveLength(1);
    expect(b[0].no).toBe(a[0].no);
    expect(b[0].count_date).toBe(a[0].count_date);
    expect(b[0].note).toBe(a[0].note);
    expect(b[0].status).toBe(a[0].status);
    expect(n(b[0].counted_qty)).toBe(n(a[0].counted_qty));
    expect(n(b[0].system_qty)).toBe(n(a[0].system_qty));
    expect(n(b[0].unit_cost)).toBe(n(a[0].unit_cost));
  });

  it('อู่ที่นำเข้ามาไม่ถูกปรับสต๊อกซ้ำจากใบตรวจนับ', async () => {
    const { rows } = await admin.query(
      `select count(*)::int as c from stock_moves
       where tenant_id = $1 and reason = 'count'`,
      [secondTenant],
    );
    expect(rows[0].c).toBe(0);
  });

  it('บาร์โค้ดของสินค้าตามไปด้วย ผูกกับสินค้าตัวเดิม', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select code, barcode from products
         where tenant_id = $1 and barcode is not null order by code`, [tenantId],
      );
      return rows.map((r) => [r.code, r.barcode]);
    };
    const a = await read(firstTenant);
    expect(a).toEqual([[expect.any(String), 'DGROUND01']]);
    expect(await read(secondTenant)).toEqual(a);
  });

  /**
   * สิทธิ์แบบละเอียดต้องรอดข้ามไฟล์สำรอง — ส่งออกเป็นรูปแบบของรุ่น 6.4
   * แล้วนำกลับเข้ามาต้องได้สิทธิ์เท่าเดิม ไม่ใช่ตกกลับไปเป็นค่าปริยาย
   */
  it('สิทธิ์แบบละเอียดของพนักงานตามไฟล์สำรองไปด้วย', async () => {
    await admin.query(
      `insert into users (tenant_id, code, name, email, role, perms, active)
       values ($1, 'U77', 'พนักงานสิทธิ์จำกัด', 'limited@example.com', 'staff',
               $2::jsonb, true)`,
      [firstTenant, JSON.stringify({
        menus: { stock: true, income: true },
        tabs: { 'stock.list': true, 'stock.count': false },
        edit: { 'stock.list': false },
        cost: false,
      })],
    );

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app) as unknown as Record<string, any>;
    const out = exported.users.find((u: any) => u.code === 'U77');

    /* รูปแบบต้องเป็นแบบ 6.4 — เมนูเป็นคีย์ระดับบน สิทธิ์รายแท็บอยู่ใน tabs/editTabs */
    expect(out.perms.stock).toBe(true);
    expect(out.perms.cost).toBe(false);
    expect(out.perms.tabs['stock.count']).toBe(false);
    expect(out.perms.editTabs['stock.list']).toBe(false);

    const back = await importBackup(app, exported as never, { openingStockDate: '2026-08-28' });
    const { rows } = await admin.query(
      `select perms from users where tenant_id = $1 and code = 'U77'`, [back.tenantId],
    );
    expect(rows[0].perms.menus).toEqual({ stock: true, income: true });
    expect(rows[0].perms.cost).toBe(false);
    expect(rows[0].perms.tabs['stock.count']).toBe(false);
    expect(rows[0].perms.edit['stock.list']).toBe(false);
  });

  it('ไฟล์สำรองไม่มีรหัสผ่านติดไปด้วย', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);
    const text = JSON.stringify(exported);

    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('passwordHash');
  });

  it('รูปสินค้าไปกลับแล้วยังเท่าเดิมทุกไบต์', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [secondTenant]);
    const p = await app.query('select id from products where code = $1', [picProductCode]);
    expect(p.rows[0], 'สินค้าที่มีรูปต้องถูกนำเข้ามาด้วย').toBeTruthy();

    const back = await readPic(app, p.rows[0].id, sha256(picFull), 'full');
    expect(back, 'รูปต้องตามมากับไฟล์สำรอง').not.toBeNull();
    expect(new Uint8Array(back!.bytes)).toEqual(picFull);

    const t = await readPic(app, p.rows[0].id, sha256(picFull), 'thumb');
    expect(new Uint8Array(t!.bytes), 'รูปย่อก็ต้องตามมา ไม่ใช่ถูกสร้างใหม่จากรูปเต็ม')
      .toEqual(picThumb);

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
  });

  it('ไฟล์สำรองเก็บรูปในรูปแบบเดียวกับรุ่น 6.4 เปิดที่นั่นได้', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const file = await exportBackupWith(app);

    const key = `p:${sha256(picFull)}`;
    expect(file._piclib, '_piclib คือชื่อที่รุ่น 6.4 ใช้').toHaveProperty(key);
    expect(file._piclib![key]).toMatch(/^data:image\/jpeg;base64,/);

    const prod = (file.products as any[]).find((x) => x.code === picProductCode);
    expect(prod.pics, 'ตัวสินค้าอ้างถึงรหัสรูป เหมือน p.pics ของรุ่นเดิม').toEqual([key]);

    expect(file._picthumbs, 'รูปย่ออยู่คนละคีย์ ซึ่งรุ่น 6.4 ข้ามไปเอง').toHaveProperty(key);
  });

  it('ไฟล์ที่ส่งออกผ่านการตรวจของตัวนำเข้าเอง', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);

    const { validateBackup } = await import('@drivegolight/importer');
    expect(validateBackup(exported)).toEqual([]);
  });
});
