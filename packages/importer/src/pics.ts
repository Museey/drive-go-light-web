/**
 * รูปสินค้าจากไฟล์สำรอง
 *
 * รุ่น 6.4 เก็บรูปไว้ใน IndexedDB แยกจากฐานเอกสาร แล้วตอนส่งออกจะรวมเข้ามาเป็น
 * `_piclib` = { 'p:abc123': 'data:image/jpeg;base64,…' } ส่วนตัวสินค้าเก็บแค่รหัสรูป
 * `p.pics = ['p:abc123']` — เราอ่านรูปแบบนั้นได้ตรง ๆ และเขียนกลับออกไปแบบเดียวกัน
 * เพื่อให้ไฟล์สำรองของเราเปิดด้วยโปรแกรมรุ่นเดิมได้จริงตามที่หน้าสำรองข้อมูลบอกไว้
 *
 * รูปย่ออยู่ที่ `_picthumbs` ซึ่งเป็นคีย์ที่รุ่น 6.4 ไม่รู้จักและข้ามไปเอง
 * ไฟล์ที่มาจากรุ่นเดิมจึงไม่มีรูปย่อ — กรณีนั้นใช้รูปเต็มไปก่อน
 */

export interface PicRow {
  legacyProductId: string;
  full: Buffer;
  thumb: Buffer;
  mime: string;
}

const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/;

/** แปลง data URL เป็นไบต์ — คืน null ถ้าไม่ใช่รูปชนิดที่รับ */
export function decodeDataUrl(v: unknown): { bytes: Buffer; mime: string } | null {
  if (typeof v !== 'string') return null;
  const m = DATA_URL.exec(v.trim());
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2]!.replace(/\s+/g, ''), 'base64');
    return bytes.length ? { bytes, mime: m[1]! } : null;
  } catch {
    return null;
  }
}

export const encodeDataUrl = (bytes: Buffer, mime: string): string =>
  `data:${mime};base64,${bytes.toString('base64')}`;

/**
 * ดึงรูปออกจากไฟล์สำรอง
 *
 * ข้ามรูปที่อ่านไม่ออกแทนที่จะล้มทั้งการนำเข้า — ไฟล์สำรองที่รูปเสียไปหนึ่งรูป
 * ยังมีข้อมูลอีกทั้งอู่ที่ต้องกู้กลับมาให้ได้
 */
export function picsFromBackup(db: any): { rows: PicRow[]; skipped: number } {
  const lib = (db && typeof db._piclib === 'object' && db._piclib) || {};
  const thumbs = (db && typeof db._picthumbs === 'object' && db._picthumbs) || {};
  const rows: PicRow[] = [];
  let skipped = 0;

  for (const p of Array.isArray(db?.products) ? db.products : []) {
    const picId = Array.isArray(p?.pics) ? p.pics[0] : null;
    if (!picId) continue;

    const full = decodeDataUrl(lib[picId]);
    if (!full) { skipped++; continue; }

    const thumb = decodeDataUrl(thumbs[picId]);
    rows.push({
      legacyProductId: String(p.id),
      full: full.bytes,
      /* ไฟล์จากรุ่นเดิมไม่มีรูปย่อ ใช้รูปเต็มไปก่อน หน้ารายการจะหนักขึ้นนิดหน่อย
         แต่ดีกว่าไม่มีรูปเลย และผู้ใช้อัปใหม่เมื่อไหร่ก็ได้รูปย่อจริง */
      thumb: thumb?.bytes ?? full.bytes,
      mime: full.mime,
    });
  }

  return { rows, skipped };
}
