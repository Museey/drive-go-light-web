import type pg from 'pg';
import { lineAmount, today, type VatMode } from '@drivegolight/core';
import { consumeStock, lockProductsWith, receiveStock } from './stock-cost';

/**
 * สต๊อกของใบซื้อ — ต้นทุนรับเข้า และการปรับสต๊อกตอนแก้ใบ
 *
 * แยกจาก purchases.ts (ซึ่งมี server-only) เพื่อให้ชุดทดสอบเรียกได้ตรง ๆ
 * แบบเดียวกับ buy-void.ts และ stock-cost.ts
 *
 * สองเรื่องที่ไฟล์นี้แก้ (24 พ.ย. 2569)
 *
 * 1. **ต้นทุนรับเข้าต้องเป็นเงินที่จ่ายจริงสำหรับของชิ้นนั้น** — เดิมใช้ จำนวน × ราคาต่อหน่วย
 *    บนบรรทัดตรง ๆ ไม่หักส่วนลดรายบรรทัด ไม่หักส่วนลดท้ายบิล และไม่ถอด VAT ออกเมื่อใบเป็น
 *    ราคารวม VAT ต้นทุนล็อตและทุนล่าสุดจึงสูงกว่าที่จ่ายจริง กำไรขั้นต้นต่ำกว่าจริง
 *
 * 2. **แก้ใบซื้อแล้วห้ามลบ stock_moves เดิม** — เดิมลบทุกแถวของใบแล้วใส่ใหม่
 *    ทั้งที่ของล็อตนั้นอาจถูกขายไปแล้ว ต้นทุนของใบขายที่ตรึงไว้จึงอ้างล็อตที่ไม่มีอยู่จริง
 *    และ created_at ใหม่ทำให้ล็อตย้ายไปท้ายคิว ตอนนี้ใช้วิธีเดียวกับการยกเลิก–กู้คืน:
 *    ตัดยอดที่ยังค้างของใบนี้ออก (คิดต้นทุนตามล็อต) แล้วรับเข้าใหม่ บัญชีเพิ่มอย่างเดียว
 *    และทำเฉพาะสินค้าที่บรรทัดเปลี่ยนจริง — แก้แค่หมายเหตุหรือเลขที่ใบกำกับ สต๊อกไม่ถูกแตะ
 */

type Client = pg.PoolClient | pg.Client;

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface BuyStockLine {
  productId: string | null;
  qty: number;
  unitPrice: number;
  discPct?: number;
  expiresOn?: string | null;
}

export interface BuyStockDoc {
  docDate: string;
  /** รับของเข้าคลังแล้วหรือยัง — ไม่ติ๊ก = ใบนี้ไม่มีสต๊อก */
  goodsReceived: boolean;
  /** ส่วนลดท้ายบิลเป็นบาทที่มีผลจริง (หลังแปลงจาก % แล้ว) */
  discount: number;
  vatMode: VatMode;
  /** อัตรา VAT เป็นเปอร์เซ็นต์ เช่น 7 */
  vatRate: number;
  /** อู่จด VAT หรือไม่ — จดแล้ว VAT ซื้อขอคืนได้ จึงไม่นับเป็นต้นทุน */
  vatRegistered: boolean;
  items: BuyStockLine[];
}

export interface PlannedReceipt {
  productId: string;
  qty: number;
  /** ต้นทุนรวมของบรรทัดนี้หลังส่วนลดและถอด VAT แล้ว */
  costAmount: number;
  expiresOn: string | null;
}

/**
 * แถวรับเข้าที่ใบซื้อใบนี้ควรมี — เฉพาะบรรทัดที่ผูกทะเบียนสินค้าและจำนวนไม่เป็นศูนย์
 *
 * ต้นทุนของบรรทัด = มูลค่าหลังส่วนลดรายบรรทัด − ส่วนลดท้ายบิลที่เฉลี่ยตามสัดส่วน
 * ถ้าใบเป็นราคารวม VAT และอู่จด VAT ให้ถอด VAT ออก (สูตรเดียวกับ net ใน totalsOf)
 * อู่ที่ไม่จด VAT ขอคืนภาษีซื้อไม่ได้ ราคารวม VAT จึงเป็นต้นทุนทั้งก้อน
 *
 * ส่วนลดเฉลี่ยจากยอดรวมของ**ทุกบรรทัด** รวมบรรทัดที่ไม่ผูกทะเบียน — ตรงกับวิธีคิดยอดของเอกสาร
 */
export function plannedReceipts(doc: BuyStockDoc): PlannedReceipt[] {
  if (!doc.goodsReceived) return [];

  const amounts = doc.items.map((it) =>
    lineAmount({ qty: it.qty, price: it.unitPrice, discPct: it.discPct ?? 0 }));
  const sub = amounts.reduce((s, a) => s + a, 0);
  const discount = Math.min(Math.max(0, doc.discount), Math.max(0, sub));
  const stripVat = doc.vatMode === 'in' && doc.vatRegistered;

  const out: PlannedReceipt[] = [];
  doc.items.forEach((it, i) => {
    if (!it.productId || !(it.qty > 0)) return;
    let cost = amounts[i]! - (sub > 0 ? discount * (amounts[i]! / sub) : 0);
    if (stripVat) cost = cost / (1 + doc.vatRate / 100);
    out.push({
      productId: it.productId,
      qty: it.qty,
      costAmount: round2(Math.max(0, cost)),
      expiresOn: it.expiresOn || null,
    });
  });
  return out;
}

