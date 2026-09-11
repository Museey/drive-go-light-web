import type pg from 'pg';
import { fifoAdd, fifoConsume, fifoReturn, fifoValue, type Lot } from '@drivegolight/core';

/**
 * ต้นทุนสต๊อกแบบเข้าก่อนออกก่อน คิดจากบัญชี stock_moves
 *
 * รุ่น 6.4 เก็บล็อตเป็นอาเรย์บนตัวสินค้าแล้วตัดล็อตหน้าสุดทิ้งไปเรื่อย ๆ
 * ได้ตัวเลขถูกแต่พอตัดแล้วประวัติหาย ตรวจย้อนไม่ได้ว่าต้นทุนมาจากการรับเข้าครั้งไหน
 *
 * ที่นี่ล็อตไม่ได้ถูกเก็บ แต่ถูก "เล่นซ้ำ" จากบัญชีที่เพิ่มอย่างเดียวทุกครั้งที่ต้องใช้
 * ได้ผลเท่ากันเป๊ะ (มีชุดทดสอบเทียบกับโค้ดเดิมโดยตรง) แต่ทุกบาทตามกลับไปหาที่มาได้
 *
 * ต้นทุนที่คิดได้ถูกตรึงลงแถวนั้นทันที ไม่คำนวณใหม่ตอนอ่านรายงาน —
 * ไม่งั้นการเพิ่มใบซื้อย้อนหลังจะทำให้งบของงวดที่ปิดไปแล้วเปลี่ยน
 *
 * ไม่มี server-only เพราะทุกฟังก์ชันรับ client เข้ามาเอง ไม่แตะ session หรือคุกกี้
 * ชุดทดสอบจึงเรียกได้ตรง ๆ — แบบเดียวกับ restore-core.ts และ license-window.ts
 */

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

type Client = pg.PoolClient | pg.Client;

/** เหตุผลที่ทำให้ของเข้าคลัง — ที่เหลือคือของออก */
const INBOUND = new Set(['opening', 'purchase', 'return', 'adjust', 'set', 'count']);

interface MoveRow {
  qty_delta: string;
  unit_cost: string | null;
  cost_amount: string | null;
  moved_on: string;
  reason: string;
  expires_on: string | null;
}

/**
 * ล็อตคงเหลือของสินค้าหนึ่งตัว ณ ตอนนี้
 *
 * เล่นบัญชีตามลำดับ (moved_on, created_at) — วันที่ก่อน แล้วค่อยลำดับที่บันทึก
 * รายการที่ลงย้อนหลังจึงเข้าคิวตามวันที่จริง ไม่ใช่ตามเวลาที่คีย์
 *
 * ปริมาณจริง: สินค้าหนึ่งตัวมีการเคลื่อนไหวหลักร้อยแถวต่อหลายปี การอ่านทั้งหมด
 * ต่อการตัดหนึ่งครั้งจึงถูกมาก และใช้ index (tenant_id, product_id, moved_on) ที่มีอยู่แล้ว
 * ถ้าวันหนึ่งช้า ให้ลงแถว opening สรุปยอดเป็นงวดแล้วเล่นซ้ำจากจุดนั้น
 */
