import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { requireOperator } from '@/lib/ops-auth';
import { getShop, getShopActivity, suggestRenewal } from '@/lib/ops-console';
import { OpsShell } from '../../ops-shell';
import { ResetLink, SeatsForm, RenewForm } from './forms';
import { KIND_SHORT, thDate, thDateTime } from '@/lib/format';
import { agoLabel, lastUsed } from '@/lib/usage';
import { ActivityGrid, LastUsed } from '../../usage-bits';

export const dynamic = 'force-dynamic';

const MODE_LABEL = { trial: 'ทดลองใช้', active: 'ใช้งานอยู่', expired: 'หมดอายุ' } as const;
const ROLE_LABEL: Record<string, string> = { owner: 'เจ้าของ', staff: 'พนักงาน' };

export default async function OpsShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();
  const shop = await getShop(session, id);
  if (!shop) notFound();

  const suggested = suggestRenewal(shop.license);
  const activity = await getShopActivity(session, id);
  const now = new Date();
  const at = lastUsed(shop.usage.lastSeenAt, shop.usage.lastDocAt);
  /* วันที่ใช้ใน 90 วัน — นับแบบเดียวกับรายชื่อ: มีคนเข้า หรือมีเอกสารสร้าง */
  const days90 = activity?.days.filter((d) => d.users || d.docs).length ?? 0;
  /* พนักงานไม่มีชื่อ — ฐานข้อมูลไม่ส่งมา นับลำดับให้แทน */
  let staffNo = 0;

  return (
    <OpsShell
      current="/ops"
      email={session.email}
      title={shop.name}
      sub={`เปิดเมื่อ ${thDate(shop.createdOn)}`}
    >
      <div className="grid g2">
        <div className="card">
          <header><h2>สถานะการใช้งาน</h2></header>
          <div className="body">
            <dl className="kv">
              <dt>สถานะ</dt><dd>{MODE_LABEL[shop.license.mode]}</dd>
              <dt>ถึงวันที่</dt><dd>{thDate(shop.license.until)}</dd>
              <dt>เหลืออีก</dt><dd>{shop.license.daysLeft} วัน</dd>
              <dt>แพ็กเกจ</dt><dd>{shop.license.plan ?? '—'}</dd>
              <dt>เคยชำระแล้ว</dt><dd>{shop.license.everPaid ? 'เคย' : 'ยังไม่เคย'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <header><h2>ผู้ใช้งาน</h2></header>
          <div className="body">
            <dl className="kv">
              <dt>บัญชีที่เปิดอยู่</dt><dd>{shop.userCount} บัญชี</dd>
              {/* อีเมลเจ้าของ — ดูได้ก่อนกดออกลิงก์ตั้งรหัสผ่าน จะได้รู้ว่าลิงก์จะเข้าบัญชีไหน (ผู้ใช้ขอ) */}
              <dt>อีเมลเจ้าของ</dt>
              <dd className="mono">{shop.ownerEmail ?? 'ยังไม่มีบัญชีเจ้าของที่เปิดใช้'}</dd>
              <dt>ที่นั่งพนักงาน</dt>
              <dd>{shop.maxUsers === null ? 'ไม่จำกัด' : `${shop.maxUsers} ที่นั่ง`}</dd>
            </dl>
            <SeatsForm tenantId={shop.tenantId} maxUsers={shop.maxUsers} />
          </div>
        </div>
      </div>

      {activity ? (
        <div className="card">
          <header><h2>การใช้งาน</h2></header>
          <div className="body">
            <div className="grid g2">
              <dl className="kv">
                <dt>ใช้ล่าสุด</dt><dd><LastUsed at={at} now={now} /></dd>
                <dt>ล็อกอินล่าสุด</dt><dd>{thDateTime(shop.usage.lastLoginAt)}</dd>
                <dt>เอกสารใบล่าสุด</dt>
                <dd>{shop.usage.lastDocAt ? `${thDateTime(shop.usage.lastDocAt)} (${agoLabel(shop.usage.lastDocAt, now)})` : 'ยังไม่เคยออก'}</dd>
                <dt>ใช้ใน 30 / 90 วัน</dt><dd>{shop.usage.activeDays30} / {days90} วัน</dd>
                <dt>เอกสาร 30 วัน</dt>
                <dd>
                  {shop.usage.docs30} ใบ
                  {Object.keys(activity.kinds30).length ? (
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' — '}
                      {Object.entries(activity.kinds30)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, n]) => `${KIND_SHORT[k] ?? k} ${n}`).join(' · ')}
                    </span>
                  ) : null}
                </dd>
                <dt>เอกสารทั้งหมด</dt><dd>{activity.docsTotal.toLocaleString('en-US')} ใบ</dd>
              </dl>
              <div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>
                  วันที่เข้าใช้ 13 สัปดาห์ล่าสุด — ยิ่งเข้มยิ่งมีคนเข้าหลายคน
                </div>
                <ActivityGrid days={activity.days} />
              </div>
            </div>

            <div className="tablewrap" style={{ marginTop: 14 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>บัญชี</th>
                    <th style={{ width: 150 }}>ใช้ล่าสุด</th>
                    <th style={{ width: 170 }}>ล็อกอินล่าสุด</th>
                    <th className="num" style={{ width: 110 }}>ใช้ใน 30 วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.users.map((u, i) => (
                    <tr key={i} style={u.active ? undefined : { color: 'var(--ink-3)' }}>
                      <td>
                        {u.role === 'owner' ? ROLE_LABEL.owner : `${ROLE_LABEL[u.role] ?? u.role} ${++staffNo}`}
                        {u.active ? null : <span className="chip" style={{ marginLeft: 8 }}>ปิดใช้งาน</span>}
                      </td>
                      <td><LastUsed at={u.lastSeenAt} now={now} /></td>
                      <td>{thDateTime(u.lastLoginAt)}</td>
                      <td className="num mono">{u.days30} วัน</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              เริ่มเก็บวันที่เข้าใช้ตั้งแต่ 26 ต.ค. 2569 — ก่อนหน้านั้นนับจากวันที่สร้างเอกสารแทน
              · คอนโซลเห็นแค่บทบาทกับเวลา ไม่เห็นชื่อพนักงาน
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <header><h2>บันทึกการต่ออายุ</h2></header>
        <div className="body">
          <RenewForm
            tenantId={shop.tenantId}
            from={suggested.startedOn}
            to={suggested.expiresOn}
            plan={shop.license.plan ?? 'light-yearly'}
          />
          <div className="hint" style={{ marginTop: 10 }}>
            วันที่ที่เติมให้ต่อจากวันหมดอายุเดิม ไม่ใช่จากวันนี้ — อู่ที่ต่อล่วงหน้า
            จะได้ไม่เสียวันที่จ่ายไปแล้ว ส่วนอู่ที่หมดอายุไปแล้วเริ่มนับใหม่จากวันนี้
          </div>
        </div>
      </div>

      <div className="card">
        <header><h2>เจ้าของอู่ลืมรหัสผ่าน</h2></header>
        <div className="body">
          <p style={{ marginBottom: 12 }}>
            ออกลิงก์ตั้งรหัสผ่านใหม่ให้เจ้าของอู่ แล้วส่งให้เขาทางช่องทางที่ปลอดภัย
            ลิงก์เดิมที่ยังไม่ได้ใช้จะถูกยกเลิกไปด้วย
          </p>
          <ResetLink tenantId={shop.tenantId} />
        </div>
      </div>

      <div className="note">
        <b>ข้อมูลธุรกิจของอู่นี้เปิดดูจากที่นี่ไม่ได้</b> — ลูกค้า เนื้อหาเอกสาร ยอดขาย
        และราคา ถูกกันไว้ที่ตัวฐานข้อมูล ไม่ใช่แค่ไม่ได้ทำหน้าจอให้ดู
        (เห็นได้แค่<b>จำนวน</b>เอกสารกับเวลาเข้าใช้)
        ถ้าต้องช่วยเรื่องข้อมูล ให้เจ้าของอู่ดาวน์โหลดไฟล์สำรองส่งมาเอง
      </div>
    </OpsShell>
  );
}
