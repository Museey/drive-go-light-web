import { STOCK_FLAG_LABEL, STOCK_FLAG_SHORT, toStockFlag, type StockFlag } from '@drivegolight/core';
import { requireExport } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { listCategories, listProducts } from '@/lib/products';
import { getStockHiddenCols, STOCK_COLS } from '@/lib/ui-prefs';
import { canCost } from '@/lib/perms';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StockPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; reorder?: string; all?: string; flag?: string }>;
}) {
  const session = await requireExport('stock', 'list');
  const sp = await searchParams;
  const flag = toStockFlag(sp.flag);

  const [cats, hidden, { rows, total, stockValue }] = await Promise.all([
    listCategories(),
    getStockHiddenCols(),
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

  /* เอกสารที่พิมพ์ซ่อนคอลัมน์ชุดเดียวกับหน้าจอ ตามรุ่นเดิม
     ยกเว้นราคา B และ C ที่ไม่พิมพ์ลงกระดาษเลย เพราะกระดาษหลุดถึงมือลูกค้าได้ */
  /* ต้นทุนถูกซ่อนได้สองทาง — ผู้ใช้เลือกซ่อนคอลัมน์เอง หรือไม่มีสิทธิ์เห็นต้นทุน
     ตรงกับ colOn() ของรุ่น 6.4 ที่รวมสองเงื่อนไขนี้ไว้ในที่เดียว */
  const seeCost = canCost(session);
  const show = (k: string) => (k === 'cost' && !seeCost ? false : !hidden.includes(k as never));
  const PRINTABLE = ['cost', 'qty', 'min', 'max', 'move'];
  const hiddenHere = STOCK_COLS.filter(([k]) => PRINTABLE.includes(k) && !show(k));

  /* จำนวนคอลัมน์ก่อนช่องยอดรวมท้ายตาราง — นับตามที่แสดงจริง */
  const colsBeforeValue = 6 + (show('cost') ? 1 : 0) + 1;
  const colsAfterValue = (show('qty') ? 1 : 0) + (show('min') ? 1 : 0)
                       + (show('max') ? 1 : 0) + (show('move') ? 1 : 0);

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
          {hiddenHere.length ? (
            <>
              <br />
              เอกสารนี้ซ่อนคอลัมน์ {hiddenHere.map(([, label]) => label).join(' · ')} ไว้ตามการตั้งค่าหน้าจอ
              หากต้องการรายการเต็ม ให้เปิดคอลัมน์ที่หน้าทะเบียนสินค้าแล้วสั่งพิมพ์ใหม่
            </>
          ) : null}
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
            {show('cost') ? <th style={{ width: 64 }}>ต้นทุน</th> : null}
            <th style={{ width: 64 }}>ราคาขาย</th>
            {show('qty') ? <th style={{ width: 46 }}>คงเหลือ</th> : null}
            {show('min') ? <th style={{ width: 36 }}>Min</th> : null}
            {show('max') ? <th style={{ width: 36 }}>Max</th> : null}
            {show('move') ? <th style={{ width: 72 }}>เคลื่อนไหวล่าสุด</th> : null}
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
                    {p.flags.map((f: StockFlag) => STOCK_FLAG_SHORT[f]).join('/')}
                  </span>
                ) : null}
              </td>
              <td>{p.oem || ''}</td>
              <td>{p.name}</td>
              <td style={{ fontSize: 11 }}>{p.categoryName ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{p.unit}</td>
              {show('cost') ? <td style={{ textAlign: 'right' }}>{baht(p.lastCost)}</td> : null}
              <td style={{ textAlign: 'right' }}>{baht(p.priceA)}</td>
              {show('qty') ? <td style={{ textAlign: 'right' }}>{p.qtyOnHand.toLocaleString('en-US')}</td> : null}
              {show('min') ? <td style={{ textAlign: 'right' }}>{p.qtyMin.toLocaleString('en-US')}</td> : null}
              {show('max') ? (
                <td style={{ textAlign: 'right' }}>{p.qtyMax > 0 ? p.qtyMax.toLocaleString('en-US') : ''}</td>
              ) : null}
              {show('move') ? <td style={{ fontSize: 11 }}>{thDate(p.lastMoveOn)}</td> : null}
            </tr>
          ))}
        </tbody>
        {show('cost') ? (
          <tfoot>
            <tr>
              <td colSpan={colsBeforeValue} style={{ textAlign: 'right' }}>
                <b>มูลค่าสต๊อกตามต้นทุน ({total.toLocaleString('en-US')} รายการ)</b>
              </td>
              <td colSpan={Math.max(1, colsAfterValue)}><b>{baht(stockValue)}</b> บาท</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </ListPaper>
  );
}
