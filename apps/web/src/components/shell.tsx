import { requireSession } from '@/lib/auth';
import { getLicenseStatus } from '@/lib/subscription';
import { LicenseNag } from './license-nag';
import { EnterToNext } from './enter-to-next';
import { BackFab } from './back-fab';
import { MenuBar } from './menu-bar';

export async function Shell({
  current, title, sub, actions, tools, doc, children,
}: {
  current: string;
  title: string;
  sub?: string;
  /** ปุ่มหลักของหน้า — อยู่ในหัวหน้าทุกขนาดจอ (เช่น "+ ตรวจนับสินค้า" ชิปเลือกชนิดเอกสาร) */
  actions?: React.ReactNode;
  /**
   * ปุ่มเครื่องมือของหน้า (พิมพ์รายงาน · ส่งออก CSV) — จอต่ำกว่า 1280 ย้ายไปอยู่ในลิ้นชัก
   *
   * **แยกจาก actions โดยตั้งใจ** — เดิมย้ายทุกอย่างใน actions ลงลิ้นชัก
   * ปุ่ม "+ ตรวจนับสินค้า" กับชิปเลือกชนิดเอกสารเลยหายไปจากหน้าจอมือถือด้วย
   * (e2e scan-count จับได้) ของสองอย่างนี้ไม่ใช่เครื่องมือ แต่เป็นทางเดินหลักของหน้า
   */
  tools?: React.ReactNode;
  /** หน้าเอกสารรายใบ — หัวแถบเป็นสีเขียวเหมือนหน้าต่างเอกสารของรุ่น 6.4 */
  doc?: boolean;
  children: React.ReactNode;
}) {
  const session = await requireSession();
  /* นับถอยหลังวันหมดอายุไว้ที่แถบเมนูทุกหน้า — ผู้ใช้ไม่ต้องเข้า 08 ลิขสิทธิ์เพื่อรู้ว่าเหลือกี่วัน */
  const license = await getLicenseStatus();

  return (
    <div className="app">
      {/* ปุ่มเครื่องมือของหน้าไปโผล่สองที่: หัวหน้า (เดสก์ท็อป) และลิ้นชัก (จอแคบ)
          เรนเดอร์ทีละที่ตามขนาดจอไม่ได้ — เซิร์ฟเวอร์ไม่รู้ความกว้างจอของผู้ใช้ */}
      <MenuBar session={session} current={current} tools={tools}
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
          <div className="page-acts">{tools}</div>
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
