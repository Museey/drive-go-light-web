/** ชุดสิทธิ์ — ต้องตรงกับ CHECK users_perms_valid ในสคีมา และ PERMS ของโปรแกรมเดิม */
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

/** ข้อมูลผู้ใช้ที่หน้าจอต้องใช้ — แยกจากโมดูลฝั่ง server เพื่อให้ client import ได้ */
export interface StaffUser {
  id: string;
  code: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  perms: PermKey[];
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}
