import Link from 'next/link';
import { baht } from '@/lib/format';
import type { IssuedReport } from '@/lib/docs-issued';
import { DocsKindSelect } from './docs-kind-select';
import { Icon } from './icon';

/**
 * การ์ด "เอกสารที่ออก" — เลือกชนิดเอกสารแล้วเห็นว่าออกไปเท่าไร ค้างอยู่ขั้นไหน
 * ตัวเลขมาจาก lib/docs-issued.ts · ช่วงเวลาใช้ตัวเดียวกับแถบช่วงเวลาบนสุดของหน้าแรก
 *
 * แถบใต้แต่ละแถวยาวตามสัดส่วนยอดเงินเทียบกับยอดรวมของชนิดนั้น
 * เป็น div ธรรมดา — การ์ดนี้ไม่ได้อยู่ในหน้าพิมพ์
 */
export function DocsIssuedCard({ report, options, from, to, canOpen }: {
  report: IssuedReport;
  options: { key: string; label: string }[];
  from?: string;
  to?: string;
  /** มีสิทธิ์เปิดหน้ารายการของชนิดนี้ */
  canOpen: boolean;
}) {
  const base = Math.max(report.total.amount, ...report.rows.map((r) => r.amount), 1);

  return (
    <div className="hcard issued" data-tone="blue">
      <header>
        <Icon name="doc$" size={22} color="#2563EB" />
        <h2>เอกสารที่ออก</h2>
        <span className="issued-pick">
          <DocsKindSelect value={report.group} options={options} from={from} to={to} />
        </span>
      </header>
      <div className="body">
        <div className="issued-total">
          <span className="lbl">{report.label}ที่ออก{from || to ? 'ในช่วงที่เลือก' : 'ทั้งหมด'}</span>
          <span className="big">{baht(report.total.amount)} <small>บาท</small></span>
          <span className="cnt">{report.total.count.toLocaleString('en-US')} รายการ</span>
        </div>

        {report.rows.map((r) => (
          <div key={r.key} className={r.partOf ? 'issued-row part' : 'issued-row'} data-tone={r.tone}>
            <div className="top">
              <span className="nm">{r.label}</span>
              <b>{baht(r.amount)} <small>บาท</small></b>
            </div>
            <div className="bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round((r.amount / base) * 100))}%` }} />
            </div>
            <div className="cnt">{r.count.toLocaleString('en-US')} รายการ</div>
          </div>
        ))}

        {canOpen && report.href ? (
          <Link className="go issued-go" href={report.href}>ดูรายการ{report.label}<span className="ar">→</span></Link>
        ) : null}
      </div>
    </div>
  );
}
