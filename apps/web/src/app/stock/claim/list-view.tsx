import Link from 'next/link';
import { query } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { CLAIM_SIDE, kindLabel, listClaims, type ClaimSide } from '@/lib/claims';
import { baht, thDate } from '@/lib/format';

/**
 * รายการใบเคลม — หน้าเดียวใช้ทั้ง 05.3 และ 05.4 ต่างกันแค่ side
 * ตามรุ่น 6.4 ที่ใช้ renderClaim(side) ตัวเดียวสำหรับทั้งสองแท็บ
 */

export interface ClaimListParams {
  q?: string;
  from?: string;
  to?: string;
  month?: string;
  year?: string;
}

export async function ClaimListView({
  side, sp,
}: {
  side: ClaimSide;
  sp: ClaimListParams;
}) {
  const S = CLAIM_SIDE[side];
  const { from, to } = rangeFromParams(sp);
  const { rows, total, writeOff } = await query((c) =>
    listClaims(c, { side, search: sp.q, from, to, limit: 200 }));

  const live = rows.filter((r) => !r.voided);

  return (
    <Shell
      current="/stock"
      title={S.title}
      sub={`${live.length} ใบที่ยังไม่ยกเลิก · มูลค่าที่จ่ายออก ${baht(writeOff)} บาท`}
      actions={
        <Link className="btn primary" href={`/stock/claim/new?side=${side}`}>
          + เปิดใบเคลม
        </Link>
      }
    >
      <SubNav menu="stock" current={side === 'vendor' ? 'vclaim' : 'claim'}>
        <div className="note" style={{ marginBottom: 14 }}>
          {side === 'vendor' ? (
            <>
              ส่งอะไหล่ชำรุดหรือผิดรุ่นคืนผู้ขาย — <b>ของถูกตัดออกจากคลังจริง</b>
              และมูลค่าลงเป็นค่าใช้จ่ายดำเนินงาน
              เมื่อผู้ขายส่งของทดแทนมาให้ <b>ให้เปิดใบซื้อรับเข้าสต๊อกตามปกติ</b> —
              ถ้าเป็นของแถมฟรี ให้ใส่ราคาศูนย์ ไม่งั้นต้นทุนจะถูกนับสองรอบ
            </>
          ) : (
            <>
              จ่ายอะไหล่ออกให้ลูกค้าโดยไม่เก็บเงิน — <b>ของถูกตัดออกจากคลังจริง</b>
              และมูลค่าลงเป็นค่าใช้จ่ายดำเนินงาน <b>ไม่ใช่ต้นทุนขาย</b>
              กำไรขั้นต้นจึงยังบอกได้ตรง ๆ ว่าขายของแล้วได้กี่เปอร์เซ็นต์
            </>
          )}
        </div>

        <div className="card">
          <div className="toolbar">
            <form action={S.href} method="get" style={{ display: 'flex', gap: 6 }}>
              <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                     placeholder={`เลขที่ ชื่อ${S.party} หรือเหตุผล`} style={{ width: 280 }} />
              <button className="btn" type="submit">ค้นหา</button>
            </form>
          </div>

          <DocDateFilter base={S.href} from={from} to={to} keep={sp.q ? { q: sp.q } : {}} />

          {rows.length === 0 ? (
            <div className="empty">
              {total === 0 ? 'ยังไม่มีใบเคลม — กดปุ่มเปิดใบเคลมเพื่อเริ่ม'
                           : 'ไม่พบเอกสารตามเงื่อนไขที่เลือก'}
            </div>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่</th><th>ประเภท</th>
                    <th>{S.party}</th>
                    {side === 'customer' ? <th>ทะเบียน</th> : <th>อ้างอิง</th>}
                    <th>เหตุผล</th>
                    <th className="num">จำนวน</th>
                    <th className="num">มูลค่าต้นทุน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={r.voided ? { opacity: 0.55 } : undefined}>
                      <td className="mono">
                        <Link href={`/stock/claim/${r.id}`} style={{ textDecoration: 'underline' }}>
                          {r.no}
                        </Link>
                        {r.voided ? <span className="chip due" style={{ marginLeft: 6 }}>ยกเลิก</span> : null}
                      </td>
                      <td>{thDate(r.claimDate)}</td>
                      <td style={{ fontSize: 12.5 }}>{kindLabel(side, r.kind)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="mono">
                        {(side === 'customer' ? r.vehiclePlate : r.refNo) || '-'}
                      </td>
                      <td className="wrap" style={{ fontSize: 12.5 }}>{r.reason}</td>
                      <td className="num">{r.qty}</td>
                      <td className="num">{baht(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'right', fontWeight: 600 }}>
                      รวมมูลค่าที่จ่ายออก (ไม่นับใบที่ยกเลิก)
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>{baht(writeOff)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </SubNav>
    </Shell>
  );
}
