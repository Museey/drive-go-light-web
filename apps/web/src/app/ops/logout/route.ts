import { redirect } from 'next/navigation';
import { opsSignOut } from '@/lib/ops-auth';

/** ออกจากคอนโซล — ไม่แตะ session ของอู่ที่อาจเปิดค้างอยู่ในเบราว์เซอร์เดียวกัน */
export async function GET() {
  await opsSignOut();
  redirect('/ops/login');
}
