'use client';

import { useState } from 'react';
import { deletePaymentAction } from './actions';
import { PayForm } from './pay-form';
import type { PaymentHistoryRow } from '@/lib/receivables';
import { baht, thDate } from '@/lib/format';

/**
 * ประวัติการรับชำระของเอกสารหนึ่งใบ พร้อมช่องตัดชำระเพิ่ม
 * ยอดที่รับ ณ วันออกเอกสารลบไม่ได้จากที่นี่ — เป็นส่วนหนึ่งของตัวเอกสาร
 */
export function PaymentsPanel({
  docId, docNo, payable, payments, canPay, direction = 'sell',
}: {
  docId: string;
  docNo: string;
  payable: number;
  payments: PaymentHistoryRow[];
  canPay: boolean;
  /** ฝั่งขายคือรับเงิน ฝั่งซื้อคือจ่ายเงิน — ใช้เลือกคำเรียก */
  direction?: 'sell' | 'buy';
}) {
  const word = direction === 'buy' ? 'จ่าย' : 'รับ';
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const outstanding = Math.round((payable - paid) * 100) / 100;
  const settled = outstanding <= 0.004;

  return (
    <div className="card">
      <header>
        <h2>การ{word}ชำระเงิน</h2>
        <div className="spacer" />
        <span className={`chip ${settled ? 'ok' : 'due'}`}>
          {settled ? 'ชำระครบแล้ว' : `คงค้าง ${baht(outstanding)}`}
        </span>
      </header>

      {error ? <div className="err" style={{ margin: 16 }}>{error}</div> : null}

      {payments.length === 0 ? (
        <div className="empty">ยังไม่มีการ{word}ชำระ</div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>วันที่</th><th>ช่องทาง</th><th>อ้างอิง</th>
                <th className="num">จำนวนเงิน</th><th>บันทึกโดย</th><th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{thDate(p.paidOn)}</td>
                  <td>
                    {p.method}
                    {p.atIssue ? <span className="chip" style={{ marginLeft: 6 }}>ตอนออกเอกสาร</span> : null}
                  </td>
                  <td className="wrap subtle">{p.ref || '-'}</td>
                  <td className="num">{baht(p.amount)}</td>
                  <td className="subtle">{p.byWho ?? '-'}</td>
                  <td>
                    {p.atIssue ? (
                      <span className="subtle" style={{ fontSize: 12 }}>แก้ที่ตัวเอกสาร</span>
                    ) : confirming === p.id ? (
                      <div className="tag-row">
                        <form action={async () => {
                          const r = await deletePaymentAction(p.id, docId);
                          setError(r.error ?? null);
                          setConfirming(null);
                        }}>
                          <button className="btn danger" type="submit" style={{ padding: '2px 8px' }}>ลบ</button>
                        </form>
                        <button className="btn" type="button" style={{ padding: '2px 8px' }}
                                onClick={() => setConfirming(null)}>ไม่ลบ</button>
                      </div>
                    ) : (
                      <button className="btn" type="button" style={{ padding: '2px 8px' }}
                              onClick={() => setConfirming(p.id)}>ลบรายการ</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>รวม{word}ชำระแล้ว</td>
                <td className="num" style={{ fontWeight: 700 }}>{baht(paid)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canPay && !settled ? (
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <PayForm docId={docId} docNo={docNo} outstanding={outstanding} direction={direction} />
        </div>
      ) : null}
    </div>
  );
}
