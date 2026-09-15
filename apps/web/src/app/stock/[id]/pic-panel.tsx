'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deletePicAction, savePicAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import { PIC_EDGE } from '@/lib/pics-core';
import { shrinkInto } from '@/components/pic-shrink';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังบันทึก…' : label}
  </button>;
}

function Remove() {
  const { pending } = useFormStatus();
  return <button className="btn danger" type="submit" disabled={pending}>
    {pending ? 'กำลังลบ…' : 'ลบรูป'}
  </button>;
}

export function PicPanel({
  productId, sha, canEdit,
}: {
  productId: string;
  sha: string | null;
  canEdit: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(savePicAction, {});
  const [delState, delAction] = useActionState<FormResult, FormData>(deletePicAction, {});
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fullRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const src = local ?? (sha ? `/pics/${productId}/${sha}` : null);

  /** เลือกไฟล์แล้วย่อทันที เก็บผลลงช่องซ่อนสองช่องเพื่อส่งไปพร้อมฟอร์ม */
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      setLocal(await shrinkInto(file, fullRef.current, thumbRef.current));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'ย่อรูปไม่สำเร็จ — ลองไฟล์อื่น');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="card">
      <header><h2>รูปสินค้า</h2></header>
      <div className="body">
        {err ? <div className="err">{err}</div> : null}
        {state.error ? <div className="err">{state.error}</div> : null}
        {delState.error ? <div className="err">{delState.error}</div> : null}

        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt="รูปสินค้า"
            style={{
              display: 'block', maxWidth: 260, width: '100%', borderRadius: 6,
              border: '1px solid var(--line)', marginBottom: 12,
            }}
          />
        ) : (
          <p style={{ marginBottom: 12, color: 'var(--ink-3)' }}>ยังไม่มีรูป</p>
        )}

        {canEdit ? (
          <>
            <form autoComplete="off" className="form" action={action}>
              <input type="hidden" name="productId" value={productId} />
              <input ref={fullRef} type="file" name="full" hidden />
              <input ref={thumbRef} type="file" name="thumb" hidden />

              <div className="tag-row">
                <input
                  className="in"
                  type="file"
                  accept="image/*"
                  onChange={onPick}
                  disabled={busy}
                />
                {local ? <Submit label="บันทึกรูป" /> : null}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                {busy
                  ? 'กำลังย่อรูป…'
                  : `ย่อให้อัตโนมัติที่ด้านยาว ${PIC_EDGE} จุด · หนึ่งรูปต่อสินค้าหนึ่งรายการ · `
                    + 'รูปใหม่จะแทนที่รูปเดิม'}
              </div>
            </form>

            {sha ? (
              <form autoComplete="off" action={delAction} style={{ marginTop: 10 }}>
                <input type="hidden" name="productId" value={productId} />
                <Remove />
              </form>
            ) : null}
          </>
        ) : (
          <div className="hint">บัญชีของคุณไม่มีสิทธิ์แก้ทะเบียนสินค้า</div>
        )}
      </div>
    </div>
  );
}
