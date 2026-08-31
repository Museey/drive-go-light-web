import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bahttext, EXPENSE_CATS } from '@drivegolight/core';
import { requirePerm } from '@/lib/auth';
import { getDocDetail, getShop } from '@/lib/queries';
import { getBuyDocMeta } from '@/lib/purchases';
import { listPayments } from '@/lib/receivables';
import { PrintButton } from '../../../income/[id]/print/print-button';
import { baht, thDate, thDateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CAT = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c]));

export default async function BuyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm('expense');
  const { id } = await params;

  const [doc, meta, shop, payments] = await Promise.all([
    getDocDetail(id), getBuyDocMeta(id), getShop(), listPayments(id),
  ]);
  if (!doc || !meta) notFound();

  const isPurchase = meta.kind === 'PO';
  const cat = meta.expenseCat ? CAT[meta.expenseCat] : null;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remain = Math.round((doc.payable - paid) * 100) / 100;
  const blankRows = Math.max(0, 8 - doc.items.length);

  const title = isPurchase ? 'ใบบันทึกซื้อสินค้า' : 'ใบบันทึกค่าใช้จ่าย';
  const en = isPurchase ? 'PURCHASE RECORD' : 'EXPENSE RECORD';

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={`/expense/${id}`}>← กลับหน้าเอกสาร</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          เอกสารภายในของอู่ ใช้แนบกับใบกำกับภาษีของผู้ขายเก็บเข้าแฟ้ม
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                &nbsp;·&nbsp; เลขประจำตัวผู้เสียภาษี {shop.taxId || '-'}
              </div>
            </div>
            <div className="doc-meta">
              <h1>{title}</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>{en}</div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr><td>เลขที่</td><td style={{ textAlign: 'right' }}><b>{doc.docNo}</b></td></tr>
                  <tr><td>วันที่</td><td style={{ textAlign: 'right' }}>{thDateLong(doc.docDate)}</td></tr>
                  <tr>
                    <td>ใบกำกับผู้ขาย</td>
                    <td style={{ textAlign: 'right' }}>{doc.refDocNo || '-'}</td>
                  </tr>
                  <tr><td>ครบกำหนด</td><td style={{ textAlign: 'right' }}>{thDate(doc.dueDate)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="box">
            <h4>{isPurchase ? 'ซื้อจาก' : 'จ่ายให้'}</h4>
            <div className="kv">
              <b>ชื่อ:</b><span>{doc.partyName || '-'}</span>
              <b>เลขประจำตัวผู้เสียภาษี:</b><span>{doc.partyTaxId || '-'}</span>
            </div>
            <div className="kv"><b>ที่อยู่:</b><span>{doc.partyAddrText || '-'}</span></div>
            <div className="kv">
              <b>โทร:</b><span>{doc.partyTel || '-'}</span>
              {isPurchase ? (
                <>
                  <b>สถานะของ:</b>
                  <span>{meta.goodsReceived ? 'รับของเข้าสต๊อกแล้ว' : 'ยังไม่ได้รับของ'}</span>
                </>
              ) : (
                <>
                  <b>หมวด:</b><span>{cat?.label ?? '-'}</span>
                </>
              )}
            </div>
          </div>

          <table className="doc">
            <thead>
              <tr>
                <th style={{ width: 34 }}>ลำดับ</th>
                {isPurchase ? <th style={{ width: 96 }}>รหัสสินค้า</th> : null}
                <th>รายการ</th>
                <th style={{ width: 50 }}>จำนวน</th>
                <th style={{ width: 46 }}>หน่วย</th>
                <th style={{ width: 80 }}>ราคา/หน่วย</th>
                <th style={{ width: 90 }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it) => (
                <tr key={it.lineNo}>
                  <td style={{ textAlign: 'center' }}>{it.lineNo}</td>
                  {isPurchase ? <td>{it.code}</td> : null}
                  <td>{it.name}</td>
                  <td style={{ textAlign: 'right' }}>{it.qty.toLocaleString('en-US')}</td>
                  <td>{it.unit}</td>
                  <td style={{ textAlign: 'right' }}>{baht(it.unitPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{baht(it.lineTotal)}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`b-${i}`}>
                  <td className="blank">&nbsp;</td>
                  {isPurchase ? <td /> : null}
                  <td /><td /><td /><td /><td />
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <div className="box" style={{ flex: 1, marginTop: 0 }}>
              <h4>การจ่ายเงิน</h4>
              {payments.length === 0 ? (
                <div style={{ fontSize: 12 }}>ยังไม่ได้จ่าย — ตั้งเป็นเจ้าหนี้</div>
              ) : (
                <table style={{ width: '100%', fontSize: 11.5 }}>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i}>
                        <td>{thDate(p.paidOn)}</td>
                        <td>{p.method}</td>
                        <td className="dotted">{p.ref || ''}</td>
                        <td style={{ textAlign: 'right' }}>{baht(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>
                จ่ายแล้ว <b>{baht(paid)}</b> · คงค้าง <b>{baht(remain)}</b>
                <br />
                จำนวนเงิน (ตัวอักษร) <b>{bahttext(doc.payable)}</b>
              </div>
            </div>

            <table className="doc" style={{ width: '46%', marginTop: 0 }}>
              <tbody>
                <tr><td>รวมเป็นเงิน</td><td style={{ textAlign: 'right', width: 96 }}>{baht(doc.subtotal)}</td></tr>
                <tr><td>ส่วนลด</td><td style={{ textAlign: 'right' }}>{baht(doc.discount)}</td></tr>
                {doc.vatMode !== 'none' ? (
                  <>
                    <tr><td>มูลค่าก่อนภาษี</td><td style={{ textAlign: 'right' }}>{baht(doc.netAmount)}</td></tr>
                    <tr>
                      <td>ภาษีมูลค่าเพิ่ม {doc.vatRate}%</td>
                      <td style={{ textAlign: 'right' }}>{baht(doc.vatAmount)}</td>
                    </tr>
                  </>
                ) : null}
                <tr><td><b>รวมทั้งสิ้น</b></td><td style={{ textAlign: 'right' }}><b>{baht(doc.grandTotal)}</b></td></tr>
                {!isPurchase ? (
                  <tr>
                    <td>หัก ณ ที่จ่าย {doc.whtRate}%</td>
                    <td style={{ textAlign: 'right' }}>−{baht(doc.whtAmount)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={{ background: '#EDEFF1' }}><b>ยอดที่ต้องจ่ายจริง</b></td>
                  <td style={{ textAlign: 'right', background: '#EDEFF1' }}><b>{baht(doc.payable)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          {!isPurchase && doc.whtAmount > 0 ? (
            <div className="box">
              <h4>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h4>
              <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                อู่หักภาษี ณ ที่จ่ายไว้ <b>{baht(doc.whtAmount)}</b> บาท
                จากมูลค่า <b>{baht(doc.netAmount)}</b> บาท ในอัตรา {doc.whtRate}%
                และมีหน้าที่นำส่งกรมสรรพากรภายในวันที่ 7 ของเดือนถัดไป
                <br />
                <span style={{ fontSize: 10.5, color: '#666' }}>
                  เอกสารนี้เป็นบันทึกภายใน ไม่ใช่หนังสือรับรองตามแบบของกรมสรรพากร
                </span>
              </div>
            </div>
          ) : null}

          <div className="box">
            <h4>หมายเหตุ</h4>
            <div style={{ fontSize: 11.5, minHeight: 26, whiteSpace: 'pre-wrap' }}>{doc.note || ''}</div>
          </div>

          <div className="sign">
            <div>
              <div className="line" />ผู้บันทึก
              <br /><span style={{ fontSize: 11 }}>( ................................................ )</span>
            </div>
            <div>
              <div className="line" />ผู้อนุมัติ
              <br /><span style={{ fontSize: 11 }}>( ................................................ )</span>
            </div>
          </div>

          <div className="brandfoot">
            <span>จัดทำด้วยโปรแกรม DriveGoLight!</span>
            <span>www.drivebizbegin.com</span>
          </div>
        </div>
      </div>
    </>
  );
}
