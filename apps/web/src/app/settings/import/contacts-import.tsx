'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { importContactsAction, type ContactImportState } from './contacts-actions';

function Submit({ label, confirm }: { label: string; confirm?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={confirm ? 'btn primary' : 'btn'}
      type="submit"
      name="confirm"
      value={confirm ? '1' : '0'}
      disabled={pending}
    >
      {pending ? 'กำลังทำงาน…' : label}
    </button>
  );
}

export function ContactsImport({ kind }: { kind: 'customer' | 'vendor' }) {
  const [state, action] = useActionState<ContactImportState, FormData>(
    importContactsAction, {},
  );
  const label = kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า';
  const p = state.plan;

  return (
    <form className="form" action={action}>
      <input type="hidden" name="kind" value={kind} />

      {state.error ? <div className="err">{state.error}</div> : null}

      {state.result ? (
        <div className={state.result.errors.length ? 'note' : 'ok-msg'}>
          <div>
            นำเข้า{label}แล้ว — เพิ่มใหม่ {state.result.created} ราย ·
            ปรับปรุง {state.result.updated} ราย
            {kind === 'customer' ? ` · ข้อมูลรถ ${state.result.vehicles} คัน` : ''}
            {state.result.skipped ? ` · ข้าม ${state.result.skipped} แถว` : ''}
          </div>
          {state.result.errors.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {state.result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {state.result.errors.length > 10
                ? <li>…และอีก {state.result.errors.length - 10} แถว</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {p ? (
        <div className="note" style={{ marginTop: 0 }}>
          <b>ตรวจสอบก่อนนำเข้า</b>
          <div style={{ marginTop: 6 }}>
            อ่านได้ {p.rows.toLocaleString()} แถว ·
            เพิ่มใหม่ <b>{p.add.toLocaleString()}</b> ราย ·
            ปรับปรุงของเดิม <b>{p.update.toLocaleString()}</b> ราย
            {kind === 'customer' ? ` · ข้อมูลรถ ${p.vehicles.toLocaleString()} คัน` : ''}
            {p.skip ? ` · ข้าม ${p.skip.toLocaleString()} แถว` : ''}
          </div>

          {p.reasons.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : null}

          <div className="tablewrap" style={{ marginTop: 10, maxHeight: 260 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>รหัส</th>
                  <th>ชื่อ</th>
                  <th style={{ width: 130 }}>เลขผู้เสียภาษี</th>
                  <th style={{ width: 120 }}>โทรศัพท์</th>
                  <th style={{ width: 90 }}>ผลที่จะเกิด</th>
                </tr>
              </thead>
              <tbody>
                {p.sample.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.taxId || '-'}</td>
                    <td className="mono">{r.tel || '-'}</td>
                    <td>
                      <span className={r.existing ? 'chip' : 'chip ok'}>
                        {r.existing ? 'ปรับปรุง' : 'เพิ่มใหม่'}
                      </span>
                    </td>
                  </tr>
                ))}
                {p.add + p.update > p.sample.length ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      และอีก {(p.add + p.update - p.sample.length).toLocaleString()} ราย
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10 }}>
            การนำเข้า<b>ไม่ลบข้อมูลเดิม</b> ช่องที่เว้นว่างในไฟล์จะคงค่าเดิมไว้
          </div>
        </div>
      ) : null}

      <div className="tag-row">
        <input className="in" type="file" name="file" accept=".csv,text/csv" required />
        {p
          ? <Submit label={`ยืนยันนำเข้า ${(p.add + p.update).toLocaleString()} ราย`} confirm />
          : <Submit label="ตรวจไฟล์" />}
      </div>
    </form>
  );
}
