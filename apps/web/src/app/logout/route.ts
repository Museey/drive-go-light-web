import { signOut } from '@/lib/auth';
import { seeOther } from '@/lib/http';

/** ออกจากระบบผ่าน POST เท่านั้น — กัน GET จากลิงก์หรือรูปทำให้ผู้ใช้หลุดออกโดยไม่ตั้งใจ */
export async function POST(): Promise<Response> {
  await signOut();
  /* path ล้วน ไม่ประกอบจาก request.url — บน Render นั่นคือที่อยู่ภายในหลัง proxy */
  return seeOther('/login');
}
