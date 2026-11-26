import Link from 'next/link';
import { can, requireSession } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getLicenseStatus, listRenewalRequests, listRenewals, TRIAL_DAYS } from '@/lib/subscription';
import { VENDOR } from '@/lib/vendor';
import { today } from '@drivegolight/core';
import { getShopSettings } from '@/lib/settings';
import { baht, thDate } from '@/lib/format';
import { CancelRequest, RenewForm } from './renew-form';
import { DeleteTenantForm } from './delete-form';
import { isPlusPlan, planLabel } from '@/lib/plan-core';

export const dynamic = 'force-dynamic';

const REQUEST_LABEL = {
  pending: 'รอตรวจสอบการชำระเงิน',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกแล้ว',
} as const;
const REQUEST_TONE = { pending: 'warn', approved: 'ok', rejected: 'due', cancelled: '' } as const;

const MODE_LABEL = {
  trial: 'อยู่ระหว่างทดลองใช้',
  active: 'ใช้งานได้ตามปกติ',
  expired: 'หมดอายุแล้ว',
} as const;

export default async function LicensePage() {
  const session = await requireSession();
  const isOwner = can(session, 'settings');

  const [status, renewals, requests, shop] = await Promise.all([
    getLicenseStatus(),
    isOwner ? listRenewals() : Promise.resolve([]),
    isOwner ? listRenewalRequests() : Promise.resolve([]),
    isOwner ? getShopSettings() : Promise.resolve(null),
  ]);

  const hasPending = requests.some((r) => r.status === 'pending');

  const tone = status.mode === 'expired' ? 'due' : status.mode === 'trial' ? 'warn' : 'ok';

  return (
    <Shell current="/license" title="ลิขสิทธิ์การใช้งาน">
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">สถานะ</div>
          <div className="value" style={{ fontSize: '1.25rem' }}>
            <span className={`chip ${tone}`}>{MODE_LABEL[status.mode]}</span>
          </div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">{status.mode === 'expired' ? 'หมดอายุเมื่อ' : 'ใช้งานได้ถึง'}</div>
          <div className="value" style={{ fontSize: '1.25rem' }}>{thDate(status.until)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">{status.daysLeft >= 0 ? 'เหลืออีก' : 'เลยกำหนดมา'}</div>
          <div className={`value${status.daysLeft < 0 ? ' due' : status.daysLeft <= 7 ? ' warn' : ''}`}>
            {Math.abs(status.daysLeft)} วัน
          </div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">แพ็กเกจ</div>
          <div className="value" style={{ fontSize: '1.25rem' }}>
            {status.plan ? `${planLabel(status.plan)} · รายปี` : `ทดลอง ${TRIAL_DAYS} วัน`}
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

      {/* Light Plus (041) — ปลายทางของปุ่ม "ดูแพ็กเกจและติดต่ออัปเกรด" บนการ์ดชวนอัปเกรด (PlusUpsell)
          เปลี่ยนแพ็กเกจได้จากคอนโซลผู้ให้บริการเท่านั้น หน้านี้จึงบอกว่าได้อะไรและต้องติดต่อใคร ไม่มีปุ่มอัปเกรดเอง */}
      <div className="card" id="plus">
        <header>
          <h2>DriveGo Light Plus</h2>
          <div className="spacer" />
          {isPlusPlan(status.plan)
            ? <span className="chip ok">เปิดใช้อยู่</span>
            : <span className="chip">ยังไม่ได้เปิดใช้</span>}
        </header>
        <div className="body">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            <li><b>เงินเดือนและพนักงาน</b> — ทะเบียนพนักงาน งวดเงินเดือน ประกันสังคม สลิป</li>
            <li><b>นัดหมายและแจ้งเตือนลูกค้า</b> — นัดรถเข้าซ่อม เตือนถึงรอบเช็กระยะ ร่างข้อความส่ง LINE</li>
            <li><b>เอกสารภาษี</b> — รายงานภาษีซื้อ-ขาย ใบแนบ ภ.ง.ด.1 / 3 / 53 สปส.1-10 และ 50 ทวิ</li>
          </ul>
          {isPlusPlan(status.plan) ? null : (
            <div className="note" style={{ marginTop: 12 }}>
              อัปเกรดได้โดยติดต่อผู้ให้บริการช่องทางเดียวกับการต่ออายุ — ข้อมูลเดิมอยู่ครบ ใช้ฟีเจอร์ใหม่ได้ทันทีหลังอัปเกรด
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <header><h2>ต่ออายุการใช้งาน</h2></header>
        <div className="body">
          <div className="note" style={{ marginBottom: 14 }}>
            <b>ขั้นตอน</b> — (1) โอนเงินเข้าบัญชีผู้ให้บริการ{' '}
            <b>{VENDOR.bank} เลขที่ {VENDOR.bankAccountNo}</b> ชื่อบัญชี {VENDOR.bankAccountName}{' '}
            (2) กรอกรายละเอียดการโอนด้านล่างแล้วกดแจ้งชำระเงิน{' '}
            (3) ผู้ให้บริการตรวจยอดแล้วต่ออายุให้ — <b>อายุการใช้งานจะเพิ่มเมื่อได้รับอนุมัติแล้วเท่านั้น</b>
            {' '}· สอบถามโทร <a href={VENDOR.telHref} style={{ textDecoration: 'underline' }}>{VENDOR.tel}</a>
          </div>

          {isOwner ? (
            hasPending ? (
              <p className="subtle" style={{ margin: 0 }}>
                มีคำขอที่รอตรวจสอบอยู่ 1 รายการ — รอผลก่อน หรือยกเลิกคำขอเดิมแล้วส่งใหม่
              </p>
            ) : <RenewForm today={today()} />
          ) : (
            <p className="subtle" style={{ margin: 0 }}>
              เฉพาะผู้ที่มีสิทธิ์ตั้งค่าร้านเท่านั้นที่แจ้งชำระเงินเพื่อต่ออายุได้
            </p>
          )}
        </div>
      </div>

      {isOwner && requests.length > 0 ? (
        <div className="card">
          <header><h2>คำขอต่ออายุ</h2></header>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>แจ้งเมื่อ</th><th>วันที่โอน</th><th className="num">จำนวนปี</th>
                  <th className="num">ยอดที่โอน</th><th>อ้างอิง</th><th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{thDate(r.createdAt)}</td>
                    <td>{thDate(r.paidOn)}</td>
                    <td className="num">{r.years}</td>
                    <td className="num">{baht(r.amount)}</td>
                    <td className="wrap subtle">{r.note || '-'}</td>
                    <td className="wrap">
                      <span className={`chip ${REQUEST_TONE[r.status]}`}>{REQUEST_LABEL[r.status]}</span>
                      {r.status === 'rejected' && r.decidedNote
                        ? <div className="subtle" style={{ fontSize: '0.875rem', marginTop: 4 }}>เหตุผล: {r.decidedNote}</div>
                        : null}
                      {r.status === 'pending' ? <div style={{ marginTop: 4 }}><CancelRequest id={r.id} /></div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
            ก่อนลบควร<Link href="/settings/import" style={{ textDecoration: 'underline' }}>ดาวน์โหลดไฟล์สำรอง</Link>เก็บไว้
          </p>
          {session.role === 'owner' && shop ? <DeleteTenantForm shopName={shop.name} /> : (
            <p className="subtle" style={{ margin: 0 }}>เฉพาะเจ้าของกิจการเท่านั้นที่ขอลบข้อมูลได้ และต้องยืนยันด้วยรหัสผ่าน</p>
          )}
        </div>
      </div>
    </Shell>
  );
}
