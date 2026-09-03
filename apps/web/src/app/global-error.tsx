'use client';

/**
 * หน้าสุดท้ายที่กันจอขาว — ใช้เมื่อพังตั้งแต่ layout ซึ่ง error.tsx ทำงานไม่ทัน
 *
 * ต้องมี <html> กับ <body> เองเพราะ layout ที่พังไปแล้วให้ไม่ได้
 * และห้ามพึ่ง CSS ของแอปด้วยเหตุผลเดียวกัน — ใส่สไตล์ติดตัวมาเลย
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body style={{
        margin: 0, padding: '48px 20px', background: '#F4F6F5',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1B2420',
      }}>
        <div style={{
          maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 10,
          border: '1px solid #DCE3DF', padding: '26px 28px',
        }}>
          <h2 style={{ marginTop: 0, fontSize: 19 }}>ระบบทำงานผิดพลาด</h2>
          <p style={{ lineHeight: 1.8, fontSize: 14 }}>
            เปิดหน้านี้ไม่ได้ชั่วคราว <b>ข้อมูลที่บันทึกไว้ไม่ได้รับผลกระทบ</b>
            {' '}ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้ติดต่อผู้ดูแลระบบ
          </p>
          {error.digest ? (
            <p style={{ fontSize: 13, color: '#5A6B76' }}>
              รหัสอ้างอิง <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 10, padding: '9px 18px', fontSize: 14, cursor: 'pointer',
              background: '#1D8A5F', color: '#fff', border: 0, borderRadius: 7,
            }}
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </body>
    </html>
  );
}
