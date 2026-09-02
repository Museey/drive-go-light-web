import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { listCategories, listProducts } from '@/lib/products';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../../income/[id]/print/print-button';
import { thDate } from '@/lib/format';
import { today } from '@drivegolight/core';

export const dynamic = 'force-dynamic';

const fmtQty = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * ใบนับเปล่าสำหรับพิมพ์ไปเดินนับในชั้นวาง
 *
 * ปริยาย **ไม่พิมพ์จำนวนที่ระบบมี** ตามรุ่น 6.4 —
 * "เพื่อให้การนับสะท้อนของจริงโดยไม่ถูกตัวเลขในระบบชี้นำ"
 * เป็นเหตุผลทางการควบคุมภายใน คนนับที่เห็นตัวเลขอยู่แล้วมักนับให้ตรงกับที่เห็น
 */
export default async function CountSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; sys?: string; q?: string }>;
}) {
  await requirePerm('stock');
  const sp = await searchParams;
  const showSys = sp.sys === '1';

  const [cats, shop, { rows }] = await Promise.all([
    listCategories(),
    getShop(),
    listProducts({ search: sp.q, categoryId: sp.cat, all: true }),
  ]);

  const scope = sp.cat
    ? (cats.find((c) => c.id === sp.cat)?.name ?? 'หมวดที่เลือก')
    : sp.q ? `ค้นหา "${sp.q}"` : 'ทุกหมวดหมู่';
  const blank = { border: '1px solid #999', height: 19 } as const;

  const link = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { cat: sp.cat, sys: sp.sys, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/stock/sheet${s ? `?${s}` : ''}`;
  };
  const csvQs = new URLSearchParams();
  if (sp.cat) csvQs.set('cat', sp.cat);
  if (sp.q) csvQs.set('q', sp.q);
  if (showSys) csvQs.set('sys', '1');

  return (
    <>
      <div className="printbar">
        <Link className="btn" href="/stock/count">← กลับตรวจนับ</Link>

        <form action="/stock/sheet" method="get" style={{ display: 'flex', gap: 6 }}>
          <select className="in" name="cat" defaultValue={sp.cat ?? ''} style={{ width: 190 }}>
            <option value="">— ทุกหมวดหมู่ —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {showSys ? <input type="hidden" name="sys" value="1" /> : null}
          <button className="btn" type="submit">เลือกหมวด</button>
        </form>

        <Link className="btn" href={link({ sys: showSys ? undefined : '1' })}>
          {showSys ? 'ซ่อนจำนวนที่ระบบมี' : 'แสดงจำนวนที่ระบบมี'}
        </Link>
        <a className="btn" href={`/stock/sheet/csv?${csvQs.toString()}`}>ส่งออกเป็น Excel</a>

        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{rows.length} รายการ</span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}</div>
            </div>
            <div className="doc-meta">
              <h1>ใบตรวจนับสต๊อก</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>STOCK COUNT SHEET</div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr><td>ขอบเขต</td><td style={{ textAlign: 'right' }}>{scope}</td></tr>
                  <tr><td>วันที่พิมพ์</td><td style={{ textAlign: 'right' }}>{thDate(today())}</td></tr>
                  <tr><td>จำนวน</td><td style={{ textAlign: 'right' }}>{rows.length} รายการ</td></tr>
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

          {rows.length === 0 ? (
            <div className="empty">ไม่มีสินค้าในหมวดที่เลือก</div>
          ) : (
            <table className="doc">
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th style={{ width: 92 }}>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th style={{ width: 80 }}>หมวดหมู่</th>
                  <th style={{ width: 40 }}>หน่วย</th>
                  {showSys ? <th style={{ width: 52 }}>ระบบมี</th> : null}
                  <th style={{ width: 64 }}>นับได้จริง</th>
                  <th style={{ width: 56 }}>ผลต่าง</th>
                  <th style={{ width: 96 }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td style={{ fontSize: 10 }}>{p.categoryName ?? ''}</td>
                    <td style={{ textAlign: 'center' }}>{p.unit}</td>
                    {showSys ? (
                      <td style={{ textAlign: 'right' }}>{fmtQty(p.qtyOnHand)}</td>
                    ) : null}
                    <td style={blank} /><td style={blank} /><td style={blank} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ fontSize: 10.5, color: '#555', marginTop: 8, lineHeight: 1.6 }}>
            นับของจริงในชั้นวางแล้วเขียนจำนวนลงช่อง “นับได้จริง”
            จากนั้นนำตัวเลขไปกรอกที่เมนู 05.5 ตรวจนับสต๊อก
            เพื่อให้ระบบปรับยอดและบันทึกส่วนต่างไว้เป็นหลักฐาน
            {!showSys ? (
              <><br />ใบนี้ไม่ได้พิมพ์จำนวนที่ระบบมีไว้
                เพื่อให้การนับสะท้อนของจริงโดยไม่ถูกตัวเลขในระบบชี้นำ</>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