/** ลายเซ็นของสิ่งที่กระทบสต๊อกของสินค้าหนึ่งตัวในใบ — เท่ากัน = ไม่ต้องแตะบัญชีสต๊อก */
function signatures(doc: BuyStockDoc): Map<string, string> {
  const by = new Map<string, string[]>();
  for (const r of plannedReceipts(doc)) {
    const list = by.get(r.productId) ?? [];
    list.push(`${r.qty}|${r.costAmount.toFixed(2)}|${r.expiresOn ?? ''}`);
    by.set(r.productId, list);
  }
  const out = new Map<string, string>();
  for (const [id, list] of by) out.set(id, `${doc.docDate}#${list.sort().join(',')}`);
  return out;
}

async function receiveWith(
  c: Client, docId: string, docDate: string, r: PlannedReceipt, userId: string | null, note = '',
): Promise<void> {
  await receiveStock(c, {
    productId: r.productId, qty: r.qty, costAmount: r.costAmount,
    movedOn: docDate, reason: 'purchase', docId, userId, expiresOn: r.expiresOn, note,
  });
  /* ทุนล่าสุด = ต้นทุนสุทธิต่อหน่วยของครั้งนี้ — ของแถมราคาศูนย์ไม่ทับทุนเดิม */
  const unit = round2(r.costAmount / Math.abs(r.qty));
  if (unit > 0) {
    await c.query(`update products set last_cost = $2 where id = $1`, [r.productId, unit.toFixed(2)]);
  }
}

/** รับของเข้าตอนบันทึกใบซื้อใบใหม่ */
export async function receiveBuyStockWith(
  c: Client, docId: string, doc: BuyStockDoc, userId: string | null,
): Promise<void> {
  const planned = plannedReceipts(doc);
  await lockProductsWith(c, planned.map((r) => r.productId));
  for (const r of planned) await receiveWith(c, docId, doc.docDate, r, userId);
}

/**
 * ปรับสต๊อกตอนแก้ใบซื้อ — เทียบใบก่อนแก้กับใบหลังแก้ ทำเฉพาะสินค้าที่เปลี่ยน
 *
 * สินค้าที่เปลี่ยน: ตัดยอดสุทธิของใบนี้ที่ยังค้างในคลังออก (เหตุผล return คิดต้นทุนตามล็อต
 * เหมือน voidBuyDocWith) แล้วรับเข้าใหม่ตามใบหลังแก้ — ไม่ลบแถวเดิมสักแถว
 * ยอดสุทธิของใบหลังทำเสร็จจึงเท่ากับจำนวนบนใบใหม่เสมอ การยกเลิกใบภายหลังยังคิดถูก
 */
export async function syncBuyStockWith(
  c: Client, docId: string, before: BuyStockDoc, after: BuyStockDoc, userId: string | null,
): Promise<void> {
  const was = signatures(before);
  const now = signatures(after);
  const changed = [...new Set([...was.keys(), ...now.keys()])]
    .filter((id) => was.get(id) !== now.get(id));
  if (changed.length === 0) return;

  /* ล็อกสินค้าทุกตัวเรียงตามรหัสก่อนตัดตัวแรก (stock-cost.ts) */
  await lockProductsWith(c, changed);

  const held = await c.query(
    `select product_id, sum(qty_delta) as qty
       from stock_moves
      where doc_id = $1 and product_id = any($2::uuid[])
      group by product_id having sum(qty_delta) > 0`,
    [docId, changed],
  );
  for (const m of held.rows) {
    await consumeStock(c, {
      productId: m.product_id, qty: Number(m.qty), movedOn: today(),
      reason: 'return', docId, note: 'ปรับสต๊อกจากการแก้ไขใบซื้อ', userId,
    });
  }

  const set = new Set(changed);
  for (const r of plannedReceipts(after)) {
    if (set.has(r.productId)) {
      await receiveWith(c, docId, after.docDate, r, userId, 'รับเข้าตามใบซื้อที่แก้ไข');
    }
  }
}

/** อ่านใบซื้อฉบับที่อยู่ในฐานตอนนี้ ในรูปที่ plannedReceipts ใช้ — เรียกก่อนเขียนทับ */
export async function loadBuyStockDocWith(
  c: Client, docId: string, vatRegistered: boolean,
): Promise<BuyStockDoc> {
  const d = await c.query(
    `select doc_date::text as doc_date, goods_received, discount, vat_mode::text as vat_mode, vat_rate
       from documents where id = $1`, [docId]);
  const items = await c.query(
    `select product_id, qty, unit_price, disc_pct, expires_on::text as expires_on
       from doc_items where doc_id = $1 order by line_no`, [docId]);
  const r = d.rows[0];
  return {
    docDate: r.doc_date,
    goodsReceived: r.goods_received === true,
    discount: Number(r.discount ?? 0),
    vatMode: r.vat_mode as VatMode,
    vatRate: Number(r.vat_rate ?? 0),
    vatRegistered,
    items: items.rows.map((it) => ({
      productId: it.product_id, qty: Number(it.qty), unitPrice: Number(it.unit_price),
      discPct: Number(it.disc_pct ?? 0), expiresOn: it.expires_on,
    })),
  };
}
