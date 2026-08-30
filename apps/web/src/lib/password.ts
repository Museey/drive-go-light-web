import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** promisify() ของ node:util มี type ที่ไม่รับ overload ที่มี options — ห่อเองชัดกว่า */
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * แฮชรหัสผ่านด้วย scrypt จาก node:crypto
 *
 * ทำไม scrypt ไม่ใช่ argon2id: argon2id ดีกว่าเล็กน้อยในทางทฤษฎี แต่ต้องลงไลบรารี
 * ที่คอมไพล์เนทีฟ ซึ่งพังบ่อยเวลาเปลี่ยนเครื่องหรือเปลี่ยนรุ่น Node
 * scrypt อยู่ใน Node อยู่แล้ว ไม่มี dependency และ OWASP ยอมรับให้ใช้ได้
 * ถ้าวันหนึ่งจะย้ายไป argon2id ก็ทำได้ เพราะรูปแบบที่เก็บมีชื่ออัลกอริทึมนำหน้าอยู่แล้ว
 *
 * รูปแบบที่เก็บ: scrypt$N$r$p$<salt base64>$<hash base64>
 * เก็บพารามิเตอร์ไปด้วยเพื่อให้ปรับความหนักขึ้นในอนาคตได้โดยรหัสผ่านเดิมยังใช้ได้
 */

const N = 32768;   // 2^15 — ใช้หน่วยความจำราว 32 MB ต่อครั้ง
const r = 8;
const p = 2;
const KEY_LEN = 32;
const SALT_LEN = 16;

/** เผื่อหน่วยความจำให้พอกับ N·r·128·p ไม่งั้น Node จะปฏิเสธ */
const MAX_MEMORY = 256 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(plain.normalize('NFKC'), salt, KEY_LEN, { N, r, p, maxmem: MAX_MEMORY });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * ตรวจรหัสผ่าน — เทียบแบบ timing-safe เสมอ
 * คืน false เมื่อรูปแบบที่เก็บไว้อ่านไม่ออก แทนที่จะโยน error
 * เพื่อไม่ให้แยกได้ว่า "ผู้ใช้ไม่มีรหัสผ่าน" กับ "รหัสผ่านผิด" ต่างกันอย่างไร
 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, sN, sr, sp, saltB64, hashB64] = parts;
  const params = { N: Number(sN), r: Number(sr), p: Number(sp) };
  if (!params.N || !params.r || !params.p) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashB64!, 'base64');
    salt = Buffer.from(saltB64!, 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  try {
    const key = await scrypt(plain.normalize('NFKC'), salt, expected.length, {
      ...params, maxmem: MAX_MEMORY,
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * เกณฑ์รหัสผ่านขั้นต่ำ — คืนข้อความบอกปัญหา หรือ null ถ้าผ่าน
 *
 * เอาความยาวเป็นหลักตามคำแนะนำของ NIST ไม่บังคับให้ผสมอักขระพิเศษ
 * เพราะกฎยิบย่อยทำให้คนตั้งรหัสที่เดาง่ายแต่พิมพ์ยาก
 */
export function checkPasswordStrength(plain: string): string | null {
  if (plain.length < 10) return 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร';
  if (plain.length > 200) return 'รหัสผ่านยาวเกินไป';
  if (/^\s|\s$/.test(plain)) return 'รหัสผ่านต้องไม่ขึ้นต้นหรือลงท้ายด้วยช่องว่าง';

  const common = ['password', '1234567890', 'qwertyuiop', 'drivegolight', 'อออออออออ'];
  if (common.some((c) => plain.toLowerCase().includes(c))) {
    return 'รหัสผ่านนี้เดาง่ายเกินไป';
  }
  return null;
}
