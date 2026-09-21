import type pg from 'pg';

/**
 * กันสองเครื่องแก้เอกสารใบเดียวกันแล้วทับกันเงียบ ๆ (ผู้ใช้สั่งแก้ 21 ก.ย. 2569)
 *
 * เดิมคนที่กดบันทึกทีหลังชนะเสมอ — หน้าร้านแก้ราคา เจ้าของแก้รายการในใบเดียวกัน
 * งานของคนที่กดก่อนหายทั้งหมดโดยไม่มีอะไรบอก ข้อมูลไม่พังแต่คนไม่รู้ว่างานตัวเองหาย
 *
 * วิธีกัน: ตอนเปิดหน้าแก้ไข จำ "ฉบับ" ของใบไว้ในฟอร์ม · ตอนกดบันทึก ล็อกแถวแล้วเทียบฉบับ
 * ไม่ตรง = มีคนบันทึกใบนี้ไปแล้วระหว่างที่เปิดอยู่ → ไม่บันทึกทับ ของที่กรอกยังอยู่ในหน้าจอครบ
 *
 * **ฉบับคือ `updated_at` ของแถว** ซึ่งทริกเกอร์ touch_updated_at เปลี่ยนให้ทุกครั้งที่แถวถูก UPDATE
 * ไม่ต้องมีคอลัมน์ใหม่ · การรับชำระไม่แตะแถว documents จึงไม่ทำให้ฉบับเปลี่ยน
 * (เรื่องรับเงินระหว่างเปิดฟอร์มค้างไว้ กันด้วย editRule ที่ตรวจซ้ำใต้ล็อกแทน)
 *
 * ไม่มี `server-only` — ชุดทดสอบเรียกกับฐานจริงได้ด้วย client สองตัว
 */

type Client = Pick<pg.ClientBase, 'query'>;

/**
 * ฉบับของแถว เป็นไมโครวินาทีแบบข้อความ
 *
 * ห้ามส่ง `updated_at` ออกไปเป็น Date ของ JS — Date เก็บแค่มิลลิวินาที
 * Postgres เก็บถึงไมโครวินาที เทียบกลับแล้วจะไม่ตรงทุกครั้ง ผู้ใช้จะบันทึกไม่ได้เลยสักใบ
 */
export const DOC_VERSION_SQL = `(extract(epoch from updated_at) * 1000000)::bigint::text`;

export const STALE_DOC_MESSAGE =
  'ใบนี้มีคนแก้ไขและบันทึกไปแล้วระหว่างที่คุณเปิดอยู่ จึงยังไม่ได้บันทึกทับให้ — ' +
  'ของที่คุณกรอกยังอยู่บนหน้าจอ เปิดใบนี้ในแท็บใหม่เพื่อดูฉบับล่าสุด แล้วค่อยแก้อีกครั้ง';

export class StaleDocError extends Error {
  constructor() {
    super(STALE_DOC_MESSAGE);
    this.name = 'StaleDocError';
  }
}

/** ฉบับปัจจุบันของเอกสาร — ไม่พบ = null */
export async function docVersionWith(c: Client, id: string): Promise<string | null> {
  const { rows } = await c.query(`select ${DOC_VERSION_SQL} as v from documents where id = $1`, [id]);
  return rows[0]?.v ?? null;
}

/**
 * ล็อกแถวเอกสารก่อนแก้ แล้วตรวจสามอย่างตามลำดับ — ต้องเรียกในทรานแซกชันเดียวกับการเขียน
 *
 *   1. ยังมีอยู่
 *   2. ไม่ได้ถูกยกเลิกไปแล้ว — **ต้องอยู่ใต้ล็อก** ไม่งั้นอีกเครื่องกดยกเลิกในเสี้ยววินาทีเดียวกัน
 *      แล้วรายการใหม่ถูกเขียนลงใบที่เพิ่งยกเลิก (การยกเลิกล็อกแถวเดียวกันอยู่แล้ว เครื่องนี้จึงต้องรอ
 *      แล้วเห็นสถานะใหม่ ไม่ใช่สถานะตอนก่อนรอ)
 *   3. ฉบับตรงกับที่ฟอร์มเปิดมา — ข้ามได้ถ้าฟอร์มไม่ได้ส่งมา (ฟอร์มที่เปิดค้างไว้ตั้งแต่ก่อนมีการตรวจนี้)
 *
 * ยกเลิกแล้วมาก่อนฉบับไม่ตรง เพราะบอกได้ชัดกว่าว่าเกิดอะไรขึ้น
 */
export async function lockDocForEditWith(
  c: Client,
  id: string,
  baseVersion?: string | null,
): Promise<{ docNo: string }> {
  const { rows } = await c.query(
    `select doc_no, status::text as status, ${DOC_VERSION_SQL} as v
       from documents where id = $1 for update`,
    [id],
  );
  const d = rows[0];
  if (!d) throw new Error('ไม่พบเอกสารที่จะแก้');
  if (d.status === 'void') throw new Error('เอกสารนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
  if (baseVersion && d.v !== baseVersion) throw new StaleDocError();
  return { docNo: d.doc_no };
}
