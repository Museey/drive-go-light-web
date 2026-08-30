import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

/** ออกจากระบบผ่าน POST เท่านั้น — กัน GET จากลิงก์หรือรูปทำให้ผู้ใช้หลุดออกโดยไม่ตั้งใจ */
export async function POST(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
