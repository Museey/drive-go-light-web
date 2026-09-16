import Link from 'next/link';
import { DocCards } from '@/components/doc-cards';
import { RowLink } from '@/components/row-link';
import { incomeDocCard, incomeStatus } from '@/lib/doc-card';
import { EditGate } from './edit-gate';
import { baht, thDate } from '@/lib/format';
import type { listIncomeDocs } from '@/lib/queries';
import { RowPay } from './row-pay';

type IncomeRow = Awaited<ReturnType<typeof listIncomeDocs>>['rows'][number];

/**
 * ตารางประวัติเอกสารขาย — ใช้ร่วมกันระหว่างหน้ารายรับ (03.1–03.3) และขายหน้าร้าน (03.5)
 *
 * แยกออกมาเพราะหน้าขายหน้าร้านต้องมีตารางเดียวกันทุกคอลัมน์ (ต้นแบบใช้ histTable ตัวเดียวกัน)
 * ถ้าคัดลอกไปวางสองที่ วันหนึ่งแก้ที่หนึ่งแล้วอีกที่หนึ่งจะเพี้ยนไปเงียบ ๆ
 */
export function IncomeHistoryTable({ rows, todayIso, mayEdit, banks, cardTitle = 'ประวัติเอกสาร', more = false, newHref, newLabel }: {
  rows: IncomeRow[];
  todayIso: string;
  mayEdit: boolean;
  /** บัญชีรับโอนของร้าน — ป๊อปอัปรับชำระตรงแถวให้เลือก */
  banks: { bank: string; no: string; name: string }[];
  /** หัวข้อกลุ่มของการ์ด (จอแคบ) */
  cardTitle?: string;
  more?: boolean;
  newHref?: string;
  newLabel?: string;
}) {
  return (
    <>
    {/* จอต่ำกว่า 1280 = การ์ด · 1280 ขึ้นไปและตอนพิมพ์ = ตารางเดิมทุกคอลัมน์ (สลับด้วย CSS) */}
    <DocCards cards={rows.map((r) => incomeDocCard(r, todayIso))}
              title={cardTitle} more={more} newHref={newHref} newLabel={newLabel} />

    <div className="tablewrap doc-table">
      {/* ประวัติแบบใหม่ (ผู้ใช้ให้ภาพอ้างอิง): ชนิด · วันที่ · ลูกค้า · ชำระ · ครบกำหนด · ก่อนภาษี · ภาษี · รวมสุทธิ · คงค้าง · สถานะ · รับชำระ/แก้/≡/ลบ */}
      {/* คอลัมน์พอดีหน้า ไม่ต้องเลื่อนซ้ายขวา: table-layout fixed + ชื่อลูกค้าตัดบรรทัดได้ · จอ < 1280 ซ่อน ก่อนภาษี/ภาษี */}
      <table className="tbl hist fit">
        {/* ความกว้างเป็น px ทุกคอลัมน์ ยกเว้นลูกค้า = ที่เหลือ → รวมไม่เกินหน้า ไม่มีเลื่อนซ้ายขวา */}
        <colgroup>
          <col style={{ width: 150 }} /><col style={{ width: 44 }} /><col style={{ width: 84 }} /><col />
          <col style={{ width: 48 }} /><col style={{ width: 84 }} /><col className="opt" style={{ width: 82 }} /><col className="opt" style={{ width: 68 }} />
          <col style={{ width: 90 }} /><col style={{ width: 82 }} /><col style={{ width: 90 }} /><col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th>เลขที่เอกสาร</th>
            <th>ชนิด</th>
            <th>วันที่</th>
            <th>ลูกค้า</th>
            <th>ชำระ</th>
            <th>ครบกำหนด</th>
            <th className="num opt">ก่อนภาษี</th>
            <th className="num opt">ภาษี</th>
            <th className="num">รวมสุทธิ</th>
            <th className="num">คงค้าง</th>
            <th>สถานะ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            /* ชิปเดียวกับที่การ์ดใช้ — คิดที่ lib/doc-card.ts ที่เดียว ไม่งั้นสองหน้าจอพูดคนละเรื่อง */
            const s = incomeStatus(r, todayIso);
            const st = <span className={s.tone === 'plain' ? 'chip' : `chip ${s.tone}`}>{s.label}</span>;
            const canPay = !r.voided && r.kind !== 'QT' && r.outstanding > 0.004;
            return (
              <RowLink key={r.id} href={`/income/${r.id}`} className={r.voided ? 'voided' : ''}>
                <td className="mono docno">{r.docNo}</td>
                <td><span className={`kindchip k-${r.kind}`}>{r.kind}</span></td>
                <td>{thDate(r.docDate)}</td>
                <td className="wrap party"><b>{r.partyName}</b>{r.vehiclePlate ? <div className="mono subtle" style={{ fontSize: 12 }}>{r.vehiclePlate}</div> : null}</td>
                <td>{r.kind === 'QT' ? '-' : r.creditDays > 0 ? `${r.creditDays} วัน` : 'สด'}</td>
                <td>{r.kind !== 'QT' && r.creditDays > 0 && r.dueDate ? thDate(r.dueDate) : '-'}</td>
                <td className="num mono opt">{baht(r.netAmount)}</td>
                <td className="num mono opt">{baht(r.vatAmount)}</td>
                <td className="num mono"><b>{baht(r.payable)}</b></td>
                <td className="num mono">{r.kind === 'QT' ? '-' : r.outstanding > 0.004 ? baht(r.outstanding) : '-'}</td>
                <td>{st}</td>
                <td>
                  {/* ปุ่มสองบรรทัด: รับชำระ(เขียว) แก้ไข(แดงอ่อน) / พิมพ์(เทา) ลบ(แดงเข้ม) — มี 3 ปุ่ม = บน 2 ล่าง 1 (ผู้ใช้กำหนด) */}
                  <span className="row-acts grid2">
                    {canPay ? <RowPay docId={r.id} docNo={r.docNo} outstanding={r.outstanding} today={todayIso} banks={banks} /> : null}
                    {/* แก้ไขถามก่อนทุกครั้ง (popup "เอกสารได้บันทึกเรียบร้อยแล้ว" — ผู้ใช้กำหนด 17 ก.ย. 2569)
                        กติกาตามต้นแบบ: ใบที่ตัดสต๊อก/รับเงินแล้วแก้ไม่ได้ — popup บอกเหตุผล เหลือทางยกเลิกแล้วออกใหม่
                        ตรงกับ editRuleWith ใน lib/doc-lock.ts ที่หน้าแก้ไขตรวจซ้ำฝั่งเซิร์ฟเวอร์ */}
                    {!r.voided && mayEdit ? (
                      <EditGate id={r.id} kind={r.kind} docNo={r.docNo} partyName={r.partyName}
                                editable={r.kind !== 'RC' && r.paid <= 0.004}
                                reason={r.kind === 'RC'
                                  ? 'ใบเสร็จตัดสต๊อกแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่'
                                  : 'ใบนี้รับเงินแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่'}
                                buttonClass={r.kind !== 'RC' && r.paid <= 0.004 ? 'btn sm act-edit' : 'btn sm act-edit dim'} />
                    ) : null}
                    <Link className="btn sm act-print" href={`/income/${r.id}/print`}>พิมพ์</Link>
                    {!r.voided && mayEdit ? <Link className="btn sm act-del" href={`/income/${r.id}?void=1`}>ลบ</Link> : null}
                  </span>
                </td>
              </RowLink>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={{ textAlign: 'right' }} className="subtle">รวมหน้านี้</td>
            <td className="opt" /><td className="opt" />
            <td className="num mono"><b>{baht(rows.filter((r) => !r.voided).reduce((s, r) => s + r.payable, 0))}</b></td>
            <td className="num mono"><b>{baht(rows.filter((r) => !r.voided && r.kind !== 'QT').reduce((s, r) => s + Math.max(0, r.outstanding), 0))}</b></td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}
