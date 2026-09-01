import type { Perm } from '@/lib/auth';
import type { IconName } from './icon';

/**
 * ผังเมนูทั้งระบบ — เลขกำกับ ชื่อ ไอคอน สี และคำอธิบาย
 *
 * ยกมาจาก MENU_ICON · SUB_ICON · MENU_DESC · SUB_DESC และชุดแท็บทั้งหกของรุ่น 6.4
 * มีชุดทดสอบเทียบกับไฟล์ต้นฉบับโดยตรง (menu-map.test.ts) — พิมพ์เลขผิดหรือลืมแท็บแล้วเทสต์แดง
 *
 * ที่เดียวที่แถบเมนูบน แผงหล่น และเมนูย่อยอ่านผังจาก แก้ที่นี่แล้วเปลี่ยนพร้อมกันทั้งสามที่
 */

export interface SubItem {
  key: string;
  /** เลขกำกับแบบเดิม เช่น 03.1 — ผู้ใช้เดิมจำเลขนี้ */
  no: string;
  label: string;
  desc: string;
  icon: IconName;
  color: string;
  href: string;
  /** ยังไม่ได้ทำ — แสดงจาง ๆ กดไม่ได้ */
  todo?: boolean;
}

export interface MenuItem {
  key: string;
  no: string;
  label: string;
  desc: string;
  icon: IconName;
  color: string;
  href: string;
  /** null = ทุกคนเข้าได้ */
  perm: Perm | null;
  subs?: SubItem[];
}

