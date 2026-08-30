import Link from 'next/link';

/** เมนูหลัก — เรียงและตั้งชื่อตามโปรแกรมรุ่นเดิมเพื่อให้ผู้ใช้เดิมไม่ต้องเรียนใหม่ */
const MENU = [
  { no: '01', href: '/', label: 'หน้าแรก', ready: true },
  { no: '02', href: '/customers', label: 'ข้อมูลลูกค้า / ผู้ขาย', ready: false },
  { no: '03', href: '/income', label: 'รายรับ', ready: true },
  { no: '04', href: '/expense', label: 'รายจ่าย', ready: false },
  { no: '05', href: '/stock', label: 'สินค้า', ready: false },
  { no: '06', href: '/finance', label: 'บัญชี / การเงิน', ready: false },
  { no: '07', href: '/settings', label: 'ตั้งค่าร้าน', ready: false },
  { no: '08', href: '/license', label: 'ลิขสิทธิ์การใช้งาน', ready: false },
] as const;

export function Rail({ shopName, current }: { shopName: string; current: string }) {
  return (
    <nav className="rail">
      <div className="brand">
        <b>DriveGo<em>Light!</em></b>
        <span className="shop">{shopName}</span>
      </div>

      {MENU.map((m) => {
        const active = m.href === '/' ? current === '/' : current.startsWith(m.href);
        const content = (
          <>
            <span className="k">{m.no}</span>
            {m.label}
          </>
        );
        return m.ready ? (
          <Link key={m.no} className="navbtn" href={m.href} aria-current={active}>
            {content}
          </Link>
        ) : (
          <span key={m.no} className="navbtn" style={{ opacity: 0.4, cursor: 'default' }} title="ยังไม่ได้ทำ">
            {content}
          </span>
        );
      })}

      <div className="foot">
        เมนูที่จางคือยังไม่ได้ทำ
        <br />
        <Link href="/login" style={{ textDecoration: 'underline' }}>สลับอู่</Link>
      </div>
    </nav>
  );
}
