import { requireOperator } from '@/lib/ops-auth';
import { listOperators } from '@/lib/ops-console';
import { OpsShell } from '../ops-shell';
import { AddOperator, ToggleOperator } from './forms';
import { thDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OperatorsPage() {
  const session = await requireOperator();
  const rows = await listOperators(session);

  return (
    <OpsShell
      current="/ops/operators"
      email={session.email}
      title="บัญชีผู้ให้บริการ"
      sub={`${rows.length} บัญชี`}
    >
      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>อีเมล</th>
                  <th>ชื่อ</th>
                  <th style={{ width: 120 }}>สถานะ</th>
                  <th style={{ width: 170 }}>เข้าใช้ล่าสุด</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">
                      {o.email}
                      {o.email === session.email
                        ? <span className="chip" style={{ marginLeft: 6 }}>คุณ</span> : null}
                    </td>
                    <td>{o.name || '—'}</td>
                    <td>
                      {!o.active ? <span className="chip">ปิดอยู่</span>
                        : !o.hasPassword ? <span className="chip warn">ยังไม่ตั้งรหัสผ่าน</span>
                          : <span className="chip ok">ใช้งานอยู่</span>}
                    </td>
                    <td>{o.lastLoginAt ? thDateTime(o.lastLoginAt) : '—'}</td>
                    <td>
                      {o.email === session.email ? null : (
                        <ToggleOperator id={o.id} active={o.active} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <header><h2>เพิ่มบัญชีผู้ให้บริการ</h2></header>
        <div className="body">
          <AddOperator />
          <div className="hint" style={{ marginTop: 10 }}>
            บัญชีผู้ให้บริการเปิดอู่ใหม่ได้และออกลิงก์ตั้งรหัสผ่านของคนอื่นได้ —
            เพิ่มเฉพาะคนที่ต้องทำงานนี้จริง ๆ ทุกการกระทำถูกจดไว้ที่หน้าบันทึกการใช้งาน
          </div>
        </div>
      </div>
    </OpsShell>
  );
}
