import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, requireTab } from '@/lib/auth';
import { CLAIM_SIDE, getClaim, kindLabel } from '@/lib/claims';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../../../../income/[id]/print/print-button';
import { baht, thDateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ClaimPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('stock', 'claim');
  const { id } = await params;

  const [claim, shop] = await Promise.all([
    query((c) => getClaim(c, id)),
    getShop(),
  ]);
  if (!claim) notFound();

  const S = CLAIM_SIDE[claim.side];
  const vendor = claim.side === 'vendor';
  const veh = (claim.vehicle ?? {}) as Record<string, string>;
  const vehText = [veh.brand, veh.model].filter(Boolean).join(' ');
  const blankRows = Math.max(0, 6 - claim.items.length);

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={`/stock/claim/${id}`}>← กลับใบเคลม</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          เอกสารตัดสต๊อก ไม่ใช่ใบกำกับภาษี — ไม่มีการเรียกเก็บเงินตามใบนี้
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
              </div>
            </div>
            <div className="doc-meta">
              <h1>{S.title}</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>
                {vendor ? 'SUPPLIER CLAIM / GOODS RETURN' : 'CLAIM / STOCK WRITE-OFF'}
              </div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr><td>เลขที่</td><td style={{ textAlign: 'right' }}><b>{claim.no}</b></td></tr>
                  <tr><td>วันที่</td><td style={{ textAlign: 'right' }}>{thDateLong(claim.claimDate)}</td></tr>
                  <tr><td>อ้างอิง</td><td style={{ textAlign: 'right' }}>{claim.refNo || '-'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {claim.voided ? (
            <div className="box"><h4>เอกสารนี้ถูกยกเลิกแล้ว</h4>
              <div style={{ fontSize: 11.5 }}>
                สต๊อกที่ตัดไปตามใบนี้ถูกคืนกลับเข้าคลังเรียบร้อยแล้ว
                {claim.voidedReason ? ` · เหตุผล: ${claim.voidedReason}` : ''}
              </div>
            </div>
          ) : null}

          <div className="box">
            <h4>รายละเอียดการเคลม</h4>
            <div className="kv"><b>ประเภท:</b><span>{kindLabel(claim.side, claim.kind)}</span></div>
            <div className="kv">
              <b>{S.party}:</b><span>{claim.partyName || '-'}</span>
              <b>โทร:</b><span>{claim.partyTel || '-'}</span>
            </div>
            {!vendor ? (
              <div className="kv">
                <b>รถยนต์:</b>
                <span>
                  {vehText || '-'}
                  {claim.vehiclePlate ? ` ทะเบียน ${claim.vehiclePlate}` : ''}
                  {veh.mileage ? ` · เลขไมล์ ${veh.mileage} กม.` : ''}
                </span>
              </div>
            ) : null}
            <div className="kv"><b>เหตุผล:</b><span>{claim.reason || '-'}</span></div>
          </div>

          <table className="doc">
            <thead>
              <tr>
                <th style={{ width: 34 }}>ลำดับ</th>
                <th style={{ width: 116 }}>รหัสสินค้า</th>
                <th>รายการ</th>
                <th style={{ width: 62 }}>จำนวน</th>
                <th style={{ width: 92 }}>ต้นทุน/หน่วย</th>
                <th style={{ width: 100 }}>มูลค่ารวม</th>
              </tr>
            </thead>
            <tbody>
              {claim.items.map((it, i) => {
                const value = it.costAmount ?? it.qty * it.unitCost;
                return (
                  <tr key={it.id}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{it.code || '-'}</td>
                    <td>{it.name}</td>
                    <td style={{ textAlign: 'right' }}>{it.qty}</td>
                    <td style={{ textAlign: 'right' }}>
                      {baht(it.qty > 0 ? value / it.qty : 0)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{baht(value)}</td>
                  </tr>
                );
              })}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`b-${i}`}>
                  <td className="blank">&nbsp;</td><td /><td /><td /><td /><td />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', background: '#EDEFF1' }}>
                  <b>รวมทั้งสิ้น</b>
                </td>
                <td style={{ textAlign: 'right', background: '#EDEFF1' }}><b>{claim.qty}</b></td>
                <td style={{ background: '#EDEFF1' }} />
                <td style={{ textAlign: 'right', background: '#EDEFF1' }}><b>{baht(claim.cost)}</b></td>
              </tr>
            </tfoot>
          </table>

          {claim.note ? (
            <div className="box">
              <h4>หมายเหตุ</h4>
              <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{claim.note}</div>
            </div>
          ) : null}

          <div className="sign">
            <div>
              <div className="line" />ผู้อนุมัติ
              <br />
              <span style={{ fontSize: 11 }}>
                ( {claim.byWhom || '................................................'} )
              </span>
            </div>
            <div>
              <div className="line" />{vendor ? 'ผู้รับของคืน' : 'ผู้รับของ'}
              <br />
              <span style={{ fontSize: 11 }}>
                ( {claim.partyName || '................................................'} )
              </span>
            </div>
          </div>

          <div style={{ fontSize: 10.5, marginTop: 10, color: '#555', lineHeight: 1.7 }}>
            {vendor ? (
              <>
                เอกสารนี้ใช้บันทึกการส่งสินค้าชำรุดหรือผิดรุ่นคืนให้ผู้ขาย
                จำนวนที่ระบุถูกหักออกจากสินค้าคงคลังแล้ว ณ วันที่ในเอกสาร
                <br />
                เมื่อผู้ขายส่งของทดแทนมาให้ ให้เปิดใบซื้อรับเข้าสต๊อกตามปกติ
                — ถ้าเป็นของทดแทนที่ไม่เสียเงิน ให้ใส่ราคาศูนย์ ไม่งั้นต้นทุนจะถูกนับสองรอบ
              </>
            ) : (
              <>
                เอกสารนี้ใช้บันทึกการจ่ายสินค้าออกจากคลังโดยไม่มีการเรียกเก็บเงิน
                จำนวนที่ระบุถูกหักออกจากสินค้าคงคลังแล้ว ณ วันที่ในเอกสาร
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
