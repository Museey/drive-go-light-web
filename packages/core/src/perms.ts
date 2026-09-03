/**
 * ชุดสิทธิ์การใช้งาน — ชนิดข้อมูลและการแปลงจากไฟล์ของโปรแกรมเดิม
 *
 * อยู่ที่ core เพราะทั้งเว็บและตัวนำเข้าต้องใช้ร่วมกัน
 * ส่วนการตัดสินใจว่า "คนนี้ทำอะไรได้" ผูกกับ session จึงอยู่ที่ apps/web/src/lib/perms.ts
 */

/** ชุดเมนูหลัก — ต้องตรงกับ PERMS ของโปรแกรมเดิม */
export const PERM_KEYS = ['customer', 'income', 'expense', 'stock', 'finance', 'settings'] as const;

export type PermKey = (typeof PERM_KEYS)[number];

export const PERM_LABEL: Record<PermKey, string> = {
  customer: 'ข้อมูลลูกค้า / ผู้ขาย',
  income: 'รายรับ',
  expense: 'รายจ่าย',
  stock: 'สินค้า',
  finance: 'บัญชี / การเงิน',
  settings: 'ตั้งค่าร้าน',
};

export interface Perms {
  menus?: Partial<Record<PermKey, boolean>>;
  tabs?: Record<string, boolean>;
  edit?: Record<string, boolean>;
  export?: Record<string, boolean>;
  cost?: boolean;
  homeReport?: boolean;
}

/** ผู้ใช้เท่าที่การตัดสินใจเรื่องสิทธิ์ต้องรู้ */
export const tabKey = (menu: PermKey, sub: string): string => `${menu}.${sub}`;

/** เข้าเมนูหลักได้ไหม */
/**
 * เข้าเมนูย่อยได้ไหม
 *
 * กติกา `tabs` ยกมาจาก canSub() ของรุ่น 6.4 — ถ้ามีคีย์ขึ้นต้นด้วยเมนูนี้อยู่บ้าง
 * ที่ไม่มีถือว่าห้าม แต่ถ้าไม่มีสักคีย์เลยแปลว่ายังไม่เคยตั้งละเอียด จึงเข้าได้ทุกแท็บ
 * จำเป็นเพราะไฟล์ที่ย้ายมาจากรุ่นก่อนไม่มีคีย์เลย ต้องไม่ถูกตัดสิทธิ์ทิ้ง
 *
 * และบังคับกฎพิเศษของ 6.4 ไว้ในนี้ — **ผู้ที่ถูกซ่อนต้นทุนเข้าหน้ากำไรขาดทุนไม่ได้**
 * เพราะทั้งหน้าคือรายงานต้นทุน ซ่อนทีละตัวเลขแล้วเหลือแต่กรอบว่างไม่มีประโยชน์กับใคร
 * วางไว้ที่นี่ที่เดียว หน้าอื่นจะได้ไม่ต้องจำเอง
 */
/** แก้ไขในเมนูย่อยได้ไหม — ต้องเข้าดูได้ก่อนเสมอ */
/** พิมพ์ทั้งชุดหรือดาวน์โหลดเป็นไฟล์ได้ไหม — ต้องเข้าดูได้ก่อนเสมอ */
/** เห็นต้นทุนสินค้าและราคาซื้อไหม */
/** เห็นการ์ดสรุปในหน้าแรกไหม */
/**
 * ต้นทุนที่ถูกซ่อน — ตรงกับ costMoney() ของรุ่น 6.4
 *
 * ตั้งใจให้ต่างจาก 0 ซึ่งอ่านว่าของฟรี และต่างจากช่องว่างซึ่งอ่านว่ายังไม่ได้กรอก
 * ผู้ใช้ต้องรู้ว่า "มีตัวเลขอยู่ แต่ไม่ได้สิทธิ์เห็น"
 */
export const HIDDEN_COST = '•••••';

/**
 * ที่นั่งพนักงานที่เหลือ — null = ไม่จำกัด
 * เจ้าของกิจการไม่ถูกนับ เพราะที่นั่งที่ขายคือที่นั่งพนักงาน
 */
export function seatsLeft(maxUsers: number | null, staffCount: number): number | null {
  if (maxUsers === null || maxUsers === undefined) return null;
  return Math.max(0, maxUsers - staffCount);
}

/**
 * แปลงสิทธิ์จากไฟล์ของโปรแกรมเดิมให้เป็นรูปแบบของเรา
 *
 * ไฟล์จริงมีสองรูปแบบปนกัน เพราะ 6.4 เองก็รองรับไฟล์รุ่นก่อนหน้ามัน
 *   ใหม่  tabs / editTabs / exportTabs   ระบุรายแท็บ
 *   เก่า  sub[menu] = 'quote'            จำกัดให้เข้าได้แท็บเดียว
 *         exportData = false             สวิตช์ส่งออกตัวเดียวทั้งระบบ
 *
 * เรารับเข้ามาแปลงครั้งเดียวตอนนำเข้า จะได้ไม่ต้องแบกทางเลือกสองทางไว้ตลอดกาล
 * @param subsOf ผังเมนูย่อยของเมนูนั้น ใช้ตอนกาง sub/exportData ให้เป็นรายแท็บ
 */
export function permsFromLegacy(
  raw: unknown,
  subsOf: (menu: PermKey) => string[],
): Perms {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: Perms = {};

  /**
   * รุ่นก่อน 6.4 แยกสิทธิ์ตามชนิดเอกสาร ไม่ใช่ตามเมนู — ยกมาจาก migrateUserPerms()
   * ใครออกใบเสนอราคาหรือใบเสร็จได้ ก็คือมีสิทธิ์เมนูรายรับ
   */
  const menus: Partial<Record<PermKey, boolean>> = {};
  for (const k of PERM_KEYS) if (p[k]) menus[k] = true;
  if (p.income === undefined && (p.quote || p.receipt)) menus.income = true;
  if (p.expense === undefined && p.purchase) menus.expense = true;
  out.menus = menus;

  if (p.cost === false) out.cost = false;
  if (p.homeReport === false) out.homeReport = false;

  const tabs: Record<string, boolean> = {};
  const edit: Record<string, boolean> = {};
  const exp: Record<string, boolean> = {};

  for (const menu of PERM_KEYS) {
    if (!menus[menu]) continue;
    const subs = subsOf(menu);
    if (subs.length === 0) continue;

    const hasNew = p.tabs && Object.keys(p.tabs).some((k) => k.startsWith(`${menu}.`));
    /* รูปแบบเก่า sub[menu] = 'quote' แปลว่าเข้าได้แท็บเดียว */
    const only = p.sub?.[menu];

    for (const sub of subs) {
      const key = `${menu}.${sub}`;
      tabs[key] = hasNew ? p.tabs[key] === true : only ? only === sub : true;

      if (p.editTabs?.[key] === false) edit[key] = false;

      if (p.exportTabs && p.exportTabs[key] !== undefined) {
        if (p.exportTabs[key] === false) exp[key] = false;
      } else if (p.exportData === false) {
        exp[key] = false;
      }
    }
  }

  if (Object.keys(tabs).length) out.tabs = tabs;
  if (Object.keys(edit).length) out.edit = edit;
  if (Object.keys(exp).length) out.export = exp;
  return out;
}
