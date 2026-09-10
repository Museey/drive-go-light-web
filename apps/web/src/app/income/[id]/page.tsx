import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bahttext } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getDocDetail, getShop } from '@/lib/queries';
import { canEdit } from '@/lib/sales';
import { listPayments } from '@/lib/receivables';
import { can } from '@/lib/auth';
import { PaymentsPanel } from '../../finance/payments-panel';
import { DocActions } from '../doc-actions';
import { baht, KIND_LABEL, payLabel, thDate, thDateLong, VAT_MODE_LABEL } from '@/lib/format';
import { DocHistory } from '@/components/doc-history';

export const dynamic = 'force-dynamic';

export default async function DocPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; void?: string }>;
}) {
  const session = await requireTab('income', 'receipt');
  const { id } = await params;
  const sp = await searchParams;
  const [doc, shop, editable, payments] = await Promise.all([
    getDocDetail(id), getShop(), canEdit(id), listPayments(id),
  ]);
  if (!doc) notFound();

  const paid = doc.payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.round((doc.payable - paid) * 100) / 100;
  const status = payLabel(outstanding, paid);

  return (
    <Shell doc
      current="/income"
      title={KIND_LABEL[doc.kind] ?? doc.kind}
      sub={`เลขที่ ${doc.docNo} · ${thDateLong(doc.docDate)}`}
      actions={<Link className="btn" href="/income">← กลับรายการ</Link>}
    >
      {sp.saved ? (
        <div className="ok-msg" style={{ marginBottom: 16 }}>
          บันทึกเรียบร้อย — เลขที่ {sp.saved}
        </div>
      ) : null}
      {sp.error ? <div className="err" style={{ marginBottom: 16 }}>{sp.error}</div> : null}
      {doc.status === 'void' ? (
        <>
          <div className="err" style={{ marginBottom: 16 }}>
            เอกสารนี้ถูกยกเลิกแล้ว — ไม่ถูกนับในยอดขายและภาษี และออกใบต่อจากใบนี้ไม่ได้
            <br />
            ถ้ายังต้องทำงานนี้ต่อ ให้<b>คัดลอกใบใหม่</b> แล้วออกใบต่อจากใบใหม่แทน
          </div>
          {/* ใบที่ยกเลิกแล้วต้องเหลือทางออก — ซ่อนปุ่มทั้งแถบทำให้ผู้ใช้ค้างอยู่ตรงนั้น
              ไม่รู้ว่าต้องทำอะไรต่อ ซึ่งเป็นสิ่งที่รุ่น 6.4 บอกไว้ชัดกว่าเรา */}
          <div className="tag-row" style={{ marginBottom: 16 }}>
            <Link className="btn primary" href={`/income/new?kind=${doc.kind}&from=${doc.id}&copy=1`}>
              คัดลอกใบใหม่
            </Link>
            <Link className="btn" href={`/income/${doc.id}/print`}>พิมพ์เอกสาร</Link>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <DocActions id={doc.id} kind={doc.kind} canEdit={editable.ok} editReason={editable.reason}
                      startVoiding={sp.void === '1' && editable.ok} />
        </div>
      )}

      {doc.missing.length && doc.status !== 'void' ? (
        <div className="note" style={{ marginBottom: 16 }}>
          <b>ข้อมูลบนเอกสารยังไม่ครบ</b> — {doc.missing.join(' · ')}
          <br />
          {doc.kind === 'IVT'
            ? 'ใบกำกับภาษีที่ข้อมูลผู้ซื้อไม่ครบ ลูกค้านำไปใช้เป็นภาษีซื้อไม่ได้ และต้องออกใหม่ทั้งใบ'
            : 'เติมให้ครบก่อนออกใบกำกับภาษีต่อจากใบนี้ จะได้ไม่ต้องออกใหม่ทีหลัง'}
        </div>
      ) : null}

      <div className="grid g2">
        <div className="card">
          <header>
            <h2>ผู้ซื้อ</h2>
            <div className="spacer" />
            {doc.missing.length ? (
              <span className="chip warn" title={doc.missing.join(' · ')}>ข้อมูลไม่ครบ</span>
            ) : null}
            <span className={`chip ${status.tone}`}>{status.text}</span>
          </header>
          <div className="body">
            <dl className="kv">
              <dt>ชื่อ</dt><dd>{doc.partyName || '-'}</dd>
              <dt>เลขผู้เสียภาษี</dt><dd className="mono">{doc.partyTaxId || '-'}</dd>
              <dt>โทรศัพท์</dt><dd className="mono">{doc.partyTel || '-'}</dd>
              <dt>ที่อยู่</dt><dd>{doc.partyAddrText || '-'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <header><h2>รถที่เข้ารับบริการ</h2></header>
          <div className="body">
            {doc.vehicle ? (
              <dl className="kv">
                <dt>ทะเบียน</dt><dd className="mono">{doc.vehiclePlate || '-'} {doc.vehicle.plateProv ?? ''}</dd>
                <dt>ยี่ห้อ / รุ่น</dt><dd>{[doc.vehicle.brand, doc.vehicle.model].filter(Boolean).join(' ') || '-'}</dd>
                <dt>ปี / สี</dt><dd>{[doc.vehicle.year, doc.vehicle.color].filter(Boolean).join(' · ') || '-'}</dd>
                <dt>เลขไมล์</dt><dd className="mono">{doc.vehicle.mileage || '-'}</dd>
              </dl>
            ) : <span style={{ color: 'var(--ink-3)' }}>ไม่มีข้อมูลรถ</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <header>
          <h2>รายการ</h2>
          <div className="spacer" />
          <span className="chip">{VAT_MODE_LABEL[doc.vatMode]}</span>
          {doc.parent ? (
            <Link className="chip" href={`/income/${doc.parent.id}`}>
              ออกต่อจาก {doc.parent.docNo}
            </Link>
          ) : null}
        </header>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>รหัส</th>
                <th>OEM</th>
                <th>รายการ</th>
                <th className="num">จำนวน</th>
                <th>หน่วย</th>
                <th className="num">ราคา/หน่วย</th>
                <th className="num">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it) => (
                <tr key={it.lineNo}>
                  <td style={{ color: 'var(--ink-3)' }}>{it.lineNo}</td>
                  <td className="mono">{it.code || '-'}</td>
                  <td className="mono" style={{ color: 'var(--ink-3)' }}>{it.oem || '-'}</td>
                  <td className="wrap">
                    {it.name}
                    {it.isService ? <span className="chip" style={{ marginLeft: 6 }}>ค่าแรง</span> : null}
                  </td>
                  <td className="num">{it.qty.toLocaleString('en-US')}</td>
                  <td>{it.unit || '-'}</td>
                  <td className="num">{baht(it.unitPrice)}</td>
                  <td className="num">{baht(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="body" style={{ display: 'flex' }}>
          <div className="totals">
            <div className="row"><span className="lbl">รวมเป็นเงิน</span><span>{baht(doc.subtotal)}</span></div>
            {doc.discount > 0 ? (
              <div className="row"><span className="lbl">ส่วนลด</span><span>−{baht(doc.discount)}</span></div>
            ) : null}
            <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(doc.netAmount)}</span></div>
            <div className="row">
              <span className="lbl">ภาษีมูลค่าเพิ่ม {doc.vatRate}%</span><span>{baht(doc.vatAmount)}</span>
            </div>
            <div className="row grand"><span>รวมทั้งสิ้น</span><span>{baht(doc.grandTotal)}</span></div>
            {doc.whtAmount > 0 ? (
              <>
                <div className="row">
                  <span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}%</span><span>−{baht(doc.whtAmount)}</span>
                </div>
                <div className="row grand"><span>ยอดสุทธิที่ต้องชำระ</span><span>{baht(doc.payable)}</span></div>
              </>
            ) : null}

            {/* จำนวนเงินเป็นตัวหนังสือ — ใช้ bahttext() ตัวเดียวกับโปรแกรมเดิม */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', color: 'var(--ink-2)', fontSize: 12.5 }}>
              ({bahttext(doc.payable)})
            </div>
          </div>
        </div>
      </div>

      {doc.kind === 'QT' ? null : (
        <PaymentsPanel
          docId={doc.id}
          docNo={doc.docNo}
          payable={doc.payable}
          payments={payments}
          canPay={doc.status === 'issued' && can(session, 'finance')}
        />
      )}

      <div className="grid g2">
        <div className="card">
          <header><h2>รายละเอียดอื่น</h2></header>
          <div className="body">
            <dl className="kv">
              <dt>ผู้ขาย</dt><dd>{shop.name}</dd>
              <dt>เครดิต</dt><dd>{doc.creditDays > 0 ? `${doc.creditDays} วัน` : 'ไม่มีเครดิต'}</dd>
              <dt>ครบกำหนด</dt><dd>{thDate(doc.dueDate)}</dd>
              <dt>ผู้รับเงิน</dt><dd>{doc.receivedBy || '-'}</dd>
              <dt>การรับประกัน</dt><dd>{doc.warrantyText || '-'}</dd>
              <dt>หมายเหตุ</dt><dd>{doc.note || '-'}</dd>
            </dl>
          </div>
        </div>
      </div>
      <DocHistory documentId={doc.id} />
    </Shell>
  );
}
