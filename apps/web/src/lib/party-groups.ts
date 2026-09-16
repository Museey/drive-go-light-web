/**
 * ลูกหนี้/เจ้าหนี้รายใบ → กลุ่มรายคน (จอต่ำกว่า 1280 · ต้นแบบของทีม `mArGroups`)
 *
 * **โมดูลบริสุทธิ์** — รวมจากแถวที่หน้าดึงมาอยู่แล้ว (คิวรีคืนใบค้างทุกใบ ไม่แบ่งหน้า)
 * ไม่แตะคิวรี จึงไม่มีทางที่มือถือกับเดสก์ท็อปจะนับยอดคนละวิธี
 */

export interface PartyRowLike {
  partyId: string | null;
  partyName: string;
  outstanding: number;
  /** จำนวนวันที่เกินกำหนด ค่าลบหรือศูนย์ = ยังไม่เกิน */
  daysOverdue: number;
}

export interface PartyGroup {
  /** คีย์ใน `?party=` — ทะเบียนผู้ติดต่อ ถ้าไม่ได้ผูกใช้ `n:ชื่อ` */
  key: string;
  name: string;
  count: number;
  overdueCount: number;
  amount: number;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * คีย์ของคน — **ทะเบียนผู้ติดต่อมาก่อนชื่อ**
 * ลูกค้าชื่อซ้ำกันได้ (นาย สมชาย สองคน) รวมด้วยชื่ออย่างเดียวจะทวงเงินผิดคน
 * ใบที่ไม่ได้ผูกทะเบียน (ขายหน้าร้าน) ไม่มีอะไรให้ยึดนอกจากชื่อ
 */
export const partyKey = (r: { partyId: string | null; partyName: string }): string =>
  r.partyId ?? `n:${r.partyName}`;

export function groupByParty(rows: PartyRowLike[]): PartyGroup[] {
  const map = new Map<string, PartyGroup>();
  for (const r of rows) {
    const key = partyKey(r);
    const g = map.get(key) ?? { key, name: r.partyName || 'ไม่ระบุชื่อ', count: 0, overdueCount: 0, amount: 0 };
    g.count += 1;
    if (r.daysOverdue > 0) g.overdueCount += 1;
    /* ปัดทุกครั้งที่บวก — 0.1 + 0.2 ต้องได้ 0.3 ไม่ใช่ 0.30000000000000004 */
    g.amount = round2(g.amount + r.outstanding);
    map.set(key, g);
  }
  /* ยอดมากสุดขึ้นก่อน = คนที่ต้องตามก่อน · ยอดเท่ากันเรียงชื่อ ลำดับจะได้ไม่สลับทุกครั้งที่โหลด */
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'th'));
}

/** ใบของคนเดียว ลำดับเดิม — คีย์ที่ไม่มีอยู่ได้รายการว่าง ไม่ใช่ทุกใบ */
export function rowsOfParty<T extends { partyId: string | null; partyName: string }>(rows: T[], key: string): T[] {
  return rows.filter((r) => partyKey(r) === key);
}
