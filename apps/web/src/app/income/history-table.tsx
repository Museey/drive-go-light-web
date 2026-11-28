import { Plate } from '@/components/plate';
import Link from 'next/link';
import { DocCards } from '@/components/doc-cards';
import { RowLink } from '@/components/row-link';
import { incomeDocCard, incomeStatus } from '@/lib/doc-card';
import { EditGate } from './edit-gate';
import { childLockedReason } from '@/lib/doc-lock';
import { baht, thDate } from '@/lib/format';
import type { listIncomeDocs } from '@/lib/queries';
import { RowPay } from './row-pay';

type IncomeRow = Awaited<ReturnType<typeof listIncomeDocs>>['rows'][number];

const dayDiff = (fromIso: string, toIso: string): number =>
  Math.round((new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / 86400000);

/**
 * บรรทัดเล็กใต้ป้ายสถานะ — ตัวเลขที่เดิมอยู่ในคอลัมน์ ชำระ · ครบกำหนด · คงค้าง
 * ใบเสนอราคาและใบที่ยกเลิกไม่มีหนี้ให้บอก · ใบที่รับครบแล้วบอกแค่เงื่อนไข (สด / เครดิตกี่วัน)
 */
export function statusDetail(
  r: Pick<IncomeRow, 'kind' | 'voided' | 'outstanding' | 'dueDate' | 'creditDays'>, todayIso: string,
): string {
  if (r.voided || r.kind === 'QT') return '';
  const terms = r.creditDays > 0 ? `เครดิต ${r.creditDays} วัน` : 'สด';
  if (r.outstanding <= 0.004) return terms;
  const owe = `ค้าง ${baht(r.outstanding)}`;
  if (r.creditDays > 0 && r.dueDate) {
    const late = dayDiff(r.dueDate, todayIso);
    return late > 0 ? `${owe} · เกิน ${late.toLocaleString('en-US')} วัน` : `${owe} · ครบ ${thDate(r.dueDate)}`;
  }
  return `${owe} · ${terms}`;
}

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
        {/* 26 พ.ย. 2569 (ผู้ใช้เลือกแบบใหม่): คอลัมน์ ชำระ · ครบกำหนด · คงค้าง ยุบเข้าช่องสถานะ
            ป้ายสีบอกสถานะ บรรทัดเล็กใต้ป้ายบอกตัวเลข (ค้างเท่าไร ครบกำหนดเมื่อไร เกินมากี่วัน)
            ที่ที่ได้คืนมาให้ปุ่มเรียงแถวเดียว แถวจึงสูงชั้นเดียว */}
        <colgroup>
          <col style={{ width: 150 }} /><col style={{ width: 56 }} /><col style={{ width: 112 }} /><col />
          <col className="opt" style={{ width: 92 }} /><col className="opt" style={{ width: 76 }} />
          <col style={{ width: 104 }} /><col style={{ width: 176 }} /><col style={{ width: 216 }} />
        </colgroup>
        <thead>
          <tr>
            <th>เลขที่เอกสาร</th>
            <th>ชนิด</th>
            <th>วันที่</th>
            <th>ลูกค้า</th>
            <th className="num opt">ก่อนภาษี</th>
            <th className="num opt">ภาษี</th>
            <th className="num">รวมสุทธิ</th>
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
            const detail = statusDetail(r, todayIso);
            /* เหตุผลที่แก้ไม่ได้ — กติกาเดียวกับ editRuleWith (lib/doc-lock.ts) ที่เซิร์ฟเวอร์ตรวจซ้ำ
               ใบต่อโดยตรงของใบเสนอราคาคือใบส่งมอบ ถ้าไม่มีจึงเป็นใบเสร็จ */
            const follow = r.invoice ?? r.receipt;
            const lock = r.kind === 'RC' ? 'ใบเสร็จตัดสต๊อกแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่'
              : r.paid > 0.004 ? 'ใบนี้รับเงินแล้ว แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่'
              : follow ? childLockedReason(follow)
              : null;
            return (
              <RowLink key={r.id} href={`/income/${r.id}`} className={r.voided ? 'voided' : ''}>
                <td className="mono docno">{r.docNo}</td>
                <td><span className={`kindchip k-${r.kind}`}>{r.kind}</span></td>
                <td>{thDate(r.docDate)}</td>
                <td className="wrap party">{r.vehiclePlate ? <div className="plate-line"><Plate value={r.vehiclePlate} /></div> : null}<b>{r.partyName}</b></td>
                <td className="num mono opt">{baht(r.netAmount)}</td>
                <td className="num mono opt">{baht(r.vatAmount)}</td>
                <td className="num mono"><b>{baht(r.payable)}</b></td>
                <td className="st">{st}{detail ? <div className="st-sub">{detail}</div> : null}</td>
                <td>
                  {/* ปุ่มสองบรรทัด: รับชำระ(เขียว) แก้ไข(แดงอ่อน) / พิมพ์(เทา) ลบ(แดงเข้ม) — มี 3 ปุ่ม = บน 2 ล่าง 1 (ผู้ใช้กำหนด) */}
                  <span className="row-acts line">
                    {canPay ? <RowPay docId={r.id} docNo={r.docNo} outstanding={r.outstanding} today={todayIso} banks={banks} /> : null}
                    {/* แก้ไขถามก่อนทุกครั้ง (popup "เอกสารได้บันทึกเรียบร้อยแล้ว" — ผู้ใช้กำหนด 17 ก.ย. 2569)
                        กติกาตามต้นแบบ: ใบที่ตัดสต๊อก/รับเงินแล้วแก้ไม่ได้ — popup บอกเหตุผล เหลือทางยกเลิกแล้วออกใหม่
                        ตรงกับ editRuleWith ใน lib/doc-lock.ts ที่หน้าแก้ไขตรวจซ้ำฝั่งเซิร์ฟเวอร์ */}
                    {!r.voided && mayEdit ? (
                      <EditGate id={r.id} kind={r.kind} docNo={r.docNo} partyName={r.partyName}
                                editable={!lock} reason={lock ?? undefined}
                                buttonClass={lock ? 'btn sm act-edit dim' : 'btn sm act-edit'} />
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
            <td colSpan={4} style={{ textAlign: 'right' }} className="subtle">รวมหน้านี้</td>
            <td className="opt" /><td className="opt" />
            <td className="num mono"><b>{baht(rows.filter((r) => !r.voided).reduce((s, r) => s + r.payable, 0))}</b></td>
            <td className="st"><span className="st-sub">คงค้าง <b>{baht(rows.filter((r) => !r.voided && r.kind !== 'QT').reduce((s, r) => s + Math.max(0, r.outstanding), 0))}</b></span></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}
