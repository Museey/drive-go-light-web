'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/auth';
import { importContactsWith, planContactsCsv, type ContactImportResult } from '@/lib/contacts-csv';
import type { ContactKind, ImportPlan } from '@/lib/contacts-csv-core';
import { mutate, type FormResult } from '@/lib/mutate';

/**
 * นำเข้าทะเบียนลูกค้าหรือผู้ขายจาก CSV — สองขั้นเสมอ
 *
 * ขั้นแรกอ่านไฟล์แล้วบอกว่าจะเกิดอะไร **โดยไม่เขียนอะไรเลย**
 * ขั้นสองถึงเขียนจริง แบบเดียวกับหน้ากู้คืนข้อมูล
 *
 * จำเป็นเพราะไฟล์ที่จับคู่ผิดจะไปแก้ทะเบียนลูกค้าของจริงหลายร้อยราย
 * และเลิกทำไม่ได้ ผู้ใช้ต้องเห็นตัวเลข "เพิ่มใหม่ / ปรับปรุง / ข้าม" ก่อนตัดสินใจ
 */
export interface ContactImportState extends FormResult {
  kind?: ContactKind;
  plan?: {
    add: number; update: number; skip: number; vehicles: number; rows: number;
    /* ตัวอย่างสิบแถวแรกให้ผู้ใช้ตาดูว่าอ่านไฟล์ถูกไหม */
    sample: { code: string; name: string; taxId: string; tel: string; existing: boolean }[];
    reasons: string[];
  };
  result?: ContactImportResult;
}

const MAX_BYTES = 5 * 1024 * 1024;

function summary(plan: ImportPlan): NonNullable<ContactImportState['plan']> {
  const all = [...plan.add, ...plan.update];
  return {
    add: plan.add.length,
    update: plan.update.length,
    skip: plan.skip.length,
    vehicles: plan.vehicles,
    rows: plan.rows,
    sample: all.slice(0, 10).map((e) => ({
      code: e.recs[0]!.code || (e.existing?.code ?? '— ออกให้ —'),
      name: e.name,
      taxId: e.recs[0]!.taxId || '',
      tel: e.recs[0]!.tel || '',
      existing: Boolean(e.existing),
    })),
    reasons: plan.skip.slice(0, 10).map((s) => `บรรทัดที่ ${s.row}: ${s.why}`),
  };
}

export async function importContactsAction(
  _prev: ContactImportState, fd: FormData,
): Promise<ContactImportState> {
  const kind: ContactKind = fd.get('kind') === 'vendor' ? 'vendor' : 'customer';
  const file = fd.get('file');

  if (!(file instanceof File) || file.size === 0) return { kind, error: 'เลือกไฟล์ CSV ก่อน' };
  if (file.size > MAX_BYTES) return { kind, error: 'ไฟล์ใหญ่เกิน 5 MB' };

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { kind, error: 'อ่านไฟล์ไม่ได้ — บันทึกใหม่เป็น CSV UTF-8 แล้วลองอีกครั้ง' };
  }

  try {
    if (fd.get('confirm') !== '1') {
      const plan = await query((c) => planContactsCsv(c, kind, text));
      if (!plan.add.length && !plan.update.length) {
        return {
          kind,
          error: plan.skip.length
            ? `อ่านได้ ${plan.rows} แถว แต่ใช้ไม่ได้เลยสักแถว — ${plan.skip[0]!.why}`
            : 'ไฟล์ไม่มีข้อมูลที่นำเข้าได้',
        };
      }
      return { kind, plan: summary(plan) };
    }

    const result = await mutate('customer', (c) => importContactsWith(c, kind, text),
      { sub: kind });
    revalidatePath('/customers');
    return { kind, ok: true, result };
  } catch (err) {
    return { kind, error: err instanceof Error ? err.message : 'นำเข้าไม่สำเร็จ' };
  }
}
