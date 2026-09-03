'use client';

import { useEffect } from 'react';
import { reportClientError } from './report-error';

/**
 * หน้าที่แสดงเมื่อหน้าใดหน้าหนึ่งพัง
 *
 * ไม่แสดง stack ให้ผู้ใช้เห็น — แสดงแค่รหัสอ้างอิงที่ตรงกับแถวในตาราง ops.errors
 * ผู้ใช้แจ้งรหัสมาแล้วเราเปิดดูได้ทันทีว่าเกิดอะไรขึ้น โดยที่หน้าจอไม่รั่วอะไรออกไป
 */
export default function ErrorPage({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError({
      message: error.message,
      stack: error.stack ?? null,
      digest: error.digest ?? null,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    });
  }, [error]);

  return (
    <div className="printview">
      <div className="card" style={{ maxWidth: 620, margin: '48px auto' }}>
        <div className="body">
          <h2 style={{ marginTop: 0 }}>หน้านี้ทำงานผิดพลาด</h2>
          <p style={{ lineHeight: 1.8 }}>
            ระบบบันทึกข้อผิดพลาดไว้แล้วและเราเห็นเองโดยไม่ต้องแจ้ง
            <b> ข้อมูลที่บันทึกไปก่อนหน้านี้ไม่ได้รับผลกระทบ</b>
          </p>
          {error.digest ? (
            <p className="subtle">
              รหัสอ้างอิง <span className="mono">{error.digest}</span> —
              แจ้งรหัสนี้มาจะช่วยให้เราหาต้นเหตุได้เร็วขึ้น
            </p>
          ) : null}
          <div className="tag-row" style={{ marginTop: 16 }}>
            <button className="btn primary" type="button" onClick={reset}>ลองใหม่อีกครั้ง</button>
            <a className="btn" href="/">กลับหน้าแรก</a>
          </div>
        </div>
      </div>
    </div>
  );
}
