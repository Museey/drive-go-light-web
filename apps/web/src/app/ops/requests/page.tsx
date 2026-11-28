import Link from 'next/link';
import { requireOperator } from '@/lib/ops-auth';
import { listRequests, type RequestStatus } from '@/lib/ops-console';
import { baht, thDateTime } from '@/lib/format';
import { OpsShell } from '../ops-shell';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'รอตรวจ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ',
};
const STATUS_COLOR: Record<RequestStatus, string> = {
  pending: '#B4720B', approved: '#1D8A5F', rejected: '#B4342A',
};
const TABS: [RequestStatus | 'all', string][] = [
  ['pending', 'รอตรวจ'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ปฏิเสธ'], ['all', 'ทั้งหมด'],
];

/**
 * คำขอที่แนบสลิป — ใบสมัครใหม่จาก /signup (db/038_payment_requests.sql)
 * คำขอต่ออายุของอู่เดิมไม่อยู่หน้านี้ — อยู่หน้าแรกของคอนโซล (renewal_requests · 039/043)
 * ค่าตั้งต้นแสดงเฉพาะที่รอตรวจ เพราะเป็นงานเดียวที่ต้องทำในหน้านี้
 */
export default async function OpsRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireOperator();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.status) ? sp.status as RequestStatus | 'all' : 'pending';
  const rows = await listRequests(session, tab === 'all' ? null : tab);

  return (
    <OpsShell
      current="/ops/requests"
      email={session.email}
      title="คำขอรออนุมัติ"
      sub="ใบสมัครที่แนบสลิปการโอน — ตรวจยอดในบัญชีธนาคารก่อนอนุมัติทุกครั้ง"
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map(([k, label]) => (
          <Link key={k} href={k === 'pending' ? '/ops/requests' : `/ops/requests?status=${k}`} className="chip"
                aria-current={k === tab ? 'true' : undefined}
                style={k === tab
                  ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff', textDecoration: 'none' }
                  : { textDecoration: 'none' }}>
            {label}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="subtle" style={{ padding: 20 }}>
              {tab === 'pending' ? 'ไม่มีคำขอที่รอตรวจ' : 'ยังไม่มีรายการ'}
            </div>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>ส่งเมื่อ</th>
                    <th>ร้าน</th>
                    <th style={{ width: 150 }}>ประเภท</th>
                    <th className="num" style={{ width: 120 }}>ยอดที่โอน</th>
                    <th style={{ width: 110 }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const off = Math.abs(r.amountPaid - r.amountDue) >= 0.005;
                    return (
                      <tr key={r.id}>
                        <td>{thDateTime(r.at)}</td>
                        <td>
                          <Link href={`/ops/requests/${r.id}`} style={{ fontWeight: 600 }}>{r.shopName}</Link>
                          <div className="subtle" style={{ fontSize: 12 }}>{r.shopProvince} · {r.ownerEmail}</div>
                        </td>
                        <td>
                          ใบสมัคร
                          <div className="subtle" style={{ fontSize: 12 }}>
                            {r.ctype === 'juristic' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                            {r.vatRegistered ? ' · จด VAT' : ' · ไม่จด VAT'}
                          </div>
                        </td>
                        <td className="num">
                          {baht(r.amountPaid)}
                          {off ? <div style={{ fontSize: 12, color: 'var(--due)' }}>ควรได้ {baht(r.amountDue)}</div> : null}
                        </td>
                        <td>
                          <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
                          {r.decidedBy ? <div className="subtle" style={{ fontSize: 12 }}>{r.decidedBy}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
