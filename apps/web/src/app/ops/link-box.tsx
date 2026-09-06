'use client';

import { useState } from 'react';

/**
 * แสดงลิงก์ที่เพิ่งออกให้ พร้อมปุ่มก๊อป
 *
 * **ลิงก์ไม่ถูกเก็บไว้ที่ไหนเลย** — ฐานข้อมูลเก็บแค่ SHA-256 ของมัน
 * ปิดหน้านี้แล้วดูย้อนหลังไม่ได้ ต้องออกใหม่ ซึ่งเป็นสิ่งที่ควรเป็น
 * เขียนบอกไว้ตรงนี้เพราะไม่งั้นคนจะปิดหน้าไปแล้วมาถามทีหลัง
 */
export function LinkBox({ link, note }: { link: string; note: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="ok-msg" style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 8 }}>{note}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="in mono"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 260, fontSize: 12 }}
        />
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* เบราว์เซอร์ไม่ให้ก๊อป — ช่องข้างบนเลือกข้อความได้อยู่แล้ว */
            }
          }}
        >{copied ? 'ก๊อปแล้ว' : 'ก๊อปลิงก์'}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
        ลิงก์นี้แสดงครั้งเดียว — ปิดหน้านี้แล้วดูย้อนหลังไม่ได้ ต้องออกใหม่
        · ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน · ใครถือลิงก์ก็ตั้งรหัสผ่านได้ ส่งทางที่ปลอดภัย
      </div>
    </div>
  );
}
