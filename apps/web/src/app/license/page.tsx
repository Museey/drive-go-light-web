import Link from 'next/link';
import { can, requireSession } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getLicenseStatus, listRenewals, TRIAL_DAYS } from '@/lib/subscription';
import { getShopSettings } from '@/lib/settings';
import { baht, thDate } from '@/lib/format';
import { RenewForm } from './renew-form';
import { DeleteTenantForm } from './delete-form';

export const dynamic = 'force-dynamic';

const MODE_LABEL = {
  trial: 'อยู่ระหว่างทดลองใช้',
  active: 'ใช้งานได้ตามปกติ',
  expired: 'หมดอายุแล้ว',
} as const;

export default async function LicensePage() {
  const session = await requireSession();
  const isOwner = can(session, 'settings');

  const [status, renewals, shop] = await Promise.all([
    getLicenseStatus(),
    isOwner ? listRenewals() : Promise.resolve([]),
    isOwner ? getShopSettings() : Promise.resolve(null),
  ]);

  const tone = status.mode === 'expired' ? 'due' : status.mode === 'trial' ? 'warn' : 'ok';

  return (
    <Shell current="/license" title="ลิขสิทธิ์การใช้งาน">
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">สถานะ</div>
          <div className="value" style={{ fontSize: 20 }}>
            <span className={`chip ${tone}`}>{MODE_LABEL[status.mode]}</span>
          </div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">{status.mode === 'expired' ? 'หมดอายุเมื่อ' : 'ใช้งานได้ถึง'}</div>
          <div className="value" style={{ fontSize: 20 }}>{thDate(status.until)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">{status.daysLeft >= 0 ? 'เหลืออีก' : 'เลยกำหนดมา'}</div>
          <div className={`value${status.daysLeft < 0 ? ' due' : status.daysLeft <= 7 ? ' warn' : ''}`}>
            {Math.abs(status.daysLeft)} วัน
          </div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">แพ็กเกจ</div>
          <div className="value" style={{ fontSize: 20 }}>
            {status.plan ? 'รายปี' : `ทดลอง ${TRIAL_DAYS} วัน`}
          </div>
        </div></div>
      </div>

      {status.mode === 'expired' ? (
        <div className="err" style={{ marginBottom: 18 }}>
          <b>{status.everPaid ? 'การใช้งานหมดอายุแล้ว' : 'ช่วงทดลองใช้สิ้นสุดแล้ว'}</b>
          <div style={{ marginTop: 6 }}>
            ตอนนี้<b>บันทึกรายการใหม่ไม่ได้</b> แต่ข้อมูลที่มีอยู่ยังอยู่ครบ —
            เปิดดู พิมพ์เอกสารเดิม และดาวน์โหลดไฟล์สำรองได้ตามปกติเสมอ
            ข้อมูลเป็นของอู่ ไม่ได้ถูกยึดไว้
          </div>
        </div>
      ) : status.daysLeft <= 7 ? (
        <div className="note" style={{ marginBottom: 18 }}>
          เหลืออีก {status.daysLeft} วันจะหมดอายุ — ต่ออายุก่อนเพื่อไม่ให้บันทึกงานสะดุด
        </div>
      ) : null}

      <div className="card">
        <header><h2>ต่ออายุการใช้งาน</h2></header>
        <div className="body">
          <div className="note" style={{ marginBottom: 14 }}>
            <b>ยังไม่รับชำระเงินออนไลน์</b> — โอนเงินมาที่บัญชีของผู้ให้บริการแล้วแจ้งหลักฐาน
            จากนั้นบันทึกการต่ออายุที่ช่องด้านล่าง (การรับชำระผ่านบัตรต้องเปิดบัญชีร้านค้า
            กับผู้ให้บริการรับชำระเงินก่อน ยังไม่ได้ทำ)
          </div>

          {isOwner ? (
            <RenewForm />
          ) : (
            <p className="subtle" style={{ margin: 0 }}>
              เฉพาะผู้ที่มีสิทธิ์ตั้งค่าร้านเท่านั้นที่ต่ออายุได้
            </p>
          )}
        </div>
      </div>

      {isOwner && renewals.length > 0 ? (
        <div className="card">
          <header><h2>ประวัติการต่ออายุ</h2></header>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>บันทึกเมื่อ</th><th>เริ่ม</th><th>ถึง</th>
                  <th className="num">ยอดที่ได้รับ</th><th>อ้างอิง</th>
                </tr>
              </thead>
              <tbody>
                {renewals.map((r) => (
                  <tr key={r.id}>
                    <td>{thDate(r.createdAt)}</td>
                    <td>{thDate(r.startedOn)}</td>
                    <td>{thDate(r.expiresOn)}</td>
                    <td className="num">{r.amount === null ? '-' : baht(r.amount)}</td>
                    <td className="wrap subtle">{r.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card">
        <header><h2>ข้อมูลส่วนบุคคลและการลบข้อมูล</h2></header>
        <div className="body">
          <p style={{ marginBottom: 12 }}>
            อ่านรายละเอียดว่าระบบเก็บข้อมูลอะไรไว้บ้างและใช้ทำอะไรได้ที่
            <Link href="/privacy" style={{ textDecoration: 'underline' }}> หน้านโยบายข้อมูลส่วนบุคคล</Link>
          </p>
          <p style={{ marginBottom: 14 }}>
            อู่ขอให้ลบข้อมูลทั้งหมดออกจากระบบได้ทุกเมื่อ —
            ก่อนลบควร<Link href="/settings/backup" style={{ textDecoration: 'underline' }}>ดาวน์โหลดไฟล์สำรอง</Link>เก็บไว้
          </p>
          {isOwner && shop ? <DeleteTenantForm shopName={shop.name} /> : (
            <p className="subtle" style={{ margin: 0 }}>เฉพาะผู้ที่มีสิทธิ์ตั้งค่าร้านเท่านั้นที่ขอลบข้อมูลได้</p>
          )}
        </div>
      </div>
    </Shell>
  );
}
