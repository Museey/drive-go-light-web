/**
 * ยกเลิกเอกสารขาย — ตัวที่รับ client
 *
 * แยกไฟล์ออกจาก sales.ts ด้วยเหตุผลเดียวกับ buy-void.ts: sales.ts ประกาศ server-only
 * เทสต์จึง import ไม่ได้ ถังขยะต้องทดสอบการกู้คืนเอกสารที่ยกเลิกด้วยทางเดียวกับหน้าจอจริง
 * ไม่ใช่แก้สถานะด้วย SQL ตรง ๆ ซึ่งจะข้ามการคืนสต๊อกไป
 */
import type pg from 'pg';
import { today } from '@drivegolight/core';
import { returnDocStock } from './stock-cost';
import { billnoteOfDoc } from './billnotes';
import { releaseParentWith } from './doc-lock';

type Client = pg.PoolClient | pg.Client;

export async function voidSalesDocWith(
  c: pg.PoolClient | pg.Client, id: string, reason: string, userId: string | null,
): Promise<void> {
  {
    /* ยกเลิกได้แม้มีใบต่อ — ใบต่อยังอยู่และนับยอดตามเดิม (ต้นแบบ voidDoc · ผู้ใช้เลือก 17 ก.ย. 2569) */

    /* ใบที่ถูกวางบิลไปแล้วยกเลิกไม่ได้ — ลูกค้าถือใบวางบิลที่มีเลขใบนี้อยู่ในมือ
       ถ้าหายไปเฉย ๆ ยอดบนกระดาษกับในระบบจะไม่ตรงกันโดยไม่มีใครอธิบายได้ */
    const bn = await billnoteOfDoc(c, id);
    if (bn) {
      throw new Error(`ใบนี้ถูกรวมอยู่ในใบวางบิล ${bn} — เอาออกจากใบวางบิลก่อน`);
    }

    /* คืนของด้วยต้นทุนที่เคยตัดไป ไม่ใช่ต้นทุนวันนี้ — ไม่งั้นการยกเลิกใบเสร็จ
       จะกลายเป็นกำไรหรือขาดทุนจากอากาศ รายการคืนอ้างเอกสารที่ยกเลิกเสมอ
       ทั้งเพราะสคีมาบังคับและเพราะต้องตามได้ว่าของกลับมาเพราะใบไหน */
    await returnDocStock(c, id, {
      movedOn: today(),
      note: 'คืนสต๊อกจากการยกเลิกเอกสาร',
      userId,
    });

    await c.query(
      `update documents set status='void', voided_at=now(), voided_reason=$2 where id=$1`,
      [id, reason || 'ยกเลิกโดยผู้ใช้'],
    );

    /* ใบเสนอราคาที่ไม่เหลือใบต่อ กลับเป็นค้างส่งมอบ — ไม่งั้นหน้าแรกนับงานค้างขาดไปตลอด */
    await releaseParentWith(c, id);
  }
}

/* =====================================================================
   ยกเลิกทั้งสายเอกสาร (ผู้ใช้กำหนด 19 ก.ย. 2569)
   ===================================================================== */

export interface ChainDoc {
  id: string;
  docNo: string;
  kind: string;
  /** วันที่บนเอกสาร ไว้เรียงให้อ่านง่ายในแผงยืนยัน */
  docDate: string;
}

export interface DocChainInfo {
  self: ChainDoc;
  /** ใบอื่นในสายที่ยังไม่ถูกยกเลิก — เรียงจากต้นสายไปปลายสาย */
  related: ChainDoc[];
  /** ใบในสายที่ยกเลิกไม่ได้เพราะถูกรวมในใบวางบิลแล้ว */
  blocked: ChainDoc[];
}

/**
 * ใบทั้งสายของเอกสารขายใบหนึ่ง — ใบต้นทางขึ้นไปจนสุด และใบต่อที่ออกจากใบเหล่านั้น
 *
 * ลูกค้ายกเลิกงานหนึ่งงาน เอกสารที่เกิดจากงานนั้นคือใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ
 * ผู้ใช้ต้องเห็นทั้งสายก่อนตัดสินใจ ไม่ใช่กดยกเลิกใบเดียวแล้วเหลือใบอื่นค้างระบบ
 */
