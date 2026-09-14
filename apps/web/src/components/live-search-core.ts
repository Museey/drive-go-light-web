/**
 * แกนของ "ค้นหาแบบพิมพ์แล้วขึ้นผลทันที ไม่ต้องกด Enter" (ข้อ 1 ในเอกสารเจ๊ก)
 *
 * แยกออกจาก React โดยตั้งใจ — ชุดทดสอบของโปรเจกต์ไม่มีตัวเรนเดอร์ React
 * แต่พฤติกรรมที่พังเงียบที่สุดของการค้นหาสดคือเรื่อง **เวลา**:
 *
 *   - พิมพ์ "ผ้าเบรค" เจ็ดตัวอักษร ต้องยิงเซิร์ฟเวอร์ครั้งเดียว ไม่ใช่เจ็ดครั้ง
 *   - ผลของคำค้นเก่าที่มาถึงช้ากว่าต้องถูกทิ้ง ไม่งั้นพิมพ์ "ab" แล้วได้ผลของ "a"
 *     โผล่ทับทีหลัง ซึ่งผู้ใช้เห็นเป็น "ผลสลับ" และเลือกของผิด
 *   - ลบคำค้นจนว่างต้องปิดผลทันที (ข้อ 9: ลบคำค้นแล้วกลับหน้าปกติ)
 *
 * สามข้อนี้ทดสอบได้ที่นี่ด้วย fake timer โดยไม่ต้องเรนเดอร์อะไร
 */

export type Runner<T> = (q: string) => Promise<T[]>;

/** ส่วนของสถานะที่เปลี่ยน — ส่งเฉพาะคีย์ที่เปลี่ยนจริง ตัวรับ merge เอง */
export type Patch<T> = { results?: T[] | null; busy?: boolean };

export interface LiveSearch {
  /** พิมพ์คำใหม่ — ว่างเปล่า (หลัง trim) = ปิดผลทันที ไม่ยิงเซิร์ฟเวอร์ */
  query(raw: string): void;
  /** ล้างผลทันทีและยกเลิกที่ค้างอยู่ — ใช้ตอนเลือกแล้ว (ข้อ 2) */
  clear(): void;
  /** เลิกใช้ — ยกเลิกทุกอย่าง ผลที่ค้างมาถึงทีหลังจะถูกทิ้ง */
  dispose(): void;
}

export function createLiveSearch<T>(
  run: Runner<T>,
  emit: (patch: Patch<T>) => void,
  opts: { delay?: number; min?: number } = {},
): LiveSearch {
  const { delay = 250, min = 1 } = opts;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  return {
    query(raw) {
      cancelTimer();
      const q = raw.trim();
      const mine = ++seq;              // ทุกคำค้นได้เลขใหม่ ผลที่กลับมาต้องเลขตรงถึงจะรับ

      if (q.length < min) { emit({ results: null, busy: false }); return; }

      emit({ busy: true });
      timer = setTimeout(async () => {
        timer = null;
        let found: T[];
        try {
          found = await run(q);
        } catch {
          if (mine === seq) emit({ busy: false });   // ล้มเหลว — ปล่อยผลเดิมไว้ ไม่โชว์ "ไม่พบ" หลอก
          return;
        }
        if (mine !== seq) return;      // มีคำค้นใหม่กว่าออกไปแล้ว ทิ้งผลนี้
        emit({ results: found, busy: false });
      }, delay);
    },

    clear() {
      cancelTimer();
      seq++;
      emit({ results: null, busy: false });
    },

    dispose() {
      cancelTimer();
      seq++;
    },
  };
}
