/**
 * การใช้งานของอู่ในคอนโซลผู้ให้บริการ — จัดกลุ่มกับข้อความ "กี่วันก่อน" อยู่ที่นี่ที่เดียว
 *
 * ฐานข้อมูลคืนแค่เวลาดิบ (db/037_usage_activity.sql) เกณฑ์ว่าเท่าไรเรียกว่าเงียบ
 * จึงอยู่ฝั่งแอป แบบเดียวกับ computeLicense() — แก้เกณฑ์ที่นี่ หน้ารายชื่อกับหน้าอู่เปลี่ยนพร้อมกัน
 * ไม่มี import ฝั่ง server ใช้ได้ทั้งสองฝั่งและเทสต์ได้โดยไม่ต้องต่อฐานข้อมูล
 */

/** ใช้ภายใน 1 วัน · 2–7 วัน · เกิน 7 วัน · ยังไม่เคยมีใครเข้า */
export type UsageLevel = 'fresh' | 'idle' | 'dormant' | 'never';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ไม่ได้ใช้นานเท่านี้ช่วงทดลองใช้ = ควรโทรตาม — ช่วงทดลองมีแค่ 15 วัน รอถึง 7 วันก็สายไป */
export const TRIAL_QUIET_DAYS = 3;

export const USAGE_LABEL: Record<UsageLevel, string> = {
  fresh: 'ใช้อยู่',
  idle: 'เริ่มเงียบ',
  dormant: 'เงียบเกิน 7 วัน',
  never: 'ยังไม่เคยเข้า',
};

export const USAGE_COLOR: Record<UsageLevel, string> = {
  fresh: '#1D8A5F',
  idle: '#B4720B',
  dormant: '#B4342A',
  never: '#8A8F98',
};

/** ใช้ล่าสุด = เวลาที่ใหม่กว่าระหว่างเข้าระบบกับสร้างเอกสาร */
export function lastUsed(...at: (string | null | undefined)[]): string | null {
  let best: number | null = null;
  for (const v of at) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

export function usageLevel(at: string | null, now: Date = new Date()): UsageLevel {
  if (!at) return 'never';
  const gap = now.getTime() - new Date(at).getTime();
  if (gap <= DAY) return 'fresh';
  if (gap <= 7 * DAY) return 'idle';
  return 'dormant';
}

/** เงียบมากี่วันเต็ม — ยังไม่เคยใช้ = null */
export function quietDays(at: string | null, now: Date = new Date()): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / DAY));
}

/** ทดลองใช้อยู่แต่ไม่ได้ใช้ — กลุ่มที่ควรโทรตามก่อนหมดช่วงทดลอง */
export function needsFollowUp(mode: string, at: string | null, now: Date = new Date()): boolean {
  if (mode !== 'trial') return false;
  const q = quietDays(at, now);
  return q === null || q >= TRIAL_QUIET_DAYS;
}

/** "เมื่อสักครู่" · "35 นาทีก่อน" · "3 ชม.ก่อน" · "เมื่อวาน" · "12 วันก่อน" · "4 เดือนก่อน" */
export function agoLabel(at: string | null, now: Date = new Date()): string {
  if (!at) return '—';
  const gap = Math.max(0, now.getTime() - new Date(at).getTime());
  if (gap < 5 * 60_000) return 'เมื่อสักครู่';
  if (gap < HOUR) return `${Math.floor(gap / 60_000)} นาทีก่อน`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)} ชม.ก่อน`;
  const d = Math.floor(gap / DAY);
  if (d === 1) return 'เมื่อวาน';
  if (d < 60) return `${d} วันก่อน`;
  return `${Math.floor(d / 30)} เดือนก่อน`;
}
