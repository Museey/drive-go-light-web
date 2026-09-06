'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deletePicAction, savePicAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import { PIC_EDGE, PIC_QUALITY, THUMB_EDGE } from '@/lib/pics-core';

/**
 * ย่อรูปที่เบราว์เซอร์ด้วย canvas — วิธีเดียวกับรุ่น 6.4
 *
 * ทำฝั่งนี้เพราะไม่ต้องลง sharp ซึ่งเป็นโมดูล native ที่ทำให้ build บนเครื่อง
 * ผู้ให้บริการเปราะขึ้นอีกชั้น และเพราะรูปจากมือถือขนาด 5 MB ไม่ต้องวิ่งขึ้นเน็ตทั้งก้อน
 *
 * เซิร์ฟเวอร์ตรวจไบต์จริงซ้ำอยู่ดี ตรงนี้เป็นแค่ความสะดวก ไม่ใช่ด่านความปลอดภัย
 */
async function shrink(file: File, edge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
    /* รูปโปร่งใสที่แปลงเป็น JPEG จะได้พื้นดำ ทาขาวรองไว้ก่อน */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    return await new Promise<Blob>((res, rej) => {
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error('ย่อรูปไม่สำเร็จ'))),
        'image/jpeg', PIC_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

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
      const [full, thumb] = await Promise.all([
        shrink(file, PIC_EDGE),
        shrink(file, THUMB_EDGE),
      ]);
      const put = (ref: typeof fullRef, blob: Blob, name: string) => {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
        if (ref.current) ref.current.files = dt.files;
      };
      put(fullRef, full, 'full.jpg');
      put(thumbRef, thumb, 'thumb.jpg');
      setLocal(URL.createObjectURL(full));
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
            <form className="form" action={action}>
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
              <form action={delAction} style={{ marginTop: 10 }}>
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
