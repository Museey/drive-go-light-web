'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { recordBulkPaymentsAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import { baht, thDate } from '@/lib/format';

/**
 * ตัดชำระหลายใบพร้อมกัน
 *
 * ลูกค้าที่ถูกวางบิลไปแปดใบมักจ่ายมาเป็นเช็คใบเดียว การตัดทีละใบแปดรอบ
 * แปลว่าต้องกรอกวันที่กับเลขเช็คเดิมซ้ำแปดครั้ง และพลาดไปใบหนึ่งก็ไม่มีใครรู้
 *
 * แผงนี้ใช้แถวที่หน้ากรองมาให้แล้ว — ค้นหาหรือกรองที่หัวตารางก่อนก็ได้
 * จำนวนเงินตั้งต้นเป็นยอดค้างของใบนั้น แก้รายใบได้ ใบที่ไม่ติ๊กไม่ถูกส่งไปเลย
 */

export interface BulkRow {
  id: string;
  docNo: string;
  partyName: string;
  dueDate: string | null;
  outstanding: number;
  daysOverdue: number;
}

const METHODS = ['เงินสด', 'เงินโอน', 'บัตรเครดิต', 'เช็ค'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

function Submit({ count, total, word }: { count: number; total: number; word: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending || count === 0}>
      {pending ? 'กำลังบันทึก…' : `บันทึกการ${word}ชำระ ${count} ใบ · ${baht(total)}`}
    </button>
  );
}

export function BulkPay({
  rows, direction = 'sell', defaultOpen,
}: {
  rows: BulkRow[];
  direction?: 'sell' | 'buy';
  defaultOpen?: boolean;
}) {
  const word = direction === 'buy' ? 'จ่าย' : 'รับ';
  const partyWord = direction === 'buy' ? 'ผู้ขาย' : 'ลูกค้า';

  const router = useRouter();
  const [state, action] = useActionState<FormResult, FormData>(recordBulkPaymentsAction, {});
  const [open, setOpen] = useState(!!defaultOpen);
  const [party, setParty] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  /* บันทึกสำเร็จแล้วยอดค้างเปลี่ยนหมด — ดึงข้อมูลใหม่แล้วล้างที่ติ๊กไว้ */
  useEffect(() => {
    if (!state.ok) return;
    setPicked({});
    setAmounts({});
    router.refresh();
  }, [state.ok, router]);

  const parties = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const name = r.partyName || '(ไม่ระบุชื่อ)';
      seen.set(name, (seen.get(name) ?? 0) + r.outstanding);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const shown = useMemo(
    () => (party ? rows.filter((r) => (r.partyName || '(ไม่ระบุชื่อ)') === party) : rows),
    [rows, party],
  );

  const amountOf = (r: BulkRow) => amounts[r.id] ?? String(round2(r.outstanding));
  const chosen = shown.filter((r) => picked[r.id]);
  const total = round2(chosen.reduce((s, r) => s + (Number(amountOf(r)) || 0), 0));

  const setAll = (on: boolean) =>
    setPicked(Object.fromEntries(shown.map((r) => [r.id, on])));

  if (rows.length === 0) return null;

  if (!open) {
    return (
      <div className="no-print" style={{ marginBottom: 14 }}>
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          {word}ชำระหลายใบพร้อมกัน
        </button>
      </div>
    );
  }

  return (
    <div className="card no-print" style={{ marginBottom: 18 }}>
      <div className="toolbar">
        <strong>{word}ชำระหลายใบพร้อมกัน</strong>
        <span className="spacer" />
        <button className="btn" type="button" onClick={() => setOpen(false)}>ปิด</button>
      </div>

      <form className="form" action={action}>
        {state.error ? <div className="err">{state.error}</div> : null}
        {state.ok ? <div className="ok-msg">{state.values?.note}</div> : null}

        <div className="row-fields f4">
          <div className="field">
            <label htmlFor="bulk-party">{partyWord}</label>
            <select className="in" id="bulk-party" value={party}
                    onChange={(e) => { setParty(e.target.value); setPicked({}); }}>
              <option value="">— ทุกราย ({rows.length} ใบ) —</option>
              {parties.map(([name, owed]) => (
                <option key={name} value={name}>{name} · {baht(owed)}</option>
              ))}
            </select>
          </div>
          <div className={state.field === 'paidOn' ? 'field bad' : 'field'}>
            <label htmlFor="bulk-date">วันที่{word}</label>
            <input className="in mono" id="bulk-date" name="paidOn" type="date" defaultValue={today()} />
          </div>
          <div className="field">
            <label htmlFor="bulk-method">ช่องทาง</label>
            <select className="in" id="bulk-method" name="method" defaultValue="เงินโอน">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bulk-ref">อ้างอิง</label>
            <input className="in" id="bulk-ref" name="ref" placeholder="เลขที่เช็ค / ธนาคาร" />
            <span className="hint">ใช้ร่วมกันทุกใบที่ติ๊ก</span>
          </div>
        </div>

        <div className="tablewrap" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>เลขที่</th><th>{partyWord}</th><th>ครบกำหนด</th>
                <th className="num">ค้างชำระ</th>
                <th className="num" style={{ width: 140 }}>ยอดที่{word}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = !!picked[r.id];
                return (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={on}
                             onChange={() => setPicked((c) => ({ ...c, [r.id]: !on }))} />
                    </td>
                    <td className="mono">{r.docNo}</td>
                    <td className="wrap">{r.partyName || '-'}</td>
                    <td>
                      {thDate(r.dueDate)}
                      {r.daysOverdue > 0
                        ? <span className="chip due" style={{ marginLeft: 6 }}>เกิน {r.daysOverdue} วัน</span>
                        : null}
                    </td>
                    <td className="num">{baht(r.outstanding)}</td>
                    <td className="num">
                      {on ? (
                        <input className="in mono num" name={`amt:${r.id}`} inputMode="decimal"
                               style={{ textAlign: 'right' }}
                               value={amountOf(r)}
                               onChange={(e) => setAmounts((c) => ({ ...c, [r.id]: e.target.value }))} />
                      ) : <span className="subtle">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <button className="btn" type="button" onClick={() => setAll(true)}>เลือกทั้งหมดที่แสดง</button>
                  {' '}
                  <button className="btn" type="button" onClick={() => setAll(false)}>ล้างที่เลือก</button>
                </td>
                <td className="num" style={{ fontWeight: 600 }}>รวม</td>
                <td className="num" style={{ fontWeight: 700 }}>{baht(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="formbar">
          <Submit count={chosen.length} total={total} word={word} />
          <span className="subtle">ยอดที่กรอกเกินยอดค้างจะถูกปรับลงให้พอดี</span>
        </div>
      </form>
    </div>
  );
}
