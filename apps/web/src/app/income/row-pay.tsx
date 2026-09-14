'use client';

import { useActionState, useEffect, useState } from 'react';
import { recordPaymentAction } from '../finance/actions';
import { baht } from '@/lib/format';

/**
 * รับชำระตรงแถวประวัติ (ผู้ใช้กำหนด) — ป๊อปอัปเล็ก: วิธีชำระ · จำนวน (ค่าเริ่มต้น = ยอดค้าง) · บัญชีรับโอน · อ้างอิง
 * บันทึกผ่าน recordPaymentAction ตัวเดียวกับหน้าเอกสาร จึงได้กติกาเดิม (ห้ามเกินยอดค้าง, ใบยกเลิกรับไม่ได้)
 */
export function RowPay({ docId, docNo, outstanding, today, banks }: {
  docId: string; docNo: string; outstanding: number; today: string;
  banks: { bank: string; no: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('เงินสด');
  const [state, action] = useActionState(recordPaymentAction, {} as { error?: string; ok?: boolean });
  useEffect(() => { if (state && (state as { ok?: boolean }).ok) setOpen(false); }, [state]);
  const bankRef = (b: { bank: string; no: string; name: string }) => `${b.bank} เลขที่ ${b.no}${b.name ? ` (${b.name})` : ''}`;
  return (
    <>
      <button className="btn sm act-pay" type="button" onClick={() => setOpen(true)}>รับชำระ</button>
      {open ? (
        <>
          <button className="scrim on" type="button" aria-label="ปิด" onClick={() => setOpen(false)} />
          <form action={action} className="confirm open" role="dialog" aria-modal="true" aria-label={`รับชำระ ${docNo}`}>
            <input type="hidden" name="docId" value={docId} />
            <header><b>รับชำระ {docNo}</b><span className="subtle">คงค้าง {baht(outstanding)}</span></header>
            {state?.error ? <div className="err-msg">{state.error}</div> : null}
            <div className="field"><label>วันที่รับ</label><input className="in mono" name="paidOn" type="date" defaultValue={today} /></div>
            <div className="field"><label>วิธีชำระ</label>
              <select className="in amber" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>เงินสด</option><option>เงินโอน</option><option>บัตรเครดิต</option><option>เช็ค</option>
              </select>
            </div>
            <div className="field"><label>จำนวนเงิน</label><input className="in mono amber" name="amount" inputMode="decimal" defaultValue={outstanding.toFixed(2)} /></div>
            {method === 'เงินโอน' && banks.length > 0 ? (
              <div className="field"><label>รับโอนเข้าบัญชี</label>
                <select className="in amber" name="ref" defaultValue={bankRef(banks[0]!)}>{banks.map((b) => <option key={b.no} value={bankRef(b)}>{bankRef(b)}</option>)}</select>
              </div>
            ) : (
              <div className="field"><label>อ้างอิง (ถ้ามี)</label><input className="in" name="ref" placeholder="เลขที่อนุมัติบัตร / เลขเช็ค" /></div>
            )}
            <div className="hint">รับบางส่วนได้ — ยอดค้างที่เหลือคำนวณให้ ใบครบแล้วขึ้น "ชำระครบ"</div>
            <div className="acts">
              <button className="btn ok" type="submit">บันทึกรับชำระ</button>
              <button className="btn amber" type="button" onClick={() => setOpen(false)}>ยกเลิก</button>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}
