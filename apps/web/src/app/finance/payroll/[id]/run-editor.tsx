'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThaiDateInput } from '@/components/thai-date-input';
import { baht } from '@/lib/format';
import type { FormResult } from '@/lib/mutate';
import { lineNet, payTotals, type PayLine } from '@/lib/payroll-calc';
import type { PayrollRun } from '@/lib/payroll-core';
import { addMissingAction, removeRunItemAction, saveRunAction } from '../actions';

type Field = keyof PayLine;

/** ช่องตัวเลขของบรรทัด — ชื่อช่องในฟอร์มคู่กับ itemsOf() ใน actions.ts */
const COLS: { field: Field; form: string; label: string }[] = [
  { field: 'base', form: 'base', label: 'เงินเดือน' },
  { field: 'overtime', form: 'ot', label: 'ล่วงเวลา' },
  { field: 'otherIncome', form: 'inc', label: 'เงินได้อื่น' },
  { field: 'sso', form: 'sso', label: 'ประกันสังคม' },
  { field: 'wht', form: 'wht', label: 'หัก ณ ที่จ่าย' },
  { field: 'otherDeduct', form: 'ded', label: 'หักอื่น' },
];

const num = (v: string): number => {
  const x = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0;
};

/**
 * ตารางแก้งวดเงินเดือน — ยอดสุทธิและยอดรวมคิดสดระหว่างพิมพ์ด้วยสูตรเดียวกับฐานข้อมูล (payroll-calc)
 * ค่าที่พิมพ์เก็บเป็นข้อความ จะได้พิมพ์ทศนิยมค้างครึ่งทางได้โดยช่องไม่กระโดด
 */
