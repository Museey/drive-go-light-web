import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { PrintReport } from '@/components/print-report';
import { PrintHeader } from '@/components/print-header';
import { thDate } from '@/lib/format';
import {
  APPT_VIEWS, appointmentMessage, apptKindLabel, apptStatusLabel, apptViewOf, listAppointments,
} from '@/lib/appointments';
import { getPlus } from '@/lib/plan';
import { getShop } from '@/lib/queries';
import { ApptRowActs } from './row-acts';
import { APPT_POINTS } from './points';

export const dynamic = 'force-dynamic';

/**
 * 02.5 นัดหมาย / แจ้งเตือนลูกค้า (Light Plus)
 *
 * สี่มุมมอง: ที่จะถึง · วันนี้ · เลยกำหนด · เสร็จ/ยกเลิก — นัดที่ยังรออยู่เรียงใกล้สุดก่อน
 * ระบบไม่ส่งข้อความเอง: ร่างข้อความให้ ร้านกดคัดลอกไปวางใน LINE แล้วกด "แจ้งแล้ว"
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; saved?: string }>;
}) {
  const session = await requireTab('customer', 'appt');
  const sp = await searchParams;

  if (!(await getPlus())) {
    return (
      <Shell current="/customers" title="นัดหมาย / แจ้งเตือนลูกค้า" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="customer" current="appt">
          <PlusUpsell feature="นัดหมายและแจ้งเตือนลูกค้า" points={APPT_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const view = apptViewOf(sp.view);
  /* ?q=a&q=b ทำให้ค่าเป็นอาเรย์ — ตัวค้นเรียก .trim() แล้วหน้าพัง 500 · รับเฉพาะข้อความ */
  const search = typeof sp.q === 'string' ? sp.q : '';
  const [{ rows, counts, today }, shop] = await Promise.all([listAppointments(view, search), getShop()]);
  const mayEdit = canEdit(session, 'customer', 'appt');
  const badge: Record<string, number> = { upcoming: counts.today + counts.upcoming, today: counts.today, overdue: counts.overdue };
  const viewLabel = APPT_VIEWS.find((v) => v.key === view)!.label;

  return (
    <Shell current="/customers" title="นัดหมาย / แจ้งเตือนลูกค้า"
           sub={`วันนี้ ${counts.today} · จะถึง ${counts.upcoming} · เลยกำหนด ${counts.overdue}`}
           tools={<PrintReport />}>
      <SubNav menu="customer" current="appt" badges={{ appt: counts.today + counts.overdue }}>
        <PrintHeader title={`นัดหมาย / แจ้งเตือนลูกค้า — ${viewLabel}`} />
        {sp.saved ? <div className="ok-msg" style={{ marginBottom: 12 }}>บันทึกนัดแล้ว</div> : null}

        <div className="card">
          <div className="toolbar">
            <div className="tiles">
              {mayEdit ? <Link className="tile act" href="/customers/appointments/new">+ นัดเข้าซ่อม</Link> : null}
              {mayEdit ? <Link className="tile act" href="/customers/appointments/new?kind=remind">+ เตือนลูกค้า</Link> : null}
            </div>
            <div className="spacer" />
            <form autoComplete="off" action="/customers/appointments" method="get" data-enter="own" style={{ display: 'flex', gap: 6 }}>
              <input type="hidden" name="view" value={view} />
              <input className="in search" type="search" name="q" defaultValue={search}
                     placeholder="กรอกคำค้นหา — ชื่อ เบอร์ ทะเบียน หรือเรื่องที่นัด" style={{ width: 260 }} />
              <button className="btn" type="submit">ค้นหา</button>
            </form>
          </div>

          <div className="toolbar" style={{ gap: 6, flexWrap: 'wrap' }}>
            {APPT_VIEWS.map((v) => (
              <Link key={v.key} className={v.key === view ? 'btn primary' : 'btn'}
                    href={{ pathname: '/customers/appointments', query: { view: v.key, ...(search ? { q: search } : {}) } }}>
                {v.label}{badge[v.key] ? ` (${badge[v.key]})` : ''}
              </Link>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="empty">
              {search ? 'ไม่พบนัดที่ตรงกับคำค้น' : view === 'overdue' ? 'ไม่มีนัดที่เลยกำหนด' : `ไม่มีนัดในมุมมอง "${viewLabel}"`}
            </div>
          ) : (
            <div className="tablewrap">
              <table className="tbl hist">
                <thead>
                  <tr>
                    <th>วันที่ / เวลา</th><th>ชนิด</th><th>ลูกค้า / รถ</th><th>เรื่อง</th>
                    <th>สถานะ</th><th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const late = a.status === 'open' && a.date < today;
                    return (
                      <tr key={a.id}>
                        <td style={late ? { color: 'var(--due)' } : undefined}>
                          <b>{thDate(a.date)}</b>{a.time ? <div className="mono">{a.time} น.</div> : null}
                          {a.date === today && a.status === 'open' ? <span className="chip warn">วันนี้</span> : null}
                        </td>
                        <td><span className={a.kind === 'repair' ? 'chip ok' : 'chip'}>{apptKindLabel(a.kind)}</span></td>
                        <td className="wrap party">
                          {a.contactId
                            ? <Link href={`/customers/${a.contactId}`} style={{ textDecoration: 'underline' }}><b>{a.partyName || '-'}</b></Link>
                            : <b>{a.partyName || '-'}</b>}
                          <div className="subtle" style={{ fontSize: '0.875rem' }}>
                            {[a.plate, a.tel].filter(Boolean).join(' · ') || '-'}
                          </div>
                        </td>
                        <td className="wrap">
                          {a.title}
                          {a.note ? <div className="subtle" style={{ fontSize: '0.875rem' }}>{a.note}</div> : null}
                        </td>
                        <td>
                          {a.status === 'open'
                            ? (a.notifiedAt ? <span className="chip ok">แจ้งลูกค้าแล้ว</span> : <span className="chip">ยังไม่ได้แจ้ง</span>)
                            : <span className="chip">{apptStatusLabel(a.status)}</span>}
                        </td>
                        <td className="no-print">
                          <ApptRowActs id={a.id} status={a.status} notified={Boolean(a.notifiedAt)} mayEdit={mayEdit}
                                       label={a.title} message={appointmentMessage(a, { name: shop.name, tel: shop.tel })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint" style={{ padding: '8px 12px' }}>
            กด "คัดลอกข้อความ" แล้ววางใน LINE หรือ SMS ถึงลูกค้า จากนั้นกด "แจ้งแล้ว" เพื่อจดไว้ — ระบบไม่ส่งข้อความให้เอง ·
            เพิ่มนัดจากหน้าลูกค้าได้ด้วย ชื่อ เบอร์ และทะเบียนจะถูกเติมให้
          </p>
        </div>
      </SubNav>
    </Shell>
  );
}