export async function lotsOfProduct(c: Client, productId: string): Promise<Lot[]> {
  const { rows } = await c.query<MoveRow>(
    /*
     * ยังเรียงตามเวลาเหมือนเดิม **ห้ามเรียงด้วยวันหมดอายุตรงนี้** —
     * การเล่นบัญชีซ้ำต้องไล่ตามเวลาจริง ไม่งั้นการตัดของวันที่ 5
     * จะไปเห็นของที่รับเข้าวันที่ 10 ซึ่งยังไม่มีอยู่ตอนนั้น
     *
     * ลำดับแบบหมดอายุก่อนออกก่อนเกิดที่ fifoAdd() ซึ่งแทรกล็อตใหม่เข้าคิว
     * ตามวันหมดอายุ แทนที่จะต่อท้ายเสมอ
     */
    `select qty_delta, unit_cost, cost_amount, moved_on::text as moved_on,
            reason::text as reason, expires_on::text as expires_on
     from stock_moves
     where product_id = $1
     order by moved_on, created_at`,
    [productId],
  );

  const fallback = await lastCostOf(c, productId);
  let lots: Lot[] = [];

  for (const m of rows) {
    const qty = n(m.qty_delta);
    if (qty === 0) continue;

    if (qty > 0) {
      /* ของคืนกลับเข้าหน้าแถวด้วยต้นทุนที่เคยตัดไป ของรับเข้าปกติต่อท้าย */
      const cost = m.cost_amount !== null ? n(m.cost_amount) : qty * n(m.unit_cost);
      lots = m.reason === 'return'
        ? fifoReturn(lots, qty, cost, m.moved_on, fallback, m.expires_on)
        : fifoAdd(lots, qty, qty === 0 ? 0 : round2(cost / qty), m.moved_on, m.expires_on);
    } else {
      lots = fifoConsume(lots, -qty, fallback).lots;
    }
  }

  return lots;
}

async function lastCostOf(c: Client, productId: string): Promise<number> {
  const { rows } = await c.query(`select last_cost from products where id = $1`, [productId]);
  return n(rows[0]?.last_cost);
}

/** มูลค่าของที่ยังอยู่ในคลังตามต้นทุนของแต่ละล็อต */
export async function stockValueOf(c: Client, productId: string): Promise<number> {
  return fifoValue(await lotsOfProduct(c, productId));
}

export interface ConsumeInput {
  productId: string;
  /** จำนวนที่ตัดออก เป็นบวกเสมอ */
  qty: number;
  movedOn: string;
  reason: 'sale' | 'use' | 'adjust' | 'count' | 'set' | 'return' | 'claim';
  docId?: string | null;
  docItemId?: string | null;
  /** ใบเคลมไม่ได้อยู่ใน documents จึงมีสายของตัวเอง — ฐานบังคับให้อ้างอย่างใดอย่างหนึ่ง */
  claimId?: string | null;
  claimItemId?: string | null;
  note?: string;
  userId?: string | null;
}

/**
 * ตัดของออกจากคลังพร้อมคิดต้นทุน แล้วบันทึกลงบัญชีเป็นแถวเดียว
 * คืนต้นทุนที่คิดได้ให้ผู้เรียกเอาไปใช้ต่อ (เช่น เก็บไว้เทียบตอนยกเลิก)
 */
export async function consumeStock(c: Client, input: ConsumeInput): Promise<number> {
  const qty = Math.abs(input.qty);
  if (qty === 0) return 0;

  const lots = await lotsOfProduct(c, input.productId);
  const fallback = await lastCostOf(c, input.productId);
  const { cost } = fifoConsume(lots, qty, fallback);

  await c.query(
    `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta,
                              unit_cost, cost_amount, reason, doc_id, doc_item_id,
                              claim_id, claim_item_id, note, created_by)
     values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.productId, input.movedOn, -qty,
      round2(cost / qty), round2(cost),
      input.reason, input.docId ?? null, input.docItemId ?? null,
      input.claimId ?? null, input.claimItemId ?? null,
      input.note ?? '', input.userId ?? null,
    ],
  );

  return round2(cost);
}

export interface ReceiveInput {
  productId: string;
  qty: number;
  /** ต้นทุนรวมของครั้งนี้ — ถ้าเป็นการคืนของ ให้ใส่ต้นทุนที่เคยตัดไป */
  costAmount: number;
  movedOn: string;
  reason: 'opening' | 'purchase' | 'return' | 'adjust' | 'set' | 'count';
  docId?: string | null;
  /** คืนของจากใบเคลมที่ถูกยกเลิก — แถวคืนต้องชี้กลับไปที่ใบเดิม */
  claimId?: string | null;
  note?: string;
  userId?: string | null;
  /**
   * วันหมดอายุของล็อตนี้ — ว่าง = ไม่มีวันหมดอายุ
   *
   * ฐานข้อมูลบังคับว่าใส่ได้เฉพาะแถวรับเข้า (`stock_move_expiry_on_receipt`)
   * ซึ่งตรงกับที่ฟังก์ชันนี้ทำอยู่แล้ว
   */
  expiresOn?: string | null;
}

/** รับของเข้าคลัง — ใช้ทั้งตอนซื้อ ตอนคืนจากการยกเลิก และตอนปรับยอดขึ้น */
export async function receiveStock(c: Client, input: ReceiveInput): Promise<void> {
  const qty = Math.abs(input.qty);
  if (qty === 0) return;

  const cost = round2(input.costAmount);

  await c.query(
    `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta,
                              unit_cost, cost_amount, reason, doc_id, claim_id, note,
                              created_by, expires_on)
     values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.productId, input.movedOn, qty,
      round2(cost / qty), cost,
      input.reason, input.docId ?? null, input.claimId ?? null,
      input.note ?? '', input.userId ?? null,
      input.expiresOn || null,
    ],
  );
}

