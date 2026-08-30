'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { recordPaymentAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import { baht } from '@/lib/format';

const METHODS = ['เงินสด', 'เงินโอน', 'บัตรเครดิต', 'เช็ค'];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : 'บันทึกการรับชำระ'}
    </button>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * ตัดชำระลูกหนี้ — ตั้งจำนวนเป็นยอดคงค้างไว้ให้ เพราะกรณีที่พบบ่อยที่สุดคือจ่ายครบ
 * ตัดบางส่วนก็แค่แก้ตัวเลข
 */
export function PayForm({
  docId, docNo, outstanding, compact,
}: {
  docId: string;
  docNo: string;
  outstanding: number;
  compact?: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(recordPaymentAction, {});
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState('เงินสด');

  if (state.ok) {
    return <div className="ok-msg">บันทึกการรับชำระของ {docNo} เรียบร้อย</div>;
  }

  return (
    <form className="form" action={action}>
      <input type="hidden" name="docId" value={docId} />

      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f4">
        <div className={state.field === 'amount' ? 'field bad' : 'field'}>
          <label htmlFor={`amt-${docId}`}>จำนวนเงินที่รับ</label>
          <input className="in mono" id={`amt-${docId}`} name="amount" inputMode="decimal"
                 value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <span className="hint">คงค้าง {baht(outstanding)} บาท</span>
        </div>

        <div className="field">
          <label htmlFor={`m-${docId}`}>ช่องทาง</label>
          <select className="in" id={`m-${docId}`} name="method" value={method}
                  onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className={state.field === 'paidOn' ? 'field bad' : 'field'}>
          <label htmlFor={`d-${docId}`}>วันที่รับ</label>
          <input className="in mono" id={`d-${docId}`} name="paidOn" type="date" defaultValue={today()} />
        </div>

        <div className="field">
          <label htmlFor={`r-${docId}`}>อ้างอิง</label>
          <input className="in" id={`r-${docId}`} name="ref"
                 placeholder={method === 'เงินสด' ? 'ไม่บังคับ' : 'ธนาคาร / เลขที่'} />
        </div>
      </div>

      <div className="tag-row">
        <Submit />
        {!compact ? (
          <button className="btn" type="button" onClick={() => setAmount(String(outstanding))}>
            เต็มจำนวน
          </button>
        ) : null}
      </div>
    </form>
  );
}