export function RunEditor({ run, mayEdit }: { run: PayrollRun; mayEdit: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormResult, FormData>(saveRunAction, {});
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState('');
  const [rows, setRows] = useState(() => run.items.map((it) => ({
    id: it.id,
    text: Object.fromEntries(COLS.map((c) => [c.field, String(it[c.field])])) as Record<Field, string>,
    note: it.note,
  })));

  const lines: PayLine[] = rows.map((r) => ({
    base: num(r.text.base), overtime: num(r.text.overtime), otherIncome: num(r.text.otherIncome),
    sso: num(r.text.sso), wht: num(r.text.wht), otherDeduct: num(r.text.otherDeduct),
  }));
  const totals = payTotals(lines);

  const setCell = (i: number, field: Field, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, text: { ...r.text, [field]: value } } : r)));

  const act = (fn: () => Promise<FormResult>, done: (r: FormResult) => string) =>
    start(async () => {
      setNotice('');
      const r = await fn();
      if (r.error) { setNotice(r.error); return; }
      setNotice(done(r));
      router.refresh();
    });

  return (
    <form autoComplete="off" className="form card" action={action} style={{ padding: 16 }}>
      <input type="hidden" name="id" value={run.id} />
      {state.error ? <div className="err" role="alert">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">บันทึกงวดเงินเดือนแล้ว</div> : null}
      {notice ? <div className="note" role="status">{notice}</div> : null}

      <div className="row-fields f3">
        <div className={state.field === 'payDate' ? 'field bad' : 'field'}>
          <label htmlFor="payDate">วันที่จ่าย *</label>
          <ThaiDateInput id="payDate" name="payDate" defaultIso={run.payDate} required disabled={!mayEdit} full />
        </div>
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="note">หมายเหตุของงวด</label>
          <input className="in" id="note" name="note" defaultValue={run.note} readOnly={!mayEdit} />
        </div>
      </div>

      <div className="tablewrap" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
        <table className="tbl lines">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ minWidth: 170 }}>พนักงาน</th>
              {COLS.map((c) => <th key={c.field} className="num" style={{ width: 104 }}>{c.label}</th>)}
              <th className="num" style={{ width: 110 }}>จ่ายสุทธิ</th>
              <th style={{ width: 130 }}>หมายเหตุ</th>
              {mayEdit ? <th style={{ width: 48 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {run.items.length === 0 ? (
              <tr><td colSpan={mayEdit ? 11 : 10} className="subtle">งวดนี้ไม่มีพนักงาน — กด "เติมพนักงานที่ยังไม่อยู่ในงวด" ด้านล่าง</td></tr>
            ) : run.items.map((it, i) => {
              const row = rows[i]!;
              const net = lineNet(lines[i]!);
              return (
                <tr key={it.id}>
                  <td className="subtle">{i + 1}
                    <input type="hidden" name={`it${i}_id`} value={it.id} />
                  </td>
                  <td className="wrap">
                    <b>{it.name}</b>
                    <div className="subtle" style={{ fontSize: '0.875rem' }}>{it.code}{it.position ? ` · ${it.position}` : ''}</div>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.field} className="num">
                      <input className="in mono" name={`it${i}_${c.form}`} inputMode="decimal"
                             aria-label={`${c.label} ของ ${it.name}`} style={{ textAlign: 'right', width: '100%' }}
                             value={row.text[c.field]} readOnly={!mayEdit}
                             onChange={(e) => setCell(i, c.field, e.target.value)}
                             onFocus={(e) => e.target.select()} />
                    </td>
                  ))}
                  <td className="num mono" style={net < 0 ? { color: 'var(--due)' } : undefined}><b>{baht(net)}</b></td>
                  <td>
                    <input className="in" name={`it${i}_note`} aria-label={`หมายเหตุของ ${it.name}`}
                           value={row.note} readOnly={!mayEdit} style={{ width: '100%' }}
                           onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, note: e.target.value } : r)))} />
                  </td>
                  {mayEdit ? (
                    <td>
                      <button className="btn sm act-del" type="button" disabled={busy} title="เอาออกจากงวดนี้"
                              onClick={() => {
                                if (!window.confirm(`เอา ${it.name} ออกจากงวดนี้? (ทะเบียนพนักงานไม่เปลี่ยน)`)) return;
                                act(() => removeRunItemAction(run.id, it.id), () => `เอา ${it.name} ออกจากงวดแล้ว`);
                              }}>✕</button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          {run.items.length > 0 ? (
            <tfoot>
              <tr>
                <td /><td><b>รวม {run.items.length} คน</b></td>
                <td className="num mono" colSpan={3}><b>เงินได้รวม {baht(totals.income)}</b></td>
                <td className="num mono"><b>{baht(totals.sso)}</b></td>
                <td className="num mono"><b>{baht(totals.wht)}</b></td>
                <td className="num mono"><b>{baht(totals.otherDeduct)}</b></td>
                <td className="num mono"><b>{baht(totals.net)}</b></td>
                <td colSpan={mayEdit ? 2 : 1} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <span className="hint">
        ประกันสังคมคิด 5% ของเงินเดือน ฐานไม่ต่ำกว่า 1,650 และไม่เกิน 17,500 บาท (สูงสุด 875 บาท) นายจ้างสมทบเท่ากัน ·
        ภาษีหัก ณ ที่จ่ายคิดตามอัตราที่ตั้งไว้ในทะเบียนพนักงาน · ทุกช่องเป็นค่าเสนอ แก้ได้ก่อนบันทึก
      </span>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {mayEdit ? (
          <>
            <button className="btn primary" type="submit" disabled={pending || busy}>
              {pending ? 'กำลังบันทึก…' : 'บันทึกงวดเงินเดือน'}
            </button>
            <button className="btn" type="button" disabled={pending || busy}
                    onClick={() => act(() => addMissingAction(run.id), (r) => {
                      const n = Number(r.values?.added ?? 0);
                      return n > 0 ? `เติมพนักงานเข้างวดแล้ว ${n} คน` : 'พนักงานที่ใช้งานอยู่อยู่ในงวดนี้ครบแล้ว';
                    })}>
              เติมพนักงานที่ยังไม่อยู่ในงวด
            </button>
          </>
        ) : null}
        <Link className="btn" href={`/finance/payroll/${run.id}/print`}>🖨 พิมพ์สลิป</Link>
      </div>
    </form>
  );
}
