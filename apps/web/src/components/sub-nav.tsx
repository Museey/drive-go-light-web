import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon';
import { MENU, permSubKey, type SubItem } from './menu-map';
import { can, currentSession } from '@/lib/auth';
import { SubnavPortal } from './subnav-portal';
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
    ? all.filter((s2) => canTab(session, item.perm as PermKey, permSubKey(s2)))
    : all;

  /* การ์ดสร้าง (สีอำพัน) — กรองตามสิทธิ์เมนูหลัก */
  /* การ์ดสร้าง (อำพัน) ย้ายไปต่อท้ายแถบไทล์ด้านบนของหน้ารายการแล้ว (ActionTiles)
     คอลัมน์ซ้ายเหลือเฉพาะการ์ดเครื่องมือ (โทนกลาง) และเมนูที่ไม่มีแถบไทล์ (ตั้งค่าร้าน) */
  const acts = (item?.actions ?? []).filter((a) => (a.tone === 'neutral' || item?.key === 'settings' || item?.actionsFirst) && (!session || !item?.perm || can(session, item.perm)))
    .sort((a, b) => Number(a.tone === 'neutral') - Number(b.tone === 'neutral'));   /* การ์ดเครื่องมือไปท้ายสุด (ชิดขวา) */
  const actCards = acts.map((a) => (
    <Link key={a.href} href={a.href} className={a.tone === 'neutral' ? 'tool' : 'act'}>
      <span className="si"><Icon name={a.icon} size={26} color={a.tone === 'neutral' ? '#43535F' : '#7A4E00'} /></span>
      <span className="sw"><span className="sl">{a.label}</span></span>
      <u>{a.no}</u>
    </Link>
  ));

  if (subs.length === 0 && acts.length === 0) return <>{children}</>;

  return (
    <div className="subwrap">
      <SubnavPortal>
      <nav className="subnav">
        <div className="ttl">{item!.label}</div>
        {item!.actionsFirst ? actCards : null}

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

        {!item!.actionsFirst ? actCards : null}
        {actions ? <div className="acts">{actions}</div> : null}
      </nav>
      </SubnavPortal>

      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
