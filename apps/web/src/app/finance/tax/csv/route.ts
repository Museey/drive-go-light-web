import { canTab, requireExport } from '@/lib/auth';
import { BOM, csvDownloadHeaders, csvField } from '@/lib/csv';
import { todayIso } from '@/lib/license-window';
import { getPlus, PLUS_REQUIRED_MESSAGE } from '@/lib/plan';
import { getTaxReport, taxDocLabel, taxDocNeedsPayroll, taxDocOf, taxMonthOf } from '@/lib/tax';

/** ส่งออกเอกสารภาษีของงวดเป็น CSV — ?doc=&month= · ตัวเลขชุดเดียวกับหน้าจอ (getTaxReport ตัวเดียวกัน) */
export async function GET(request: Request) {
  const session = await requireExport('finance', 'tax');
  if (!(await getPlus())) return new Response(PLUS_REQUIRED_MESSAGE, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const doc = taxDocOf(sp.get('doc'));
  /* ไฟล์ที่มีเงินได้ของพนักงานรายคน — ต้องมีสิทธิ์แท็บเงินเดือนด้วย เหมือนหน้าจอ */
  if (taxDocNeedsPayroll(doc) && !canTab(session, 'finance', 'payroll')) {
    return new Response('ไฟล์นี้มีเงินได้ของพนักงานรายคน — ต้องมีสิทธิ์แท็บเงินเดือนพนักงาน', { status: 403 });
  }
  const month = taxMonthOf(sp.get('month'), todayIso());
  const report = await getTaxReport(doc, month);

  const rows: unknown[][] = [];
  if ('vat' in report) {
    rows.push(['ลำดับ', 'วันที่', 'เลขที่เอกสาร', 'เลขที่ใบกำกับภาษีของผู้ขาย',
      report.key === 'vat-out' ? 'ชื่อผู้ซื้อ' : 'ชื่อผู้ขาย', 'เลขประจำตัวผู้เสียภาษี', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', 'รวม']);
    report.vat.rows.forEach((r, i) => rows.push([
      i + 1, r.docDate, r.docNo, r.refDocNo, r.partyName, r.partyTaxId,
      r.net.toFixed(2), r.vat.toFixed(2), r.total.toFixed(2)]));
    rows.push(['', '', '', '', 'รวม', '', report.vat.net.toFixed(2), report.vat.vat.toFixed(2), report.vat.total.toFixed(2)]);
  } else if ('wht' in report) {
    rows.push(['ลำดับ', 'วันที่จ่าย', 'เลขที่เอกสาร', 'ผู้รับเงิน', 'เลขประจำตัวผู้เสียภาษี', 'ที่อยู่',
      'อัตรา (%)', 'จำนวนเงินที่จ่าย', 'ภาษีที่หัก']);
    report.wht.rows.forEach((r, i) => rows.push([
      i + 1, r.docDate, r.docNo, r.partyName, r.partyTaxId, r.partyAddr,
      r.rate, r.base.toFixed(2), r.wht.toFixed(2)]));
    rows.push(['', '', '', 'รวม', '', '', '', report.wht.base.toFixed(2), report.wht.wht.toFixed(2)]);
  } else if (report.key === 'sso') {
    const list = report.pay.rows.filter((r) => r.sso > 0.004);
    rows.push(['ลำดับ', 'เลขประจำตัวประชาชน', 'ชื่อผู้ประกันตน', 'ค่าจ้าง', 'เงินสมทบผู้ประกันตน']);
    list.forEach((r, i) => rows.push([i + 1, r.taxId, r.name, r.ssoWage.toFixed(2), r.sso.toFixed(2)]));
    rows.push(['', '', 'รวม', list.reduce((s, r) => s + r.ssoWage, 0).toFixed(2), report.pay.sso.toFixed(2)]);
  } else {
    rows.push(['ลำดับ', 'เลขประจำตัวผู้เสียภาษี', 'ชื่อผู้มีเงินได้', 'วันที่จ่าย', 'เงินได้ที่จ่าย', 'ภาษีที่หัก']);
    report.pay.rows.forEach((r, i) => rows.push([
      i + 1, r.taxId, r.name, report.pay.payDate ?? '', r.income.toFixed(2), r.wht.toFixed(2)]));
    rows.push(['', '', 'รวม', '', report.pay.income.toFixed(2), report.pay.wht.toFixed(2)]);
  }

  const body = rows.map((r) => r.map(csvField).join(',')).join('\n');
  return new Response(BOM + body, {
    headers: csvDownloadHeaders(`drivegolight-tax-${doc}-${month}.csv`, `drivegolight-${taxDocLabel(doc)}-${month}.csv`),
  });
}
