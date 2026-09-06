import { query, requireExport } from '@/lib/auth';
import { contactsCsvTemplate, exportContactsCsv } from '@/lib/contacts-csv';

/**
 * ส่งออกทะเบียนลูกค้าหรือผู้ขายเป็น CSV และดาวน์โหลดแบบฟอร์มเปล่า (07.3)
 *
 *   /contacts/csv?kind=customer             ข้อมูลจริงทั้งหมด
 *   /contacts/csv?kind=vendor&template=1    แบบฟอร์มพร้อมตัวอย่าง
 *
 * ไม่มีต้นทุนอยู่ในไฟล์นี้ จึงไม่ต้องเรียก requireCost() ต่างจาก CSV สินค้า
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const kind = sp.get('kind') === 'vendor' ? 'vendor' : 'customer';

  await requireExport('customer', kind);

  const wantTemplate = sp.get('template') === '1';
  const body = wantTemplate
    ? contactsCsvTemplate(kind)
    : await query((c) => exportContactsCsv(c, kind));

  const label = kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า';
  const name = wantTemplate
    ? `drivegolight-แบบฟอร์มนำเข้า${label}.csv`
    : `drivegolight-ทะเบียน${label}.csv`;

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      /* ชื่อไฟล์เป็นภาษาไทย ต้องส่งแบบ RFC 5987 ด้วย ไม่งั้นเบราว์เซอร์เก่าตั้งชื่อมั่ว */
      'content-disposition':
        `attachment; filename="contacts-${kind}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
    },
  });
}
