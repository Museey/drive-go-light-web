import Link from 'next/link';
import { can, type Perm, type Session } from '@/lib/auth';

/** เมนูหลัก — เรียงและตั้งชื่อตามโปรแกรมรุ่นเดิมเพื่อให้ผู้ใช้เดิมไม่ต้องเรียนใหม่ */
const MENU: { no: string; href: string; label: string; perm: Perm | null; ready: boolean }[] = [
  { no: '01', href: '/', label: 'หน้าแรก', perm: null, ready: true },
  { no: '02', href: '/customers', label: 'ข้อมูลลูกค้า / ผู้ขาย', perm: 'customer', ready: true },
  { no: '03', href: '/income', label: 'รายรับ', perm: 'income', ready: true },
  { no: '04', href: '/expense', label: 'รายจ่าย', perm: 'expense', ready: true },
  { no: '05', href: '/stock', label: 'สินค้า', perm: 'stock', ready: true },
  { no: '06', href: '/finance', label: 'บัญชี / การเงิน', perm: 'finance', ready: true },
  { no: '07', href: '/settings', label: 'ตั้งค่าร้าน', perm: 'settings', ready: true },
  { no: '08', href: '/license', label: 'ลิขสิทธิ์การใช้งาน', perm: 'settings', ready: false },
];

export function Rail({ session, current }: { session: Session; current: string }) {
  /* เมนูที่ไม่มีสิทธิ์ถูกซ่อน แต่การซ่อนไม่ใช่การป้องกัน — หน้าเหล่านั้นเรียก requirePerm() ด้วย */
  const visible = MENU.filter((m) => !m.perm || can(session, m.perm));

  return (
    <nav className="rail">
      <div className="brand">
        <b>DriveGo<em>Light!</em></b>
        <span className="shop">{session.tenantName}</span>
      </div>

      {visible.map((m) => {
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
        <div style={{ color: '#C6D0DA', fontSize: 12.5 }}>{session.name}</div>
        <div style={{ marginBottom: 8 }}>
          {session.role === 'owner' ? 'เจ้าของกิจการ · สิทธิ์เต็มทุกเมนู' : 'พนักงาน'}
        </div>
        <form action="/logout" method="post">
          <button type="submit" className="navbtn"
                  style={{ background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', font: 'inherit', color: '#93A3B2' }}>
            ออกจากระบบ
          </button>
        </form>
      </div>
    </nav>
  );
}
