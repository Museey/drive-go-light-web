import type pg from 'pg';

/**
 * ประวัติการบันทึกเอกสาร — ฝั่งอ่าน
 *
 * ฝั่งเขียนไม่มีในโค้ด TypeScript เลยโดยตั้งใจ — trigger ในฐานข้อมูลเขียนให้เอง
 * ทุกครั้งที่เอกสารถูกสร้างหรือแก้ ดู db/009_edits.sql
 */

export interface DocEdit {
  at: string;
  /** ชื่อผู้บันทึก — ว่างแปลว่าเกิดจากตัวนำเข้าหรือสคริปต์ ไม่ใช่คนกดในเว็บ */
  by: string;
  action: 'create' | 'update' | 'void';
}

const ACTION_LABEL: Record<DocEdit['action'], string> = {
  create: 'สร้างเอกสาร',
  update: 'แก้ไข',
  void: 'ยกเลิกเอกสาร',
};

export const editActionLabel = (a: DocEdit['action']): string => ACTION_LABEL[a] ?? a;

/** ชื่อที่แสดง — บัญชีที่ถูกลบยังเหลือชื่อ ณ ตอนนั้นไว้ */
export const editorName = (e: DocEdit): string => e.by || 'ระบบ';

export async function listDocEdits(
  c: Pick<pg.PoolClient, 'query'>, documentId: string,
): Promise<DocEdit[]> {
  const { rows } = await c.query(
    `select at, coalesce(u.name, e.user_name) as by, e.action
       from doc_edits e
       left join users u on u.id = e.user_id
      where e.document_id = $1
      order by e.id desc`,
    [documentId],
  );
  return rows.map((r: any) => ({
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    by: r.by ?? '',
    action: r.action,
  }));
}
