import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, requireTab } from '@/lib/auth';
import { getCount } from '@/lib/stock-counts';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../../../../income/[id]/print/print-button';
import { baht, thDate, thDateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmtQty = (v: number) => String(Math.round(v * 1000) / 1000);

export default async function CountPrintPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sys?: string }>;
}) {
  await requireTab('stock', 'count');
  const { id } = await params;
  const sp = await searchParams;

  const [count, shop] = await Promise.all([query((c) => getCount(c, id)), getShop()]);
  if (!count) notFound();

  /* ใบร่างพิมพ์ไปเดินนับ — ปริยายไม่โชว์ยอดระบบ เพื่อไม่ให้ตัวเลขชี้นำการนับ
     ใบที่ปรับแล้วเป็นหลักฐาน จึงโชว์ครบเสมอ */
  const showSys = count.applied || sp.sys === '1';
  const blank = { border: '1px solid #999', height: 19 } as const;

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={`/stock/count/${id}`}>← กลับใบตรวจนับ</Link>
        {!count.applied ? (
          <Link className="btn" href={`/stock/count/${id}/print?sys=${showSys ? '0' : '1'}`}>
            {showSys ? 'ซ่อนยอดที่ระบบมี' : 'แสดงยอดที่ระบบมี'}
          </Link>
        ) : null}
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          {count.applied
            ? 'ปรับยอดแล้ว — ใบนี้เป็นหลักฐานส่วนต่างที่พบ'
            : 'ใบร่างสำหรับเดินนับ — สต๊อกยังไม่เปลี่ยน'}
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
              </div>
            </div>
            <div className="doc-meta">
              <h1>ใบตรวจนับสต๊อก</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>STOCK COUNT SHEET</div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr><td>เลขที่</td><td style={{ textAlign: 'right' }}><b>{count.no}</b></td></tr>
                  <tr><td>วันที่</td><td style={{ textAlign: 'right' }}>{thDateLong(count.countDate)}</td></tr>
                  <tr><td>จำนวน</td><td style={{ textAlign: 'right' }}>{count.lines} รายการ</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 6 }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 0' }}>ผู้นับ ......................................................</td>
                <td style={{ padding: '4px 0' }}>ผู้ตรวจสอบ ......................................................</td>
                <td style={{ padding: '4px 0' }}>วันที่นับ ..................................</td>
              </tr>
            </tbody>
          </table>

          {count.note ? (
            <div style={{ fontSize: 11.5, margin: '4px 0' }}>หมายเหตุ: {count.note}</div>
          ) : null}

          <table className="doc">
            <thead>
              <tr>
                <th style={{ width: 26 }}>#</th>
                <th style={{ width: 100 }}>รหัสสินค้า</th>
                <th>ชื่อสินค้า</th>
                <th style={{ width: 44 }}>หน่วย</th>
                {showSys ? <th style={{ width: 56 }}>ระบบมี</th> : null}
                <th style={{ width: 64 }}>นับได้จริง</th>
                <th style={{ width: 56 }}>ผลต่าง</th>
                <th style={{ width: 90 }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {count.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{it.code}</td>
                  <td>{it.name}</td>
                  <td style={{ textAlign: 'center' }}>{it.unit}</td>
                  {showSys ? (
                    <td style={{ textAlign: 'right' }}>
                      {it.systemQty === null ? '—' : fmtQty(it.systemQty)}
                    </td>
                  ) : null}
                  {count.applied ? (
                    <>
                      <td style={{ textAlign: 'right' }}>
                        {it.countedQty === null ? '—' : fmtQty(it.countedQty)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {it.diff === null ? '—' : (it.diff > 0 ? '+' : '') + fmtQty(it.diff)}
                      </td>
                      <td>{it.note}</td>
                    </>
                  ) : (
                    <>
                      <td style={blank} /><td style={blank} /><td style={blank} />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {count.applied && count.offCount > 0 ? (
            <div style={{ fontSize: 11.5, marginTop: 8 }}>
              พบส่วนต่าง <b>{count.offCount}</b> รายการ ·
              มูลค่ารวม <b>{baht(count.offValue)}</b> บาท
            </div>
          ) : null}

          <div style={{ fontSize: 10.5, color: '#555', marginTop: 8, lineHeight: 1.6 }}>
            {count.applied ? (
              <>ใบนี้ปรับยอดเข้าระบบเรียบร้อยแล้วเมื่อ {thDate(count.countDate)} —
                ทุกรายการที่มีส่วนต่างถูกบันทึกลงประวัติความเคลื่อนไหวของสินค้า</>
            ) : (
              <>
                นับของจริงในชั้นวางแล้วเขียนจำนวนลงช่อง “นับได้จริง”
                จากนั้นนำตัวเลขไปกรอกที่เมนู 05.5 ตรวจนับสต๊อก
                เพื่อให้ระบบปรับยอดและบันทึกส่วนต่างไว้เป็นหลักฐาน
                {!showSys ? (
                  <><br />ใบนี้ไม่ได้พิมพ์จำนวนที่ระบบมีไว้
                    เพื่อให้การนับสะท้อนของจริงโดยไม่ถูกตัวเลขในระบบชี้นำ</>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