export async function docChainWith(c: Client, id: string): Promise<DocChainInfo> {
  const { rows } = await c.query(
    `with recursive up as (
       select d.id, d.doc_no, d.kind::text as kind, d.doc_date::text as doc_date,
              d.parent_doc_id, d.status::text as status, d.purged_at
         from documents d where d.id = $1
       union all
       select p.id, p.doc_no, p.kind::text, p.doc_date::text, p.parent_doc_id, p.status::text, p.purged_at
         from documents p join up on p.id = up.parent_doc_id
     ),
     down as (
       select id, doc_no, kind, doc_date, parent_doc_id, status, purged_at from up
       union
       select x.id, x.doc_no, x.kind::text, x.doc_date::text, x.parent_doc_id, x.status::text, x.purged_at
         from documents x join down on x.parent_doc_id = down.id
     )
     select distinct down.id, down.doc_no, down.kind, down.doc_date, down.status,
            exists (select 1 from billnote_docs bd
                     join billnotes b on b.id = bd.billnote_id and b.status <> 'void' and b.purged_at is null
                    where bd.doc_id = down.id) as billed
       from down
      /* ใบที่ลบถาวรแล้วไม่นับ · ใบที่ยกเลิกแล้วไม่นับเป็น "ใบในสายที่ต้องถามถึง"
         แต่ตัวเอกสารเองต้องติดมาเสมอ ไม่งั้นหน้าเอกสารของใบที่ยกเลิกไปแล้วจะพัง */
      where down.purged_at is null and (down.status <> 'void' or down.id = $1)
      order by down.doc_date, down.doc_no`,
    [id],
  );

  const map = (r: any): ChainDoc => ({ id: r.id, docNo: r.doc_no, kind: r.kind, docDate: r.doc_date });
  const self = rows.find((r: any) => r.id === id);
  if (!self) throw new Error('ไม่พบเอกสารที่จะยกเลิก');

  const live = rows.filter((r: any) => r.id !== id && r.status !== 'void');
  return {
    self: map(self),
    related: live.map(map),
    blocked: [self, ...live].filter((r: any) => r.billed).map(map),
  };
}

/**
 * ยกเลิกหลายใบในคำสั่งเดียว — ปลายสายก่อนต้นสาย
 *
 * **ล้มทั้งชุดถ้ามีใบไหนยกเลิกไม่ได้** (เช่นถูกรวมในใบวางบิล) — ยกเลิกไปครึ่งเดียว
 * แย่กว่าไม่ยกเลิกเลย เพราะยอดบนกระดาษกับในระบบจะไม่ตรงกันโดยไม่มีใครรู้ตัว
 * ผู้เรียกต้องเปิดทรานแซกชันมาเอง (server action ทำให้อยู่แล้ว) การโยนจึงย้อนทุกใบ
 */
export async function voidSalesChainWith(
  c: Client, ids: string[], reason: string, userId: string | null,
): Promise<void> {
  if (ids.length === 0) return;

  /* **ตรวจตัวขวางให้ครบก่อนแตะใบแรก** — ถ้าปล่อยให้ไปตายกลางทาง ใบต้นสายจะถูกยกเลิกไปแล้ว
     ส่วนใบที่ติดใบวางบิลยังอยู่ (ทรานแซกชันของผู้เรียกย้อนให้ก็จริง แต่ไม่ควรพึ่งอย่างเดียว) */
  const billed = await c.query(
    `select d.doc_no, b.no as bill_no
       from documents d
       join billnote_docs bd on bd.doc_id = d.id
       join billnotes b on b.id = bd.billnote_id and b.status <> 'void' and b.purged_at is null
      where d.id = any($1::uuid[])
      order by d.doc_no`, [ids]);
  if (billed.rows.length) {
    const list = billed.rows.map((r: any) => `${r.doc_no} (ใบวางบิล ${r.bill_no})`).join(' · ');
    throw new Error(`ยกเลิกทั้งสายไม่ได้ — มีใบที่ถูกรวมในใบวางบิลแล้ว: ${list} · เอาออกจากใบวางบิลก่อน`);
  }

  /* ไล่จากปลายสายขึ้นต้นสาย — ผลลัพธ์เท่ากันไม่ว่าจะเรียงทางไหน (ตรวจแล้ว)
     แต่ลำดับที่แน่นอนทำให้รายการเคลื่อนไหวสต๊อกและประวัติอ่านเรียงตามความเป็นจริง */
  const { rows } = await c.query(
    `select id from documents where id = any($1::uuid[]) order by doc_date desc, doc_no desc`, [ids]);

  for (const r of rows) await voidSalesDocWith(c, r.id, reason, userId);
}
