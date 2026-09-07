/**
 * ส่งค่าลับให้ผู้ใช้โดยไม่พิมพ์ลงหน้าจอ
 *
 * เครื่องมือที่พิมพ์ connection string หรือลิงก์ตั้งรหัสผ่านออกมาเต็ม ๆ
 * **เชิญให้คนก๊อปทั้งก้อนไปวางในแชทหรือในตั๋วงาน** ซึ่งเกิดขึ้นจริงมาแล้วสองครั้ง
 * ในโปรเจกต์นี้ และทั้งสองครั้งต้องเปลี่ยนรหัสผ่านใหม่
 *
 * ค่าจึงถูกส่งเข้าคลิปบอร์ดแทน แล้วพิมพ์แค่ "รูปร่าง" ออกมาให้ตรวจว่าถูกตัว
 * เครื่องที่ไม่มีคลิปบอร์ด (เซิร์ฟเวอร์) ต้องสั่ง --show เอง ซึ่งทำให้การพิมพ์
 * ค่าลับลงหน้าจอเป็น **การตัดสินใจ** ไม่ใช่ค่าตั้งต้น
 */
import { spawnSync } from 'node:child_process';

/** คำสั่งคลิปบอร์ดตามระบบปฏิบัติการ — ลองไปเรื่อยจนกว่าจะเจอตัวที่มี */
const COPIERS = [
  ['pbcopy', []],                                   // macOS
  ['wl-copy', []],                                  // Linux + Wayland
  ['xclip', ['-selection', 'clipboard']],           // Linux + X11
  ['xsel', ['--clipboard', '--input']],
];

/** คืนชื่อคำสั่งที่ใช้ได้ หรือ null ถ้าเครื่องนี้ไม่มีคลิปบอร์ด */
export function copyToClipboard(text) {
  for (const [cmd, args] of COPIERS) {
    const r = spawnSync(cmd, args, { input: text });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

/**
 * รูปร่างของ connection string แบบไม่มีรหัสผ่าน
 *
 * พอให้ตรวจว่าหยิบถูกตัว — ผู้ใช้ · โฮสต์ · ฐานข้อมูล คือสามอย่างที่พลาดได้จริง
 * (เอา role ของผู้ดูแลมาใช้เป็นของแอป · เอา External มาใช้ตอนที่ต้องใช้ Internal)
 */
export function urlShape(value) {
  try {
    const u = new URL(value);
    const host = u.hostname + (u.port ? `:${u.port}` : '');
    return [
      `ผู้ใช้      ${u.username || '(ไม่มี)'}`,
      `รหัสผ่าน    ${u.password ? `(มี ${u.password.length} ตัว)` : '(ไม่มี)'}`,
      `โฮสต์      ${host}${host.includes('.') ? '' : '   ← ไม่มีจุด แปลว่าเป็นที่อยู่ภายใน'}`,
      `ฐานข้อมูล   ${u.pathname.replace(/^\//, '') || '(ไม่ได้ระบุ)'}`,
      `พารามิเตอร์ ${u.search || '(ไม่มี)'}`,
    ].join('\n  ');
  } catch {
    return `(อ่านเป็น URL ไม่ได้ · ยาว ${String(value).length} ตัวอักษร)`;
  }
}

/** รูปร่างของลิงก์ — โชว์ที่อยู่แต่ปิดโทเคนท้าย URL */
export function linkShape(value) {
  try {
    const u = new URL(value);
    const parts = u.pathname.split('/');
    const token = parts.pop() ?? '';
    return `${u.origin}${parts.join('/')}/<โทเคน ${token.length} ตัวอักษร>`;
  } catch {
    return `(อ่านเป็น URL ไม่ได้ · ยาว ${String(value).length} ตัวอักษร)`;
  }
}

/**
 * ส่งค่าลับออกไป
 *
 * @param value  ค่าที่ต้องเก็บเป็นความลับ
 * @param opts.title  หัวข้อที่พิมพ์นำ
 * @param opts.shape  ฟังก์ชันย่อค่าให้ปลอดภัยพอจะพิมพ์ได้
 * @param opts.show   พิมพ์ค่าจริงลงหน้าจอ (มาจาก --show)
 * @param opts.log    ตัวพิมพ์ ใส่เองได้เพื่อให้เทสต์ตรวจสิ่งที่พิมพ์ออกมา
 * @param opts.copy   ตัวคัดลอก ใส่เองได้เพื่อให้เทสต์ไม่ต้องแตะคลิปบอร์ดจริง
 */
export function emitSecret(value, {
  title, shape = urlShape, show = false, log = console.log, copy = copyToClipboard,
} = {}) {
  log(`\n═══ ${title} ═══\n`);
  log('  ' + shape(value));

  if (show) {
    log(`\n${value}\n`);
    log('  พิมพ์ออกหน้าจอเพราะสั่ง --show — ระวังประวัติคำสั่งและการก๊อปไปวางที่อื่น\n');
    return 'shown';
  }

  const via = copy(value);
  if (via) {
    log('\n  ก๊อปลงคลิปบอร์ดแล้ว — วางได้เลย ไม่ต้องพิมพ์');
    log('  ไม่ได้พิมพ์ค่าจริงลงหน้าจอ จะได้ไม่ติดไปกับภาพหน้าจอหรือประวัติคำสั่ง\n');
    return via;
  }

  log('\n  เครื่องนี้ไม่มีคำสั่งคลิปบอร์ด — สั่งซ้ำด้วย --show ถ้าต้องการให้พิมพ์ออกมา\n');
  return null;
}
