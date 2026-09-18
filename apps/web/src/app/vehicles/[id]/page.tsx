import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { query, requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { vehicleHistoryWith } from '@/lib/vehicles';
import { baht, KIND_SHORT, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * ประวัติของรถหนึ่งคัน (ผู้ใช้กำหนด 19 ก.ย. 2569)
 *
 * ลูกค้าขับเข้ามา ช่างค้น 4 ตัวท้ายแล้วอยากเห็นทันทีว่าคันนี้เคยทำอะไรไปบ้าง
 * — ไม่ใช่รายชื่อลูกค้าแล้วค่อยไล่หาใบในนั้น ลูกค้าที่มีหลายคันจึงแยกดูรายคันได้
 */
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('customer', 'customer');
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const history = await query((c) => vehicleHistoryWith(c, id));
  if (!history) notFound();

  const { vehicle: v, docs } = history;
  const spec = [v.brand, v.model, v.color].filter(Boolean).join(' · ');

  return (
    <Shell
      current="/customers"
      title={v.plate || 'รถไม่ระบุทะเบียน'}
      sub={[spec, v.plateProvince].filter(Boolean).join(' · ') || undefined}
      tools={<Link className="btn" href={`/customers/${v.ownerId}`}>ไปหน้าเจ้าของรถ</Link>}
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="body veh-head">
          <div className="veh-facts">
            <div><span className="lbl">เจ้าของรถ</span>
              <Link href={`/customers/${v.ownerId}`} className="val link">{v.ownerName}</Link></div>
            <div><span className="lbl">เอกสารที่ทำไปแล้ว</span><span className="val">{v.docCount} ใบ</span></div>
            <div><span className="lbl">ยอดค้างของรถคันนี้</span>
              <span className="val" style={v.outstanding > 0.004 ? { color: 'var(--due)' } : undefined}>
                {v.outstanding > 0.004 ? baht(v.outstanding) : '-'}
              </span></div>
            <div><span className="lbl">เข้าซ่อมล่าสุด</span>
              <span className="val">{v.lastServiceOn ? thDate(v.lastServiceOn) : '-'}</span></div>
          </div>
          <div className="tag-row">
            <Link className="btn primary" href={`/income/new?kind=QT&party=${v.ownerId}`}>เปิดใบเสนอราคา</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <header>
          <h2>ประวัติเอกสารของรถคันนี้</h2>
          <div className="spacer" />
          <span className="subtle">{docs.length.toLocaleString('en-US')} ใบ · ใบที่บันทึกล่าสุดอยู่บนสุด</span>
        </header>

        {docs.length === 0 ? (
          <div className="empty">ยังไม่มีเอกสารของรถคันนี้</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl hist fit">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>วันที่</th>
                  <th className="num">รวมทั้งสิ้น</th>
                  <th className="num">คงค้าง</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">
                      <Link href={`/income/${d.id}`} style={{ textDecoration: 'underline' }}>{d.docNo}</Link>
                    </td>
                    <td>{KIND_SHORT[d.kind] ?? d.kind}</td>
                    <td>{thDate(d.docDate)}</td>
                    <td className="num mono">{baht(d.grandTotal)}</td>
                    <td className="num mono" style={d.outstanding > 0.004 ? { color: 'var(--due)' } : undefined}>
                      {d.outstanding > 0.004 ? baht(d.outstanding) : '-'}
                    </td>
                    <td>
                      {d.status === 'void'
                        ? <span className="chip">ยกเลิก</span>
                        : d.outstanding > 0.004
                          ? <span className="chip due">ค้างชำระ</span>
                          : <span className="chip ok">เรียบร้อย</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
