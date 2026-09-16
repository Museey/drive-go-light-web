import { payLabel } from './format';
import type { CardStatus, DocCard } from './doc-card';

/**
 * ผู้ติดต่อ → การ์ด (จอต่ำกว่า 1280 · ต้นแบบของทีม `a.mparty` / `.mdetail`)
 *
 * **โมดูลบริสุทธิ์** — ไม่ import lib/contacts.ts เพราะไฟล์นั้นแตะฐานข้อมูล
 * หน้าเรียกใช้ส่งค่าที่ประกอบแล้วเข้ามา (ที่อยู่ ทะเบียนรถ) เพื่อให้เทสต์ด้วย vitest ได้
 */

export interface ContactCard {
  href: string;
  name: string;
  kind: CardStatus;
  /** บรรทัดรอง — หน้าเรียกใช้คั่นด้วย " · " · ค่าว่างถูกตัดทิ้งแล้ว */
  meta: string[];
}

export interface ContactCardInput {
  id: string;
  code: string;
  kind: 'customer' | 'vendor';
  displayName: string;
  tel: string;
  taxId: string;
  /** ทะเบียนรถที่ประกอบแล้ว เรียงตามที่เพิ่ม — ผู้ขายส่งว่าง */
  plates: string[];
}

/** ทะเบียนรถหนึ่งคัน — รูปแบบเดียวกับคิวรีรายชื่อ (concat_ws ช่องที่ไม่ว่าง) */
export function plateOf(v: { plateA: string; plateB: string; plateProvince: string }): string {
  return [v.plateA, v.plateB, v.plateProvince].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}

const kindChip = (kind: 'customer' | 'vendor'): CardStatus =>
  kind === 'vendor' ? { label: 'ผู้ขาย', tone: 'plain' } : { label: 'ลูกค้า', tone: 'ok' };

export function contactCard(c: ContactCardInput): ContactCard {
  /* ลูกค้าอู่ถูกค้นด้วยทะเบียนรถบ่อยกว่าเลขภาษี — มีรถก็ขึ้นทะเบียน ไม่มีค่อยใช้เลขภาษี
     สองคันแรกพอให้จำได้ว่าคนไหน ที่เหลือบอกจำนวน (เหมือนคอลัมน์ทะเบียนในตาราง) */
  const plates = c.kind === 'customer' ? c.plates.filter(Boolean) : [];
  const idLine = plates.length
    ? plates.slice(0, 2).join(', ') + (plates.length > 2 ? ` +${plates.length - 2} คัน` : '')
    : c.taxId;

  return {
    href: `/customers/${c.id}`,
    name: c.displayName || 'ไม่ระบุชื่อ',
    kind: kindChip(c.kind),
    meta: [c.code, c.tel, idLine].map((s) => (s ?? '').trim()).filter(Boolean),
  };
}

export interface DetailRow {
  label: string;
  value: string;
}

export function contactDetailRows(c: {
  kind: 'customer' | 'vendor';
  code: string; tel: string; tel2: string; email: string;
  plates: string[]; taxId: string; creditDays: number;
  addrLine: string; note: string;
}): DetailRow[] {
  const rows: DetailRow[] = [
    { label: 'รหัส', value: c.code },
    { label: 'โทรศัพท์', value: c.tel },
    { label: 'โทรศัพท์สำรอง', value: c.tel2 },
    { label: 'อีเมล', value: c.email },
    /* ผู้ขายไม่มีรถให้ดูแล — ข้อมูลรถที่ค้างมาจากการย้ายชนิดไม่ควรโผล่ */
    { label: 'ทะเบียนรถ', value: c.kind === 'customer' ? c.plates.filter(Boolean).join(', ') : '' },
    { label: 'เลขผู้เสียภาษี', value: c.taxId },
    /* เครดิตศูนย์แปลว่าขายสด — เป็นข้อมูล ไม่ใช่ช่องว่าง จึงไม่ถูกตัดทิ้ง */
    { label: 'เครดิต', value: c.creditDays > 0 ? `${c.creditDays} วัน` : 'เงินสด' },
    { label: 'ที่อยู่', value: c.addrLine },
    { label: 'หมายเหตุ', value: c.note },
  ];
  /* ค่าว่างไม่แสดงแถวนั้น ตามต้นแบบ — แถวที่มีแต่ป้ายทำให้การ์ดยาวโดยไม่บอกอะไร */
  return rows
    .map((r) => ({ ...r, value: (r.value ?? '').trim() }))
    .filter((r) => r.value !== '');
}

/** เอกสารหนึ่งใบในประวัติซื้อขาย → การ์ดเอกสารของเฟส 2 */
export function contactHistoryCard(
  d: { id: string; kind: string; docNo: string; docDate: string; payable: number; paid: number; outstanding: number },
  partyName: string,
): DocCard {
  const pay = payLabel(d.outstanding, d.paid);
  return {
    /* ประวัติของผู้ขายเป็นใบซื้อ/ค่าใช้จ่าย — อยู่ที่หน้ารายจ่าย ไม่ใช่รายรับ */
    href: d.kind === 'PO' || d.kind === 'EX' ? `/expense/${d.id}` : `/income/${d.id}`,
    kind: d.kind,
    no: d.docNo,
    name: partyName || '-',
    plate: '',
    date: d.docDate,
    amount: d.payable,
    outstanding: d.outstanding,
    status: { label: pay.text, tone: pay.tone },
    voided: false,
  };
}