/**
 * คืนของที่เคยตัดจากใบหนึ่งกลับเข้าคลัง ด้วยต้นทุนที่บันทึกไว้ตอนตัด
 *
 * ใช้ทั้งตอนยกเลิกเอกสาร ตอนแก้เอกสารที่ตัดสต๊อกไปแล้ว และตอนยกเลิกใบเคลม
 * ไม่ลบแถวเดิมทิ้ง เพราะบัญชีเดินสะพัดที่ลบย้อนหลังได้ก็ไม่ใช่บัญชีอีกต่อไป —
 * ต้นทุนของใบที่ขายหลังจากนั้นคิดจากล็อตที่จะไม่มีอยู่จริง
 *
 * คืนตามแถวที่ยัง "ค้างอยู่" เท่านั้น — ถ้าคืนไปแล้วรอบหนึ่ง แถวคืนเก่าจะหักลบกัน
 * ทำให้เรียกซ้ำแล้วของไม่งอกขึ้นมาจากอากาศ
 */
async function returnStockOf(
  c: Client,
  key: { docId: string } | { claimId: string },
  opts: { movedOn: string; note: string; userId?: string | null },
): Promise<void> {
  const isDoc = 'docId' in key;
  const id = isDoc ? key.docId : key.claimId;
  const col = isDoc ? 'doc_id' : 'claim_id';

  /* cost_amount เก็บเป็นค่าบวกเสมอทั้งขาเข้าและขาออก เครื่องหมายอยู่ที่ qty_delta
     จึงต้องใส่เครื่องหมายกลับเข้าไปก่อนบวกกัน ไม่งั้นแถวคืนจะไปเพิ่มยอดแทนที่จะหักออก */
  const { rows } = await c.query(
    `select product_id,
            sum(qty_delta) as qty_delta,
            sum(sign(qty_delta) * coalesce(cost_amount, abs(qty_delta) * unit_cost)) as cost_amount
     from stock_moves
     where ${col} = $1
     group by product_id
     having sum(qty_delta) < 0`,
    [id],
  );

  for (const m of rows) {
    const qty = -n(m.qty_delta);
    const cost = -n(m.cost_amount);

    await receiveStock(c, {
      productId: m.product_id,
      qty,
      costAmount: cost,
      movedOn: opts.movedOn,
      reason: 'return',
      docId: isDoc ? id : null,
      claimId: isDoc ? null : id,
      note: opts.note,
      userId: opts.userId,
    });
  }
}

/** คืนของที่เคยตัดจากเอกสารใบหนึ่ง — ดู returnStockOf */
export const returnDocStock = (
  c: Client,
  docId: string,
  opts: { movedOn: string; note: string; userId?: string | null },
) => returnStockOf(c, { docId }, opts);

/** คืนของที่เคยตัดจากใบเคลมใบหนึ่ง — ใช้ตอนยกเลิกใบเคลม */
export const returnClaimStock = (
  c: Client,
  claimId: string,
  opts: { movedOn: string; note: string; userId?: string | null },
) => returnStockOf(c, { claimId }, opts);
