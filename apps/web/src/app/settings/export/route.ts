import { query, requirePerm } from '@/lib/auth';
import { backupFileName, exportBackupWith } from '@/lib/backup';

/**
 * ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมด
 * เป็น route ไม่ใช่ server action เพราะต้องส่งไฟล์ให้เบราว์เซอร์ดาวน์โหลดตรง ๆ
 */
export async function GET() {
  await requirePerm('settings');
  const data = await query((c) => exportBackupWith(c));

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${backupFileName()}"`,
      'cache-control': 'no-store',
    },
  });
}
