import Link from 'next/link';
import { baht } from '@/lib/format';
import { owingDocCard } from '@/lib/doc-card';
import { groupByParty, type PartyRowLike } from '@/lib/party-groups';
import { PartyDoc } from './party-doc';

type OwingRow = PartyRowLike & {
  id: string; kind: string; docNo: string; docDate: string;
  payable: number; paid: number; vehiclePlate?: string;
};

/**
 * ลูกหนี้/เจ้าหนี้บนจอแคบ (เฟส 5 · ต้นแบบ mFinance) — การ์ดรายคน กดแล้วเห็นใบค้างของคนนั้น (ผู้ใช้เลือก)
 *
 * `rows` คือใบค้างทุกใบที่หน้าดึงมาอยู่แล้ว · `party` คือคีย์จาก `?party=`
 * เรนเดอร์เสมอแล้วซ่อนด้วย CSS บนจอ ≥ 1280 — เดสก์ท็อปยังเป็นตารางรายใบ
 */
export function PartyList({ base, rows, party, direction, keep }: {
  base: string;
  rows: OwingRow[];
  /** มีค่า = หน้ารายคน · `rows` ต้องกรองเหลือคนนั้นมาแล้ว */
  party?: string;
  direction: 'sell' | 'buy';
  /** ตัวกรองที่ต้องติดไปกับลิงก์ (คำค้น · เฉพาะที่เกินกำหนด) */
  keep: Record<string, string>;
}) {
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...keep, ...extra }).toString();
    return q ? `${base}?${q}` : base;
  };

  if (party) {
    const name = rows[0]?.partyName || 'ไม่ระบุชื่อ';
    const total = Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100;
    return (
      <div className="party-view party-docs">
        <Link className="mback" href={href({})}>← ทุกราย</Link>
        <div className="list-head">
          <h2>{name}</h2>
          <span className="cnt">{rows.length} ใบ · ค้าง {baht(total)}</span>
        </div>
        <div className="doc-cards">
          {rows.map((r) => (
            <PartyDoc key={r.id} card={owingDocCard(r, direction)} docId={r.id} docNo={r.docNo}
                      outstanding={r.outstanding} direction={direction} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="party-view party-cards">
      {groupByParty(rows).map((g) => (
        <Link key={g.key} className="mparty" href={href({ party: g.key })}>
          <span className="who">
            <b className="nm">{g.name}</b>
            <span className="meta">
              {g.count} ใบ{g.overdueCount > 0 ? <> · <span className="due-text">เกินกำหนด {g.overdueCount} ใบ</span></> : null}
            </span>
          </span>
          <span className="amt"><span className="n">{baht(g.amount)}</span><span className="u">บาท คงค้าง</span></span>
          <span className="chev" aria-hidden="true">›</span>
        </Link>
      ))}
    </div>
  );
}
