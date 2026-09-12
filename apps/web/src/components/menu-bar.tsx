'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icon';
import { BLANK_FORM, isCurrent, navItems, tabItems } from './nav-data';
import { NavDrawer } from './nav-drawer';
import { BackFab } from './back-fab';
import type { Session } from '@/lib/auth';

/**
 * การนำทาง — สามรูปแบบตามขนาดจอ ใช้ผังเมนูชุดเดียวกัน
 *
 *   มือถือ   แถบล่างห้าช่องในระยะนิ้วโป้ง + ลิ้นชักสำหรับเมนูที่เหลือ
 *   แท็บเล็ต  แถบบน + ปุ่มเรียกลิ้นชัก
 *   เดสก์ท็อป แถบซ้ายเต็ม เห็นเมนูครบพร้อมกัน
 *
 * **สลับด้วย CSS ไม่ใช่ด้วยการวัดความกว้างใน JavaScript** — การวัดใน JS
 * ทำให้หน้าแรกที่เซิร์ฟเวอร์ส่งมาเป็นคนละอย่างกับที่วาดจริงเสมอ ผู้ใช้จะเห็น
 * เมนูกระพริบเปลี่ยนรูปแบบทุกครั้งที่โหลด และขนาดจอที่เปลี่ยนกลางคันก็ไม่ตาม
 *
 * เลขกำกับ 01–08 อยู่ครบทุกปุ่มทุกรูปแบบ ผู้ใช้เดิมที่จำเลขได้ยังใช้ความจำเดิมได้
 */
export function MenuBar({ session, current }: { session: Session; current: string }) {
  const items = navItems(session);
  const tabs = tabItems(session);
  const role = session.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน';

  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btnRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * วางแผงเมนูย่อยของเดสก์ท็อป — ออกไปทางขวาของแถบซ้าย ระดับเดียวกับปุ่ม
   *
   * **วัดความกว้างจริงของแผงจาก DOM** ไม่ใช่ใช้ตัวเลขที่พิมพ์ไว้
   * ของเดิมพิมพ์ไว้ 290 แต่แผงกว้างจริง 324 จึงดันกลับเข้าจอไม่พอ
   * แล้วล้นขอบขวา 26px ทุกเมนูบนจอแคบ
   */
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = panelRef.current?.getBoundingClientRect().width ?? 300;
    const h = panelRef.current?.getBoundingClientRect().height ?? 0;
    setAt({
      left: Math.max(8, Math.min(r.right + 8, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(r.top, window.innerHeight - h - 8)),
    });
  };

  useEffect(() => {
    if (!open || !btnRef.current) return;
    /* วัดอีกรอบหลังแผงวาดเสร็จ — ตอนกดยังไม่รู้ความสูงจริง */
    place(btnRef.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); btnRef.current?.focus(); }
    };
    const follow = () => { if (btnRef.current) place(btnRef.current); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open]);

  const openAt = (key: string, el: HTMLElement) => {
    btnRef.current = el;
    setOpen(key);
  };

  return (
    <>
      <nav className="rail" aria-label="เมนูหลัก">
        <div className="brand">
          <b>DriveGo<em>Light!</em></b>
          <span className="shop">{session.tenantName}</span>
        </div>

        {/* แท็บเล็ต — เมนูสิบตัวไม่พอดีแถวเดียวที่ 768px จึงเรียกจากลิ้นชัก */}
        <button type="button" className="navbtn drawer-open" onClick={() => setDrawer(true)}
                aria-haspopup="dialog" aria-expanded={drawer}>
          <Icon name="listp" size={18} color="#D7EEE2" />
          เมนูทั้งหมด
        </button>

        <div className="railnav">
          {items.map(({ menu, subs }) => {
            const showing = open === menu.key;
            const here = isCurrent(menu, current);

            if (subs.length === 0) {
              return (
                <Link key={menu.key} className="navbtn" href={menu.href} aria-current={here}>
                  <span className="k">{menu.no}</span>
                  <Icon name={menu.icon} size={17} color={here ? menu.color : '#D7EEE2'} />
                  {menu.label}
                </Link>
              );
            }

            return (
              <button key={menu.key} type="button" className="navbtn"
                      aria-current={here} aria-expanded={showing} aria-haspopup="true"
                      onClick={(e) => (showing ? setOpen(null) : openAt(menu.key, e.currentTarget))}>
                <span className="k">{menu.no}</span>
                <Icon name={menu.icon} size={17} color={here ? menu.color : '#D7EEE2'} />
                {menu.label}
                <span className="car">▾</span>
              </button>
            );
          })}

          <Link className="navbtn" href={BLANK_FORM.href} aria-current={current.startsWith('/forms')}>
            <Icon name={BLANK_FORM.icon} size={17}
                  color={current.startsWith('/forms') ? BLANK_FORM.color : '#D7EEE2'} />
            {BLANK_FORM.label}
          </Link>
        </div>

        <div className="spacer" />

        <div className="foot">
          <BackFab />
          <span className="who">{session.name} · {role}</span>
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
                 open={drawer} onClose={() => setDrawer(false)} />

      {/* แผงเมนูย่อยของเดสก์ท็อป — มีฉากหลังใสที่กดแล้วปิด ตามกติกาเดียวกับลิ้นชัก */}
      {open && mounted ? createPortal(
        <>
          <button className="scrim clear" type="button" aria-label="ปิดเมนู"
                  onClick={() => setOpen(null)} />
          <div className="mmenu" ref={panelRef} style={{ left: at.left, top: at.top }}>
            <div className="mcards">
              {(items.find((n) => n.menu.key === open)?.subs ?? []).map((s) => (
                <Link key={s.key} className="mcard" href={s.href} onClick={() => setOpen(null)}>
                  <span className="no">{s.no}</span>
                  <Icon name={s.icon} size={42} color={s.color} />
                  <span className="t1">{s.label}</span>
                  <span className="t2">{s.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