export const MENU: MenuItem[] = [
  {
    key: 'home', no: '01', label: 'หน้าแรก', desc: 'ภาพรวมทั้งอู่ในหน้าเดียว',
    icon: 'home', color: '#1D8A5F', href: '/', perm: null,
  },
  {
    key: 'customer', no: '02', label: 'ข้อมูลลูกค้า / ผู้ขาย', desc: 'ทะเบียนลูกค้าและผู้ขาย',
    icon: 'people', color: '#5B3FBF', href: '/customers', perm: 'customer',
    subs: [
      {
        key: 'customer', no: '02.1', label: 'ทะเบียนลูกค้า', desc: 'ผู้นำรถเข้าซ่อม',
        icon: 'seeUser', color: '#5B3FBF', href: '/customers?kind=customer',
      },
      {
        key: 'vendor', no: '02.2', label: 'ทะเบียนผู้ขาย', desc: 'ร้านอะไหล่ / ผู้จำหน่าย',
        icon: 'seeShop', color: '#C25A18', href: '/customers?kind=vendor',
      },
    ],
  },
  {
    key: 'income', no: '03', label: 'รายรับ', desc: 'ใบเสนอราคา ส่งมอบ ใบเสร็จ',
    icon: 'doc$', color: '#1D7A5F', href: '/income', perm: 'income',
    subs: [
      {
        key: 'quote', no: '03.1', label: 'ใบเสนอราคา / อนุมัติซ่อม', desc: 'เสนอราคาและขออนุมัติซ่อม',
        icon: 'quote', color: '#1D8A5F', href: '/income?kind=QT',
      },
      {
        key: 'invoice', no: '03.2', label: 'ใบส่งมอบงาน / ใบแจ้งหนี้', desc: 'ส่งมอบงานและตั้งลูกหนี้',
        icon: 'truck', color: '#0F5C3E', href: '/income?kind=IVT',
      },
      {
        key: 'receipt', no: '03.3', label: 'ใบเสร็จรับเงิน', desc: 'รับเงินและปิดยอดลูกหนี้',
        icon: 'receipt', color: '#C25A18', href: '/income?kind=RC',
      },
      {
        key: 'billing', no: '03.4', label: 'ใบวางบิล', desc: 'รวมใบค้างชำระแจ้งเก็บเงิน',
        icon: 'bill', color: '#B4720B', href: '/income/billing',
      },
    ],
  },
  {
    key: 'expense', no: '04', label: 'รายจ่าย', desc: 'ซื้อสินค้าและค่าใช้จ่าย',
    icon: 'cart', color: '#C25A18', href: '/expense', perm: 'expense',
    subs: [
      {
        key: 'purchase', no: '04.1', label: 'ซื้อสินค้า', desc: 'ซื้อของเข้าร้าน รับเข้าสต๊อก',
        icon: 'buy', color: '#C25A18', href: '/expense?kind=PO',
      },
      {
        key: 'expense', no: '04.2', label: 'บันทึกค่าใช้จ่าย', desc: 'ค่าใช้จ่ายของกิจการ',
        icon: 'bill', color: '#B3382C', href: '/expense?kind=EX',
      },
    ],
  },
  {
    key: 'stock', no: '05', label: 'สินค้า', desc: 'สต๊อกและเตือนจุดสั่งซื้อ',
    icon: 'box', color: '#2E8B3D', href: '/stock', perm: 'stock',
    subs: [
      {
        key: 'list', no: '05.1', label: 'ทะเบียนสินค้า', desc: 'ทะเบียนสินค้าและสต๊อก',
        icon: 'tags', color: '#2E8B3D', href: '/stock',
      },
      {
        key: 'pending', no: '05.2', label: 'รายการค้างทำ', desc: 'รายการที่ยังไม่ลงทะเบียน',
        icon: 'pending', color: '#B4720B', href: '/stock/pending',
      },
      {
        key: 'claim', no: '05.3', label: 'ใบเคลมสินค้า (ลูกค้า)', desc: 'จ่ายของออกให้ลูกค้าฟรี',
        icon: 'claim', color: '#B3382C', href: '/stock/claim',
      },
      {
        key: 'vclaim', no: '05.4', label: 'เคลมสินค้า (ผู้ขาย)', desc: 'ส่งของชำรุดคืนผู้ขาย',
        icon: 'buy', color: '#C25A18', href: '/stock/vclaim',
      },
      {
        key: 'count', no: '05.5', label: 'ตรวจนับสต๊อก', desc: 'นับของจริงแล้วปรับยอดให้ตรง',
        icon: 'tally', color: '#1F5FBF', href: '/stock/count', todo: true,
      },
    ],
  },
  {
    key: 'finance', no: '06', label: 'บัญชี / การเงิน', desc: 'ลูกหนี้ เจ้าหนี้ กำไรขาดทุน',
    icon: 'chart', color: '#1F5FBF', href: '/finance/ar', perm: 'finance',
    subs: [
      {
        key: 'sales', no: '06.1', label: 'ยอดขาย', desc: 'ยอดขายและต้นทุนตามช่วงเวลา',
        icon: 'sales', color: '#1F5FBF', href: '/finance/sales',
      },
      {
        key: 'ar', no: '06.2', label: 'ลูกหนี้', desc: 'ใบที่ยังเก็บเงินไม่ได้',
        icon: 'ar', color: '#1D7A5F', href: '/finance/ar',
      },
      {
        key: 'ap', no: '06.3', label: 'เจ้าหนี้', desc: 'ใบที่ยังไม่ได้จ่าย',
        icon: 'ap', color: '#C25A18', href: '/finance/ap',
      },
      {
        key: 'pl', no: '06.4', label: 'กำไรขาดทุน', desc: 'กำไรขาดทุนรายเดือน',
        icon: 'pl', color: '#5B3FBF', href: '/finance/pl',
      },
    ],
  },
  {
    key: 'settings', no: '07', label: 'ตั้งค่าร้าน', desc: 'ข้อมูลร้านและผู้ใช้งาน',
    icon: 'gear', color: '#5A6B76', href: '/settings', perm: 'settings',
    subs: [
      {
        key: 'shop', no: '07.1', label: 'ตั้งค่าร้าน', desc: 'ข้อมูลร้านบนหัวเอกสาร',
        icon: 'gear', color: '#5A6B76', href: '/settings',
      },
      {
        key: 'staff', no: '07.2', label: 'ตั้งค่าพนักงาน', desc: 'ผู้ใช้งานและสิทธิ์',
        icon: 'people', color: '#5B3FBF', href: '/settings/users',
      },
      {
        key: 'import', no: '07.3', label: 'นำข้อมูลเข้าระบบ', desc: 'นำเข้าและสำรองข้อมูล',
        icon: 'folder', color: '#1D8A5F', href: '/settings/backup',
      },
    ],
  },
  {
    key: 'license', no: '08', label: 'ลิขสิทธิ์การใช้งาน', desc: 'สถานะและรหัสลิขสิทธิ์',
    icon: 'shield', color: '#B4720B', href: '/license', perm: null,
  },
];

/**
 * แบบฟอร์มเปล่า — 6.4 นับเป็นเมนูหนึ่งใน MENU_ICON ด้วย
 * แต่ในเว็บเราเป็นหน้าเดี่ยวที่ไม่มีแท็บย่อย เลยแยกออกมาไว้ท้ายแถบ
 */
export const BLANK_FORM: MenuItem = {
  key: 'blankform', no: '', label: 'แบบฟอร์มเปล่า', desc: 'แบบฟอร์มเขียนมือทุกชนิด',
  icon: 'blank', color: '#B4720B', href: '/forms', perm: null,
};

/** หาเมนูที่ตรงกับเส้นทางปัจจุบัน — เส้นทางยาวสุดที่ตรงชนะ */
export function menuOf(pathname: string): MenuItem | null {
  if (pathname === '/') return MENU[0]!;
  return MENU
    .filter((m) => m.href !== '/' && pathname.startsWith(m.href.split('?')[0]!))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}
