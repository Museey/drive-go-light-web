import { requireExport } from '@/lib/auth';
import { listReceivables } from '@/lib/receivables';
import { AR_HEADERS, BOM, csvDownloadHeaders, csvField } from '@/lib/csv';
import { KIND_SHORT } from '@/lib/format';

/**
 * ส่งออกลูกหนี้คงค้างเป็น CSV — ?q=&overdue=1
 *
 * **ส่งออกทุกแถวที่ตรงเงื่อนไขที่กรองอยู่** ไม่ใช่เฉพาะที่เห็นบนจอ
 * กติกาเดียวกับหน้าพิมพ์ — ไฟล์ที่ได้ไม่ครบคือไฟล์ที่เอาไปทำบัญชีไม่ได้
 */
export async function GET(request: Request) {
  await requireExport('finance', 'ar');

  const sp = new URL(request.url).searchParams;
  const search = sp.get('q') || undefined;
  const onlyOverdue = sp.get('overdue') === '1';

  const { rows } = await listReceivables({ search, onlyOverdue });

  const lines = [AR_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.docNo, KIND_SHORT[r.kind] ?? r.kind, r.partyName, r.vehiclePlate,
      r.docDate, r.dueDate ?? '',
      r.payable.toFixed(2), r.paid.toFixed(2), r.outstanding.toFixed(2),
      /* ยังไม่ถึงกำหนดหรือไม่มีวันครบกำหนด ให้เป็นศูนย์ ไม่ใช่เลขติดลบที่อ่านไม่ออก */
      r.daysOverdue > 0 ? String(r.daysOverdue) : '0',
    ].map(csvField).join(','));
  }

  const stamp = onlyOverdue ? 'เกินกำหนด' : 'ทั้งหมด';
  const ascii = onlyOverdue ? 'overdue' : 'all';

  return new Response(BOM + lines.join('\n'), {
    headers: csvDownloadHeaders(`drivegolight-receivables-${ascii}.csv`, `drivegolight-ลูกหนี้-${stamp}.csv`),
  });
}
