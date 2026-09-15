'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './icon';
import { BLANK_FORM, TAB_LABEL, isCurrent, navItems, tabItems } from './nav-data';
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
/**
 * ชื่อสั้นบนแถบบนของเดสก์ท็อป — ชื่อเต็มยังอยู่ใน title, aria-label, ลิ้นชัก และหัวหน้าของหน้า
 *
 * วัดจริงที่ 1280px (จอเดสก์ท็อปแคบสุด): ชื่อเต็มครบเก้าเมนู + ชื่อร้าน + ผู้ใช้ ต้องใช้ราว 1,800px
 * ปุ่ม 08 กับ 09 หลุดขอบขวาไปทั้งปุ่ม (e2e nav.spec จับได้) และเพิ่มจุดตัดจอไม่ได้ตามสเปก §2
 * ย่อเฉพาะสี่ชื่อที่ยาวเกิน — เลขกำกับ 01–09 ยังอยู่ครบ ผู้ใช้เดิมที่จำเลขได้ไม่ต้องเรียนใหม่
 */
const RAIL_LABEL: Record<string, string> = {
  customer: 'ลูกค้า/ผู้ขาย',
  finance: 'การเงิน',
  license: 'ลิขสิทธิ์',
  blankform: 'ฟอร์มเปล่า',
};

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
                    aria-current={here} title={menu.label} aria-label={`${menu.no} ${menu.label}`}>
                <span className="k">{menu.no}</span>
                <Icon name={menu.icon} size={17} color={here ? menu.color : '#D7EEE2'} />
                <span className="lbl">{RAIL_LABEL[menu.key] ?? menu.label}</span>
              </Link>
            );
          })}

          <Link className="navbtn" href={BLANK_FORM.href}
                aria-current={current.startsWith('/forms')} title={BLANK_FORM.label}
                aria-label={`${BLANK_FORM.no} ${BLANK_FORM.label}`}>
            <span className="k">{BLANK_FORM.no}</span>
            <Icon name={BLANK_FORM.icon} size={17}
                  color={current.startsWith('/forms') ? BLANK_FORM.color : '#D7EEE2'} />
            <span className="lbl">{RAIL_LABEL[BLANK_FORM.key] ?? BLANK_FORM.label}</span>
          </Link>
        </div>

        <div className="spacer" />

        {/* กล่องขวาแสดงลิขสิทธิ์แบบสั้นอย่างเดียว — ชื่อ · บทบาท และข้อความเต็มอยู่ใน title
            วัดที่ 1280: ชื่อ + ข้อความเต็ม (nowrap) กว้าง 188px ดันเมนูให้ล้นทับกล่องนี้ 158px
            ชื่อผู้ใช้ยังอยู่ในลิ้นชักเมนู (มือถือ) และ aria-label */}
        <div className="foot">
          <span className="who" title={`${session.name} · ${role}${lic ? `\n${lic.text}` : ''}`}
                aria-label={`${session.name} · ${role}${lic ? ` · ${lic.text}` : ''}`}>
            {lic ? <span className={`lic ${lic.tone}`}>{lic.short}</span> : null}
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
            <b>{TAB_LABEL[menu.key as keyof typeof TAB_LABEL] ?? menu.label.split(' / ')[0]}</b>
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
