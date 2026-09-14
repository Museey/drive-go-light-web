import Link from 'next/link';

/**
 * ลำดับขั้นตอนงานขาย A → B → C (ตามเอกสารเจ๊ก ข้อ 4, 5, 7)
 *
 *   A ใบเสนอราคา · B ใบส่งมอบ (B.1 ใบกำกับภาษี / B.2 ใบแจ้งหนี้) · C ใบเสร็จรับเงิน
 *
 *   ขั้นที่อยู่ตอนนี้    = สีเข้ม (เขียวเข้ม)
 *   ขั้นถัดไปที่ควรทำ    = สีอำพันเด่น กดแล้วออกใบต่อได้ทันที
 *   ขั้นที่ผ่านมาแล้ว     = ขอบเขียว มีเลขที่ให้กดย้อนดู
 *   ขั้นที่ข้ามไป/ยังไม่ถึง = เทา
 *
 * ไม่มี state ของตัวเอง — วาดจากข้อมูลจริงในฐานทุกครั้งที่โหลด (ข้อ 7: อัปเดตทันที)
 * ใช้ได้ทั้งหน้าเอกสาร (รู้ทั้งแม่และลูก) และในฟอร์ม (รู้แค่ชนิดที่กำลังทำ)
 */

export type StepDoc = { id: string; docNo: string; kind: string };

const STEP_OF: Record<string, number> = { QT: 0, IV: 1, IVT: 1, RC: 2 };
const STEPS = [
  { key: 'A', label: 'ใบเสนอราคา', sub: 'A' },
  { key: 'B', label: 'ใบส่งมอบ', sub: 'B.1 ใบกำกับภาษี · B.2 ใบแจ้งหนี้' },
  { key: 'C', label: 'ใบเสร็จรับเงิน', sub: 'C' },
];

export function DocSteps({ kind, id, parent, child, voided, canContinue = true }: {
  /** ชนิดของเอกสารที่กำลังดู/ทำ */
  kind: string;
  /** id ของเอกสารนี้ — มีเมื่ออยู่หน้าเอกสาร (ใช้สร้างลิงก์ออกใบต่อ) */
  id?: string;
  /** ใบต้นทาง (ขั้นก่อนหน้า) ถ้ามี */
  parent?: StepDoc | null;
  /** ใบที่ออกต่อจากใบนี้แล้ว ถ้ามี */
  child?: StepDoc | null;
  voided?: boolean;
  /** ผู้ใช้ออกใบขั้นถัดไปได้ไหม (สิทธิ์) */
  canContinue?: boolean;
}) {
  const cur = STEP_OF[kind] ?? 0;
  const parentStep = parent ? STEP_OF[parent.kind] ?? -1 : -1;
  const childStep = child ? STEP_OF[child.kind] ?? -1 : -1;

  return (
    <div className="steps" aria-label="ขั้นตอนงาน">
      {STEPS.map((s, i) => {
        let state: 'done' | 'current' | 'next' | 'later' | 'skip' = 'later';
        let href: string | null = null;
        let note = '';

        if (i === cur) state = 'current';
        else if (i < cur) {
          if (parentStep === i) { state = 'done'; href = `/income/${parent!.id}`; note = parent!.docNo; }
          else state = 'skip';
        } else if (childStep === i) {
          state = 'done'; href = `/income/${child!.id}`; note = child!.docNo;
        } else if (i === cur + 1 && !voided && id && canContinue && !child) {
          state = 'next';
          href = `/income/new?kind=${i === 1 ? 'IVT' : 'RC'}&from=${id}`;
          note = 'ทำขั้นตอนนี้ต่อ →';
        }

        const body = (
          <>
            <b>{s.key}</b>
            <span className="lbl">{s.label}</span>
            <span className="sub">{note || (state === 'skip' ? 'ข้าม' : s.sub)}</span>
          </>
        );
        return (
          <div className="stepwrap" key={s.key}>
            {i > 0 ? <span className="arrow" aria-hidden>›</span> : null}
            {href ? <Link className={`step ${state}`} href={href}>{body}</Link>
                  : <span className={`step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>{body}</span>}
          </div>
        );
      })}
    </div>
  );
}
