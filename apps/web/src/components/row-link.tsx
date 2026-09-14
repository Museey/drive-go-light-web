'use client';

import { useRouter } from 'next/navigation';

/**
 * แถวตารางที่กดได้ทั้งแถว (ข้อ 13) สำหรับหน้าที่เรนเดอร์ฝั่งเซิร์ฟเวอร์
 * ปุ่ม/ลิงก์ที่ซ้อนในแถวยังกดได้ตามปกติ — กดตรงปุ่มจะไม่นำทางซ้ำ
 */
export function RowLink({ href, children, className = '' }: {
  href: string; children: React.ReactNode; className?: string;
}) {
  const router = useRouter();
  const go = (e: React.SyntheticEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('a, button, input, select, label')) return;   /* ให้ปุ่มในแถวทำงานของมันเอง */
    router.push(href);
  };
  return (
    <tr className={`pick ${className}`.trim()} role="link" tabIndex={0} onClick={go}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(href); } }}>
      {children}
    </tr>
  );
}
