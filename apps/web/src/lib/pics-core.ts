/**
 * ตรวจไฟล์รูปที่ผู้ใช้อัปโหลด — ส่วนที่ไม่แตะฐานข้อมูล
 *
 * รูปถูกย่อที่เบราว์เซอร์ด้วย canvas เหมือนรุ่น 6.4 (ไม่ต้องลง sharp ซึ่งเป็นโมดูล
 * native ที่ทำให้ build บนเครื่องผู้ให้บริการเปราะขึ้นอีกชั้น — เพิ่งเจอมาแล้วรอบหนึ่ง)
 *
 * **แต่ห้ามเชื่อสิ่งที่เบราว์เซอร์ส่งมาแม้แต่นิดเดียว** `<input type=file>` ส่งอะไรมาก็ได้
 * และ `file.type` เป็นค่าที่ผู้ส่งตั้งเองได้ทั้งหมด ทุกอย่างในไฟล์นี้จึงอ่านจากตัวไบต์จริง
 *
 * ที่ต้องกันคือไฟล์หน้าตาเป็นรูปแต่ข้างในเป็น HTML — ถ้าเสิร์ฟกลับออกไปโดยเชื่อ
 * content-type ที่ผู้ใช้ส่งมา มันจะกลายเป็น XSS บนโดเมนของเราเอง
 */

/** ชนิดที่รับ — เบราว์เซอร์ย่อแล้วส่งมาเป็น JPEG เสมอ ที่เหลือรับไว้เผื่อคนอัปตรง ๆ */
export type PicMime = 'image/jpeg' | 'image/png';

/** ขนาดไฟล์สูงสุดต่อรูป — รูปที่ย่อแล้วไม่ควรเกิน 100 KB ด้วยซ้ำ */
export const MAX_PIC_BYTES = 1024 * 1024;

/** ด้านที่ยาวที่สุดหลังย่อ — ตรงกับ PIC_EDGE ของรุ่น 6.4 */
export const PIC_EDGE = 800;

/** ด้านของรูปย่อในตารางรายการ */
export const THUMB_EDGE = 160;

/** เพดานความกว้างหรือสูงที่ยอมรับ — กันรูปที่บีบอัดไว้เล็กแต่คลายออกมาแล้วกินแรมเป็นกิกะไบต์ */
export const MAX_EDGE = 2000;

/** คุณภาพ JPEG ตอนย่อ — ตรงกับ PIC_Q ของรุ่น 6.4 */
export const PIC_QUALITY = 0.62;

/** พื้นที่รูปสูงสุดต่ออู่หนึ่งราย */
export const TENANT_PIC_QUOTA = 200 * 1024 * 1024;

export interface PicInfo {
  mime: PicMime;
  width: number;
  height: number;
}

/**
 * ชนิดไฟล์จริงจากไบต์แรก ๆ
 * ไม่ดู file.type และไม่ดูนามสกุล เพราะทั้งสองอย่างผู้ส่งตั้งเองได้
 */
export function sniffMime(b: Uint8Array): PicMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  return null;
}

/** ขนาดจากส่วนหัวของ PNG — อยู่ที่ IHDR ตำแหน่งคงที่ */
function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /* ชังก์แรกต้องเป็น IHDR เสมอตามมาตรฐาน ถ้าไม่ใช่แปลว่าไฟล์ไม่ถูกต้อง */
  if (String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== 'IHDR') return null;
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/**
 * ขนาดจากส่วนหัวของ JPEG — ต้องไล่ segment ไปเรื่อย ๆ จนเจอ SOF
 * ตำแหน่งไม่คงที่เพราะไฟล์จากกล้องมี EXIF และ thumbnail คั่นอยู่ก่อน
 */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 1 < b.length) {
    /* บาง encoder ใส่ 0xFF ซ้ำคั่นระหว่าง segment ได้ตามมาตรฐาน */
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1]!;
    while (marker === 0xff && i + 2 < b.length) { i++; marker = b[i + 1]!; }

    /* marker ที่ไม่มีตัวความยาวตามหลัง */
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;   /* จบไฟล์ หรือเริ่มข้อมูลภาพแล้ว */

    if (i + 3 >= b.length) return null;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2) return null;

    /* SOF0–SOF15 คือช่วง 0xC0–0xCF ยกเว้นสามตัวที่ไม่ใช่ SOF */
    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 8 >= b.length) return null;
      return {
        height: (b[i + 5]! << 8) | b[i + 6]!,
        width: (b[i + 7]! << 8) | b[i + 8]!,
      };
    }
    i += 2 + len;
  }
  return null;
}

export type PicCheck =
  | { ok: true; info: PicInfo }
  | { ok: false; error: string };

/**
 * ตรวจไฟล์ทั้งใบ — ชนิด ขนาดไบต์ และความกว้างสูง
 * ข้อความบอกด้วยว่าต้องแก้อย่างไร ไม่ใช่แค่บอกว่าไม่ผ่าน
 */
export function checkPic(bytes: Uint8Array): PicCheck {
  if (bytes.length === 0) return { ok: false, error: 'ไฟล์ว่าง' };

  if (bytes.length > MAX_PIC_BYTES) {
    return {
      ok: false,
      error: `ไฟล์ใหญ่ ${Math.round(bytes.length / 1024)} KB เกิน `
        + `${MAX_PIC_BYTES / 1024} KB — ปกติเบราว์เซอร์ย่อให้ก่อนส่งอยู่แล้ว `
        + 'ถ้าเจอข้อความนี้แปลว่าการย่อไม่ทำงาน ลองใหม่อีกครั้ง',
    };
  }

  const mime = sniffMime(bytes);
  if (!mime) {
    return { ok: false, error: 'ไฟล์นี้ไม่ใช่รูป JPEG หรือ PNG — เลือกไฟล์รูปแล้วลองใหม่' };
  }

  const size = mime === 'image/png' ? pngSize(bytes) : jpegSize(bytes);
  if (!size || !size.width || !size.height) {
    return { ok: false, error: 'อ่านขนาดรูปไม่ได้ — ไฟล์อาจเสียหาย ลองเปิดดูก่อนแล้วบันทึกใหม่' };
  }
  if (size.width > MAX_EDGE || size.height > MAX_EDGE) {
    return {
      ok: false,
      error: `รูปกว้าง ${size.width} สูง ${size.height} จุด เกิน ${MAX_EDGE} จุด — `
        + 'ปกติเบราว์เซอร์ย่อให้ก่อนส่งอยู่แล้ว ลองใหม่อีกครั้ง',
    };
  }

  return { ok: true, info: { mime, width: size.width, height: size.height } };
}
