import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * กรอบของคอนโซลผู้ให้บริการ
 *
 * ตั้งใจให้หน้าตาต่างจากหน้าอู่ชัดเจน — แถบบนสีเข้มกับคำว่า "คอนโซลผู้ให้บริการ"
 * คนที่เปิดสองหน้านี้พร้อมกันต้องแยกออกทันทีว่ากำลังอยู่ที่ไหน
 * การกดผิดหน้าต่างในคอนโซลแบบนี้แพงกว่าการกดผิดในหน้าอู่มาก
 */
export function OpsShell({
  current, title, sub, actions, email, children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
  email: string;
  children: ReactNode;
}) {
  const tabs: [string, string][] = [
    ['/ops', 'อู่ทั้งหมด'],
    ['/ops/operators', 'ผู้ให้บริการ'],
    ['/ops/errors', 'ข้อผิดพลาด'],
    ['/ops/audit', 'บันทึกการใช้งาน'],
  ];

  return (
    <div>
      <div style={{
        background: '#1E2A33', color: '#E8EEF2', padding: '10px 20px',
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <b style={{ fontSize: 15 }}>คอนโซลผู้ให้บริการ</b>
        <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 13,
                color: current === href ? '#1E2A33' : '#B8C6D0',
                background: current === href ? '#E8EEF2' : 'transparent',
                textDecoration: 'none',
              }}
            >{label}</Link>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: '#8FA3B0' }}>{email}</span>
        {/* ต้องเป็น form + POST ห้ามเป็น <Link> — ดูคอมเมนต์ใน /ops/logout/route.ts */}
        <form action="/ops/logout" method="post">
          <button
            type="submit"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              font: 'inherit', fontSize: 12.5, color: '#B8C6D0',
            }}
          >ออกจากระบบ</button>
        </form>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
            {sub ? <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{sub}</div> : null}
          </div>
          <div style={{ flex: 1 }} />
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
