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
