import type pg from 'pg';
import { today } from '@drivegolight/core';
import { consumeStock, receiveStock } from './stock-cost';

/**
 * ยกเลิกและกู้คืนใบซื้อ / ค่าใช้จ่าย
 *
 * แยกออกมาจาก purchases.ts เพราะไฟล์นั้นมี `server-only` ชุดทดสอบจึงนำเข้าไม่ได้
 * ตรงนี้รับ client เข้ามาเอง ไม่แตะ session หรือคุกกี้ — แบบเดียวกับ stock-cost.ts
 * และ billnotes.ts ส่วนการตรวจสิทธิ์กับการหา tenant ยังอยู่ที่ mutate() เหมือนเดิม
 */

type Client = pg.PoolClient | pg.Client;

const n = (v: unknown): number => Number(v ?? 0);

/** ตัวจริงที่รับ client เข้ามาเอง — ชุดทดสอบเรียกตรงได้โดยไม่ต้องมี session */
export async function voidBuyDocWith(
  c: Client,
  id: string,
  reason: string,
  userId: string | null,
): Promise<void> {
  {
    /*
     * คิดจาก **ยอดสุทธิของใบนี้ที่ยังค้างอยู่ในคลัง** ไม่ใช่ไล่แถวรับเข้าทีละแถว
     *
     * ใบที่เคยยกเลิกแล้วกู้คืนกลับมามีทั้งแถวรับเข้าเดิมและแถวรับกลับ
     * ถ้าไล่เฉพาะแถว reason='purchase' การยกเลิกรอบที่สองจะตัดของสองเท่า
     * การหักกลบทำให้ยกเลิก–กู้คืนสลับกันกี่รอบก็ได้โดยของไม่งอกและไม่หาย
     * (กติกาเดียวกับ returnStockOf() ของฝั่งขาย)
     */
    const moves = await c.query(
      `select product_id, sum(qty_delta) as qty
         from stock_moves where doc_id = $1
        group by product_id having sum(qty_delta) > 0`,
      [id],
    );
    for (const m of moves.rows) {
      /* ของที่รับเข้ามาจากใบนี้ต้องออกไป และต้องคิดต้นทุนตามล็อตเหมือนการตัดอื่น ๆ
         ไม่ใช่คืนที่ราคาซื้อ เพราะของอาจถูกขายไปแล้วบางส่วน ล็อตที่ตัดออกจึงเป็นคนละก้อน */
      await consumeStock(c, {
        productId: m.product_id,
        qty: n(m.qty),
        movedOn: today(),
        reason: 'return',
        docId: id,
        note: 'คืนสต๊อกจากการยกเลิกใบซื้อ',
        userId,
      });
    }

    await c.query(
      `update documents set status='void', voided_at=now(), voided_reason=$2 where id=$1`,
      [id, reason || 'ยกเลิกโดยผู้ใช้'],
    );
  }
}

/**
 * นำใบซื้อหรือค่าใช้จ่ายที่ยกเลิกไปแล้วกลับมาใช้
 *
 * **มีเฉพาะฝั่งรายจ่าย** — เอกสารรายรับที่ยกเลิกแล้วกู้คืนไม่ได้ ต้องคัดลอกเป็นใบใหม่
 * เพราะยอดขาย ภาษีขาย และใบกำกับภาษีที่ส่งออกไปแล้วพัวพันอยู่ (กติกาเดียวกับรุ่น 6.4)
 * ส่วนใบซื้อไม่มีเอกสารที่ออกไปข้างนอก การกดยกเลิกผิดใบเป็นแค่การคีย์ผิด
 *
 * **รับของกลับด้วยต้นทุนก้อนที่ตัดออกไปตอนยกเลิก ไม่ใช่ราคาซื้อบนใบ** —
 * ตอนยกเลิกระบบตัดของออกตามล็อตจริง ซึ่งอาจเป็นคนละราคากับที่ซื้อมา
 * ถ้ารับกลับที่ราคาบนใบ มูลค่าสต๊อกจะเพี้ยนไปทุกครั้งที่ราคาซื้อขยับระหว่างทาง
 */
export async function unvoidBuyDocWith(
  c: Client,
  id: string,
  userId: string | null,
): Promise<void> {
  {
    const doc = await c.query(
      `select kind::text as kind, doc_no, status::text as status
         from documents where id = $1 for update`,
      [id],
    );
    if (!doc.rows[0]) throw new Error('ไม่พบเอกสาร');
    if (doc.rows[0].status !== 'void') {
      throw new Error(`${doc.rows[0].doc_no} ไม่ได้ถูกยกเลิกไว้ กู้คืนไม่ได้`);
    }

    /*
     * **ย้อนเฉพาะการยกเลิกครั้งล่าสุด** ไม่ใช่ดูยอดสุทธิของใบ
     *
     * หลังยกเลิก ยอดสุทธิของใบเป็นศูนย์พอดี (รับเข้าเท่าไรก็ตัดออกเท่านั้น)
     * ซึ่งเป็นเรื่องถูกต้องแต่ทำให้ "ดูยอดสุทธิ" หาของที่ต้องคืนไม่เจอเลย
     *
     * แถวคืนที่เกิดจากการยกเลิกครั้งเดียวกันมี created_at ตรงกันเป๊ะ เพราะ now()
     * คงที่ตลอดทรานแซกชัน — ยกเลิกสองครั้งอยู่คนละทรานแซกชันเสมอ (สถานะกันไว้)
     * จับกลุ่มด้วยเวลานั้นจึงได้ก้อนของการยกเลิกครั้งล่าสุดพอดี ไม่ใช่ค่าเฉลี่ย
     * ของทุกครั้งที่เคยยกเลิก ซึ่งจะเพี้ยนเมื่อต้นทุนแต่ละรอบไม่เท่ากัน
     */
    const back = await c.query(
      `with last_void as (
         select max(created_at) as at from stock_moves
          where doc_id = $1 and reason = 'return'
       )
       select m.product_id,
              -sum(m.qty_delta) as qty,
              sum(coalesce(m.cost_amount, abs(m.qty_delta) * m.unit_cost)) as cost
         from stock_moves m join last_void lv on m.created_at = lv.at
        where m.doc_id = $1 and m.reason = 'return'
        group by m.product_id`,
      [id],
    );

    for (const r of back.rows) {
      await receiveStock(c, {
        productId: r.product_id,
        qty: n(r.qty),
        costAmount: n(r.cost),
        movedOn: today(),
        reason: 'purchase',
        docId: id,
        note: 'รับของกลับจากการกู้คืนใบซื้อ',
        userId,
      });
    }

    /* สคีมาบังคับว่า status กับ voided_at ต้องตรงกัน ล้างทั้งคู่พร้อมกัน */
    await c.query(
      `update documents
          set status = 'issued', voided_at = null, voided_reason = null
        where id = $1`,
      [id],
    );
  }
}
