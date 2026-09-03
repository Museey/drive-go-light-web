'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { BLANK_FORM, MENU, type MenuItem } from './menu-map';
import type { Session } from '@/lib/auth';
import { canMenu, canTab, type PermKey } from '@/lib/perms';

/**
 * แถบเมนูหลัก — แนวนอนด้านบนตามรุ่น 6.4
 *
 * เมนูที่มีแท็บย่อยกดแล้วหล่นแผงการ์ดลงมา เมนูที่ไม่มีก็ไปหน้านั้นเลย
 * บนมือถือแถบเลื่อนซ้ายขวาได้ ปุ่มหน้าแรกตรึงไว้ซ้ายสุดเพื่อให้กดกลับได้เสมอ
 *
 * เมนูและแท็บที่ไม่มีสิทธิ์ถูกซ่อน แต่การซ่อนไม่ใช่การป้องกัน —
 * ทุกหน้าเรียก requireTab() เอง เพราะผู้ใช้พิมพ์ URL ตรงเข้ามาได้เสมอ
 */

const can = (session: Session, perm: PermKey | null): boolean =>
  !perm || canMenu(session, perm);

export function MenuBar({ session, current }: { session: Session; current: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const barRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLElement | null>(null);

  /* แผงวางแบบ fixed จึงต้องวัดตำแหน่งปุ่มเอง
     วางชิดซ้ายปุ่ม แล้วดันกลับเข้ามาถ้าจะล้นขอบขวาของจอ */
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = 290;
    setAt({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: r.bottom + 6,
    });
  };

  const openAt = (key: string, el: HTMLElement) => {
    btnRef.current = el;
    place(el);
    setOpen(key);
  };

  /* กดที่อื่นหรือกด Esc แล้วปิดแผง — แผงลอยทับเนื้อหา ถ้าปิดไม่ได้จะบังของข้างหลัง */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    /* แถบเลื่อนปุ่มเข้ามาในจอเองตอนกด ถ้าปิดแผงเมื่อเกิด scroll
       แผงจะปิดทันทีที่เปิด — ย้ายตำแหน่งตามปุ่มแทน */
    const follow = () => { if (btnRef.current) place(btnRef.current); };
    const bar = barRef.current;

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    bar?.addEventListener('scroll', follow);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      bar?.removeEventListener('scroll', follow);
    };
  }, [open]);

  const visible = MENU.filter((m) => can(session, m.perm));
  const isCurrent = (m: MenuItem) =>
    m.href === '/' ? current === '/' : current.startsWith(m.href.split('?')[0]!);

  return (
    <nav className="rail" ref={barRef}>
      <div className="brand">
        <b>DriveGo<em>Light!</em></b>
        <span className="shop">{session.tenantName}</span>
      </div>

      {visible.map((m) => {
        /* ซ่อนแท็บที่คนนี้เข้าไม่ได้ — เมนูที่ไม่เหลือแท็บเลยก็ไม่ต้องแสดงแผงหล่น */
        const subs = m.perm
          ? (m.subs ?? []).filter((sub) => canTab(session, m.perm as PermKey, sub.key))
          : (m.subs ?? []);
        const showing = open === m.key;

        if (subs.length === 0) {
          return (
            <Link key={m.key} className="navbtn" href={m.href} aria-current={isCurrent(m)}>
              <span className="k">{m.no}</span>
              <Icon name={m.icon} size={17} color={isCurrent(m) ? m.color : '#D7EEE2'} />
              {m.label}
            </Link>
          );
        }

        return (
          <div key={m.key} style={{ position: 'relative', flex: 'none' }}>
            <button
              type="button"
              className="navbtn"
              aria-current={isCurrent(m)}
              aria-expanded={showing}
              aria-haspopup="true"
              onClick={(e) => (showing ? setOpen(null) : openAt(m.key, e.currentTarget))}
            >
              <span className="k">{m.no}</span>
              <Icon name={m.icon} size={17} color={isCurrent(m) ? m.color : '#D7EEE2'} />
              {m.label}
              <span className="car">▾</span>
            </button>

            {showing ? (
              <div className="mmenu" style={{ left: at.left, top: at.top }}>
                <div className="mcards">
                  {subs.map((s) => (
                    s.todo ? (
                      <span key={s.key} className="mcard" aria-disabled="true"
                            title="ยังไม่ได้ทำ — อยู่ในแผนช่วงถัดไป">
                        <span className="no">{s.no}</span>
                        <Icon name={s.icon} size={42} color={s.color} />
                        <span className="t1">{s.label}</span>
                        <span className="t2">{s.desc}</span>
                      </span>
                    ) : (
                      <Link key={s.key} className="mcard" href={s.href} onClick={() => setOpen(null)}>
                        <span className="no">{s.no}</span>
                        <Icon name={s.icon} size={42} color={s.color} />
                        <span className="t1">{s.label}</span>
                        <span className="t2">{s.desc}</span>
                      </Link>
                    )
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <Link className="navbtn" href={BLANK_FORM.href} aria-current={current.startsWith('/forms')}>
        <Icon name={BLANK_FORM.icon} size={17}
              color={current.startsWith('/forms') ? BLANK_FORM.color : '#D7EEE2'} />
        {BLANK_FORM.label}
      </Link>

      <div className="spacer" />

      <div className="foot">
        <span className="who">
          {session.name} · {session.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน'}
        </span>
        <form action="/logout" method="post">
          <button type="submit" className="navbtn" style={{ fontSize: 12.5 }}>ออกจากระบบ</button>
        </form>
      </div>
    </nav>
  );
}
