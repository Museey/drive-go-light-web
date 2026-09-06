import { requireCost, requireExport } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { getFinanceCsvRows } from '@/lib/reports';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * พิมพ์รายรับรายจ่ายลงกระดาษ หรือบันทึกเป็น PDF
 *
 * รุ่น 6.4 เรียกปุ่มนี้ว่า "พิมพ์ PDF" แต่ไม่ได้มีตัวสร้าง PDF อยู่ในโปรแกรม —
 * finExportPdf() ของมันเรียก doPrint() แล้วให้ผู้ใช้เลือก "บันทึกเป็น PDF"
 * ในกล่องพิมพ์ของเบราว์เซอร์ ตามที่หน้าต่างของมันเขียนบอกไว้เอง
 * เราทำแบบเดียวกัน จึงไม่ต้องลงไลบรารี PDF ที่ต้องคอยตามดูแลเรื่องฟอนต์ไทย
 *
 * ตัวเลขมาจาก getFinanceCsvRows() ตัวเดียวกับที่ /finance/csv ใช้ —
 * กระดาษกับไฟล์จึงตรงกันเสมอโดยไม่ต้องมีใครคอยดูแลให้ตรง
 */
export default async function FinancePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireExport('finance', 'sales');
  await requireCost();

  const sp = await searchParams;
  const rows = await getFinanceCsvRows(sp.from || undefined, sp.to || undefined);

  const range = sp.from || sp.to
    ? `${sp.from ? thDate(sp.from) : 'เริ่มแรก'} ถึง ${sp.to ? thDate(sp.to) : 'ปัจจุบัน'}`
    : 'ทั้งหมด';

  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((a, r) => a + pick(r), 0);

  return (
    <ListPaper
      backHref="/finance/sales"
      backLabel="กลับหน้าการเงิน"
      title="รายรับรายจ่าย"
      en="Income and Expenses"
      filterNote={`ช่วงเวลา ${range} · ${rows.length.toLocaleString()} รายการ`}
      hint="ตัวเลขตามตัวกรองที่เลือก ณ เวลาที่พิมพ์"
    >
      <table className="doc" style={{ fontSize: 10 }}>
        <thead>
          <tr>
            <th>ประเภท</th>
            <th>เลขที่</th>
            <th>วันที่</th>
            <th>คู่ค้า</th>
            <th className="num">ก่อนภาษี</th>
            <th className="num">VAT</th>
            <th className="num">หัก ณ ที่จ่าย</th>
            <th className="num">ยอดสุทธิ</th>
            <th className="num">ชำระแล้ว</th>
            <th className="num">คงค้าง</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={i}>
              <td>{r.group}</td>
              <td className="mono">{r.docNo}</td>
              <td>{thDate(r.docDate)}</td>
              <td>{r.party}</td>
              <td className="num">{baht(r.net)}</td>
              <td className="num">{baht(r.vat)}</td>
              <td className="num">{baht(r.wht)}</td>
              <td className="num">{baht(r.payable)}</td>
              <td className="num">{baht(r.paid)}</td>
              <td className="num">{baht(r.outstanding)}</td>
              <td>{r.status}</td>
            </tr>
          )) : (
            <tr><td colSpan={11} className="empty">ไม่มีรายการในช่วงที่เลือก</td></tr>
          )}
        </tbody>
        {rows.length ? (
          <tfoot>
            <tr>
              <th colSpan={4} className="num">รวม</th>
              <th className="num">{baht(sum((r) => r.net))}</th>
              <th className="num">{baht(sum((r) => r.vat))}</th>
              <th className="num">{baht(sum((r) => r.wht))}</th>
              <th className="num">{baht(sum((r) => r.payable))}</th>
              <th className="num">{baht(sum((r) => r.paid))}</th>
              <th className="num">{baht(sum((r) => r.outstanding))}</th>
              <th />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </ListPaper>
  );
}
