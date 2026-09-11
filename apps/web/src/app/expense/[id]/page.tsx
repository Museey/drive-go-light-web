import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bahttext, EXPENSE_CATS } from '@drivegolight/core';
import { can, requireTab } from '@/lib/auth';
import { canEdit as mayEditOf } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { getDocDetail } from '@/lib/queries';
import { getBuyDocMeta } from '@/lib/purchases';
import { listPayments } from '@/lib/receivables';
import { PaymentsPanel } from '../../finance/payments-panel';
import { BuyDocActions, UnvoidBuyDoc } from '../doc-actions';
import { baht, thDate, thDateLong, VAT_MODE_LABEL } from '@/lib/format';
import { DocHistory } from '@/components/doc-history';

export const dynamic = 'force-dynamic';

const CAT = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c]));

export default async function BuyDocPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; void?: string }>;
}) {
  const session = await requireTab('expense', 'purchase');
  const { id } = await params;
  const sp = await searchParams;

  const [doc, meta, payments] = await Promise.all([
    getDocDetail(id), getBuyDocMeta(id), listPayments(id),
  ]);
  if (!doc || !meta) notFound();

  const isPurchase = meta.kind === 'PO';
  const mayEdit = mayEditOf(session, 'expense', 'purchase');
  const cat = meta.expenseCat ? CAT[meta.expenseCat] : null;

  return (
    <Shell doc
      current="/expense"
      title={isPurchase ? 'ใบซื้อสินค้า' : `ค่าใช้จ่าย — ${cat?.label ?? ''}`}
      sub={`เลขที่ ${doc.docNo} · ${thDateLong(doc.docDate)}`}
      actions={<Link className="btn" href="/expense">← กลับรายการ</Link>}
    >
      {sp.saved ? (
        <div className="ok-msg" style={{ marginBottom: 16 }}>บันทึกเรียบร้อย — เลขที่ {sp.saved}</div>
      ) : null}
      {sp.error ? <div className="err" style={{ marginBottom: 16 }}>{sp.error}</div> : null}

      {meta.status === 'void' ? (
        <div style={{ marginBottom: 16 }}>
          <div className="err">
            เอกสารนี้ถูกยกเลิกแล้ว{meta.voidedReason ? ` — ${meta.voidedReason}` : ''}
          </div>
          {mayEdit ? (
            <UnvoidBuyDoc id={id} docNo={meta.docNo} hasStock={isPurchase} />
          ) : null}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <BuyDocActions id={id} startVoiding={sp.void === '1'} />
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <header><h2>{isPurchase ? 'ผู้ขาย' : 'ผู้รับเงิน'}</h2></header>
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
          <header><h2>รายละเอียด</h2></header>
          <div className="body">
            <dl className="kv">
              <dt>เลขใบกำกับผู้ขาย</dt><dd className="mono">{doc.refDocNo || '-'}</dd>
              <dt>ภาษีมูลค่าเพิ่ม</dt><dd>{VAT_MODE_LABEL[doc.vatMode]}</dd>
              <dt>เครดิต</dt><dd>{doc.creditDays > 0 ? `${doc.creditDays} วัน` : 'ไม่มีเครดิต'}</dd>
              <dt>ครบกำหนด</dt><dd>{thDate(doc.dueDate)}</dd>
              {isPurchase ? (
                <>
                  <dt>รับของแล้ว</dt>
                  <dd>{meta.goodsReceived
                    ? <span className="chip ok">รับเข้าสต๊อกแล้ว</span>
                    : <span className="chip warn">ยังไม่รับของ — ยังไม่เข้าสต๊อก</span>}</dd>
                </>
              ) : (
                <>
                  <dt>หมวด</dt><dd>{cat?.label ?? '-'}</dd>
                  {meta.assetLifeYears ? (
                    <>
                      <dt>อายุการใช้งาน</dt>
                      <dd>{meta.assetLifeYears} ปี <span className="subtle">(ยังไม่คิดค่าเสื่อมให้)</span></dd>
                    </>
                  ) : null}
                </>
              )}
              <dt>หมายเหตุ</dt><dd>{doc.note || '-'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div className="card">
        <header><h2>รายการ</h2></header>
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                {isPurchase ? <th>รหัส</th> : null}
                <th>รายการ</th>
                <th className="num">จำนวน</th><th>หน่วย</th>
                <th className="num">ราคา/หน่วย</th><th className="num">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it) => (
                <tr key={it.lineNo}>
                  <td className="subtle">{it.lineNo}</td>
                  {isPurchase ? <td className="mono">{it.code || '-'}</td> : null}
                  <td className="wrap">{it.name}</td>
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
            {doc.vatMode !== 'none' ? (
              <>
                <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(doc.netAmount)}</span></div>
                <div className="row">
                  <span className="lbl">ภาษีมูลค่าเพิ่ม {doc.vatRate}%</span><span>{baht(doc.vatAmount)}</span>
                </div>
              </>
            ) : null}
            <div className="row grand"><span>รวมทั้งสิ้น</span><span>{baht(doc.grandTotal)}</span></div>
            {doc.whtAmount > 0 ? (
              <>
                <div className="row">
                  <span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}%</span><span>−{baht(doc.whtAmount)}</span>
                </div>
                <div className="row grand"><span>ยอดที่ต้องจ่ายจริง</span><span>{baht(doc.payable)}</span></div>
              </>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
              ({bahttext(doc.payable)})
            </div>
          </div>
        </div>
      </div>

      <PaymentsPanel
        docId={id}
        docNo={doc.docNo}
        payable={doc.payable}
        payments={payments}
        canPay={meta.status === 'issued' && can(session, 'finance')}
        direction="buy"
      />
      <DocHistory documentId={meta.id} />
    </Shell>
  );
}
