import Link from 'next/link';

/**
 * การ์ดชวนอัปเกรดเป็น Light Plus — แสดงแทนเนื้อหาของหน้าฟีเจอร์ Plus ในอู่แพ็กเกจ Light
 *
 * แท็บของฟีเจอร์ Plus แสดงทุกแพ็กเกจโดยตั้งใจ (menu-map.ts) หน้านี้จึงต้องบอกให้ชัดว่า
 * ไม่ใช่ระบบพัง และต้องทำอะไรต่อ · **การ์ดนี้ไม่ใช่การป้องกัน** — ตัวอ่านและตัวเขียนของฟีเจอร์
 * ตรวจแพ็กเกจเองทุกตัว (assertPlusWith ใน plan-core.ts)
 */
export function PlusUpsell({ feature, points }: { feature: string; points: string[] }) {
  return (
    <div className="card" data-plus-upsell>
      <header><h2>{feature} — ฟีเจอร์ของ DriveGo Light Plus</h2></header>
      <div className="body">
        <div className="note" style={{ marginBottom: 14 }}>
          อู่ของคุณใช้แพ็กเกจ <b>DriveGo Light!</b> อยู่ ส่วนนี้เปิดใช้ได้เมื่ออัปเกรดเป็น <b>Light Plus</b>
          — ข้อมูลเดิมทั้งหมดอยู่ครบ ใช้งานต่อได้ทันทีหลังอัปเกรด ไม่ต้องย้ายข้อมูล
        </div>
        <ul style={{ margin: '0 0 14px', paddingLeft: 20, lineHeight: 1.9 }}>
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <Link className="btn primary" href="/license#plus">ดูแพ็กเกจและติดต่ออัปเกรด</Link>
      </div>
    </div>
  );
}
