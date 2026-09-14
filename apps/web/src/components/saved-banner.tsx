import Link from 'next/link';

/**
 * แถบ "บันทึกเรียบร้อย" หลังกดบันทึกในแผงยืนยัน — กลับมาที่หน้าเดิม พร้อมปุ่มพิมพ์เอกสารต่อทันที (ผู้ใช้กำหนด)
 */
export function SavedBanner({ docNo, printHref, openHref, label = 'พิมพ์เอกสาร' }: {
  docNo: string; printHref: string; openHref?: string; label?: string;
}) {
  return (
    <div className="ok-msg saved" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span>บันทึกเรียบร้อย — เลขที่ <b className="mono">{docNo}</b></span>
      <Link className="btn ok" href={printHref} target="_blank" rel="noreferrer">🖨 {label}</Link>
      {openHref ? <Link className="btn" href={openHref}>เปิดเอกสาร</Link> : null}
    </div>
  );
}
