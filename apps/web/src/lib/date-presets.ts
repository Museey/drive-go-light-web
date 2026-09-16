/**
 * ช่วงวันที่สำเร็จรูปของหน้ารายการเอกสาร — ที่เดียวสำหรับทั้งชิป (เดสก์ท็อป) และ dropdown (จอแคบ)
 *
 * เขียนแยกเป็นโมดูลบริสุทธิ์เพราะ `DateRangeSelect` เป็น client component
 * ส่วน `DocDateFilter` เรนเดอร์ฝั่งเซิร์ฟเวอร์ — สองที่นี้ต้องได้ชุดเดียวกันเป๊ะ
 * ไม่งั้นเลือก "เดือนที่แล้ว" บนมือถือแล้วได้คนละช่วงกับที่กดบนเดสก์ท็อป
 */

const pad = (n: number) => String(n).padStart(2, '0');

export interface DatePreset {
  label: string;
  /** ว่าง = ไม่กรอง (ทั้งหมด) */
  from: string;
  to: string;
}

/** วันแรกและวันสุดท้ายของเดือน */
export function monthRange(year: number, month1: number): { from: string; to: string } {
  return {
    from: `${year}-${pad(month1)}-01`,
    to: `${year}-${pad(month1)}-${pad(new Date(year, month1, 0).getDate())}`,
  };
}

export function datePresets(now: Date): DatePreset[] {
  const y = now.getFullYear();
  const today = `${y}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const lastM = new Date(y, now.getMonth() - 1, 1);
  return [
    { label: 'ทั้งหมด', from: '', to: '' },
    { label: 'วันนี้', from: today, to: today },
    { label: 'เดือนนี้', ...monthRange(y, now.getMonth() + 1) },
    { label: 'เดือนที่แล้ว', ...monthRange(lastM.getFullYear(), lastM.getMonth() + 1) },
    { label: 'ปีนี้', from: `${y}-01-01`, to: `${y}-12-31` },
    { label: 'ปีที่แล้ว', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

/** ค่าที่ใช้ใน <option> — เก็บทั้งช่วงไว้ในค่าเดียวเพื่อให้เลือกทีเดียวได้ทั้งคู่ */
export const presetValue = (p: { from: string; to: string }): string => `${p.from}|${p.to}`;
