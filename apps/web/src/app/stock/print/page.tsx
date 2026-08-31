import { STOCK_FLAG_LABEL, type StockFlag } from '@drivegolight/core';
import { requirePerm } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { listCategories, listProducts } from '@/lib/products';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StockPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; reorder?: string; all?: string; flag?: string }>;
}) {
  await requirePerm('stock');
  const sp = await searchParams;
  const flag = (['min', 'max', 'dead'] as const).find((f) => f === sp.flag);

  const [cats, { rows, total, stockValue }] = await Promise.all([
    listCategories(),
    listProducts({
      search: sp.q,
      categoryId: sp.cat,
      onlyReorder: sp.reorder === '1',
      flag,
      includeInactive: sp.all === '1',
      all: true,
    }),
  ]);

  const notes = [
    sp.q ? `ค้นหา "${sp.q}"` : '',
    sp.cat ? `หมวด ${cats.find((c) => c.id === sp.cat)?.name ?? '-'}` : '',
    sp.reorder === '1' ? 'เฉพาะที่ต้องสั่งซื้อ' : '',
    flag ? STOCK_FLAG_LABEL[flag] : '',
    sp.all === '1' ? 'รวมที่ปิดใช้งาน' : '',
  ].filter(Boolean);

  /* จำนวนคอลัมน์ก่อนช่องยอดรวมท้ายตาราง — แก้หัวตารางแล้วต้องแก้ตรงนี้ด้วย */
  const COLS_BEFORE_VALUE = 8;

  return (
    <ListPaper
      backHref="/stock"
      backLabel="กลับทะเบียนสินค้า"
      title="รายการสต๊อกอะไหล่"
      en="STOCK LIST"
      filterNote={notes.length ? notes.join(' · ') : `ทั้งหมด ${total.toLocaleString('en-US')} รายการ`}
      hint={
        <>
          <b>Min</b> = ถึงจุดสั่งซื้อ · <b>Max</b> = เกินระดับสูงสุด · <b>ค้าง</b> = ไม่เคลื่อนไหวตั้งแต่ 6 เดือน
          <br />
          ราคาที่พิมพ์เป็นราคาขายระดับ A เท่านั้น ระดับ B และ C ไม่พิมพ์ลงกระดาษที่อาจหลุดถึงมือลูกค้า
        </>
      }
    >
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th style={{ width: 86 }}>รหัสสินค้า</th>
            <th style={{ width: 92 }}>รหัสอ้างอิง</th>
            <th>ชื่อสินค้า</th>
            <th style={{ width: 76 }}>หมวดหมู่</th>
            <th style={{ width: 38 }}>หน่วย</th>
            <th style={{ width: 64 }}>ต้นทุน</th>
            <th style={{ width: 64 }}>ราคาขาย</th>
            <th style={{ width: 46 }}>คงเหลือ</th>
            <th style={{ width: 36 }}>Min</th>
            <th style={{ width: 36 }}>Max</th>
            <th style={{ width: 72 }}>เคลื่อนไหวล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td>
                {p.code}
                {p.flags.length ? (
                  <span style={{ fontSize: 9.5, color: '#666' }}>
                    {' '}
                    {p.flags.map((f: StockFlag) => (f === 'min' ? 'Min' : f === 'max' ? 'Max' : 'ค้าง')).join('/')}
                  </span>
                ) : null}
              </td>
              <td>{p.oem || ''}</td>
              <td>{p.name}</td>
              <td style={{ fontSize: 11 }}>{p.categoryName ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{p.unit}</td>
              <td style={{ textAlign: 'right' }}>{baht(p.lastCost)}</td>
              <td style={{ textAlign: 'right' }}>{baht(p.priceA)}</td>
              <td style={{ textAlign: 'right' }}>{p.qtyOnHand.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'right' }}>{p.qtyMin.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'right' }}>{p.qtyMax > 0 ? p.qtyMax.toLocaleString('en-US') : ''}</td>
              <td style={{ fontSize: 11 }}>{thDate(p.lastMoveOn)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={COLS_BEFORE_VALUE} style={{ textAlign: 'right' }}>
              <b>มูลค่าสต๊อกตามต้นทุน ({total.toLocaleString('en-US')} รายการ)</b>
            </td>
            <td colSpan={4}><b>{baht(stockValue)}</b> บาท</td>
          </tr>
        </tfoot>
      </table>
    </ListPaper>
  );
}
