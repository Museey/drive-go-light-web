import Link from 'next/link';
import { MENU } from './menu-map';

/**
 * ไทล์ "สร้าง…" สีอำพัน — วางต่อท้ายแถบไทล์ด้านบนของหน้ารายการ (ผู้ใช้ชี้ตำแหน่งจากภาพ)
 * ข้อความมีเครื่องหมาย + อันเดียว ไม่มีไอคอนซ้ำ
 */
export function ActionTiles({ menu, first = false }: { menu: string; first?: boolean }) {
  const item = MENU.find((m) => m.key === menu);
  const acts = (item?.actions ?? []).filter((a) => a.tone !== 'neutral');
  if (!acts.length) return null;
  return (
    <>
      {acts.map((a) => (
        <Link key={a.href} href={a.href} className="tile act" data-first={first ? '1' : undefined}>
          <span className="k">{a.no}</span>{a.label}
        </Link>
      ))}
    </>
  );
}
