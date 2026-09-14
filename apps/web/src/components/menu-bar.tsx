'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './icon';
import { BLANK_FORM, isCurrent, navItems, tabItems } from './nav-data';
import { NavDrawer } from './nav-drawer';
import type { Session } from '@/lib/auth';
import { licenseLine, type LicenseBrief } from './license-line';

/**
 * การนำทาง — เมนูหลักอยู่ด้านบน เมนูย่อยอยู่ซ้าย (ตามที่ผู้ใช้ขอ)
 *
 *   มือถือ   แถบล่างห้าช่องในระยะนิ้วโป้ง + ลิ้นชักสำหรับเมนูที่เหลือ
 *   แท็บเล็ต  แถบบน (เลข+ไอคอน ครบทุกตัวในจอ ไม่ต้องปัด) + เมนูย่อยคอลัมน์ซ้าย
 *   เดสก์ท็อป แถบบนเต็ม (เลข+ไอคอน+ชื่อ) + เมนูย่อยคอลัมน์ซ้าย
 *
 * **กดเมนูหลักแล้วไปหน้าแรกของเมนูนั้นทันที** — เมนูหลักทุกตัวเป็นลิงก์ที่พาไป
 * เมนูย่อยตัวแรก (เช่น 06 บัญชี/การเงิน → 06.1 ยอดขาย) ไม่ใช่ปุ่มที่กางแผงย่อย
 * แล้วค้างหน้าเดิม ซึ่งเป็นอาการที่ผู้ใช้แจ้งมา
 *
 * **สลับด้วย CSS ไม่ใช่วัดความกว้างใน JS** เพื่อไม่ให้เมนูกระพริบตอนโหลด
 * เลขกำกับ 01–08 อยู่ครบทุกปุ่มทุกรูปแบบ ผู้ใช้เดิมที่จำเลขได้ยังใช้ได้เหมือนเดิม
 */
export function MenuBar({ session, current, license }: {
  session: Session; current: string; license?: LicenseBrief;
}) {
  const lic = license ? licenseLine(license) : null;
  const items = navItems(session);
  const tabs = tabItems(session);
  const role = session.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน';
  const [drawer, setDrawer] = useState(false);

  return (
    <>
      <nav className="rail" aria-label="เมนูหลัก">
        <div className="brand">
          <b>DriveGo<em>Light!</em></b>
          <span className="shop">{session.tenantName}</span>
        </div>

        <div className="railnav">
          {items.map(({ menu, subs }) => {
            const here = isCurrent(menu, current);
            /* ปลายทาง = เมนูย่อยตัวแรกที่กดได้ ไม่มีก็ไปหน้าเมนูนั้นเอง */
            const href = subs.find((s) => !s.todo)?.href ?? menu.href;
            return (
              <Link key={menu.key} className="navbtn" href={href}
                    aria-current={here} title={menu.label}>
                <span className="k">{menu.no}</span>
                <Icon name={menu.icon} size={17} color={here ? menu.color : '#D7EEE2'} />
                <span className="lbl">{menu.label}</span>
              </Link>
            );
          })}

          <Link className="navbtn" href={BLANK_FORM.href}
                aria-current={current.startsWith('/forms')} title={BLANK_FORM.label}>
            <span className="k">{BLANK_FORM.no}</span>
            <Icon name={BLANK_FORM.icon} size={17}
                  color={current.startsWith('/forms') ? BLANK_FORM.color : '#D7EEE2'} />
            <span className="lbl">{BLANK_FORM.label}</span>
          </Link>
        </div>

        <div className="spacer" />

        <div className="foot">
          <span className="who">
            <span>{session.name} · {role}</span>
            {lic ? <span className={`lic ${lic.tone}`}>{lic.text}</span> : null}
          </span>
          <form action="/logout" method="post">
            <button type="submit" className="signout">ออกจากระบบ</button>
          </form>
        </div>
      </nav>

      {/* แถบล่างบนมือถือ — อยู่ในระยะที่นิ้วโป้งเอื้อมถึงตอนถือมือเดียว */}
      <nav className="tabbar" aria-label="เมนูหลัก">
        {tabs.map(({ menu }) => (
          <Link key={menu.key} className="tab" href={menu.href}
                aria-current={isCurrent(menu, current)}>
            <Icon name={menu.icon} size={21}
                  color={isCurrent(menu, current) ? '#fff' : '#BFE3D6'} />
            <b>{menu.label.split(' / ')[0]}</b>
          </Link>
        ))}
        <button type="button" className="tab" onClick={() => setDrawer(true)}
                aria-haspopup="dialog" aria-expanded={drawer}>
          <Icon name="listp" size={21} color={drawer ? '#fff' : '#BFE3D6'} />
          <b>เพิ่มเติม</b>
        </button>
      </nav>

      <NavDrawer items={items} blank={BLANK_FORM} current={current}
                 name={session.name} role={role}
                 note={lic ? <span className={`lic ${lic.tone}`}>{lic.text}</span> : null}
                 open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}
