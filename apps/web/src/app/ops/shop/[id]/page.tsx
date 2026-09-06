import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/lib/ops-auth';
import { getShop, suggestRenewal } from '@/lib/ops-console';
import { OpsShell } from '../../ops-shell';
import { ResetLink, SeatsForm, RenewForm } from './forms';
import { thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const MODE_LABEL = { trial: 'ทดลองใช้', active: 'ใช้งานอยู่', expired: 'หมดอายุ' } as const;

export default async function OpsShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  const shop = await getShop(session, id);
  if (!shop) notFound();

  const suggested = suggestRenewal(shop.license);

  return (
    <OpsShell
      current="/ops"
      email={session.email}
      title={shop.name}
      sub={`เปิดเมื่อ ${thDate(shop.createdOn)}`}
      actions={<Link className="btn" href="/ops">← กลับรายชื่ออู่</Link>}
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
              <dt>ที่นั่งพนักงาน</dt>
              <dd>{shop.maxUsers === null ? 'ไม่จำกัด' : `${shop.maxUsers} ที่นั่ง`}</dd>
            </dl>
            <SeatsForm tenantId={shop.tenantId} maxUsers={shop.maxUsers} />
          </div>
        </div>
      </div>

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
        <b>ข้อมูลธุรกิจของอู่นี้เปิดดูจากที่นี่ไม่ได้</b> — ลูกค้า เอกสาร ยอดขาย
        และราคา ถูกกันไว้ที่ตัวฐานข้อมูล ไม่ใช่แค่ไม่ได้ทำหน้าจอให้ดู
        ถ้าต้องช่วยเรื่องข้อมูล ให้เจ้าของอู่ดาวน์โหลดไฟล์สำรองส่งมาเอง
      </div>
    </OpsShell>
  );
}
