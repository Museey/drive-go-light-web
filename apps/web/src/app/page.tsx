import Link from 'next/link';
import { Shell } from '@/components/shell';
import { getHomeSummary, getShop } from '@/lib/queries';
import { baht, KIND_SHORT } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [shop, summary] = await Promise.all([getShop(), getHomeSummary()]);

  return (
    <Shell current="/" title="หน้าแรก" sub={`ภาษีมูลค่าเพิ่ม ${shop.vatRate}% · หัก ณ ที่จ่าย ${shop.whtRate}%`}>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">ยอดขาย (ก่อนภาษี)</div>
          <div className="value">{baht(summary.salesThisYear)}</div>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">ลูกหนี้คงค้าง</div>
          <div className={`value${summary.arOutstanding > 0 ? ' due' : ''}`}>{baht(summary.arOutstanding)}</div>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">เจ้าหนี้คงค้าง</div>
          <div className={`value${summary.apOutstanding > 0 ? ' warn' : ''}`}>{baht(summary.apOutstanding)}</div>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">สินค้าที่ต้องสั่งซื้อ</div>
          <div className={`value${summary.reorderCount > 0 ? ' warn' : ''}`}>{summary.reorderCount}</div>
        </div></div>
      </div>

      <div className="card">
        <header><h2>เอกสารในระบบ</h2></header>
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr><th>ชนิดเอกสาร</th><th className="num">จำนวน</th><th /></tr>
            </thead>
            <tbody>
              {summary.docCounts.map((d) => (
                <tr key={d.kind}>
                  <td>{KIND_SHORT[d.kind] ?? d.kind}</td>
                  <td className="num">{d.count.toLocaleString('en-US')}</td>
                  <td>
                    {['IV', 'IVT', 'RC'].includes(d.kind) ? (
                      <Link href={{ pathname: '/income', query: { kind: d.kind } }}
                            style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>
                        ดูรายการ
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note">
        ข้อมูลทั้งหมดมาจากไฟล์สำรองของโปรแกรมรุ่น HTML ที่นำเข้าด้วย
        <span className="mono"> packages/importer</span> ยอดเงินคำนวณด้วย
        <span className="mono"> packages/core</span> ชุดเดียวกับที่โปรแกรมเดิมใช้
      </div>
    </Shell>
  );
}
