import { query, requireTab } from '@/lib/auth';
import { readPic } from '@/lib/pics';

/**
 * เสิร์ฟรูปสินค้า
 *
 *   /pics/<product_id>/<sha>          รูปเต็ม
 *   /pics/<product_id>/<sha>?t=1      รูปย่อสำหรับตาราง
 *
 * **content-type มาจากค่าที่เราสรุปเองตอนอัปโหลดโดยอ่านจากไบต์จริง**
 * ไม่ใช่ค่าที่ผู้ใช้ส่งมา บวก nosniff — ไม่งั้นไฟล์ที่หน้าตาเป็นรูปแต่ข้างในเป็น HTML
 * จะกลายเป็น XSS บนโดเมนของเราเอง (ตัวตรวจที่ pics-core.ts กันไว้อีกชั้นแล้ว)
 *
 * URL ผูกกับ SHA-256 ของตัวไฟล์ รูปเปลี่ยนแล้ว URL เปลี่ยนตาม จึงแคชได้ถาวร
 * ซึ่งเป็นสิ่งที่ทำให้หน้ารายการสินค้าที่มีรูป 50 แถวไม่กิน connection ทุกครั้งที่เปิด
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string; sha: string }> },
) {
  /* รูปคือข้อมูลของอู่ ต้องล็อกอินและมีสิทธิ์ดูทะเบียนสินค้าก่อน
     ไม่ต้องมีสิทธิ์ส่งออก เพราะเป็นการดูทีละรูปเหมือนดูหน้าสินค้า ไม่ใช่ดึงทั้งชุด */
  await requireTab('stock', 'list');

  const { productId, sha } = await params;
  if (!/^[0-9a-f]{64}$/.test(sha)) return new Response('ไม่พบรูป', { status: 404 });

  const wantThumb = new URL(request.url).searchParams.get('t') === '1';
  const pic = await query((c) => readPic(c, productId, sha, wantThumb ? 'thumb' : 'full'));
  if (!pic) return new Response('ไม่พบรูป', { status: 404 });

  return new Response(new Uint8Array(pic.bytes), {
    headers: {
      'content-type': pic.mime,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      /* URL ผูกกับเนื้อไฟล์แล้ว จึงแคชได้ถาวร — private เพราะเป็นข้อมูลของอู่
         ห้ามให้ proxy กลางทางเก็บไว้แล้วส่งให้อู่อื่น */
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}
