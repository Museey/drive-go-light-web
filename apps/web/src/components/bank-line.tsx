import type { ShopInfo } from '@/lib/queries';

/**
 * บรรทัดบัญชีรับโอนเงินบนกระดาษ
 *
 * ยกมาจาก `bankLine()` ของรุ่น 6.4 ซึ่งพิมพ์ลงบนใบเสร็จ ใบวางบิล และแบบฟอร์มเปล่า
 * ก่อนหน้านี้เว็บของเราไม่มีเลย — **อู่ออกใบเสร็จแล้วลูกค้าไม่รู้ว่าจะโอนไปที่ไหน**
 *
 * ข้อที่ 6.4 คิดมาดีและทำตาม: **ถ้าอู่ยังไม่ได้กรอก ให้พิมพ์เส้นว่างให้เขียนด้วยมือ**
 * ไม่ใช่ไม่พิมพ์อะไรเลย อู่ที่เพิ่งเปิดใช้ระบบจะได้ยังใช้กระดาษได้ทันที
 * และคนที่ถือใบไปก็รู้ว่าตรงนี้ควรมีเลขบัญชี
 */
export function BankLine({ shop }: { shop: ShopInfo }) {
  const has = shop.bankName || shop.bankAccountNo || shop.bankAccountName;

  const rule = (w: number) => (
    <span style={{
      display: 'inline-block', width: w, borderBottom: '1px solid #000',
      margin: '0 4px', height: '0.9em',
    }} />
  );

  return (
    <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.9 }}>
      <b>ชำระเงินโอนเข้าบัญชี:</b>{' '}
      {has ? (
        <>
          ธนาคาร {shop.bankName || '-'} · เลขที่บัญชี{' '}
          <b className="mono">{shop.bankAccountNo || '-'}</b> ·
          {' '}ชื่อบัญชี {shop.bankAccountName || '-'}
        </>
      ) : (
        <>
          ธนาคาร{rule(90)} เลขที่บัญชี{rule(130)} ชื่อบัญชี{rule(130)}
        </>
      )}
    </div>
  );
}
