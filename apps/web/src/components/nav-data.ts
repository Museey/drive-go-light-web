import type { Session } from '@/lib/auth';
import { canMenu, canTab, type PermKey } from '@/lib/perms';
import { BLANK_FORM, MENU, permSubKey, type MenuItem, type SubItem } from './menu-map';

/**
 * ผังเมนูที่ผ่านการกรองสิทธิ์แล้ว — ใช้ร่วมกันทั้งสามรูปแบบการนำทาง
 *
 * แถบซ้าย แถบล่าง และลิ้นชัก ต้องเห็นเมนูชุดเดียวกันเสมอ ถ้าแต่ละที่กรองเอง
 * วันหนึ่งจะมีเมนูที่โผล่ในลิ้นชักแต่ไม่โผล่ในแถบ แล้วไม่มีใครรู้ว่าอันไหนถูก
 *
 * การซ่อนไม่ใช่การป้องกัน — ทุกหน้าเรียก requireTab() เอง
 * เพราะผู้ใช้พิมพ์ URL ตรงเข้ามาได้เสมอ
 */

export interface NavItem {
  menu: MenuItem;
  subs: SubItem[];
}

export function navItems(session: Session): NavItem[] {
  return MENU
    .filter((m) => !m.perm || canMenu(session, m.perm))
    .map((menu) => ({
      menu,
      subs: menu.perm
        ? (menu.subs ?? []).filter((s) => canTab(session, menu.perm as PermKey, permSubKey(s)))
        : (menu.subs ?? []),
    }));
}

export { BLANK_FORM };

/**
 * ห้าช่องของแถบล่างบนมือถือ
 *
 * สี่ช่องแรกคือเมนูที่อู่ใช้บ่อยที่สุดตอนยืนทำงาน ช่องที่ห้าเปิดลิ้นชักที่มีเมนูครบ
 * **ไม่ใช่เมนูที่ถูกตัดทิ้ง** — ทุกเมนูยังไปถึงได้เสมอจากช่องเพิ่มเติม
 *
 * เลือกจากลำดับงานจริงของอู่ ไม่ใช่จากลำดับเลขเมนู — รับรถเข้ามาก็ดูสินค้าและออกเอกสาร
 * ส่วนทะเบียนลูกค้ากับบัญชีเป็นงานที่ทำตอนนั่งโต๊ะ ซึ่งเปิดจากคอมพิวเตอร์อยู่แล้ว
 */
export const TAB_KEYS = ['home', 'income', 'expense', 'stock'] as const;

/** เมนูที่ควรอยู่ในแถบล่าง เรียงตามที่กำหนดไว้ และเฉพาะที่ผู้ใช้คนนี้เข้าได้ */
export function tabItems(session: Session): NavItem[] {
  const all = navItems(session);
  return TAB_KEYS
    .map((k) => all.find((n) => n.menu.key === k))
    .filter((n): n is NavItem => Boolean(n));
}

/** หน้าไหนอยู่ในเมนูไหน — ใช้ทำแถบไฮไลต์ให้ตรงกันทุกรูปแบบ */
export function isCurrent(menu: MenuItem, current: string): boolean {
  return menu.href === '/'
    ? current === '/'
    : current.startsWith(menu.href.split('?')[0]!);
}

/**
 * แท็บย่อยไหนกำลังเปิดอยู่ — **ต้องเทียบ query string ด้วย**
 *
 * แท็บย่อยของเมนูเดียวกันใช้ path เดียวกันหมด ต่างกันแค่ query
 * (`/income?kind=QT` · `/income?kind=RC` · …) ถ้าเทียบแค่ path จะไฮไลต์
 * ทุกแท็บพร้อมกัน แล้วผู้ใช้อ่านไม่ออกว่าตัวเองอยู่ตรงไหน
 * — เจอตอนเปิดลิ้นชักบนมือถือแล้วแท็บ 03.1 ถึง 03.3 เขียวพร้อมกันทั้งแถบ
 *
 * ตัวกรองอื่นที่ผู้ใช้เลือกเพิ่ม (หน้า ขนาดหน้า ช่วงวันที่) ไม่ทำให้หลุด —
 * ดูเฉพาะคีย์ที่แท็บนั้นระบุไว้เท่านั้น
 */
export function subIsCurrent(
  href: string,
  pathname: string,
  params: URLSearchParams,
): boolean {
  const [path, query] = href.split('?');
  if (pathname !== path) return false;
  if (!query) return true;
  const want = new URLSearchParams(query);
  for (const [k, v] of want) if (params.get(k) !== v) return false;
  return true;
}
