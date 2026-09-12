'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icon } from './icon';
import { isCurrent, subIsCurrent, type NavItem } from './nav-data';
import type { BLANK_FORM } from './nav-data';

/**
 * ลิ้นชักเมนู — มือถือและแท็บเล็ต
 *
 * **ทุกอย่างที่ลอยทับต้องมีฉากหลังที่กดแล้วปิด** ไม่งั้นมันดูเหมือนส่วนหนึ่งของหน้า
 * และไม่มีทางออกนอกจากกดปุ่มเดิมซ้ำ ซึ่งบนมือถืออาจถูกลิ้นชักบังไปแล้ว
 *
 * เปิดแล้วล็อกการเลื่อนของหน้าข้างหลัง ไม่งั้นเลื่อนในลิ้นชักจนสุดแล้วหน้าข้างหลัง
 * เลื่อนตามต่อ ซึ่งทำให้ปิดลิ้นชักแล้วอยู่คนละที่กับตอนเปิด
 */
export function NavDrawer({
  items, blank, current, name, role, open, onClose,
}: {
  items: NavItem[];
  blank: typeof BLANK_FORM;
  current: string;
  name: string;
  role: string;
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    /* ล็อกการเลื่อนของหน้าข้างหลังไว้ตราบที่ลิ้นชักเปิดอยู่ */
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button className="scrim" type="button" aria-label="ปิดเมนู" onClick={onClose} />
      <div className="drawer" ref={panelRef} role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด">
        <header>
          <b>DriveGo<em>Light!</em></b>
          <button ref={closeRef} className="close" type="button" onClick={onClose} aria-label="ปิดเมนู">
            ✕
          </button>
        </header>

        <div className="body">
          {items.map(({ menu, subs }) => (
            <div className="grp" key={menu.key}>
              <Link className="lead" href={menu.href} aria-current={isCurrent(menu, current)}
                    onClick={onClose}>
                <Icon name={menu.icon} size={20} color={menu.color} />
                <span>{menu.label}</span>
                <span className="k">{menu.no}</span>
              </Link>

              {subs.length > 0 ? (
                <div className="subs">
                  {subs.map((s) => (
                    <Link key={s.key} href={s.href} onClick={onClose}
                          aria-current={subIsCurrent(s.href, pathname, params) ? 'true' : undefined}>
                      <Icon name={s.icon} size={16} color={s.color} />
                      <span>{s.label}</span>
                      <span className="k">{s.no}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <div className="grp">
            <Link className="lead" href={blank.href} onClick={onClose}
                  aria-current={current.startsWith('/forms')}>
              <Icon name={blank.icon} size={20} color={blank.color} />
              <span>{blank.label}</span>
            </Link>
          </div>

          <div className="foot">
            <span className="who">{name} · {role}</span>
            <form action="/logout" method="post">
              <button type="submit" className="signout" style={{ width: '100%' }}>
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
