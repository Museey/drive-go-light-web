import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canCost, canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { baht } from '@/lib/format';
import { listKits } from '@/lib/kits';
import { DeactivateKit } from './deactivate-kit';
import { SavedNotice } from '@/components/saved-notice';

export const dynamic = 'force-dynamic';

/**
 * 05.7 ชุดอะไหล่ซ่อมบำรุง — รายการชุด
 *
 * ชุดขายในเอกสารเป็นบรรทัดเดียว ราคาตามระดับราคาของเอกสาร (A/B/C) · ใบเสร็จตัดสต๊อกชิ้นส่วนที่ผูกทะเบียน
 * ต้นทุน/กำไรซ่อนเมื่อผู้ใช้ไม่มีสิทธิ์เห็นต้นทุน
 */
export default async function KitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; savedId?: string }>;
}) {
  const session = await requireTab('stock', 'kits');
  const sp = await searchParams;
  const search = sp.q ?? '';
  const kits = await listKits(search);
  const showCost = canCost(session);
  const mayEdit = canEdit(session, 'stock', 'kits');

  return (
    <Shell current="/stock" title="ชุดอะไหล่ซ่อมบำรุง"
           sub={`${kits.length.toLocaleString('en-US')} ชุด · ขายเป็นบรรทัดเดียว ใบเสร็จตัดสต๊อกชิ้นส่วนให้`}>
      <SubNav menu="stock" current="kits">
        {/* แก้ไขชุดจากรายการ บันทึกแล้วกลับมาที่นี่พร้อมการ์ด */}
        <SavedNotice saved={sp.saved} savedId={sp.savedId} />
        <div className="card">
          <div className="toolbar">
            <div className="tiles">
              {mayEdit ? <Link className="tile act" href="/stock/kits/new">+ สร้างชุดอะไหล่</Link> : null}
            </div>
            <div className="spacer" />
            <form autoComplete="off" action="/stock/kits" method="get" data-enter="own" style={{ display: 'flex', gap: 6 }}>
              <input className="in search" type="search" name="q" defaultValue={search}
                     placeholder="กรอกคำค้นหา — รหัสชุด หรือชื่อชุด" style={{ width: 240 }} />
              <button className="btn" type="submit">ค้นหา</button>
            </form>
          </div>

          {kits.length === 0 ? (
            <div className="empty">
              {search ? 'ไม่พบชุดที่ตรงกับคำค้น' : 'ยังไม่มีชุดอะไหล่ — กด "+ สร้างชุดอะไหล่" เพื่อเริ่ม'}
            </div>
          ) : (
            <div className="tablewrap">
              <table className="tbl hist fit">
                <colgroup>
                  <col style={{ width: 110 }} /><col />
                  <col style={{ width: 96 }} /><col className="opt" style={{ width: 96 }} /><col className="opt" style={{ width: 96 }} />
                  {showCost ? <><col style={{ width: 96 }} /><col style={{ width: 96 }} /></> : null}
                  <col style={{ width: 150 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>รหัสชุด</th><th>ชื่อชุด / รายการในชุด</th>
                    <th className="num">ราคา A</th><th className="num opt">ราคา B</th><th className="num opt">ราคา C</th>
                    {showCost ? <><th className="num">ต้นทุน</th><th className="num">กำไร (A)</th></> : null}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {kits.map((k) => (
                    <tr key={k.id}>
                      <td className="mono docno">{k.code}</td>
                      <td className="wrap party">
                        <b>{k.name}</b>
                        <div className="subtle" style={{ fontSize: 12 }}>
                          {k.items.map((i) => i.name).join(', ')}
                        </div>
                      </td>
                      <td className="num mono"><b>{baht(k.price)}</b></td>
                      <td className="num mono opt">{baht(k.priceB)}</td>
                      <td className="num mono opt">{baht(k.priceC)}</td>
                      {showCost ? (
                        <>
                          <td className="num mono">{baht(k.cost)}</td>
                          <td className="num mono" style={k.price - k.cost < 0 ? { color: 'var(--due)' } : undefined}>
                            {baht(k.price - k.cost)}
                          </td>
                        </>
                      ) : null}
                      <td>
                        <span className="row-acts">
                          <Link className="btn sm act-edit" href={`/stock/kits/${k.id}`}>{mayEdit ? 'แก้ไข' : 'เปิด'}</Link>
                          {mayEdit ? <DeactivateKit id={k.id} code={k.code} /> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint" style={{ padding: '8px 12px' }}>
            ค้นชื่อหรือรหัสชุดในช่องรหัสสินค้าของใบเสนอราคา/ใบส่งมอบ/ใบเสร็จ แล้วเลือกได้เหมือนสินค้า ·
            รายการที่พิมพ์ชื่อเองขึ้นบนเอกสารแต่ไม่ตัดสต๊อก
          </p>
        </div>
      </SubNav>
    </Shell>
  );
}
