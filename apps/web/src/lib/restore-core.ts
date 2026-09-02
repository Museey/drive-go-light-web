import {
  hasDataLoss, importBackup, unsupportedCollections, validateBackup,
  type BackupFile, type UnsupportedGroup,
} from '@drivegolight/importer';

/**
 * แกนกลางของการกู้คืนข้อมูล — รับ client ที่เปิดทรานแซกชันและตั้งอู่ไว้แล้ว
 *
 * แยกจาก restore.ts ที่ผูกกับ session ของผู้ใช้ เพื่อให้ชุดทดสอบเรียกได้ตรง ๆ
 * เรื่องนี้ต้องมีเทสต์เพราะมันลบข้อมูลจริงก่อนเขียนทับ
 */

interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/** ตารางที่ถูกล้าง เรียงตามลำดับที่ลบได้โดยไม่ติดคีย์นอก */
export const WIPE_ORDER = [
  /* ใบวางบิลต้องไปก่อนเอกสาร — billnote_docs.doc_id เป็น on delete restrict
     ถ้าไม่ตัดสายก่อน การกู้คืนทับอู่ที่เคยวางบิลไว้จะล้มด้วย foreign key */
  'billnote_docs',
  'billnotes',
  'billnote_sequences',
  'payments',
  /* stock_moves ต้องไปก่อน claims เพราะ stock_moves.claim_id เป็น on delete restrict
     และไปก่อน products/documents ด้วยเหตุผลเดียวกัน — บัญชีสต๊อกอ้างถึงทุกอย่าง */
  'stock_moves',
  'claim_items',
  'claims',
  'claim_sequences',
  /* ใบตรวจนับล็อกสินค้าไว้ผ่าน product_id ที่เป็น on delete restrict
     ต้องล้างก่อนถึงลบ products ได้ */
  'stock_count_items',
  'stock_counts',
  'stock_count_sequences',
  'doc_items',
  'documents',
  'vehicles',
  'contacts',
  'products',
  'product_categories',
  'doc_sequences',
  'ignored_item_names',
] as const;

export function parseBackupFile(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('อ่านไฟล์ไม่ได้ — ไม่ใช่ไฟล์ JSON ที่ถูกต้อง เลือกไฟล์ที่ดาวน์โหลดจากเมนูสำรองข้อมูล');
  }

  const problems = validateBackup(data);
  if (problems.length) {
    const shown = problems.slice(0, 8).join(' · ');
    const more = problems.length > 8 ? ` …และอีก ${problems.length - 8} จุด` : '';
    throw new Error(`ไฟล์สำรองไม่ถูกต้อง พบปัญหา ${problems.length} จุด: ${shown}${more}`);
  }

  return data as BackupFile;
}

/**
 * ล้างข้อมูลธุรกิจของอู่ที่ตั้งไว้ใน client — ไม่แตะผู้ใช้งานและการสมัครใช้บริการ
 * เอกสารอ้างถึงกันเองอยู่ ต้องตัดสายก่อนถึงจะลบได้ (parent_doc_id เป็น on delete restrict)
 */
export async function wipeTenantData(c: SqlClient): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  await c.query(`update documents set parent_doc_id = null where parent_doc_id is not null`);
  for (const table of WIPE_ORDER) {
    const res = await c.query(`delete from ${table}`);
    removed[table] = res.rowCount ?? 0;
  }
  return removed;
}

export interface RestoreResult {
  counts: Record<string, number>;
  warnings: string[];
  /** จำนวนแถวที่ลบทิ้งก่อนกู้คืน ไว้บอกผู้ใช้ว่าทับอะไรไป */
  removed: Record<string, number>;
  /** กลุ่มข้อมูลในไฟล์ที่ระบบยังรับไม่ได้ */
  dropped: UnsupportedGroup[];
}

/**
 * ตรวจไฟล์โดยไม่แตะข้อมูล — ใช้บอกผู้ใช้ว่าจะได้อะไรและจะเสียอะไรก่อนกดยืนยัน
 * ต้องเรียกก่อนเสมอ เพราะการกู้คืนลบของเดิมทิ้งแล้วย้อนไม่ได้
 */
export interface BackupPreview {
  counts: Record<string, number>;
  dropped: UnsupportedGroup[];
  /** true = มีข้อมูลที่จะหายทั้งกลุ่ม ต้องให้ผู้ใช้ยืนยันเพิ่ม */
  needsAcknowledgement: boolean;
}

const COUNTABLE = [
  'products', 'customers', 'vendors', 'quotes', 'invoices',
  'receipts', 'purchases', 'expenses', 'billnotes', 'claims', 'counts',
] as const;

export function previewBackup(text: string): BackupPreview {
  const backup = parseBackupFile(text) as unknown as Record<string, unknown>;
  const dropped = unsupportedCollections(backup);

  const counts: Record<string, number> = {};
  for (const k of COUNTABLE) {
    const v = backup[k];
    if (Array.isArray(v) && v.length) counts[k] = v.length;
  }

  return { counts, dropped, needsAcknowledgement: hasDataLoss(dropped) };
}

export async function restoreIntoTenant(
  c: SqlClient,
  tenantId: string,
  backup: BackupFile,
): Promise<RestoreResult> {
  const dropped = unsupportedCollections(backup);
  const removed = await wipeTenantData(c);
  const result = await importBackup(c, backup, {
    intoTenantId: tenantId,
    externalTransaction: true,
  });
  return { counts: result.counts, warnings: result.warnings, removed, dropped };
}
