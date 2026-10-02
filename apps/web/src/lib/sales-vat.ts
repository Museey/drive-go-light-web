import type pg from 'pg';
import type { VatMode } from '@drivegolight/core';
import { canIssueKind, forcedVatMode, NO_TAX_INVOICE, type SalesKind } from './sales-rules';

/**
 * โหมดภาษีที่จะบันทึกลงเอกสารขาย — ฝั่งเซิร์ฟเวอร์ของ vatChoices() (ร้านจด / ไม่จด VAT · 036)
 *
 * รับ client ที่ตั้ง tenant แล้ว ไม่มี server-only — เทสต์เรียกกับฐานจริงได้ (vat-registered-db.test.ts)
 */

type Client = Pick<pg.ClientBase, 'query'>;

export const VAT_MODE_STALE_MESSAGE =
  'ใบนี้คิดภาษีมูลค่าเพิ่มแบบที่เลือกไม่ได้ เพราะร้านตั้งค่าเป็นไม่จดภาษีมูลค่าเพิ่ม — ' +
  'โหลดหน้าใหม่แล้วตรวจยอดอีกครั้งก่อนบันทึก';

/** ร้านนี้จด VAT ไหม — ค่าที่บันทึกอยู่ในฐานตอนนี้ ไม่ใช่ค่าที่ฟอร์มเห็นตอนเปิด */
export async function shopVatRegisteredWith(c: Client): Promise<boolean> {
  const { rows } = await c.query(`select vat_registered from tenants where id = current_tenant_id()`);
  return rows[0]?.vat_registered !== false;
}

/**
 * ตัดสินจากค่าในฐานทั้งหมด ไม่เชื่อค่าที่หน้าเว็บส่งมา
 *
 * ใบที่แก้: ชนิดใบ โหมดที่บันทึกไว้ และชนิดใบต้นทาง อ่านจากแถว — **เรียกหลังล็อกแถวแล้ว**
 * ใบใหม่: ยังไม่มีแถว ชนิดใบมาจากหน้าเว็บ ส่วนชนิดใบต้นทางอ่านจากฐาน
 *
 * ร้านที่จด VAT ทำงานเหมือนเดิมทุกอย่าง (IV บังคับไม่คิด · IVT บังคับคิด · ที่เหลือตามที่เลือก)
 * ร้านที่ไม่จด:
 *   - ออกใบกำกับภาษีใบใหม่ไม่ได้ (NO_TAX_INVOICE)
 *   - หน้าเว็บส่งโหมดที่ใช้ไม่ได้มา = ฟอร์มเปิดค้างไว้ตอนเปลี่ยนการตั้งค่า
 *     **ปฏิเสธแทนการปรับให้เงียบ ๆ** — ยอดที่บันทึกต้องเป็นยอดที่ผู้ใช้เห็นในแผงยืนยัน
 */
export async function vatModeForSaveWith(
  c: Client,
  input: { id?: string; kind: SalesKind; vatMode: VatMode; parentDocId: string | null },
  registered: boolean,
): Promise<VatMode> {
  let kind = input.kind;
  let saved: VatMode | null = null;
  let parentKind: SalesKind | null = null;

  if (input.id) {
    const { rows } = await c.query(
      `select d.kind::text as kind, d.vat_mode::text as vat_mode, p.kind::text as parent_kind
         from documents d left join documents p on p.id = d.parent_doc_id
        where d.id = $1`,
      [input.id],
    );
    if (!rows[0]) throw new Error('ไม่พบเอกสาร');
    kind = rows[0].kind as SalesKind;
    saved = rows[0].vat_mode as VatMode;
    parentKind = (rows[0].parent_kind as SalesKind | null) ?? null;
  } else {
    if (!canIssueKind(kind, registered)) throw new Error(NO_TAX_INVOICE);
    if (input.parentDocId) {
      const { rows } = await c.query(
        `select kind::text as kind from documents where id = $1`, [input.parentDocId],
      );
      parentKind = (rows[0]?.kind as SalesKind | undefined) ?? null;
    }
  }

  const mode = forcedVatMode(kind, input.vatMode, { registered, saved, parentKind });
  if (!registered && mode !== input.vatMode) throw new Error(VAT_MODE_STALE_MESSAGE);
  return mode;
}
