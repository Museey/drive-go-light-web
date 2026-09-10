import type pg from 'pg';
import { consumeStock, returnClaimStock } from './stock-cost';
import { syncVehicleFromDocWith } from './doc-chain';

/**
 * ใบเคลมสินค้า — ของที่ออกจากคลังโดยไม่มีการเรียกเก็บเงิน
 *
 * สองทิศทางใช้โค้ดชุดเดียวกันเหมือนรุ่น 6.4 ต่างกันแค่ `side`
 *   customer (05.3) — จ่ายอะไหล่ทดแทนให้ลูกค้าตามเงื่อนไขรับประกันของอู่
 *   vendor   (05.4) — ส่งอะไหล่ชำรุดคืนผู้ขาย
 * ทั้งคู่ของหายไปจากคลังจริง ต้นทุนจึงลงเป็นค่าใช้จ่ายดำเนินงาน ไม่ใช่ต้นทุนขาย
 * — ถ้าเข้าต้นทุนขาย กำไรขั้นต้นจะเลิกบอกความจริงว่าขายของแล้วได้กี่เปอร์เซ็นต์
 *
 * บันทึกแล้วแก้ไม่ได้ ต้องยกเลิกแล้วเปิดใบใหม่ ตามรุ่น 6.4 ที่ปิดปุ่มบันทึกทันทีที่ใบอยู่ในฐาน
 * ทำให้บัญชีสต๊อกเรียบร้อย — ใบหนึ่งมีการตัดครั้งเดียวและการคืนอย่างมากครั้งเดียว
 *
 * ไม่มีคอลัมน์ "ตัดสต๊อกแล้ว" เหมือน 6.4 เพราะ stock_moves ตอบได้เองว่ามีแถวไหม
 * ธงที่ซ้ำกับความจริงคือธงที่วันหนึ่งจะไม่ตรงกับความจริง
 *
 * ไม่มี server-only เพราะทุกฟังก์ชันรับ client เข้ามา ชุดทดสอบจึงเรียกได้ตรง ๆ
 */

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

type Client = pg.PoolClient | pg.Client;

export type ClaimSide = 'customer' | 'vendor';

/** ยกมาจาก CLAIM_SIDE ของรุ่น 6.4 ทั้งชุด — เลขกำกับ คำเรียกคู่ค้า และคำอธิบายใต้หัวข้อ */
export const CLAIM_SIDE = {
  customer: {
    no: '05.3', title: 'ใบเคลมสินค้า (ลูกค้า)', party: 'ลูกค้า', prefix: 'CL',
    hint: 'จ่ายอะไหล่ออกให้ลูกค้าโดยไม่เก็บเงิน · ตัดสต๊อกจริงเมื่อบันทึก',
    href: '/stock/claim',
  },
  vendor: {
    no: '05.4', title: 'เคลมสินค้า (ผู้ขาย)', party: 'ผู้ขาย', prefix: 'VC',
    hint: 'ส่งอะไหล่ชำรุดคืนผู้ขาย · ตัดสต๊อกจริงเมื่อบันทึก',
    href: '/stock/vclaim',
  },
} as const satisfies Record<ClaimSide, {
  no: string; title: string; party: string; prefix: string; hint: string; href: string;
}>;

export interface ClaimKind { key: string; label: string; hint: string }

/** ยกมาจาก CLAIM_KINDS / VCLAIM_KINDS ของรุ่น 6.4 คำต่อคำ */
export const CLAIM_KINDS: Record<ClaimSide, ClaimKind[]> = {
  customer: [
    { key: 'warranty', label: 'เคลมประกันงานซ่อม',
      hint: 'จ่ายอะไหล่ทดแทนให้ลูกค้าตามเงื่อนไขรับประกันของอู่' },
    { key: 'supplier', label: 'ของเสียจากผู้ขาย',
      hint: 'อะไหล่ชำรุดจากโรงงาน เปลี่ยนให้ลูกค้าก่อนแล้วเคลมกับผู้ขายทีหลัง' },
    { key: 'damage', label: 'ชำรุด / เสียหายในร้าน',
      hint: 'ของแตกหักหรือเสื่อมสภาพในร้าน ต้องตัดออกจากสต๊อก' },
    { key: 'other', label: 'อื่น ๆ',
      hint: 'กรณีอื่นที่ต้องจ่ายของออกโดยไม่เก็บเงิน' },
  ],
  vendor: [
    { key: 'defect', label: 'ของชำรุดจากโรงงาน',
      hint: 'อะไหล่เสียตั้งแต่แกะกล่อง ส่งคืนผู้ขายเพื่อขอของใหม่' },
    { key: 'wrong', label: 'ส่งของผิดรุ่น',
      hint: 'ผู้ขายส่งผิดรุ่นหรือผิดรหัส ส่งคืนเพื่อเปลี่ยน' },
    { key: 'damaged', label: 'เสียหายระหว่างขนส่ง',
      hint: 'ของเสียหายมาตั้งแต่ก่อนถึงร้าน' },
    { key: 'return', label: 'ส่งคืนของที่สั่งเกิน',
      hint: 'สั่งเกินความต้องการ ส่งคืนเพื่อขอเงินคืนหรือหักหนี้' },
    { key: 'other', label: 'อื่น ๆ',
      hint: 'กรณีอื่นที่ต้องส่งของคืนผู้ขาย' },
  ],
};

