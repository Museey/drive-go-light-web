import { requireCost, requireExport } from '@/lib/auth';
import { getFinanceCsvRows } from '@/lib/reports';
import { BOM, csvDownloadHeaders, csvField, FINANCE_HEADERS } from '@/lib/csv';

/** ส่งออกรายรับรายจ่ายในช่วงที่เลือกเป็น CSV — ?from=&to= */
export async function GET(request: Request) {
  await requireExport('finance', 'sales');
  await requireCost();

  const sp = new URL(request.url).searchParams;
  const from = sp.get('from') || undefined;
  const to = sp.get('to') || undefined;

  const rows = await getFinanceCsvRows(from, to);

  const lines = [FINANCE_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.group, r.docNo, r.docDate, r.party,
      r.net.toFixed(2), r.vat.toFixed(2), r.wht.toFixed(2),
      r.payable.toFixed(2), r.paid.toFixed(2), r.outstanding.toFixed(2),
      r.status,
    ].map(csvField).join(','));
  }

  const stamp = [from, to].filter(Boolean).join('_') || 'ทั้งหมด';
  /* ชื่อสำรองสำหรับตัวที่อ่าน RFC 5987 ไม่เป็น — ต้องเป็นอักษรอังกฤษล้วน */
  const ascii = [from, to].filter(Boolean).join('_') || 'all';

  return new Response(BOM + lines.join('\n'), {
    headers: csvDownloadHeaders(`drivegolight-finance-${ascii}.csv`, `drivegolight-รายรับรายจ่าย-${stamp}.csv`),
  });
}
