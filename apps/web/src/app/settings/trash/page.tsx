import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { baht, thDate } from '@/lib/format';
import { listTrash } from '@/lib/trash';
import { TrashActions } from './trash-actions';

export const dynamic = 'force-dynamic';

const KIND_NAME: Record<string, string> = {
  QT: 'ใบเสนอราคา', IVT: 'ใบส่งมอบ/ใบกำกับภาษี', IV: 'ใบส่งมอบ', RC: 'ใบเสร็จรับเงิน',
  PO: 'ใบซื้อสินค้า', EX: 'ค่าใช้จ่าย', BN: 'ใบวางบิล',
};

/**
 * 07.4 เอกสารที่ลบ/ยกเลิก — ตามต้นแบบ (pageTrash)
 *
 * ค้นได้เฉพาะช่วงเวลาที่ยกเลิก · กู้คืนได้ทุกชนิด · ลบถาวรเฉพาะเจ้าของ + รหัสผ่าน แล้วกู้ไม่ได้
 * สิทธิ์ตรงกับที่ lib/trash.ts ตรวจตอนเขียน (ตั้งค่าร้าน · ข้อมูลร้าน)
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string; year?: string }>;
}) {
  const session = await requireTab('settings', 'shop');
  const mayPurge = session.role === 'owner';
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
                  <col style={{ width: 190 }} />
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
                                      mayPurge={mayPurge} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="hint" style={{ padding: '8px 12px' }}>
            กู้คืนได้ทุกชนิด (ใบเสร็จตัดสต๊อกใหม่ รวมชิ้นส่วนชุดอะไหล่ · ใบซื้อรับของกลับเข้าสต๊อก) ·
            ลบถาวรได้เฉพาะเจ้าของกิจการและต้องใส่รหัสผ่าน · ลบแล้วหายจากทุกหน้า กู้ไม่ได้
          </p>
        </div>
      </SubNav>
    </Shell>
  );
}
