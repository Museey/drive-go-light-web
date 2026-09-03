/**
 * สิทธิ์การใช้งาน — ที่เดียวที่ตัดสินใจว่าใครทำอะไรได้
 *
 * ชนิดข้อมูลกับการแปลงจากไฟล์เดิมอยู่ที่ @drivegolight/core เพราะตัวนำเข้าใช้ร่วมด้วย
 * ที่นี่เก็บเฉพาะการตัดสินใจที่ผูกกับผู้ใช้หนึ่งคน
 *
 * ทุกฟังก์ชันเป็นฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูลและไม่แตะ session store
 * จึงทดสอบได้ตรง ๆ และ client component import ได้ด้วย
 *
 * สามแกนต่อเมนูย่อยหนึ่งอัน ตามรุ่น 6.4
 *   ดูได้      tabs['stock.count']
 *   แก้ไขได้    edit['stock.count']
 *   ส่งออกได้   export['stock.count']   (พิมพ์ทั้งชุด / ดาวน์โหลดไฟล์)
 *
 * บวกสองสวิตช์ระดับคน — เห็นต้นทุน กับ เห็นสรุปหน้าแรก
 *
 * **ค่าที่ไม่ได้ตั้งไว้ = อนุญาต** ทุกแกน ยกเว้น `tabs` ที่ทำตามกติกาของ 6.4 (ดู canTab)
 */
import { tabKey, type PermKey, type Perms } from '@drivegolight/core';

export {
  HIDDEN_COST, PERM_KEYS, PERM_LABEL, permsFromLegacy, seatsLeft, tabKey,
  type PermKey, type Perms,
} from '@drivegolight/core';

/** ผู้ใช้เท่าที่การตัดสินใจเรื่องสิทธิ์ต้องรู้ */
export interface PermSubject {
  role: 'owner' | 'staff';
  perms: Perms;
}

const isOwner = (s: PermSubject) => s.role === 'owner';

/** เข้าเมนูหลักได้ไหม */
export function canMenu(s: PermSubject, menu: PermKey): boolean {
  if (isOwner(s)) return true;
  return s.perms.menus?.[menu] === true;
}

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
export function canTab(s: PermSubject, menu: PermKey, sub: string): boolean {
  if (menu === 'finance' && sub === 'pl' && !canCost(s)) return false;
  if (isOwner(s)) return true;
  if (!canMenu(s, menu)) return false;

  const tabs = s.perms.tabs;
  if (!tabs) return true;
  const prefix = `${menu}.`;
  const touched = Object.keys(tabs).some((k) => k.startsWith(prefix));
  if (!touched) return true;
  return tabs[tabKey(menu, sub)] === true;
}

/** แก้ไขในเมนูย่อยได้ไหม — ต้องเข้าดูได้ก่อนเสมอ */
export function canEdit(s: PermSubject, menu: PermKey, sub: string): boolean {
  if (isOwner(s)) return true;
  if (!canTab(s, menu, sub)) return false;
  return s.perms.edit?.[tabKey(menu, sub)] !== false;
}

/** พิมพ์ทั้งชุดหรือดาวน์โหลดเป็นไฟล์ได้ไหม — ต้องเข้าดูได้ก่อนเสมอ */
export function canExport(s: PermSubject, menu: PermKey, sub: string): boolean {
  if (isOwner(s)) return true;
  if (!canTab(s, menu, sub)) return false;
  return s.perms.export?.[tabKey(menu, sub)] !== false;
}

/** เห็นต้นทุนสินค้าและราคาซื้อไหม */
export function canCost(s: PermSubject): boolean {
  if (isOwner(s)) return true;
  return s.perms.cost !== false;
}

/** เห็นการ์ดสรุปในหน้าแรกไหม */
export function canHomeReport(s: PermSubject): boolean {
  if (isOwner(s)) return true;
  return s.perms.homeReport !== false;
}

/** ข้อมูลผู้ใช้ที่หน้าจอต้องใช้ — แยกจากโมดูลฝั่ง server เพื่อให้ client import ได้ */
export interface StaffUser {
  id: string;
  code: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  perms: Perms;
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}
