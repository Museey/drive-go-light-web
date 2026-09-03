import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon';
import { MENU, type SubItem } from './menu-map';
import { currentSession } from '@/lib/auth';
import { canTab, type PermKey } from '@/lib/perms';

/**
 * เมนูย่อยแนวตั้งชิดซ้าย ตามรุ่น 6.4
 *
 * แทนแถบชิปแนวนอนที่ใช้อยู่เดิม — การ์ดแนวตั้งอ่านง่ายกว่าเมื่อมีห้าแท็บขึ้นไป
 * และมีที่ให้ใส่คำอธิบายบรรทัดที่สอง ซึ่งช่วยคนที่ยังไม่ชินกับเลขเมนู
 *
 * ใต้รายการแท็บมีที่ว่างสำหรับการ์ดปุ่มทำงาน (เช่น "+ เพิ่มสินค้า")
 * ส่งเข้ามาทาง prop actions
 *
 * แท็บที่ผู้ใช้คนนี้เข้าไม่ได้ถูกซ่อน — อ่าน session เองเพื่อให้ทุกหน้าที่เรียก
 * ไม่ต้องส่งเข้ามาทีละที่ แล้วลืมที่ใดที่หนึ่ง
 */

export async function SubNav({
  menu, current, badges, actions, children,
}: {
  /** คีย์เมนูหลัก เช่น 'stock' */
  menu: string;
  /** คีย์แท็บย่อยที่เปิดอยู่ */
  current: string;
  /** ตัวเลขแจ้งเตือนบนแท็บ เช่น { pending: 12 } */
  badges?: Record<string, number>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const item = MENU.find((m) => m.key === menu);
  const session = await currentSession();
  const all = item?.subs ?? [];
  const subs = session && item?.perm
    ? all.filter((s2) => canTab(session, item.perm as PermKey, s2.key))
    : all;

  if (subs.length === 0) return <>{children}</>;

  return (
    <div className="subwrap">
      <nav className="subnav">
        <div className="ttl">{item!.label}</div>

        {subs.map((s: SubItem) => {
          const on = s.key === current;
          const n = badges?.[s.key] ?? 0;

          const inner = (
            <>
              <span className="si"><Icon name={s.icon} size={28} color={s.color} /></span>
              <span className="sw">
                <span className="sl">
                  {s.label}
                  {n > 0 ? <span className="badge">{n}</span> : null}
                </span>
                <span className="sd">{s.desc}</span>
              </span>
              <u>{s.no}</u>
            </>
          );

          /* แท็บที่ยังไม่ได้ทำแสดงจาง กดไม่ได้ — บอกว่ากำลังจะมี ดีกว่าซ่อนแล้วผู้ใช้เดิมหาไม่เจอ */
          return s.todo ? (
            <span key={s.key} className="item todo" title="ยังไม่ได้ทำ — อยู่ในแผนช่วงถัดไป">
              {inner}
            </span>
          ) : (
            <Link key={s.key} href={s.href} aria-current={on}>{inner}</Link>
          );
        })}

        {actions ? <div className="acts">{actions}</div> : null}
      </nav>

      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
