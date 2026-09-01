import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { countIgnoredItems, listPendingItems } from '@/lib/pending';
import { restoreIgnoredAction } from '../actions';
import { PendingRow } from './pending-row';

export const dynamic = 'force-dynamic';

export default async function PendingPage() {
  await requirePerm('stock');
  const [items, ignored] = await Promise.all([listPendingItems(), countIgnoredItems()]);

  return (
    <Shell
      current="/stock"
      title="รายการค้างทำ"
      sub={`${items.length} ชื่อที่ยังไม่ได้ลงทะเบียน`}
      actions={
        <div className="tag-row">
          <Link className="btn" href="/stock/pending/print">พิมพ์รายการ</Link>
          <Link className="btn" href="/stock">← ทะเบียนสินค้า</Link>
        </div>
      }
    >
      <SubNav menu="stock" current="pending">
      <div className="note">
        รายการเหล่านี้คือชื่อที่พิมพ์ลงเอกสารเองโดยไม่ได้เลือกจากทะเบียนสินค้า
        จึงไม่มีรหัส ไม่ถูกตัดสต๊อก และไม่เข้าการคำนวณต้นทุน
        ผูกเข้าทะเบียนหรือสั่งข้ามได้ที่นี่ — การผูกไม่แก้ชื่อหรือราคาบนเอกสารที่ออกไปแล้ว
      </div>

      <div className="card">
        <header>
          <h2>ชื่อที่ยังไม่มีรหัสสินค้า</h2>
          <div className="spacer" />
          {ignored > 0 ? (
            <form action={restoreIgnoredAction}>
              <button className="btn" type="submit">นำรายการที่ข้ามไว้กลับมา ({ignored})</button>
            </form>
          ) : null}
        </header>

        {items.length === 0 ? (
          <div className="empty">
            ไม่มีรายการค้างทำ
            {ignored > 0 ? ` — มี ${ignored} ชื่อที่ถูกสั่งข้ามไว้` : ''}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ชื่อที่พิมพ์ในเอกสาร</th>
                  <th className="num">จำนวนบรรทัด</th>
                  <th className="num">รวมจำนวน</th>
                  <th>ใช้ล่าสุด</th>
                  <th style={{ width: 320 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => <PendingRow key={it.nameNorm} item={it} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </SubNav>
    </Shell>
  );
}
