import Link from 'next/link';
import type { OpenDoc } from '@/lib/sales';
import { baht, KIND_SHORT, thDate } from '@/lib/format';

/**
 * เลือกใบที่ยังค้างก่อนออกเอกสารใหม่
 *
 * ยกมาจาก `invNewModal` / `rcNewModal` ของรุ่น 6.4 — กดออกใบส่งมอบหรือใบเสร็จ
 * โดยไม่ได้มาจากเอกสารต้นทาง รุ่นเดิมเสนอใบที่ยังค้างให้เลือกก่อน
 * ไม่ใช่โยนฟอร์มเปล่าให้แล้วบังคับให้จำเลขที่ใบเองหรือย้อนไปหาในรายการอีกรอบ
 *
 * **ปุ่มข้ามต้องเห็นชัดและอยู่ที่เดิมเสมอ** งานที่ไม่ได้เริ่มจากใบเสนอราคามีจริง
 * เช่นลูกค้าเดินเข้ามาซื้ออะไหล่ชิ้นเดียว การขวางคนกลุ่มนั้นคือการทำให้ช้าลง
 */
export function PickSource({
  target, kind, rows, search,
}: {
  target: 'invoice' | 'receipt';
  /** ชนิดเอกสารที่กำลังจะออก ใช้ต่อท้ายลิงก์ */
  kind: string;
  rows: OpenDoc[];
  search: string;
}) {
  const title = target === 'invoice' ? 'ออกใบส่งมอบงาน / ใบแจ้งหนี้' : 'ออกใบเสร็จรับเงิน';
  const hint = target === 'invoice'
    ? 'เลือกใบเสนอราคาที่ยังไม่ได้ออกใบส่งมอบ'
    : 'เลือกใบส่งมอบที่ยังไม่ได้เก็บเงิน หรือใบเสนอราคาที่ยังค้าง';

  return (
    <div className="card" style={{ maxWidth: 780, margin: '0 auto' }}>
      <header>
        <h2>{title}</h2>
        <div className="spacer" />
        {/* ทางออกสำหรับงานที่ไม่ได้เริ่มจากใบเสนอราคา — อยู่ที่เดิมเสมอ */}
        <Link className="btn" href={`/income/new?kind=${kind}&blank=1`}>
          ข้าม — ออกใบเปล่า
        </Link>
      </header>

      <div className="body">
        <p style={{ color: 'var(--ink-2)', marginTop: 0 }}>{hint}</p>

        <form action="/income/new" method="get" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input type="hidden" name="kind" value={kind} />
          <input className="in" type="search" name="q" defaultValue={search}
                 placeholder="เลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ" style={{ width: 280 }} />
          <button className="btn" type="submit">ค้นหา</button>
        </form>

        {rows.length === 0 ? (
          <div className="empty">
            {search
              ? 'ไม่พบใบที่ค้างตามคำค้นนี้'
              : 'ไม่มีใบที่ค้างอยู่ — กด “ข้าม — ออกใบเปล่า” เพื่อเริ่มใบใหม่'}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>ลูกค้า</th>
                  <th className="num">ยอดรวม</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.docNo}</td>
                    <td>{KIND_SHORT[r.kind] ?? r.kind}</td>
                    <td>{thDate(r.docDate)}</td>
                    <td className="wrap">
                      {r.partyName || '-'}
                      {r.vehiclePlate ? (
                        <div className="mono subtle" style={{ fontSize: 11.5 }}>{r.vehiclePlate}</div>
                      ) : null}
                    </td>
                    <td className="num mono">{baht(r.amount)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="btn sm primary"
                            href={`/income/new?kind=${kind}&from=${r.id}`}>
                        เลือกใบนี้
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
