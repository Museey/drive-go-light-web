import { requirePerm } from '@/lib/auth';
import { exportProductsCsv, productsCsvTemplate } from '@/lib/products-csv';

/** ส่งออกทะเบียนสินค้าเป็น CSV — ใส่ ?template=1 เพื่อขอไฟล์ต้นแบบเปล่า */
export async function GET(request: Request) {
  await requirePerm('stock');
  const wantTemplate = new URL(request.url).searchParams.get('template') === '1';

  const body = wantTemplate ? productsCsvTemplate() : await exportProductsCsv();
  const name = wantTemplate ? 'drivegolight-products-template.csv' : 'drivegolight-products.csv';

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
