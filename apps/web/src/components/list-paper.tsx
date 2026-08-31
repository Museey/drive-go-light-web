import Link from 'next/link';
import type { ReactNode } from 'react';
import { getShop } from '@/lib/queries';
import { thDateLong } from '@/lib/format';
import { PrintButton } from '@/app/income/[id]/print/print-button';

/**
 * กระดาษสำหรับพิมพ์ "รายการ" — ทะเบียนผู้ติดต่อ สต๊อก รายการค้างทำ ค่าใช้จ่าย
 *
 * ต่างจากการสั่งพิมพ์หน้าจอตรงที่ตรงนี้พิมพ์ทุกแถวที่ตรงเงื่อนไข ไม่ใช่เฉพาะหน้าที่เปิดอยู่
 * อู่เอากระดาษนี้ไปเดินนับของจริงในชั้นวาง ถ้าพิมพ์มาได้แค่ 40 แถวแรกก็ใช้ไม่ได้
 */
export async function ListPaper({
  backHref, backLabel, title, en, filterNote, hint, children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  en: string;
  /** บอกว่ากระดาษใบนี้กรองอะไรไว้ ไม่งั้นคนถือกระดาษไม่รู้ว่าเห็นครบหรือยัง */
  filterNote?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const shop = await getShop();
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={backHref}>← {backLabel}</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          พิมพ์ทุกแถวที่ตรงเงื่อนไข ไม่ใช่เฉพาะหน้าที่เปิดอยู่
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
              </div>
            </div>
            <div className="doc-meta">
              <h1>{title}</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>{en}</div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr>
                    <td>พิมพ์เมื่อ</td>
                    <td style={{ textAlign: 'right' }}>{thDateLong(iso)}</td>
                  </tr>
                  {filterNote ? (
                    <tr>
                      <td>เงื่อนไข</td>
                      <td style={{ textAlign: 'right' }}>{filterNote}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {children}

          {hint ? (
            <div style={{ fontSize: 11, marginTop: 8, color: '#555', lineHeight: 1.7 }}>{hint}</div>
          ) : null}

          <div className="brandfoot">
            <span>จัดทำด้วยโปรแกรม DriveGoLight!</span>
            <span>www.drivebizbegin.com</span>
          </div>
        </div>
      </div>
    </>
  );
}
