'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { purgeTrashAction, restoreTrashAction, type TrashActionResult } from './actions';

/**
 * ปุ่มกู้คืน / ลบถาวร ของแต่ละแถวในถังขยะ
 *
 * ตามชุดแก้ 14 ก.ย. 2569 22:37 (เจ้าของกิจการเลือกให้ตามต้นฉบับ):
 * กู้คืนได้ทุกชนิด · ลบถาวรเฉพาะเจ้าของกิจการ และต้องใส่รหัสผ่านของตัวเองซ้ำ
 * พนักงานเห็นปุ่มจางพร้อมเหตุผล — ฝั่งเซิร์ฟเวอร์ตรวจซ้ำเสมอ ปุ่มจางเป็นแค่คำอธิบาย
 *
 * แผงแขวนที่ body ด้วย portal — ตารางอยู่ในกรอบที่เลื่อนแนวนอนได้ ซึ่ง Safari
 * ตัดภาพลูกที่เป็น position: fixed ตามกรอบนั้น (บั๊กเดียวกับแผงเมนูที่ menu-portal.test.ts กันไว้)
 */
export function TrashActions({ source, id, docNo, kindName, mayPurge }: {
  source: 'doc' | 'billnote';
  id: string;
  docNo: string;
  kindName: string;
  /** เจ้าของกิจการเท่านั้น */
  mayPurge: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const close = () => { setConfirming(false); setPassword(''); };

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const run = (fn: () => Promise<TrashActionResult>) => start(async () => {
    setError('');
    const r = await fn();
    if (r.error) { setError(r.error); return; }
    close();
    router.refresh();
  });

  return (
    <>
      <span className="row-acts">
        <button className="btn sm act-pay" type="button" disabled={pending}
                onClick={() => run(() => restoreTrashAction(source, id))}>
          กู้คืน
        </button>
        {mayPurge ? (
          <button className="btn sm act-del" type="button" disabled={pending}
                  onClick={() => { setError(''); setConfirming(true); }}>
            ลบถาวร
          </button>
        ) : (
          <span className="btn sm act-del off" title="ลบถาวรได้เฉพาะเจ้าของกิจการ">ลบถาวร</span>
        )}
      </span>
      {error && !confirming ? <div className="err" role="alert" style={{ marginTop: 4 }}>{error}</div> : null}

      {confirming ? createPortal(
        <>
          <button className="scrim" type="button" aria-label="ปิด" onClick={close} />
          <form className="confirm" role="dialog" aria-modal="true" aria-label={`ยืนยันลบ ${docNo} ถาวร`}
                onSubmit={(e) => { e.preventDefault(); if (password) run(() => purgeTrashAction(source, id, password)); }}>
            <header>
              <b>ลบถาวร — กู้คืนไม่ได้</b>
              <span className="subtle">{kindName} <span className="mono">{docNo}</span></span>
            </header>
            <div style={{ padding: '4px 16px 12px', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 10px' }}>
                เอกสาร <b className="mono">{docNo}</b> จะหายจากทุกหน้า รวมถึงถังขยะนี้ และ<b>กู้คืนไม่ได้อีก</b>
              </p>
              <p className="subtle" style={{ margin: '0 0 14px' }}>
                รายการในบัญชีสต๊อกและการเงินที่อ้างถึงใบนี้ยังเก็บไว้ ยอดย้อนหลังจึงไม่เปลี่ยน
              </p>
              <div className="field">
                <label htmlFor={`purge-pw-${id}`}>รหัสผ่านของคุณ (เจ้าของกิจการ)</label>
                <input id={`purge-pw-${id}`} className="in" type="password" autoComplete="current-password"
                       autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error ? <div className="err" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
            </div>
            <div className="acts">
              <button className="btn act-del" type="submit" disabled={!password || pending}>
                {pending ? 'กำลังลบ…' : 'ลบถาวร'}
              </button>
              <button className="btn" type="button" onClick={close}>ยกเลิก</button>
            </div>
          </form>
        </>,
        document.body,
      ) : null}
    </>
  );
}
