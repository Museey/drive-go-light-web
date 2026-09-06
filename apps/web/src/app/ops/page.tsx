import Link from 'next/link';
import { requireOperator } from '@/lib/ops-auth';
import { listShops } from '@/lib/ops-console';
import { OpsShell } from './ops-shell';
import { thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const MODE_LABEL = { trial: 'ทดลองใช้', active: 'ใช้งานอยู่', expired: 'หมดอายุ' } as const;
const MODE_COLOR = { trial: '#B4720B', active: '#1D8A5F', expired: '#B4342A' } as const;

export default async function OpsHomePage() {
  const session = await requireOperator();
  const shops = await listShops(session);

  const expiring = shops.filter(
    (s) => s.license.mode !== 'expired' && s.license.daysLeft <= 30,
  ).length;

  return (
    <OpsShell
      current="/ops"
      email={session.email}
      title="อู่ทั้งหมด"
      sub={
        `${shops.length} อู่`
        + (expiring ? ` · ใกล้หมดอายุใน 30 วัน ${expiring} อู่` : '')
      }
      actions={<Link className="btn primary" href="/ops/new">+ เปิดอู่ใหม่</Link>}
    >
      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ชื่ออู่</th>
                  <th style={{ width: 110 }}>เปิดเมื่อ</th>
                  <th style={{ width: 110 }}>สถานะ</th>
                  <th style={{ width: 120 }}>ถึงวันที่</th>
                  <th className="num" style={{ width: 90 }}>เหลือ (วัน)</th>
                  <th className="num" style={{ width: 100 }}>ผู้ใช้</th>
                </tr>
              </thead>
              <tbody>
                {shops.length ? shops.map((s) => (
                  <tr key={s.tenantId}>
                    <td>
                      <Link href={`/ops/shop/${s.tenantId}`}
                            style={{ textDecoration: 'underline' }}>{s.name}</Link>
                    </td>
                    <td>{thDate(s.createdOn)}</td>
                    <td>
                      <span className="chip" style={{ color: MODE_COLOR[s.license.mode] }}>
                        {MODE_LABEL[s.license.mode]}
                      </span>
                    </td>
                    <td>{thDate(s.license.until)}</td>
                    <td className="num mono"
                        style={{ color: s.license.daysLeft <= 30 ? MODE_COLOR.expired : undefined }}>
                      {s.license.daysLeft}
                    </td>
                    <td className="num mono">
                      {s.userCount}{s.maxUsers === null ? '' : ` / ${s.maxUsers + 1}`}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="empty">ยังไม่มีอู่ในระบบ — กดปุ่มเปิดอู่ใหม่</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        คอนโซลนี้เห็นได้แค่ข้อมูลการเป็นลูกค้า — <b>ไม่เห็นลูกค้า เอกสาร ยอดขาย
        หรือราคาของอู่</b> ซึ่งบังคับไว้ที่ตัวฐานข้อมูล ไม่ใช่แค่ไม่ได้ทำหน้าจอให้ดู
      </div>
    </OpsShell>
  );
}
