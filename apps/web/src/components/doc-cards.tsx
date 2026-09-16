import Link from 'next/link';
import { baht, thDate } from '@/lib/format';
import type { DocCard } from '@/lib/doc-card';

/**
 * รายการเอกสารแบบการ์ด — จอต่ำกว่า 1280 (ต้นแบบของทีม `a.mdoc` · สเปก §5.1)
 *
 * ตารางประวัติมีสิบสองคอลัมน์ บนจอ 375 ต้องเลื่อนซ้ายขวาเพื่ออ่านใบเดียวให้ครบ
 * การ์ดตอบสี่คำถามที่หน้าเคาน์เตอร์ถามจริง: ใบอะไร ของใคร วันไหน ค้างอยู่เท่าไร
 *
 * **การ์ดคือลิงก์ ไม่มีปุ่มในตัว** (ผู้ใช้เลือก 16 ก.ย. 2569) — รับชำระ/แก้ไข/ลบ
 * ทำในหน้าเอกสาร ปุ่มเล็ก ๆ สี่ปุ่มบนจอ 375 กดพลาดง่ายกว่าเปิดใบเข้าไปทำ
 */
export function DocCards({ cards, title, more = false, newHref, newLabel = '＋ สร้างใหม่' }: {
  cards: DocCard[];
  title: string;
  /** ยังมีหน้าถัดไป — หัวข้อจะบอกว่าจำนวนที่นับคือเฉพาะหน้านี้ */
  more?: boolean;
  /** ปุ่มสร้างใหม่ในหัวข้อกลุ่ม — ไม่ส่งมาก็ไม่มีปุ่ม (เช่นตอนยังไม่ได้เลือกชนิดเอกสาร) */
  newHref?: string;
  newLabel?: string;
}) {
  return (
    <>
      <div className="list-head">
        <h2>{title}</h2>
        <span className="cnt">{cards.length} เอกสาร{more ? 'ในหน้านี้' : ''}</span>
        {newHref ? <Link className="new-btn" href={newHref}>{newLabel}</Link> : null}
      </div>

      <div className="doc-cards">
        {cards.map((c) => <DocCardView key={c.href} c={c} />)}
      </div>
    </>
  );
}

/**
 * การ์ดเอกสารหนึ่งใบ — แยกออกมาให้การ์ดที่มีปุ่มต่อท้าย (ใบค้างในหน้าลูกหนี้รายคน) ใช้หน้าตาเดียวกัน
 * ไม่มี hook จึงใช้ได้ทั้งในคอมโพเนนต์ฝั่งเซิร์ฟเวอร์และฝั่งเบราว์เซอร์
 */
export function DocCardView({ c }: { c: DocCard }) {
  return (
    <Link className={c.voided ? 'dcard voided' : 'dcard'} href={c.href}>
      <div className="r1">
        <span className={`kindchip k-${c.kind}`}>{c.kind}</span>
        <span className="no">{c.no}</span>
        <span className={`chip ${c.status.tone === 'plain' ? '' : c.status.tone}`}>{c.status.label}</span>
      </div>
      <div className="nm">{c.name}</div>
      {c.plate ? <div className="plate mono">{c.plate}</div> : null}
      <div className="r3">
        <div className="d">{thDate(c.date)}</div>
        <div className="tot">
          <div className="amt">{baht(c.amount)}</div>
          {/* ใบเสนอราคาและใบที่ยกเลิกไม่มีบรรทัดนี้ — ทั้งสองอย่างยังไม่ใช่/ไม่ใช่หนี้แล้ว */}
          {c.outstanding === null ? null
            : c.outstanding > 0.004
              ? <div className="out">คงค้าง {baht(c.outstanding)}</div>
              : <div className="out clear">ชำระครบ</div>}
        </div>
      </div>
    </Link>
  );
}
