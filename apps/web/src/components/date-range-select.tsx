'use client';

import { useRouter } from 'next/navigation';
import { datePresets, presetValue } from '@/lib/date-presets';

/**
 * ตัวกรองช่วงเวลาบนจอแคบ — dropdown เดียวตามต้นแบบของทีม (`.mdate`)
 *
 * จอต่ำกว่า 1280 ไม่มีที่พอสำหรับชิปหกปุ่ม + ช่องกรอกวันที่สองช่อง (ผู้ใช้เลือก 16 ก.ย. 2569)
 * ช่วงที่เลือกเองจากเดสก์ท็อปยังติดมากับลิงก์ได้ จึงมีตัวเลือก "ช่วงที่เลือกไว้" ให้เห็นค่าจริง
 * ไม่ใช่เด้งไปโชว์ "ทั้งหมด" ซึ่งจะอ่านว่ารายการนี้ไม่ได้กรองอะไร
 */
export function DateRangeSelect({ base, from, to, keep = {} }: {
  base: string;
  from?: string;
  to?: string;
  /** ค่าอื่นที่ต้องติดไปด้วย เช่น ชนิดเอกสารหรือคำค้น */
  keep?: Record<string, string>;
}) {
  const router = useRouter();
  const presets = datePresets(new Date());
  const now = `${from ?? ''}|${to ?? ''}`;
  const custom = !presets.some((p) => presetValue(p) === now);

  return (
    <div className="mdate">
      <label htmlFor="mdate-range">ช่วงเวลา</label>
      <select id="mdate-range" className="in" value={now} aria-label="ช่วงเวลา"
              onChange={(e) => {
                const [f, t] = e.target.value.split('|');
                const q = new URLSearchParams(keep);
                if (f) { q.set('from', f); q.set('to', t ?? ''); }
                const s = q.toString();
                router.push(s ? `${base}?${s}` : base);
              }}>
        {custom ? <option value={now}>ช่วงที่เลือกไว้</option> : null}
        {presets.map((p) => (
          <option key={p.label} value={presetValue(p)}>{p.label}</option>
        ))}
      </select>
    </div>
  );
}
