/**
 * ใบตรวจนับสต๊อก
 *
 * สามเรื่องที่ต้องพิสูจน์ให้หนักที่สุด
 * 1. **ช่องว่างไม่ใช่ศูนย์** — ใบที่นับไปครึ่งเดียว ปรับยอดแล้วอีกครึ่งต้องไม่ถูกแตะ
 *    พลาดข้อนี้แล้วสต๊อกครึ่งร้านกลายเป็นศูนย์ และตามกติกาคือย้อนไม่ได้
 * 2. **ปรับยอดซ้ำใบเดิมไม่ได้** — กดสองครั้งแล้วสต๊อกต้องไม่ขยับรอบที่สอง
 * 3. **ส่วนต่างคิดจากยอด ณ ตอนกดปรับ** ไม่ใช่ตอนเปิดใบ
 *    ระหว่างที่นับค้างไว้อาจมีการขาย ถ้าใช้ยอดเก่าจะปรับผิดเท่าที่ขายไประหว่างนั้น
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  addCountItems, applyCount, createCount, deleteCount, getCount, listCounts,
  removeCountItem, saveCountHead, scanIntoCount, setCountedQty,
} from '../src/lib/stock-counts';
import { consumeStock, lotsOfProduct, receiveStock } from '../src/lib/stock-cost';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ใบตรวจนับสต๊อก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let brake: string;
  let oil: string;

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

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบตรวจนับ') returning id`);
    tenantId = t.rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    for (const t of ['stock_moves', 'stock_count_items', 'stock_counts',
                     'stock_count_sequences', 'doc_items', 'documents', 'products']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const p = await admin.query(
      `insert into products (tenant_id, code, oem, barcode, name, unit, last_cost, price_a)
       values ($1,'BRK-001','OEM-BRK','DGBRK001','ผ้าเบรกหน้า','ชุด',250,500),
              ($1,'OIL-001','OEM-OIL',null,'น้ำมันเครื่อง','ลิตร',120,220)
       returning id, code`,
      [tenantId],
    );
    brake = p.rows.find((r) => r.code === 'BRK-001').id;
    oil = p.rows.find((r) => r.code === 'OIL-001').id;
  });

  /** สองล็อตราคาต่างกัน — ทำให้ FIFO ต่างจากต้นทุนล่าสุด */
  async function twoLots(productId: string) {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1000, movedOn: '2026-01-10', reason: 'set',
    });
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1500, movedOn: '2026-02-10', reason: 'set',
    });
  }

  const onHand = async (productId: string): Promise<number> => {
    const r = await admin.query(
      `select coalesce(sum(qty_delta),0) as q from stock_moves where product_id = $1`,
      [productId],
    );
    return n(r.rows[0].q);
  };

  const moves = async (): Promise<number> => {
    const r = await admin.query(
      `select count(*)::int as c from stock_moves where reason = 'count' and tenant_id = $1`,
      [tenantId],
    );
    return n(r.rows[0].c);
  };

  /** ใบร่างที่มีสินค้าสองตัวอยู่ในนั้น */
  async function draft(): Promise<string> {
    const { id } = await createCount(app, { countDate: '2026-03-01', note: 'ตรวจนับประจำเดือน' }, null);
    await addCountItems(app, id, [brake, oil]);
    return id;
  }

  const itemOf = async (countId: string, productId: string) => {
    const c = await getCount(app, countId);
    return c!.items.find((i) => i.productId === productId)!;
  };

  it('เปิดใบแล้วได้เลขที่ตามงวด และเป็นร่าง', async () => {
    const { id, no } = await createCount(app, { countDate: '2026-03-01' }, null);
    expect(no).toBe('CT-202603-001');
    const got = await getCount(app, id);
    expect(got!.status).toBe('draft');
    expect(got!.items).toEqual([]);
  });

  it('ดึงสินค้ามาตรวจนับแล้วเห็นยอดที่ระบบว่ามี', async () => {
    await twoLots(brake);
    const id = await draft();
    const got = await getCount(app, id);

    expect(got!.lines).toBe(2);
    expect(got!.done).toBe(0);
    expect((await itemOf(id, brake)).systemQty).toBe(20);
    expect((await itemOf(id, brake)).diff).toBeNull();     // ยังไม่ได้กรอก
  });

  it('ดึงสินค้าตัวเดิมซ้ำไม่เพิ่มแถว', async () => {
    const id = await draft();
    const added = await addCountItems(app, id, [brake, oil]);
    expect(added).toBe(0);
    expect((await getCount(app, id))!.lines).toBe(2);
  });

  it('นับได้น้อยกว่าระบบ ตัดตามล็อตจริง ไม่ใช่ต้นทุนล่าสุด', async () => {
    await twoLots(brake);                                   // 20 ชิ้น · 10@100 + 10@150
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 5);

    const r = await applyCount(app, id, null);

    expect(r.adjusted).toBe(1);
    expect(await onHand(brake)).toBe(5);
    /* หายไป 15 = 10 ที่ 100 + 5 ที่ 150 = 1,750 — ต้นทุนล่าสุดจะได้ 15 × 250 = 3,750 */
    expect(r.value).toBe(-1750);

    const { rows } = await admin.query(
      `select cost_amount, reason::text as reason, note from stock_moves
       where product_id = $1 and reason = 'count'`, [brake],
    );
    expect(n(rows[0].cost_amount)).toBe(1750);
    expect(rows[0].note).toContain('CT-202603-001');
  });

  it('นับได้มากกว่าระบบ รับเข้าที่ต้นทุนล่าสุด', async () => {
    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 23);

    const r = await applyCount(app, id, null);

    expect(r.up).toBe(1);
    expect(await onHand(brake)).toBe(23);
    expect(r.value).toBe(750);                              // 3 × 250 (last_cost)

    const lots = await lotsOfProduct(app, brake);
    expect(lots.at(-1)).toEqual({ qty: 3, unitCost: 250, on: '2026-03-01' });
  });

  /**
   * ข้อสำคัญที่สุดของช่วงนี้
   */
  it('ช่องที่ยังไม่ได้กรอกไม่ใช่ศูนย์ — ปรับยอดแล้วต้องไม่ถูกแตะ', async () => {
    await twoLots(brake);
    await twoLots(oil);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 18);   // กรอกแค่ตัวเดียว

    const r = await applyCount(app, id, null);

    expect(r.adjusted).toBe(1);
    expect(await onHand(brake)).toBe(18);
    expect(await onHand(oil)).toBe(20);                    // ไม่ถูกแตะเลย
    expect(await moves()).toBe(1);
  });

  it('กรอกศูนย์แปลว่านับแล้วไม่เจอ — ตัดออกจริง', async () => {
    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 0);

    await applyCount(app, id, null);
    expect(await onHand(brake)).toBe(0);
  });

  it('นับได้ตรงกับระบบพอดี ไม่สร้างแถวในบัญชีสต๊อกเลย', async () => {
    await twoLots(brake);
    await twoLots(oil);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 20);   // ตรงพอดี
    await setCountedQty(app, (await itemOf(id, oil)).id, 17);     // ต่าง

    const r = await applyCount(app, id, null);

    expect(r.adjusted).toBe(1);
    expect(await moves()).toBe(1);
    expect(await onHand(brake)).toBe(20);

    /* แต่ยอดระบบยังถูกตรึงลงทุกบรรทัดที่กรอก เพื่อให้ใบเป็นหลักฐานครบ */
    const { rows } = await admin.query(
      `select system_qty from stock_count_items where count_id = $1 order by line_no`, [id],
    );
    expect(rows.map((r2) => n(r2.system_qty))).toEqual([20, 20]);
  });

  it('ปรับยอดซ้ำใบเดิมไม่ได้ สต๊อกไม่ขยับรอบที่สอง', async () => {
    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 12);
    await applyCount(app, id, null);

    await expect(applyCount(app, id, null)).rejects.toThrow(/ปรับยอดไปแล้ว/);
    expect(await onHand(brake)).toBe(12);
    expect(await moves()).toBe(1);
  });

  it('ส่วนต่างคิดจากยอด ณ ตอนกดปรับ ไม่ใช่ตอนเปิดใบ', async () => {
    await twoLots(brake);                                   // 20
    const id = await draft();
    const item = await itemOf(id, brake);
    expect(item.systemQty).toBe(20);
    await setCountedQty(app, item.id, 20);                  // นับได้ 20 เท่าที่เห็นตอนนั้น

    /* ระหว่างที่นับค้างไว้ มีการขายออกไป 6 ชิ้น */
    const doc = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name)
       values ($1,'RC','RC-ระหว่างนับ-001','2026-02-20','ลูกค้า') returning id`, [tenantId],
    );
    await consumeStock(app, {
      productId: brake, qty: 6, movedOn: '2026-02-20', reason: 'sale', docId: doc.rows[0].id,
    });
    expect(await onHand(brake)).toBe(14);

    /* เปิดใบใหม่ต้องเห็นยอดสด */
    expect((await itemOf(id, brake)).systemQty).toBe(14);

    const r = await applyCount(app, id, null);
    expect(r.adjusted).toBe(1);
    expect(await onHand(brake)).toBe(20);                   // ปรับขึ้นจาก 14 ไป 20
    const { rows } = await admin.query(
      `select system_qty from stock_count_items where count_id = $1 and product_id = $2`,
      [id, brake],
    );
    expect(n(rows[0].system_qty)).toBe(14);                 // ตรึงยอดที่ใช้จริง
  });

  it('ไม่มีรายการไหนต่างจากระบบ ปรับยอดไม่ได้', async () => {
    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 20);

    await expect(applyCount(app, id, null)).rejects.toThrow(/ต่างจากระบบ/);
    expect((await getCount(app, id))!.status).toBe('draft');
  });

  it('ใบที่ปรับยอดแล้วแก้ไม่ได้', async () => {
    await twoLots(brake);
    const id = await draft();
    const item = await itemOf(id, brake);
    await setCountedQty(app, item.id, 3);
    await applyCount(app, id, null);

    await expect(setCountedQty(app, item.id, 9)).rejects.toThrow(/แก้ไขไม่ได้/);
    await expect(addCountItems(app, id, [oil])).rejects.toThrow(/แก้ไขไม่ได้/);
    await expect(saveCountHead(app, id, { countDate: '2026-04-01', note: '' }))
      .rejects.toThrow(/แก้ไขไม่ได้/);
    await expect(scanIntoCount(app, id, 'DGBRK001')).rejects.toThrow(/แก้ไขไม่ได้/);
  });

  it('ลบใบร่างได้ ลบใบที่ปรับยอดแล้วไม่ได้', async () => {
    const drafted = await draft();
    await deleteCount(app, drafted);
    expect(await getCount(app, drafted)).toBeNull();

    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 1);
    await applyCount(app, id, null);
    await expect(deleteCount(app, id)).rejects.toThrow(/ลบไม่ได้/);
  });

  it('เอารายการออกจากใบร่างได้', async () => {
    const id = await draft();
    await removeCountItem(app, (await itemOf(id, oil)).id);
    expect((await getCount(app, id))!.lines).toBe(1);
  });

  it('ลบสินค้าที่เคยถูกนับไม่ได้', async () => {
    const id = await draft();
    void id;
    await expect(admin.query(`delete from products where id = $1`, [brake]))
      .rejects.toThrow(/violates foreign key/);
  });

  /* ---------------- ยิงบาร์โค้ด ---------------- */

  it('ยิงบาร์โค้ดแล้วเพิ่มรายการ นับเป็น 1', async () => {
    await twoLots(brake);
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);

    const r = await scanIntoCount(app, id, 'DGBRK001');
    expect(r.kind).toBe('added');
    expect(r.kind === 'added' && r.item.countedQty).toBe(1);
    expect(r.kind === 'added' && r.item.code).toBe('BRK-001');
  });

  it('ยิงซ้ำตัวเดิม นับเพิ่มทีละ 1 ไม่ใช่เพิ่มแถว', async () => {
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);
    await scanIntoCount(app, id, 'DGBRK001');
    await scanIntoCount(app, id, 'DGBRK001');
    const r = await scanIntoCount(app, id, 'dgbrk001');     // พิมพ์เล็กก็ต้องเจอ

    expect(r.kind).toBe('increased');
    expect(r.kind === 'increased' && r.item.countedQty).toBe(3);
    expect((await getCount(app, id))!.lines).toBe(1);
  });

  it('ยิงด้วยรหัสร้านหรือรหัส OEM ก็ได้', async () => {
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);
    expect((await scanIntoCount(app, id, 'OIL-001')).kind).toBe('added');
    expect((await scanIntoCount(app, id, 'OEM-OIL')).kind).toBe('increased');
  });

  it('พิมพ์บางส่วนแล้วเจอตัวเดียว ใช้ตัวนั้นเลย', async () => {
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);
    const r = await scanIntoCount(app, id, 'น้ำมัน');
    expect(r.kind).toBe('added');
    expect(r.kind === 'added' && r.item.code).toBe('OIL-001');
  });

  it('พิมพ์แล้วเจอหลายตัว บอกให้เลือกเอง ไม่เดา', async () => {
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);
    const r = await scanIntoCount(app, id, 'OEM');
    expect(r.kind).toBe('many');
    expect(r.kind === 'many' && r.count).toBe(2);
    expect((await getCount(app, id))!.lines).toBe(0);
  });

  it('ยิงรหัสที่ไม่มี บอกว่าไม่พบ ไม่สร้างของใหม่', async () => {
    const { id } = await createCount(app, { countDate: '2026-03-01' }, null);
    const r = await scanIntoCount(app, id, 'ไม่มีรหัสนี้');
    expect(r.kind).toBe('none');
    expect((await getCount(app, id))!.lines).toBe(0);
  });

  /* ---------------- รายการและสรุป ---------------- */

  it('รายการแยกร่างกับที่ปรับแล้ว และนับมูลค่าส่วนต่างเฉพาะที่ปรับแล้ว', async () => {
    await twoLots(brake);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 15);
    await applyCount(app, id, null);
    await createCount(app, { countDate: '2026-03-05' }, null);

    const list = await listCounts(app);
    expect(list.rows).toHaveLength(2);
    expect(list.drafts).toBe(1);
    expect(list.adjusted).toBe(1);
    expect(list.adjustedValue).toBe(-1250);                 // 5 ที่ 250 (ต้นทุนที่ตรึงไว้)
  });

  /**
   * บรรทัดที่ไม่เคยกรอกบนใบที่ปรับยอดแล้ว ต้องไม่แสดงว่า "ระบบว่ามี 0"
   * เพราะบรรทัดนั้นไม่ถูกแตะเลย ศูนย์จะทำให้อ่านย้อนหลังแล้วเข้าใจผิด
   */
  it('บรรทัดที่ไม่เคยกรอกบนใบที่ปรับแล้ว ไม่มียอดระบบตรึงไว้', async () => {
    await twoLots(brake);
    await twoLots(oil);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 18);
    await applyCount(app, id, null);

    const got = await getCount(app, id);
    const untouched = got!.items.find((i) => i.productId === oil)!;
    expect(untouched.countedQty).toBeNull();
    expect(untouched.systemQty).toBeNull();
    expect(untouched.diff).toBeNull();

    const filled = got!.items.find((i) => i.productId === brake)!;
    expect(filled.systemQty).toBe(20);
  });

  /**
   * ทั้งใบต้องอยู่ในทรานแซกชันเดียว — ปรับ 300 รายการแล้วพังกลางทาง
   * ต้องไม่เหลือสภาพที่ปรับไปครึ่งใบโดยที่ไม่มีใครรู้ว่าถึงไหน
   *
   * วางกับดักไว้ที่สินค้าตัวที่สองเท่านั้น ถ้าพังทั้งคู่จะพิสูจน์อะไรไม่ได้
   */
  it('ทั้งใบอยู่ในทรานแซกชันเดียว — รายการท้ายพังแล้วรายการแรกต้องไม่ถูกบันทึก', async () => {
    await twoLots(brake);
    await twoLots(oil);
    const id = await draft();
    await setCountedQty(app, (await itemOf(id, brake)).id, 5);
    await setCountedQty(app, (await itemOf(id, oil)).id, 5);

    await admin.query(`
      create or replace function trap_second() returns trigger language plpgsql as $$
      begin
        if (select code from products where id = new.product_id) = 'OIL-001' then
          raise exception 'กับดักสำหรับเทสต์';
        end if;
        return new;
      end $$;
      create trigger trap_second before insert on stock_moves
        for each row execute function trap_second();
    `);

    try {
      await app.query('begin');
      await expect(applyCount(app, id, null)).rejects.toThrow(/กับดัก/);
      await app.query('rollback');
    } finally {
      await admin.query('drop trigger trap_second on stock_moves; drop function trap_second();');
    }

    expect(await onHand(brake)).toBe(20);
    expect(await onHand(oil)).toBe(20);
    expect((await getCount(app, id))!.status).toBe('draft');
  });
});
