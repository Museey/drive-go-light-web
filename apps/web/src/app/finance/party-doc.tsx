'use client';

import { useState } from 'react';
import { DocCardView } from '@/components/doc-cards';
import type { DocCard } from '@/lib/doc-card';
import { PayForm } from './pay-form';

/**
 * ใบค้างหนึ่งใบในหน้าลูกหนี้/เจ้าหนี้รายคน บนจอแคบ (เฟส 5)
 *
 * การ์ดส่วนบนเป็นลิงก์เปิดเอกสาร ปุ่มรับ/จ่ายชำระอยู่แถวล่าง**แยกจากลิงก์**
 * — ปุ่มซ้อนในลิงก์เป็น HTML ที่ผิด กดปุ่มแล้วเบราว์เซอร์บางตัวพาเปิดเอกสารไปด้วย
 * ฟอร์มชำระตัวเดียวกับแถวในตาราง (สีเขียว · เปิดอยู่เป็น "ปิด" สีปกติ ตามที่ผู้ใช้กำหนดไว้)
 */
export function PartyDoc({ card, docId, docNo, outstanding, direction }: {
  card: DocCard;
  docId: string;
  docNo: string;
  outstanding: number;
  direction: 'sell' | 'buy';
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pdoc">
      <DocCardView c={card} />
      <div className="pdoc-acts">
        <button className={open ? 'btn pay-btn' : 'btn ok pay-btn'} type="button" onClick={() => setOpen(!open)}>
          {open ? 'ปิด' : direction === 'buy' ? 'จ่ายชำระ' : 'รับชำระ'}
        </button>
      </div>
      {open ? (
        <div className="pdoc-pay">
          <PayForm docId={docId} docNo={docNo} outstanding={outstanding} compact direction={direction} />
        </div>
      ) : null}
    </div>
  );
}
