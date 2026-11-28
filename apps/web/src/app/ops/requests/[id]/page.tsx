import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/lib/ops-auth';
import { isUuid } from '@/lib/ids';
import { getRequest } from '@/lib/ops-console';
import { baht, thDate, thDateTime } from '@/lib/format';
import { formatTaxId } from '@/lib/signup-core';
import { OpsShell } from '../../ops-shell';
import { DecideForm } from './decide-form';

export const dynamic = 'force-dynamic';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <tr>
      <th style={{ width: '36%', textAlign: 'left', fontWeight: 500, color: 'var(--ink-2)', verticalAlign: 'top' }}>{k}</th>
      <td style={{ wordBreak: 'break-word' }}>{children}</td>
    </tr>
  );
}

export default async function OpsRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperator();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const r = await getRequest(session, id);
  if (!r) notFound();

  const off = Math.abs(r.amountPaid - r.amountDue) >= 0.005;
  const branch = r.branchNo === null ? null : r.branchNo === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${r.branchNo}`;

  return (
    <OpsShell
      current="/ops/requests"
      email={session.email}
      title={r.shopName}
      sub={`ใบสมัครใหม่ · ส่งเมื่อ ${thDateTime(r.at)}`}
      actions={<Link className="btn" href="/ops/requests">← คำขอทั้งหมด</Link>}
    >
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <header><h2>การชำระเงิน</h2></header>
            <div className="body">
              <table className="tbl"><tbody>
                <Row k="ยอดที่ต้องโอน">{baht(r.amountDue)} บาท ({r.years} ปี{r.wht ? ' · หัก ณ ที่จ่าย 3%' : ''})</Row>
                <Row k="ยอดที่ลูกค้าแจ้ง">
                  <b style={{ color: off ? 'var(--due)' : undefined }}>{baht(r.amountPaid)} บาท</b>
                  {off ? <div style={{ color: 'var(--due)', fontSize: 12.5 }}>ไม่ตรงกับยอดที่ต้องโอน</div> : null}
                </Row>
                <Row k="เวลาที่โอน (ตามสลิป)">{thDateTime(r.paidAt)}</Row>
              </tbody></table>
              {r.hasSlip ? (
                <a href={`/ops/requests/${r.id}/file/slip`} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปจากฐานข้อมูลผ่าน route ที่ตรวจ session */}
                  <img src={`/ops/requests/${r.id}/file/slip`} alt="สลิปการโอน"
                       style={{ maxWidth: '100%', maxHeight: 560, border: '1px solid var(--line)', borderRadius: 6, marginTop: 12 }} />
                </a>
              ) : <div className="subtle" style={{ marginTop: 12 }}>รูปสลิปถูกลบตามรอบเก็บกวาดแล้ว</div>}
              {r.hasWhtCert ? (
                <div style={{ marginTop: 10 }}>
                  <a href={`/ops/requests/${r.id}/file/wht`} target="_blank" rel="noopener">เปิดหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</a>
                </div>
              ) : r.wht ? <div className="subtle" style={{ marginTop: 10 }}>ยังไม่ได้แนบ 50 ทวิ — ลูกค้าจะส่งตามมาทาง LINE</div> : null}
            </div>
          </div>

          <div className="card">
            <header><h2>{r.status === 'pending' ? 'ตัดสิน' : 'ผลการตัดสิน'}</h2></header>
            <div className="body">
              {/* ตัวเดียวทั้งก่อนและหลังตัดสิน — อนุมัติแล้วหน้าโหลดข้อมูลใหม่เป็น "อนุมัติแล้ว"
                  ถ้าสลับไปเป็นอีกคอมโพเนนต์ กล่องลิงก์ตั้งรหัสผ่านที่ขึ้นได้ครั้งเดียวจะหายไปกับมัน */}
              <DecideForm id={r.id} shopName={r.shopName} amount={baht(r.amountPaid)} ownerEmail={r.ownerEmail}
                          decided={r.status === 'pending' ? null : {
                            approved: r.status === 'approved', by: r.decidedBy ?? '-',
                            at: thDateTime(r.decidedAt), reason: r.rejectReason, tenantId: r.tenantId,
                          }} />
            </div>
          </div>
        </div>

        <div className="card">
          <header><h2>ข้อมูลในใบสมัคร</h2></header>
          <div className="body">
            <table className="tbl"><tbody>
              <Row k="ประเภทผู้สมัคร">
                {r.ctype === 'juristic' ? 'นิติบุคคล' : 'บุคคลธรรมดา'} / {r.vatRegistered ? 'จดทะเบียน VAT' : 'ไม่ได้จดทะเบียน VAT'}
              </Row>
              <Row k="ชื่อในใบกำกับภาษี"><b>{r.billName}</b></Row>
              <Row k="เลขประจำตัวผู้เสียภาษี">{r.taxId ? <span className="mono">{formatTaxId(r.taxId)}</span> : '-'}</Row>
              {branch ? <Row k="สถานประกอบการ">{branch}</Row> : null}
              <Row k="ที่อยู่ในใบกำกับภาษี">{r.billAddrText}</Row>
              <Row k="อีเมลรับใบกำกับภาษี">{r.billEmail}</Row>
              {r.ctype === 'juristic' ? <Row k="หัก ณ ที่จ่าย 3%">{r.wht ? 'หัก' : 'ไม่หัก'}</Row> : null}
              <Row k="ชื่อร้าน / อู่">{r.shopName} (จ.{r.shopProvince})</Row>
              <Row k="ผู้ติดต่อ">{r.contactName}{r.contactPos ? ` — ${r.contactPos}` : ''}</Row>
              <Row k="เบอร์มือถือ"><span className="mono">{r.contactTel.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</span></Row>
              <Row k="อีเมลผู้ดูแลระบบ (เข้าสู่ระบบ)"><b>{r.ownerEmail}</b></Row>
              <Row k="ยินยอม PDPA">{r.consentAt ? thDate(r.consentAt.slice(0, 10)) : '-'}</Row>
            </tbody></table>
          </div>
        </div>
      </div>
    </OpsShell>
  );
}
