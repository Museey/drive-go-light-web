import { requireOperator } from '@/lib/ops-auth';
import { listErrors } from '@/lib/ops-console';
import { OpsShell } from '../ops-shell';
import { thDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OpsErrorsPage() {
  const session = await requireOperator();
  const rows = await listErrors(session, 200);

  return (
    <OpsShell
      current="/ops/errors"
      email={session.email}
      title="ข้อผิดพลาดที่เกิดขึ้นจริง"
      sub={`${rows.length} รายการล่าสุด`}
    >
      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>เมื่อไหร่</th>
                  <th style={{ width: 90 }}>ชนิด</th>
                  <th>ข้อความ</th>
                  <th style={{ width: 110 }}>อู่</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((e) => (
                  <tr key={e.id}>
                    <td>{thDateTime(e.at)}</td>
                    <td><span className="chip">{e.kind}</span></td>
                    <td className="wrap" style={{ fontSize: 12.5 }}>{e.message}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                      {e.tenantId ? e.tenantId.slice(0, 8) : '—'}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="empty">ยังไม่มีข้อผิดพลาด</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        ข้อความถูกกรองรหัสผ่านและโทเคนออกก่อนบันทึกเสมอ (ดู <code>scrub()</code> ใน
        <code>lib/ops-core.ts</code>) เพราะที่เก็บ log คือที่ที่ความลับรั่วบ่อยที่สุด ·
        รายการที่เกิน 90 วันถูกลบทิ้งอัตโนมัติทุกเดือน
      </div>
    </OpsShell>
  );
}
