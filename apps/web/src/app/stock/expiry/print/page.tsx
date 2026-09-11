import { today } from '@drivegolight/core';
import { requireExport } from '@/lib/auth';
import { canCost, HIDDEN_COST } from '@/lib/perms';
import { ListPaper } from '@/components/list-paper';
import { listExpiringLots } from '@/lib/products';
import { getShop } from '@/lib/queries';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** กระดาษสำหรับถือไปเดินดูของบนชั้นวาง — มีช่องให้เขียนว่าจัดการยังไง */
export default async function ExpiryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  const session = await requireExport('stock', 'list');
  const sp = await searchParams;
  const onlyExpired = sp.only === 'expired';
  const seeCost = canCost(session);

  const shop = await getShop();
  const all = await listExpiringLots(shop.expiryWarnDays);
  const rows = onlyExpired ? all.filter((r) => r.daysLeft < 0) : all;

  const now = today();
  const value = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ListPaper
      backHref={`/stock/expiry${onlyExpired ? '?only=expired' : ''}`}
      backLabel="กลับรายการของใกล้หมดอายุ"
      title={onlyExpired ? 'รายการของที่หมดอายุแล้ว' : 'รายการของใกล้หมดอายุ'}
      en={onlyExpired ? 'EXPIRED STOCK' : 'EXPIRING STOCK'}
      filterNote={
        onlyExpired
          ? `เฉพาะที่เลยวันหมดอายุแล้ว ณ ${thDate(now)}`
          : `หมดอายุภายใน ${shop.expiryWarnDays} วันนับจาก ${thDate(now)}`
      }
      hint={
        <>
          เรียงจากที่หมดอายุก่อน ซึ่งเป็นลำดับเดียวกับที่ระบบตัดออกจริง (หมดอายุก่อนออกก่อน)
          <br />
          จำนวนที่พิมพ์คือของที่เหลือ<b>ในล็อตนั้น</b> ไม่ใช่ยอดคงเหลือทั้งหมดของสินค้า —
          สินค้าตัวเดียวกันอาจมีหลายบรรทัดถ้ารับเข้ามาคนละรอบและหมดอายุคนละวัน
        </>
      }
    >
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th style={{ width: 90 }}>รหัส</th>
            <th>ชื่อสินค้า</th>
            <th style={{ width: 90 }}>หมวด</th>
            <th style={{ width: 80 }}>วันหมดอายุ</th>
            <th style={{ width: 52 }} className="num">เหลือ (วัน)</th>
            <th style={{ width: 70 }} className="num">จำนวน</th>
            {seeCost ? <th style={{ width: 70 }} className="num">มูลค่า</th> : null}
            <th style={{ width: 110 }}>จัดการอย่างไร</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={seeCost ? 9 : 8} style={{ textAlign: 'center' }}>
                ไม่มีของที่เข้าเงื่อนไข
              </td>
            </tr>
          ) : rows.map((r, i) => (
            <tr key={`${r.productId}:${r.expiresOn}`}>
              <td className="num">{i + 1}</td>
              <td className="mono">{r.code}</td>
              <td>{r.name}</td>
              <td>{r.categoryName || '-'}</td>
              <td>{thDate(r.expiresOn)}</td>
              <td className="num">{r.daysLeft < 0 ? `เลย ${Math.abs(r.daysLeft)}` : r.daysLeft}</td>
              <td className="num">{r.qty.toLocaleString('en-US')} {r.unit}</td>
              {seeCost ? <td className="num">{baht(r.value)}</td> : null}
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={{ textAlign: 'right' }}>
              รวม {rows.length.toLocaleString('en-US')} ล็อต
            </td>
            <td className="num">{rows.reduce((s, r) => s + r.qty, 0).toLocaleString('en-US')}</td>
            {seeCost ? <td className="num">{baht(value)}</td> : <td />}
            <td />
          </tr>
        </tfoot>
      </table>
      {!seeCost ? (
        <div style={{ marginTop: 8, fontSize: 11 }}>มูลค่าต้นทุน {HIDDEN_COST}</div>
      ) : null}
    </ListPaper>
  );
}
