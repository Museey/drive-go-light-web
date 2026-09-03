import { requireExport } from '@/lib/auth';
import { ListPaper } from '@/components/list-paper';
import { listContacts } from '@/lib/contacts';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { customer: 'ลูกค้า', vendor: 'ผู้ขาย' };
const TYPE_LABEL: Record<string, string> = { person: 'บุคคลธรรมดา', company: 'นิติบุคคล' };

export default async function ContactsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; type?: string }>;
}) {
  await requireExport('customer', 'customer');
  const sp = await searchParams;

  const { rows, total } = await listContacts({
    search: sp.q, kind: sp.kind, type: sp.type, all: true,
  });

  const notes = [
    sp.q ? `ค้นหา "${sp.q}"` : '',
    sp.kind ? KIND_LABEL[sp.kind] ?? '' : '',
    sp.type ? TYPE_LABEL[sp.type] ?? '' : '',
  ].filter(Boolean);

  return (
    <ListPaper
      backHref="/customers"
      backLabel="กลับทะเบียนผู้ติดต่อ"
      title="ทะเบียนลูกค้าและผู้ขาย"
      en="CONTACT LIST"
      filterNote={notes.length ? notes.join(' · ') : `ทั้งหมด ${total.toLocaleString('en-US')} ราย`}
      hint="เอกสารนี้มีข้อมูลส่วนบุคคลของลูกค้า เก็บในที่ปลอดภัยและทำลายเมื่อไม่ใช้แล้ว"
    >
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th style={{ width: 68 }}>รหัส</th>
            <th style={{ width: 46 }}>ประเภท</th>
            <th>ชื่อ</th>
            <th style={{ width: 104 }}>เลขประจำตัวผู้เสียภาษี</th>
            <th style={{ width: 92 }}>โทรศัพท์</th>
            <th style={{ width: 34 }}>รถ</th>
            <th style={{ width: 44 }}>เครดิต</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k, i) => (
            <tr key={k.id}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td>{k.code}</td>
              <td style={{ fontSize: 11 }}>{KIND_LABEL[k.kind] ?? k.kind}</td>
              <td>
                {k.displayName || 'ไม่ระบุชื่อ'}
                {k.addrText ? (
                  <div style={{ fontSize: 10.5, color: '#666' }}>{k.addrText}</div>
                ) : null}
              </td>
              <td>{k.taxId || ''}</td>
              <td>{[k.tel, k.tel2].filter(Boolean).join(' / ')}</td>
              <td style={{ textAlign: 'right' }}>{k.vehicleCount || ''}</td>
              <td style={{ textAlign: 'right' }}>{k.creditDays > 0 ? `${k.creditDays} วัน` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListPaper>
  );
}
