import { query, requireCost, requireExport } from '@/lib/auth';
import { backupFileName, exportBackupWith } from '@/lib/backup';

/**
 * ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมด
 * เป็น route ไม่ใช่ server action เพราะต้องส่งไฟล์ให้เบราว์เซอร์ดาวน์โหลดตรง ๆ
 *
 * ต้องมีสิทธิ์เห็นต้นทุนด้วย — ในไฟล์นี้มีต้นทุนของสินค้าทุกตัวและทุกใบซื้อ
 * กันแค่หน้าจอแล้วปล่อยให้กดดาวน์โหลดได้ การซ่อนต้นทุนก็ไม่มีความหมายเลย
 */
export async function GET() {
  await requireExport('settings', 'import');
  await requireCost();
  const data = await query((c) => exportBackupWith(c));

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${backupFileName()}"`,
      'cache-control': 'no-store',
    },
  });
}
