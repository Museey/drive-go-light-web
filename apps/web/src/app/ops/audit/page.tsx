import { requireOperator } from '@/lib/ops-auth';
import { AUDIT_LABEL, listAudit } from '@/lib/ops-console';
import { OpsShell } from '../ops-shell';
import { thDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** สรุปรายละเอียดให้อ่านได้ โดยไม่โชว์ทุกคีย์ดิบ ๆ */
function detailOf(action: string, d: Record<string, unknown>): string {
  const parts: string[] = [];
  if (d.name) parts.push(String(d.name));
  if (d.owner_email) parts.push(String(d.owner_email));
  if (d.email) parts.push(String(d.email));
  if (action === 'record_renewal' && d.to) parts.push(`ถึง ${String(d.to).slice(0, 10)}`);
  if (action === 'record_renewal' && d.amount) parts.push(`${d.amount} บาท`);
  if (action === 'set_max_users') {
    parts.push(d.max_users === null ? 'ไม่จำกัด' : `${d.max_users} ที่นั่ง`);
  }
  return parts.join(' · ');
}

export default async function OpsAuditPage() {
  const session = await requireOperator();
  const rows = await listAudit(session, 300);

  return (
    <OpsShell
      current="/ops/audit"
      email={session.email}
      title="บันทึกการใช้งานคอนโซล"
      sub={`${rows.length} รายการล่าสุด`}
    >
      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>เมื่อไหร่</th>
                  <th style={{ width: 200 }}>ใคร</th>
                  <th style={{ width: 220 }}>ทำอะไร</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((a) => (
                  <tr key={a.id}>
                    <td>{thDateTime(a.at)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{a.operatorEmail || '—'}</td>
                    <td>{AUDIT_LABEL[a.action] ?? a.action}</td>
                    <td className="wrap" style={{ fontSize: 12.5 }}>
                      {detailOf(a.action, a.detail)}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="empty">ยังไม่มีบันทึก</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        บันทึกนี้เขียนโดยตัวฟังก์ชันในฐานข้อมูลเอง ไม่ใช่โดยโค้ดของหน้าเว็บ
        จึงไม่มีทางลืมเขียน และลบจากคอนโซลไม่ได้ ·
        แถวที่อ้างถึงอู่ที่ถูกลบไปแล้วยังอยู่ ซึ่งเป็นกรณีที่บันทึกมีค่าที่สุด
      </div>
    </OpsShell>
  );
}