export const kindLabel = (side: ClaimSide, key: string): string =>
  CLAIM_KINDS[side].find((k) => k.key === key)?.label ?? key;

export const isClaimSide = (v: unknown): v is ClaimSide =>
  v === 'customer' || v === 'vendor';

export const isClaimKind = (side: ClaimSide, key: string): boolean =>
  CLAIM_KINDS[side].some((k) => k.key === key);

export interface ClaimItem {
  id: string;
  productId: string | null;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  /** ต้นทุนที่คิดได้จริงตอนตัดสต๊อก — ว่างได้ถ้าไม่ผูกสินค้าหรือมาจากไฟล์สำรอง */
  costAmount: number | null;
}

export interface ClaimRow {
  id: string;
  no: string;
  side: ClaimSide;
  kind: string;
  claimDate: string;
  partyName: string;
  refNo: string;
  reason: string;
  vehiclePlate: string;
  status: string;
  voided: boolean;
  qty: number;
  cost: number;
}

export interface Claim extends ClaimRow {
  partyId: string | null;
  partyTel: string;
  vehicleId: string | null;
  vehicle: Record<string, unknown> | null;
  byWhom: string;
  note: string;
  voidedReason: string | null;
  items: ClaimItem[];
}

/**
 * ยอดต้นทุนของใบเคลม
 *
 * ใช้ต้นทุนที่ตรึงไว้ตอนตัดสต๊อกก่อนเสมอ ตกลงมาที่ จำนวน × ต้นทุน/หน่วย
 * เฉพาะบรรทัดที่ไม่ได้ตัดสต๊อก — ตรงกับ `num(it.cogs) || num(it.qty)*num(it.cost)`
 * ของ claimWriteOff() ในรุ่น 6.4
 */
const COST_SQL = `coalesce(i.cost_amount, i.qty * i.unit_cost)`;

const COLS = `
  c.id, c.no, c.side::text as side, c.kind, c.claim_date::text as claim_date,
  c.party_name, c.ref_no, c.reason, c.vehicle_plate, c.status::text as status,
  coalesce(sum(i.qty), 0) as qty,
  coalesce(sum(${COST_SQL}), 0) as cost`;

const FROM = `
  from claims c
  left join claim_items i on i.claim_id = c.id`;

const ROW = `select ${COLS} ${FROM}`;

const toRow = (r: Record<string, unknown>): ClaimRow => ({
  id: r.id as string,
  no: r.no as string,
  side: r.side as ClaimSide,
  kind: r.kind as string,
  claimDate: r.claim_date as string,
  partyName: (r.party_name as string) ?? '',
  refNo: (r.ref_no as string) ?? '',
  reason: (r.reason as string) ?? '',
  vehiclePlate: (r.vehicle_plate as string) ?? '',
  status: r.status as string,
  voided: r.status === 'void',
  qty: n(r.qty),
  cost: round2(n(r.cost)),
});

export interface ClaimListResult {
  rows: ClaimRow[];
  total: number;
  /** ยอดต้นทุนรวมของใบที่ยังไม่ยกเลิก — ตัวเลขที่ไปโผล่ในงบ */
  writeOff: number;
}

