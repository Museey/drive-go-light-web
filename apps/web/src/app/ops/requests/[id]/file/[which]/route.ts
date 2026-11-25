import { isUuid } from '@/lib/ids';
import { requireOperator } from '@/lib/ops-auth';
import { getRequestFile } from '@/lib/ops-console';
import { sniffMime } from '@/lib/pics-core';

/**
 * รูปสลิป / 50 ทวิ ของคำขอ — เฉพาะผู้ให้บริการที่ล็อกอินอยู่ (ฐานข้อมูลตรวจ session อีกชั้น)
 *
 * content-type อ่านจากไบต์จริงอีกครั้ง ไม่ใช่จากคอลัมน์ที่บันทึกไว้อย่างเดียว + nosniff
 * แบบเดียวกับ /pics — ไฟล์ที่ข้างในเป็น HTML ต้องไม่กลายเป็นหน้าเว็บบนโดเมนเรา
 * ห้ามแคชทุกชั้น สลิปมีชื่อและเลขบัญชีของคนโอน
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; which: string }> },
) {
  const session = await requireOperator();
  const { id, which } = await params;
  if (!isUuid(id) || (which !== 'slip' && which !== 'wht')) {
    return new Response('ไม่พบไฟล์', { status: 404 });
  }

  const file = await getRequestFile(session, id, which);
  const mime = file ? sniffMime(file.bytes) : null;
  if (!file || !mime) return new Response('ไม่พบไฟล์ — อาจถูกลบตามรอบเก็บกวาด 90 วันแล้ว', { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': mime,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}
