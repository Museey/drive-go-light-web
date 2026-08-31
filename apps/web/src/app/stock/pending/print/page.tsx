import { requirePerm } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { listPendingItems } from '@/lib/pending';
import { thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PendingPrintPage() {
  await requirePerm('stock');
  const rows = await listPendingItems();

  return (
    <ListPaper
      backHref="/stock/pending"
      backLabel="กลับรายการค้างทำ"
      title="รายการสินค้าที่ยังไม่ได้ลงทะเบียน"
      en="PENDING ITEM LIST"
      filterNote={`${rows.length.toLocaleString('en-US')} ชื่อ`}
      hint={
        <>
          รายการเหล่านี้ถูกพิมพ์ชื่อลงในเอกสารเองโดยไม่ได้ดึงจากทะเบียนสินค้า
          จึงยังไม่มีรหัสสินค้า ไม่ถูกตัดสต๊อก และไม่นับในมูลค่าสต๊อก
          ควรนำเข้าทะเบียนที่เมนูสินค้า › รายการค้างทำ
        </>
      }
    >
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th>ชื่อที่กรอกไว้ในเอกสาร</th>
            <th style={{ width: 44 }}>พบ</th>
            <th style={{ width: 58 }}>รวมจำนวน</th>
            <th style={{ width: 84 }}>ใช้ล่าสุด</th>
            <th style={{ width: 110 }}>เอกสารล่าสุด</th>
            <th style={{ width: 92 }}>รหัสที่ตั้งให้</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.nameNorm}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td>{p.name}</td>
              <td style={{ textAlign: 'right' }}>{p.lineCount}</td>
              <td style={{ textAlign: 'right' }}>{p.totalQty.toLocaleString('en-US')}</td>
              <td>{thDate(p.lastUsedOn)}</td>
              <td style={{ fontSize: 11 }}>{p.lastDocNo}</td>
              <td className="blank">&nbsp;</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center' }}>ไม่มีรายการค้างทำ</td></tr>
          ) : null}
        </tbody>
      </table>
    </ListPaper>
  );
}
