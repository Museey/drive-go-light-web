import Link from 'next/link';

/** พิมพ์ URL ผิดหรือเปิดลิงก์ของเอกสารที่ถูกลบไปแล้ว */
export default function NotFound() {
  return (
    <div className="printview">
      <div className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
        <div className="body">
          <h2 style={{ marginTop: 0 }}>ไม่พบหน้าที่ต้องการ</h2>
          <p style={{ lineHeight: 1.8 }}>
            ที่อยู่นี้อาจพิมพ์ผิด หรือเอกสารที่เคยอยู่ตรงนี้ถูกลบไปแล้ว
          </p>
          <Link className="btn primary" href="/">กลับหน้าแรก</Link>
        </div>
      </div>
    </div>
  );
}