export async function listClaims(
  c: Client,
  opts: {
    side: ClaimSide;
    search?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ClaimListResult> {
  const params: unknown[] = [opts.side];
  const where = [`c.side = $1::claim_side`];

  const term = (opts.search ?? '').trim();
  if (term) {
    params.push(`%${term}%`);
    where.push(`(c.no ilike $${params.length} or c.party_name ilike $${params.length}
                 or c.ref_no ilike $${params.length} or c.reason ilike $${params.length}
                 or c.vehicle_plate ilike $${params.length})`);
  }
  if (opts.from) { params.push(opts.from); where.push(`c.claim_date >= $${params.length}`); }
  if (opts.to)   { params.push(opts.to);   where.push(`c.claim_date <= $${params.length}`); }

  const filter = `where ${where.join(' and ')}`;

  const totals = await c.query(
    `select count(*)::int as total,
            coalesce(sum(case when c.status <> 'void' then x.cost else 0 end), 0) as write_off
     from claims c
     left join lateral (
       select coalesce(sum(${COST_SQL}), 0) as cost
       from claim_items i where i.claim_id = c.id
     ) x on true
     ${filter}`,
    params,
  );

  const page = [...params, opts.limit ?? 50, opts.offset ?? 0];
  const { rows } = await c.query(
    `${ROW} ${filter}
     group by c.id
     order by c.claim_date desc, c.no desc
     limit $${page.length - 1} offset $${page.length}`,
    page,
  );

  return {
    rows: rows.map(toRow),
    total: n(totals.rows[0].total),
    writeOff: round2(n(totals.rows[0].write_off)),
  };
}

export async function getClaim(c: Client, id: string): Promise<Claim | null> {
  const { rows } = await c.query(
    `select ${COLS}, c.party_id, c.party_tel, c.vehicle_id, c.vehicle,
            c.by_whom, c.note, c.voided_reason
     ${FROM}
     where c.id = $1
     group by c.id`,
    [id],
  );
  const head = rows[0];
  if (!head) return null;

  const items = await c.query(
    `select id, product_id, code, oem, name, unit, qty, unit_cost, cost_amount
     from claim_items where claim_id = $1 order by line_no`,
    [id],
  );

  return {
    ...toRow(head),
    partyId: head.party_id ?? null,
    partyTel: head.party_tel ?? '',
    vehicleId: head.vehicle_id ?? null,
    vehicle: head.vehicle ?? null,
    byWhom: head.by_whom ?? '',
    note: head.note ?? '',
    voidedReason: head.voided_reason ?? null,
    items: items.rows.map((r) => ({
      id: r.id,
      productId: r.product_id ?? null,
      code: r.code ?? '',
      oem: r.oem ?? '',
      name: r.name ?? '',
      unit: r.unit ?? '',
      qty: n(r.qty),
      unitCost: n(r.unit_cost),
      costAmount: r.cost_amount === null ? null : n(r.cost_amount),
    })),
  };
}

export interface ClaimItemInput {
  productId: string | null;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
}

export interface ClaimInput {
  side: ClaimSide;
  kind: string;
  claimDate: string;
  partyId: string | null;
  partyName: string;
  partyTel: string;
  refNo: string;
  vehicleId: string | null;
  vehicle: Record<string, unknown> | null;
  vehiclePlate: string;
  reason: string;
  byWhom: string;
  note: string;
  items: ClaimItemInput[];
}

export interface SaveClaimResult {
  id: string;
  no: string;
  /** จำนวนชิ้นที่ตัดออกจากคลังจริง */
  cutQty: number;
  /** ต้นทุนรวมที่ตัดได้ */
  cost: number;
  /** บรรทัดที่ไม่ได้ผูกทะเบียนสินค้า จึงไม่ตัดสต๊อก */
  unlinked: number;
}

/**
 * ออกใบเคลมใหม่ แล้วตัดสต๊อกทันที
 *
 * สร้างอย่างเดียว ไม่มีทางแก้ใบเดิม — 6.4 ปิดปุ่มบันทึกทันทีที่ใบอยู่ในฐานแล้ว
 * และเขียนบอกไว้บนฟอร์มว่าถ้าผิดให้ยกเลิกแล้วเปิดใบใหม่
 */
export async function saveClaim(
  c: Client,
  input: ClaimInput,
  userId: string | null,
): Promise<SaveClaimResult> {
  const side = input.side;
  if (!isClaimKind(side, input.kind)) {
    throw new Error('ประเภทการเคลมไม่ตรงกับทิศทางของใบ');
  }
  if (!input.reason.trim()) throw new Error('กรอกเหตุผลในการเคลมก่อนบันทึก');

  const items = input.items.filter((i) => i.qty > 0 && (i.name.trim() || i.productId));
  if (items.length === 0) throw new Error('เพิ่มรายการสินค้าอย่างน้อยหนึ่งรายการ');

  const seq = await c.query(
    `select next_claim_no(current_tenant_id(), $1::claim_side, '') as no`, [side],
  );
  const ym = input.claimDate.slice(0, 4) + input.claimDate.slice(5, 7);
  const no = `${CLAIM_SIDE[side].prefix}-${ym}-${String(n(seq.rows[0].no)).padStart(3, '0')}`;

  /* ฝั่งผู้ขายไม่ผูกรถ — ฐานบังคับอยู่แล้ว ตัดทิ้งที่นี่ให้ข้อความผิดพลาดไม่ต้องไปโผล่จาก SQL */
  const vehicleId = side === 'customer' ? input.vehicleId : null;
  const vehicle = side === 'customer' ? input.vehicle : null;
  const plate = side === 'customer' ? input.vehiclePlate : '';

  const head = await c.query(
    `insert into claims (tenant_id, no, side, kind, claim_date, party_id, party_name, party_tel,
                         ref_no, vehicle_id, vehicle, vehicle_plate, reason, by_whom, note,
                         status, created_by)
     values (current_tenant_id(),$1,$2::claim_side,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
             'issued',$15)
     returning id`,
    [
      no, side, input.kind, input.claimDate, input.partyId, input.partyName, input.partyTel,
      input.refNo, vehicleId, vehicle ? JSON.stringify(vehicle) : null, plate,
      input.reason.trim(), input.byWhom, input.note, userId,
    ],
  );
  const id = head.rows[0].id as string;

  /* เลขไมล์กลับเข้าทะเบียนรถ กติกาเดียวกับเอกสารขาย — รถคันเดียวกันที่เข้ามาเคลม
     ก็คือรถที่วิ่งมาถึงเลขไมล์นั้นจริง เขียนกลับแค่เลขไมล์กับวันที่บริการล่าสุด
     ช่องอื่นเป็นภาพนิ่งของใบนี้ และวันที่ขยับไปข้างหน้าอย่างเดียว */
  await syncVehicleFromDocWith(c, {
    vehicleId,
    mileage: String((vehicle as Record<string, string> | null)?.mileage ?? ''),
    docDate: input.claimDate,
  });

  let cutQty = 0;
  let cost = 0;
  let unlinked = 0;

  for (const [i, it] of items.entries()) {
    const line = await c.query(
      `insert into claim_items (tenant_id, claim_id, line_no, product_id,
                                code, oem, name, unit, qty, unit_cost)
       values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [id, i + 1, it.productId, it.code, it.oem, it.name, it.unit,
       it.qty.toFixed(3), it.unitCost.toFixed(2)],
    );
    const itemId = line.rows[0].id as string;

    /* บรรทัดที่พิมพ์ชื่อเองไม่ผูกทะเบียนสินค้า ขึ้นบนใบพิมพ์แต่ไม่แตะสต๊อก — ตามรุ่น 6.4 */
    if (!it.productId) { unlinked++; continue; }

    const lineCost = await consumeStock(c, {
      productId: it.productId,
      qty: it.qty,
      movedOn: input.claimDate,
      reason: 'claim',
      claimId: id,
      claimItemId: itemId,
      note: `${CLAIM_SIDE[side].title} ${no}`,
      userId,
    });

    await c.query(`update claim_items set cost_amount = $1 where id = $2`,
      [lineCost.toFixed(2), itemId]);

    cutQty += it.qty;
    cost += lineCost;
  }

  return { id, no, cutQty: round2(cutQty), cost: round2(cost), unlinked };
}

/**
 * ยกเลิกใบเคลม แล้วคืนของกลับเข้าล็อตด้วยต้นทุนเดิม
 *
 * ยกเลิกแทนการลบเหมือนเอกสารหมวด 03 และ 04 — เอกสารยังอยู่ให้ตรวจย้อนหลังได้
 * ยกเลิกซ้ำไม่ได้ ไม่งั้นของจะงอกขึ้นมาจากอากาศทุกครั้งที่กด
 */
export async function voidClaim(
  c: Client,
  id: string,
  reason: string,
  userId: string | null,
): Promise<{ no: string }> {
  const { rows } = await c.query(
    `select no, status::text as status, claim_date::text as claim_date
     from claims where id = $1 for update`,
    [id],
  );
  const claim = rows[0];
  if (!claim) throw new Error('ไม่พบใบเคลม');
  if (claim.status === 'void') throw new Error(`${claim.no} ถูกยกเลิกไปแล้ว`);

  await returnClaimStock(c, id, {
    movedOn: claim.claim_date,
    note: `คืนสต๊อกเพราะยกเลิก ${claim.no}`,
    userId,
  });

  await c.query(
    `update claims set status = 'void', voided_at = now(), voided_reason = $2 where id = $1`,
    [id, reason.trim()],
  );

  return { no: claim.no };
}
