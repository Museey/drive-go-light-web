import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { CLAIM_SIDE, getClaim, kindLabel } from '@/lib/claims';
import { baht, thDate } from '@/lib/format';
import { VoidClaim } from '../void-claim';

export const dynamic = 'force-dynamic';

export default async function ClaimDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePerm('stock');
  const { id } = await params;
  const sp = await searchParams;

  const claim = await query((c) => getClaim(c, id));
  if (!claim) notFound();

  const S = CLAIM_SIDE[claim.side];
  const vendor = claim.side === 'vendor';
  const veh = (claim.vehicle ?? {}) as Record<string, string>;
  const cut = claim.items.filter((i) => i.productId).length;

  return (
    <Shell
      doc
      current="/stock"
      title={`${S.title} ${claim.no}`}
      sub={`วันที่ ${thDate(claim.claimDate)} · ${kindLabel(claim.side, claim.kind)}`}
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/stock/claim/${id}/print`}>พิมพ์ใบเคลม</Link>
          <Link className="btn" href={S.href}>← กลับรายการ</Link>
        </div>
      }
    >
      {sp.saved ? (
        <div className="ok-msg" style={{ marginBottom: 16 }}>
          บันทึกเรียบร้อย — ตัดสต๊อก {cut} รายการ รวม {claim.qty} ชิ้น
          มูลค่า {baht(claim.cost)} บาท
        </div>
      ) : null}

      {claim.voided ? (
        <div className="err" style={{ marginBottom: 16 }}>
          ใบเคลมนี้ถูกยกเลิกแล้ว — สต๊อกที่ตัดไปถูกคืนกลับเข้าคลังเรียบร้อย
          {claim.voidedReason ? ` · เหตุผล: ${claim.voidedReason}` : ''}
        </div>
      ) : null}

      <div className="card">
        <div className="body">
          <div className="grid g4">
            <div className="kv"><b>ประเภท</b><span>{kindLabel(claim.side, claim.kind)}</span></div>
            <div className="kv"><b>{S.party}</b><span>{claim.partyName || '-'}</span></div>
            <div className="kv"><b>โทรศัพท์</b><span>{claim.partyTel || '-'}</span></div>
            <div className="kv"><b>อ้างอิง</b><span>{claim.refNo || '-'}</span></div>
            {!vendor ? (
              <div className="kv">
                <b>รถยนต์</b>
                <span>
                  {[veh.brand, veh.model].filter(Boolean).join(' ') || '-'}
                  {claim.vehiclePlate ? ` · ${claim.vehiclePlate}` : ''}
                </span>
              </div>
            ) : null}
            <div className="kv" style={{ gridColumn: 'span 2' }}>
              <b>เหตุผล</b><span>{claim.reason}</span>
            </div>
            <div className="kv"><b>ผู้อนุมัติ</b><span>{claim.byWhom || '-'}</span></div>
            {claim.note ? (
              <div className="kv" style={{ gridColumn: 'span 4' }}>
                <b>หมายเหตุ</b><span>{claim.note}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>รหัสสินค้า</th><th>รายการ</th>
                <th className="num">จำนวน</th>
                <th className="num">มูลค่าต้นทุน</th>
                <th>ตัดสต๊อก</th>
              </tr>
            </thead>
            <tbody>
              {claim.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td className="mono">{it.code || '-'}</td>
                  <td className="wrap">{it.name}</td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{baht(it.costAmount ?? it.qty * it.unitCost)}</td>
                  <td>
                    {it.productId
                      ? <span className="chip ok">ตัดแล้ว</span>
                      : <span className="chip warn">ไม่ผูกทะเบียนสินค้า</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>รวม</td>
                <td className="num" style={{ fontWeight: 700 }}>{claim.qty}</td>
                <td className="num" style={{ fontWeight: 700 }}>{baht(claim.cost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        ใบเคลมที่บันทึกแล้ว<b>แก้ไขไม่ได้</b> — ถ้าผิดให้ยกเลิกแล้วเปิดใบใหม่
        วิธีนี้ทำให้บัญชีสต๊อกมีการตัดครั้งเดียวต่อใบ ตรวจย้อนหลังได้ว่าของหายไปไหนเมื่อไหร่
      </div>

      {!claim.voided ? <VoidClaim id={id} no={claim.no} /> : null}
    </Shell>
  );
}
