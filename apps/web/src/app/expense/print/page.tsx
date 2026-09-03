import { EXPENSE_CATS } from '@drivegolight/core';
import { requireExport } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { listBuyDocs } from '@/lib/purchases';
import { rangeFromParams } from '@/components/doc-date-filter';
import { baht, thDate, thDateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CAT_LABEL = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c.label]));
const KIND_LABEL: Record<string, string> = { PO: 'ซื้อสินค้า', EX: 'ค่าใช้จ่าย' };

export default async function ExpensePrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; cat?: string; from?: string; to?: string; month?: string; year?: string;
  }>;
}) {
  await requireExport('expense', 'purchase');
  const sp = await searchParams;
  const { from, to } = rangeFromParams(sp);

  const { rows, total } = await listBuyDocs({
    kind: sp.kind, cat: sp.cat, search: sp.q, from, to, all: true,
  });

  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    Math.round(rows.reduce((s, r) => s + pick(r), 0) * 100) / 100;

  const notes = [
    sp.q ? `ค้นหา "${sp.q}"` : '',
    sp.kind ? KIND_LABEL[sp.kind] ?? '' : '',
    sp.cat ? CAT_LABEL[sp.cat] ?? '' : '',
    from || to ? `${from ? thDateLong(from) : 'เริ่มต้น'} ถึง ${to ? thDateLong(to) : 'ปัจจุบัน'}` : '',
  ].filter(Boolean);

  return (
    <ListPaper
      backHref="/expense"
      backLabel="กลับหน้ารายจ่าย"
      title="รายการรายจ่าย"
      en="EXPENSE LIST"
      filterNote={notes.length ? notes.join(' · ') : `ทั้งหมด ${total.toLocaleString('en-US')} รายการ`}
      hint="ยอดที่แสดงเป็นยอดที่ต้องจ่ายจริงหลังหักภาษี ณ ที่จ่ายแล้ว"
    >
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th style={{ width: 96 }}>เลขที่</th>
            <th style={{ width: 62 }}>วันที่</th>
            <th style={{ width: 60 }}>ชนิด</th>
            <th>ผู้ขาย / ผู้รับเงิน</th>
            <th style={{ width: 74 }}>หมวด</th>
            <th style={{ width: 88 }}>ใบกำกับผู้ขาย</th>
            <th style={{ width: 74 }}>ยอดจ่าย</th>
            <th style={{ width: 68 }}>จ่ายแล้ว</th>
            <th style={{ width: 68 }}>คงค้าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td>{r.docNo}</td>
              <td>{thDate(r.docDate)}</td>
              <td style={{ fontSize: 11 }}>{KIND_LABEL[r.kind] ?? r.kind}</td>
              <td>{r.partyName || '-'}</td>
              <td style={{ fontSize: 11 }}>{r.expenseCat ? CAT_LABEL[r.expenseCat] ?? '' : ''}</td>
              <td style={{ fontSize: 11 }}>{r.refDocNo || ''}</td>
              <td style={{ textAlign: 'right' }}>{baht(r.payable)}</td>
              <td style={{ textAlign: 'right' }}>{baht(r.paid)}</td>
              <td style={{ textAlign: 'right' }}>{r.outstanding > 0.004 ? baht(r.outstanding) : ''}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center' }}>ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} style={{ textAlign: 'right' }}>
              <b>รวม {rows.length.toLocaleString('en-US')} รายการ</b>
            </td>
            <td style={{ textAlign: 'right' }}><b>{baht(sum((r) => r.payable))}</b></td>
            <td style={{ textAlign: 'right' }}><b>{baht(sum((r) => r.paid))}</b></td>
            <td style={{ textAlign: 'right' }}><b>{baht(sum((r) => Math.max(0, r.outstanding)))}</b></td>
          </tr>
        </tfoot>
      </table>
    </ListPaper>
  );
}
