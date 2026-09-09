import Link from 'next/link';
import type { DocRef } from '@/lib/queries';
import { todoState } from '@/lib/doc-flow';

/**
 * ช่องงานค้างบนหน้ารายการใบเสนอราคา — ยกแนวคิดมาจากรุ่น 6.4 ตรง ๆ
 *
 * รุ่นเดิมมองใบเสนอราคาเป็นกระดานงาน ไม่ใช่รายการเอกสาร เปิดหน้ามาแล้วเห็นทันที
 * ว่าใบไหนยังไม่ได้ออกใบส่งมอบ ใบไหนยังไม่ได้เก็บเงิน แล้วกดทำต่อได้จากแถวนั้นเลย
 *
 * ที่ต้องมีสามสภาพ ไม่ใช่สองสภาพ: ออกแล้ว · ยังไม่ได้ออก · ทำไม่ได้
 * "ทำไม่ได้" ต้องบอกว่าเพราะอะไร ไม่ใช่หายไปเฉย ๆ ให้ผู้ใช้เดาเอง
 */
export function TodoCell({
  done, href, canMake, voided, todoTitle,
}: {
  /** ใบที่ออกต่อแล้ว — null คือยังไม่ได้ออก */
  done: DocRef | null;
  /** ที่อยู่หน้าออกใบใหม่ ใช้เมื่อยังไม่ได้ออก */
  href: string;
  /** ผู้ใช้คนนี้มีสิทธิ์ออกใบชนิดนี้ไหม */
  canMake: boolean;
  /** ใบเสนอราคาต้นทางถูกยกเลิกแล้ว */
  voided: boolean;
  todoTitle: string;
}) {
  const st = todoState({ done: !!done, sourceVoided: voided, canMake });

  switch (st.kind) {
    case 'done':
      return (
        <Link className="chip ok" href={`/income/${done!.id}`} title="เปิดดูเอกสารใบนี้">
          {done!.docNo}
        </Link>
      );
    case 'voided':
      return <span className="subtle">ยกเลิกแล้ว</span>;
    case 'denied':
      return <span className="subtle" title="ไม่มีสิทธิ์ออกเอกสารชนิดนี้">ยังไม่ได้ออก</span>;
    case 'todo':
      return (
        <Link className="chip todo" href={href} title={todoTitle}>
          <span aria-hidden="true">👆</span> รอจัดทำ
        </Link>
      );
  }
}
