import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { baht, thDate } from '@/lib/format';
import { listTrash } from '@/lib/trash';
import { copyHrefFor, isRestorable } from '@/lib/trash-rules';
import { TrashActions } from './trash-actions';

export const dynamic = 'force-dynamic';

const KIND_NAME: Record<string, string> = {
  QT: 'ใบเสนอราคา', IVT: 'ใบส่งมอบ/ใบกำกับภาษี', IV: 'ใบส่งมอบ', RC: 'ใบเสร็จรับเงิน',
  PO: 'ใบซื้อสินค้า', EX: 'ค่าใช้จ่าย', BN: 'ใบวางบิล',
};

/**
 * 07.5 เอกสารที่ลบ/ยกเลิก — ตามต้นแบบ (pageTrash)
 *
 * ค้นได้เฉพาะช่วงเวลาที่ยกเลิก · กู้คืนได้ · ลบถาวรจากที่นี่แล้วกู้ไม่ได้
 * สิทธิ์ตรงกับที่ lib/trash.ts ตรวจตอนเขียน (ตั้งค่าร้าน · ข้อมูลร้าน)
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string; year?: string }>;
}) {
  await requireTab('settings', 'shop');
  const sp = await searchParams;
  const { from, to } = rangeFromParams(sp);
  const rows = await listTrash({ from, to });

  return (
    <Shell current="/settings" title="เอกสารที่ลบ/ยกเลิก"
           sub="สำรองไว้ทุกใบ · กู้คืนได้ · ลบถาวรจากที่นี่แล้วกู้ไม่ได้">
      <SubNav menu="settings" current="trash">
        <div className="card">
          <DocDateFilter base="/settings/trash" from={from} to={to} keep={{}} />
          <div className="toolbar" style={{ borderTop: '1px solid var(--line)' }}>
            <b>🗑 เอกสารที่ลบ/ยกเลิก</b>
            <span className="subtle">
              {rows.length.toLocaleString('en-US')} ใบ{from || to ? ' ในช่วงที่เลือก' : ''} · ค้นได้เฉพาะช่วงเวลาที่ยกเลิก
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="empty">ไม่มีเอกสารที่ลบ/ยกเลิกในช่วงนี้</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl hist fit">
                <colgroup>
                  <col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 90 }} />
                  <col /><col style={{ width: 110 }} /><col style={{ width: 130 }} />
                  {/* ปุ่ม "คัดลอกเป็นใบใหม่" + "ลบถาวร" กว้างกว่ากู้คืน — 170px ตัดปุ่มลบถาวรที่ 1280px */}
                  <col style={{ width: 250 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>เลขที่เอกสาร</th><th>ชนิด</th><th>วันที่</th><th>ลูกค้า/ผู้ขาย</th>
                    <th className="num">ยอด</th><th>ยกเลิกเมื่อ</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.source}:${r.id}`} className="voided">
                      <td className="mono docno">{r.docNo}</td>
                      <td>{KIND_NAME[r.kind] ?? r.kind}</td>
                      <td>{thDate(r.docDate)}</td>
                      <td className="wrap party"><b>{r.partyName || '-'}</b></td>
                      <td className="num mono">{baht(r.amount)}</td>
                      <td>
                        {thDate(r.voidedAt.slice(0, 10))}
                        {r.reason ? <div className="subtle" style={{ fontSize: 12 }}>{r.reason}</div> : null}
                      </td>
                      <td>
                        <TrashActions source={r.source} id={r.id} docNo={r.docNo}
                                      kindName={KIND_NAME[r.kind] ?? r.kind}
                                      restorable={isRestorable(r.kind)} copyHref={copyHrefFor(r.kind, r.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="hint" style={{ padding: '8px 12px' }}>
            กู้คืนได้เฉพาะใบเสนอราคา ใบวางบิล ใบซื้อ และค่าใช้จ่าย (ใบซื้อรับของกลับเข้าสต๊อก) ·
            ใบส่งมอบ ใบกำกับภาษี และใบเสร็จที่ยกเลิกแล้วคัดลอกเป็นใบใหม่ · ลบถาวรแล้วหายจากทุกหน้า กู้ไม่ได้
          </p>
        </div>
      </SubNav>
    </Shell>
  );
}
