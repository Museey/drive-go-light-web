import { healthChecks } from '@/lib/ops';

export const dynamic = 'force-dynamic';

/**
 * ตัวตรวจสุขภาพสำหรับระบบเฝ้าระวังและตัวถ่วงน้ำหนัก
 *
 * ตอบ 503 เมื่อของที่แอปพึ่งพาไม่พร้อม — ตัวตรวจที่ตอบ 200 เสมอไม่มีประโยชน์
 * เพราะจะบอกว่าปกติในขณะที่ผู้ใช้เปิดหน้าไม่ได้เลย
 *
 * ไม่ต้องล็อกอิน แต่บอกแค่ชื่อการตรวจที่ตก ไม่บอกรายละเอียดระบบให้คนนอก
 */
export async function GET() {
  const checks = await healthChecks();
  const ok = checks.every((c) => c.ok);

  return Response.json(
    { ok, failed: checks.filter((c) => !c.ok).map((c) => c.name) },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
