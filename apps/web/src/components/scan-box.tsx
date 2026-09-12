'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { parseScan } from '@/lib/scan';

/**
 * ช่องยิงบาร์โค้ดสำหรับหน้าออกเอกสาร
 *
 * **ปืนยิงบาร์โค้ดคือคีย์บอร์ด** — ทั้งแบบ USB และบลูทูธพิมพ์รหัสเร็ว ๆ แล้วกด Enter
 * ไม่ต้องลงไดรเวอร์ ไม่ต้องขอสิทธิ์ ขอแค่มีช่องที่โฟกัสค้างอยู่ให้มันพิมพ์ลงไป
 *
 * โฟกัสกลับมาที่ช่องนี้เองหลังยิงทุกครั้ง — คนถือปืนยืนอยู่หน้าชั้นวางไม่ได้จ้องจอ
 * ถ้าต้องเอามือมาคลิกช่องใหม่ทุกครั้ง การยิงติด ๆ กันจะทำไม่ได้เลย
 * (แบบแผนเดียวกับช่องยิงของใบตรวจนับ ซึ่งอู่ใช้อยู่แล้ว)
 */
export function ScanBox({ onScan }: {
  /** คืนข้อความผลลัพธ์ที่จะแสดง — ว่างคือสำเร็จเงียบ ๆ */
  onScan: (term: string) => Promise<{ ok: boolean; message: string } | void>;
}) {
  const [term, setTerm] = useState('');
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  /*
   * **ห้ามปิดช่องระหว่างรอผล** — ช่องที่ถูก disabled จะเสียโฟกัสทันที
   * แล้วตัวอักษรของการยิงครั้งถัดไปหล่นหายไปทั้งชุด คนยิงจะไม่รู้ตัวเลยเพราะ
   * ปืนดังติ๊บปกติทุกครั้ง (เจอตอนเขียนเทสต์ที่ยิงติด ๆ กันจริง)
   *
   * ยิงรัวกว่าที่เซิร์ฟเวอร์ตอบทันก็ไม่เป็นไร — แต่ละครั้งเป็นคนละคำขอ
   * และการใส่บรรทัดเป็นการอัปเดตจากค่าก่อนหน้า จึงไม่ทับกัน
   */
  useEffect(() => { ref.current?.focus(); }, [pending]);

  /**
   * **ล้างช่องทันทีที่กด Enter ไม่ใช่หลังเซิร์ฟเวอร์ตอบ**
   *
   * ปืนยิงพิมพ์ต่อท้ายสิ่งที่ค้างอยู่ในช่อง ถ้ารอล้างตอนผลกลับมา การยิงนัดถัดไป
   * ที่มาถึงก่อนจะได้ค่าเป็นรหัสสองตัวติดกัน (`ABCABC`) ซึ่งไม่ตรงกับสินค้าไหนเลย
   * นัดนั้นหายไปเงียบ ๆ — ปืนดังติ๊บครบทุกนัด แต่ใบเสร็จขาดของ
   * (เจอตอนยิงสามนัดติดในเทสต์แล้วได้จำนวน 2)
   */
  const fire = () => {
    const v = term.trim();
    if (!v) return;
    setTerm('');
    start(async () => {
      const r = await onScan(v);
      setNote(r ?? null);
      ref.current?.focus();
    });
  };

  /* แสดงจำนวนที่ระบบเข้าใจไว้ข้าง ๆ ตั้งแต่ยังพิมพ์ไม่จบ
     คนจะได้เห็นก่อนกด Enter ว่า 40*ABC จะเข้าเป็น 40 ชิ้นจริง */
  const preview = parseScan(term);

  return (
    <div className="scanbox">
      <label htmlFor="scan">ยิงบาร์โค้ด</label>
      <input
        ref={ref}
        id="scan"
        className="in mono"
        value={term}
        autoComplete="off"
        placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัสแล้วกด Enter"
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          /* ปืนยิงกด Enter ปิดท้ายเสมอ ต้องกันไม่ให้ไปกดปุ่มบันทึกของฟอร์ม */
          e.preventDefault();
          fire();
        }}
      />
      {preview.qty !== 1 ? (
        <span className="chip ok">{preview.qty} ชิ้น · {preview.term}</span>
      ) : (
        <span className="hint">พิมพ์จำนวนนำหน้าได้ เช่น <b>40*</b> แล้วค่อยยิง</span>
      )}
      {note ? (
        <span className={note.ok ? 'chip ok' : 'chip due'}>{note.message}</span>
      ) : null}
    </div>
  );
}
