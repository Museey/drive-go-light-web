import Link from 'next/link';
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { canCost, canExport as mayExport, HIDDEN_COST } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { ExpiryChip } from '@/components/expiry-chip';
import { listExpiringLots } from '@/lib/products';
import { getShop } from '@/lib/queries';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * 05.1.1 ของใกล้หมดอายุ — รายการที่ต้องไปจัดการบนชั้นวาง
 *
 * แยกรายล็อต ไม่ใช่รายสินค้า เพราะคนถือรายการนี้ต้องรู้ว่าต้องหยิบกี่ชิ้น
 * เรียงจากที่หมดอายุก่อน ซึ่งเป็นลำดับเดียวกับที่ระบบจะตัดออกจริง
 */
export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  const session = await requireTab('stock', 'list');
  const sp = await searchParams;
  const onlyExpired = sp.only === 'expired';
  const seeCost = canCost(session);

  const shop = await getShop();
  const all = await listExpiringLots(shop.expiryWarnDays);
  const rows = onlyExpired ? all.filter((r) => r.daysLeft < 0) : all;

  const now = today();
  const expiredCount = all.filter((r) => r.daysLeft < 0).length;
  const value = rows.reduce((s, r) => s + r.value, 0);

  return (
    <Shell
      current="/stock"
      title="ของใกล้หมดอายุ"
      sub={`เตือนล่วงหน้า ${shop.expiryWarnDays} วัน — ตั้งเกณฑ์ได้ที่หน้าตั้งค่าร้าน`}
      actions={
        <div className="tag-row">
          <Link className="btn" href="/stock">← กลับทะเบียนสินค้า</Link>
          {mayExport(session, 'stock', 'list') && rows.length > 0 ? (
            <Link className="btn" href={{ pathname: '/stock/expiry/print', query: onlyExpired ? { only: 'expired' } : {} }}>
              พิมพ์รายการ
            </Link>
          ) : null}
        </div>
      }
    >
      <div className="card">
        <header>
          <h2>{onlyExpired ? 'เฉพาะที่หมดอายุแล้ว' : 'ใกล้หมดอายุและหมดอายุแล้ว'}</h2>
          <div className="spacer" />
          <div className="tag-row">
            <Link className="chip" href="/stock/expiry"
                  style={!onlyExpired ? { outline: '2px solid var(--ink-3)' } : undefined}>
              ทั้งหมด {all.length}
            </Link>
            <Link className="chip flag-expired" href={{ pathname: '/stock/expiry', query: { only: 'expired' } }}
                  style={onlyExpired ? { outline: '2px solid var(--ink-3)' } : undefined}>
              หมดอายุแล้ว {expiredCount}
            </Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="empty">
            {all.length === 0
              ? `ไม่มีของที่จะหมดอายุภายใน ${shop.expiryWarnDays} วัน — กรอกวันหมดอายุตอนรับของเข้าเพื่อให้ระบบเตือนได้`
              : 'ไม่มีของที่หมดอายุไปแล้ว'}
          </div>
        ) : (
          <>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อสินค้า</th>
                    <th>หมวด</th>
                    <th>วันหมดอายุ</th>
                    <th className="num">คงเหลือในล็อต</th>
                    {seeCost ? <th className="num">ต้นทุน/หน่วย</th> : null}
                    <th className="num">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.productId}:${r.expiresOn}`}>
                      <td className="mono">
                        <Link href={`/stock/${r.productId}`} style={{ textDecoration: 'underline' }}>{r.code}</Link>
                      </td>
                      <td className="wrap">{r.name}</td>
                      <td style={{ color: 'var(--ink-3)' }}>{r.categoryName || '-'}</td>
                      <td>
                        {thDate(r.expiresOn)}{' '}
                        <ExpiryChip expiresOn={r.expiresOn} today={now} warnDays={shop.expiryWarnDays} />
                      </td>
                      <td className="num">{r.qty.toLocaleString('en-US')} {r.unit}</td>
                      {seeCost ? <td className="num">{baht(r.unitCost)}</td> : null}
                      <td className="num">{seeCost ? baht(r.value) : HIDDEN_COST}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="body">
              <div className="note">
                รวม {rows.length.toLocaleString('en-US')} ล็อต
                มูลค่าตามต้นทุน {seeCost ? baht(value) : HIDDEN_COST} บาท —
                ระบบตัดของที่หมดอายุก่อนออกก่อนให้อยู่แล้ว รายการนี้มีไว้ให้ตัดสินใจว่าจะลดราคา
                คืนผู้ขาย หรือตัดทิ้ง ถ้าจะตัดทิ้งให้ใช้ปรับยอดที่หน้าสินค้าหรือใบตรวจนับ
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
