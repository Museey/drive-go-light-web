import { requireSession } from '@/lib/auth';
import { getLicenseStatus } from '@/lib/subscription';
import { LicenseNag } from './license-nag';
import { EnterToNext } from './enter-to-next';
import { BackFab } from './back-fab';
import { MenuBar } from './menu-bar';

export async function Shell({
  current, title, sub, actions, doc, children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  /** หน้าเอกสารรายใบ — หัวแถบเป็นสีเขียวเหมือนหน้าต่างเอกสารของรุ่น 6.4 */
  doc?: boolean;
  children: React.ReactNode;
}) {
  const session = await requireSession();
  /* นับถอยหลังวันหมดอายุไว้ที่แถบเมนูทุกหน้า — ผู้ใช้ไม่ต้องเข้า 08 ลิขสิทธิ์เพื่อรู้ว่าเหลือกี่วัน */
  const license = await getLicenseStatus();

  return (
    <div className="app">
      <MenuBar session={session} current={current}
               license={{ mode: license.mode, until: license.until, daysLeft: license.daysLeft }} />
      <div className="main">
        <div className={doc ? 'topbar doc' : 'topbar'}>
          <div>
            <h1>{title}</h1>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          {/* ช่องรับแถบเมนูย่อย (แท็บเล็ต/เดสก์ท็อป) — SubnavPortal ย้ายเข้ามาที่นี่ */}
          <div id="topbar-subnav" className="topbar-subnav" />
          <div className="spacer" />
          {actions}
        </div>
        <div className="wrap">{children}</div>
        {/* ปุ่มย้อนกลับลอย มุมขวาล่าง (แท็บเล็ต/เดสก์ท็อป) — ดู CSS .backfab */}
        <BackFab />
      <EnterToNext />
      {license.daysLeft < 0 ? <LicenseNag expiredDays={Math.abs(license.daysLeft)} /> : null}
      </div>
    </div>
  );
}
