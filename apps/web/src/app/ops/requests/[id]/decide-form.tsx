'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { REJECT_REASONS } from '@/lib/request-reasons';
import { decideRequestAction, type LinkResult } from '../../actions';
import { LinkBox } from '../../link-box';

function Submit({ label, busy, tone }: { label: string; busy: string; tone: 'primary' | 'danger' }) {
  const { pending } = useFormStatus();
  return <button className={`btn ${tone}`} type="submit" disabled={pending}>{pending ? busy : label}</button>;
}

/**
 * อนุมัติ / ปฏิเสธ — ต้องเลือกก่อนว่าจะทำอะไร แล้วยืนยันอีกชั้น (ผู้ใช้เลือก 25 พ.ย. 2569)
 * อนุมัติแล้วเปิดอู่ทันทีและย้อนไม่ได้ ปุ่มสองปุ่มวางติดกันกดพลาดง่ายเกินไป
 */
export function DecideForm({ id, shopName, amount, ownerEmail, decided }: {
  id: string; shopName: string; amount: string; ownerEmail: string;
  /** null = ยังรอตรวจ */
  decided: { approved: boolean; by: string; at: string; reason: string | null; tenantId: string | null } | null;
}) {
  const [mode, setMode] = useState<'' | 'approve' | 'reject'>('');
  const [reason, setReason] = useState('');
  const [state, action] = useActionState<LinkResult, FormData>(decideRequestAction, {});

  if (state.ok) {
    return state.link ? (
      <LinkBox link={state.link}
               note={`เปิดอู่ ${shopName} แล้ว — ส่งลิงก์นี้ให้ ${state.email ?? ownerEmail} เพื่อตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว ภายใน 7 วัน)`} />
    ) : <div className="ok-msg">ปฏิเสธแล้ว — แจ้งลูกค้าพร้อมเหตุผล และโอนเงินคืนถ้ามีการโอนเข้ามา</div>;
  }

  if (decided) {
    return (
      <div>
        <b style={{ color: decided.approved ? 'var(--ok)' : 'var(--due)' }}>
          {decided.approved ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว'}
        </b>
        {' '}โดย {decided.by} เมื่อ {decided.at}
        {decided.reason ? <div style={{ marginTop: 6 }}>เหตุผล: {decided.reason}</div> : null}
        {decided.approved && decided.tenantId ? (
          <div style={{ marginTop: 10 }}>
            <Link className="btn" href={`/ops/shop/${decided.tenantId}`}>เปิดหน้าอู่</Link>
            <div className="subtle" style={{ marginTop: 6, fontSize: 12.5 }}>
              ลิงก์ตั้งรหัสผ่านแสดงได้ครั้งเดียวตอนอนุมัติ — ถ้าหาย ออกใหม่ได้ที่หน้าอู่
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form autoComplete="off" action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={mode} />
      {state.error ? <div className="err" style={{ marginBottom: 10 }}>{state.error}</div> : null}

      {mode === '' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={() => setMode('approve')}>อนุมัติ…</button>
          <button type="button" className="btn danger" onClick={() => setMode('reject')}>ปฏิเสธ…</button>
        </div>
      ) : null}

      {mode === 'approve' ? (
        <div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
            <input type="checkbox" name="checked" style={{ marginTop: 4 }} />
            <span>ตรวจแล้วว่ายอด <b>{amount} บาท</b> เข้าบัญชีธนาคารจริง (ดูในแอปธนาคาร ไม่ใช่ดูจากสลิป)</span>
          </label>
          <div className="note" style={{ marginBottom: 12 }}>
            กดแล้วจะ <b>เปิดอู่ {shopName}</b> · ตั้งค่าร้านตามใบสมัคร · บันทึกลิขสิทธิ์ 1 ปี ·
            ออกลิงก์ตั้งรหัสผ่านให้ {ownerEmail} — ทั้งหมดย้อนกลับไม่ได้
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Submit label="ยืนยันอนุมัติและเปิดอู่" busy="กำลังเปิดอู่…" tone="primary" />
            <button type="button" className="btn" onClick={() => setMode('')}>ยกเลิก</button>
          </div>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>เหตุผล — ข้อความนี้แจ้งถึงลูกค้า</div>
          {REJECT_REASONS.map((r) => (
            <label key={r} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              <span>{r}</span>
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input type="radio" name="reason" value="other" checked={reason === 'other'} onChange={() => setReason('other')} />
            <span>อื่น ๆ</span>
          </label>
          {reason === 'other' ? (
            <input className="in" name="reasonText" maxLength={200} autoComplete="off" style={{ width: '100%', marginBottom: 10 }}
                   placeholder="พิมพ์เหตุผล" aria-label="เหตุผลอื่น" />
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Submit label="ยืนยันปฏิเสธ" busy="กำลังบันทึก…" tone="danger" />
            <button type="button" className="btn" onClick={() => setMode('')}>ยกเลิก</button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
