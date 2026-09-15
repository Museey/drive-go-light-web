import 'server-only';
import type { SavedSummary } from '@/components/saved-card';
import { query } from './auth';
import { getBillnote } from './billnotes';
import { CLAIM_SIDE, getClaim } from './claims';
import { getContact } from './contacts';
import { baht, KIND_LABEL } from './format';
import { getKit } from './kits';
import { getProduct } from './products';
import { getDocDetail } from './queries';
import type { SavedKind } from './saved-target';

const DOC = 'บันทึกเอกสารเรียบร้อย';
const DATA = 'บันทึกข้อมูลแล้ว';

/**
 * ข้อมูลของการ์ดบันทึกแล้ว — อ่านจากฐานด้วย id ผ่านสิทธิ์และอู่ของผู้ใช้ตามปกติ (RLS)
 * ไม่พบ หรือชนิดไม่ตรงกับ id (เช่นส่ง id ใบซื้อมาในชนิดเอกสารขาย) = null ไม่แสดงการ์ด
 */
export async function loadSavedSummary(kind: SavedKind, id: string): Promise<SavedSummary | null> {
  switch (kind) {
    case 'sales':
    case 'buy': {
      const d = await getDocDetail(id);
      if (!d) return null;
      const buy = d.kind === 'PO' || d.kind === 'EX';
      if (buy !== (kind === 'buy')) return null;
      const base = buy ? '/expense' : '/income';
      return {
        title: DOC, label: KIND_LABEL[d.kind] ?? d.kind, no: d.docNo, name: d.partyName,
        amount: baht(d.grandTotal),
        printHref: `${base}/${id}/print`, printLabel: 'พิมพ์เอกสาร',
        editHref: `${base}/${id}/edit`, editLabel: 'แก้ไขเอกสาร',
      };
    }
    case 'bill': {
      const b = await query((c) => getBillnote(c, id));
      if (!b) return null;
      return {
        title: DOC, label: 'ใบวางบิล', no: b.note.no, name: b.note.partyName, amount: baht(b.note.total),
        printHref: `/income/billing/${id}/print`, printLabel: 'พิมพ์ใบวางบิล',
        editHref: `/income/billing/${id}`, editLabel: 'แก้ไขเอกสาร',
      };
    }
    case 'claim': {
      const cl = await query((c) => getClaim(c, id));
      if (!cl) return null;
      /* ใบเคลมบันทึกแล้วแก้ไขไม่ได้ (ตัดสต๊อกทันที) — ปุ่มที่สองเปิดดูใบแทน */
      return {
        title: DOC, label: CLAIM_SIDE[cl.side].title, no: cl.no, name: cl.partyName, amount: baht(cl.cost),
        printHref: `/stock/claim/${id}/print`, printLabel: 'พิมพ์ใบเคลม',
        editHref: `/stock/claim/${id}`, editLabel: 'เปิดดูใบเคลม',
      };
    }
    case 'contact': {
      const k = await getContact(id);
      if (!k) return null;
      return {
        title: DATA, label: k.kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า', no: k.code, name: k.displayName, amount: null,
        printHref: null, printLabel: '',
        editHref: `/customers/${id}`, editLabel: 'แก้ไขข้อมูล',
      };
    }
    case 'product': {
      const p = await getProduct(id);
      if (!p) return null;
      return {
        title: DATA, label: 'สินค้า', no: p.code, name: p.name, amount: null,
        printHref: `/stock/${id}/barcode`, printLabel: 'พิมพ์บาร์โค้ด',
        editHref: `/stock/${id}`, editLabel: 'แก้ไขข้อมูล',
      };
    }
    case 'kit': {
      const k = await getKit(id);
      if (!k) return null;
      return {
        title: DATA, label: 'ชุดอะไหล่', no: k.code, name: k.name, amount: baht(k.price),
        printHref: null, printLabel: '',
        editHref: `/stock/kits/${id}`, editLabel: 'แก้ไขข้อมูล',
      };
    }
    default:
      return null;
  }
}
