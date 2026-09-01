import type pg from 'pg';

/**
 * ใบวางบิล — รวมใบแจ้งหนี้ที่ยังค้างของลูกค้ารายเดียวเป็นใบเดียวส่งไปแผนกการเงิน
 *
 * **ไม่ตั้งลูกหนี้ซ้ำและไม่นับรายได้** เป็นคำพูดของรุ่น 6.4 เอง และเป็นกติกาที่ทั้งไฟล์นี้ยึด
 * ใบวางบิลไม่มียอดของตัวเอง — ยอดของมันคือผลรวมยอดค้างของใบข้างใน ณ เวลาที่ถาม
 * ลูกค้าจ่ายบางใบไปแล้ว ยอดบนใบวางบิลลดตามเอง
 *
 * ไม่มี server-only เพราะทุกฟังก์ชันรับ client เข้ามา ชุดทดสอบจึงเรียกได้ตรง ๆ
 * ตัวที่ผูกกับ session อยู่ใน actions ของหน้า
 */

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

type Client = pg.PoolClient | pg.Client;

/** ใบแจ้งหนี้ที่ยังเก็บเงินไม่ครบ — ตรงกับ unpaidInvoices() ของรุ่น 6.4 */
export interface OpenInvoice {
  id: string;
  docNo: string;
  kind: string;
  docDate: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  payable: number;
  paid: number;
  outstanding: number;
  /** อยู่ในใบวางบิลใบอื่นที่ยังไม่ยกเลิกอยู่แล้วหรือไม่ */
  inBillnoteNo: string | null;
}

/**
 * ใบขายที่นับเป็น "ใบแจ้งหนี้ที่รอเก็บเงิน"
 *
 * ใบเสนอราคาไม่นับเพราะยังไม่เป็นหนี้ ส่วนใบเสร็จที่ออกต่อจากใบส่งมอบก็ไม่นับ
 * เพราะยอดของมันคือยอดเดียวกับใบส่งมอบ — เงื่อนไขเดียวกับที่รายงานลูกหนี้ใช้
 */
const BILLABLE = `
  d.status <> 'void' and d.direction = 'sell' and d.kind <> 'QT'
  and d.payable - coalesce(p.paid, 0) > 0.004`;

/** ใบค้างชำระทั้งหมด แยกตามลูกค้า ใช้ตอนเลือกว่าจะวางบิลใคร */
export async function openInvoices(
  c: Client,
  opts: { partyId?: string | null; partyName?: string; includeDocIds?: string[] } = {},
): Promise<OpenInvoice[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.partyId) {
    params.push(opts.partyId);
    where.push(`d.party_id = $${params.length}`);
  } else if (opts.partyName) {
    params.push(opts.partyName);
    where.push(`d.party_id is null and d.party_name = $${params.length}`);
  }

  /* ใบที่เลือกไว้แล้วแต่จ่ายครบไปแล้วก็ยังต้องแสดง ไม่งั้นมันหายจากใบวางบิลที่เปิดค้างอยู่ */
  let keep = '';
  if (opts.includeDocIds?.length) {
    params.push(opts.includeDocIds);
    keep = ` or d.id = any($${params.length}::uuid[])`;
  }

  const { rows } = await c.query(
    `select d.id, d.doc_no, d.kind::text as kind, d.doc_date::text as doc_date,
            d.due_date::text as due_date, d.party_id, d.party_name,
            d.payable, coalesce(p.paid, 0) as paid,
            (select b.no from billnote_docs bd
               join billnotes b on b.id = bd.billnote_id
              where bd.doc_id = d.id and not bd.voided limit 1) as in_billnote_no
     from documents d
     left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
            on p.doc_id = d.id
     where ((${BILLABLE})${keep})
       and d.status <> 'void' and d.direction = 'sell' and d.kind <> 'QT'
       ${where.length ? 'and ' + where.join(' and ') : ''}
     order by d.doc_date, d.doc_no`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    docNo: r.doc_no,
    kind: r.kind,
    docDate: r.doc_date,
    dueDate: r.due_date,
    partyId: r.party_id,
    partyName: r.party_name ?? '',
    payable: n(r.payable),
    paid: n(r.paid),
    outstanding: round2(n(r.payable) - n(r.paid)),
    inBillnoteNo: r.in_billnote_no,
  }));
}

export interface BillnoteRow {
  id: string;
  no: string;
  billDate: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  partyTaxId: string;
  partyAddrText: string;
  byWhom: string;
  note: string;
  /** ยอด ณ วันที่บันทึก */
  totalSnapshot: number;
  /** ยอดค้างของใบข้างในตอนนี้ — ตัวนี้คือยอดที่แสดงและที่พิมพ์ */
  total: number;
  docCount: number;
  status: string;
  voidedReason: string | null;
}

const ROW = `
  b.id, b.no, b.bill_date::text as bill_date, b.due_date::text as due_date,
  b.party_id, b.party_name, b.party_tax_id, b.party_addr_text,
  b.by_whom, b.note, b.total_snapshot, b.status::text as status, b.voided_reason,
  (select count(*) from billnote_docs x where x.billnote_id = b.id)::int as doc_count,
  coalesce((
    select sum(d.payable - coalesce(p.paid, 0))
    from billnote_docs bd
    join documents d on d.id = bd.doc_id
    left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
           on p.doc_id = d.id
    where bd.billnote_id = b.id and d.status <> 'void'
  ), 0) as total`;

const toRow = (r: any): BillnoteRow => ({
  id: r.id,
  no: r.no,
  billDate: r.bill_date,
  dueDate: r.due_date,
  partyId: r.party_id,
  partyName: r.party_name ?? '',
  partyTaxId: r.party_tax_id ?? '',
  partyAddrText: r.party_addr_text ?? '',
  byWhom: r.by_whom ?? '',
  note: r.note ?? '',
  totalSnapshot: n(r.total_snapshot),
  /* ยอดติดลบเกิดไม่ได้ในทางบัญชี — ใบที่จ่ายเกินถูกปัดเป็นศูนย์ */
  total: round2(Math.max(0, n(r.total))),
  docCount: r.doc_count,
  status: r.status,
  voidedReason: r.voided_reason,
});

export async function listBillnotes(
  c: Client,
  opts: { search?: string; from?: string; to?: string } = {},
): Promise<BillnoteRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(b.no ilike $${params.length} or b.party_name ilike $${params.length})`);
  }
  if (opts.from) { params.push(opts.from); where.push(`b.bill_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`b.bill_date <= $${params.length}`); }

  const { rows } = await c.query(
    `select ${ROW} from billnotes b
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by b.bill_date desc, b.no desc`,
    params,
  );
  return rows.map(toRow);
}

export async function getBillnote(
  c: Client,
  id: string,
): Promise<{ note: BillnoteRow; docs: OpenInvoice[] } | null> {
  const { rows } = await c.query(`select ${ROW} from billnotes b where b.id = $1`, [id]);
  if (!rows[0]) return null;

  const ids = await c.query(
    `select doc_id from billnote_docs where billnote_id = $1`, [id],
  );
  const docIds = ids.rows.map((r) => r.doc_id as string);

  const docs = docIds.length
    ? (await openInvoices(c, { includeDocIds: docIds })).filter((d) => docIds.includes(d.id))
    : [];

  return { note: toRow(rows[0]), docs };
}

export interface BillnoteInput {
  id?: string;
  billDate: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  partyTaxId: string;
  partyAddrText: string;
  byWhom: string;
  note: string;
  docIds: string[];
}

/**
 * บันทึกใบวางบิล
 *
 * ใบแจ้งหนี้ใบหนึ่งอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ใบเดียว — ฐานข้อมูลบังคับด้วย
 * partial unique index ตรงนี้จึงแปลงข้อผิดพลาดของฐานข้อมูลเป็นข้อความที่อ่านรู้เรื่อง
 * แทนที่จะปล่อยชื่อ constraint หลุดไปถึงผู้ใช้
 */
export async function saveBillnote(
  c: Client,
  input: BillnoteInput,
  userId: string | null,
): Promise<{ id: string; no: string }> {
  if (!input.partyName.trim() && !input.partyId) throw new Error('เลือกลูกค้าก่อนบันทึก');
  if (input.docIds.length === 0) throw new Error('ติ๊กเลือกใบที่จะวางบิลอย่างน้อยหนึ่งใบ');

  let id = input.id ?? '';
  let no: string;

  if (id) {
    const cur = await c.query(`select no, status::text as status from billnotes where id = $1`, [id]);
    if (!cur.rows[0]) throw new Error('ไม่พบใบวางบิลที่จะแก้');
    if (cur.rows[0].status === 'void') throw new Error('ใบวางบิลนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
    no = cur.rows[0].no;

    await c.query(
      `update billnotes set bill_date=$2, due_date=$3, party_id=$4, party_name=$5,
              party_tax_id=$6, party_addr_text=$7, by_whom=$8, note=$9, updated_at=now()
       where id=$1`,
      [id, input.billDate, input.dueDate, input.partyId, input.partyName,
       input.partyTaxId, input.partyAddrText, input.byWhom, input.note],
    );
    await c.query(`delete from billnote_docs where billnote_id = $1`, [id]);
  } else {
    const ym = input.billDate.slice(0, 4) + input.billDate.slice(5, 7);
    const seq = await c.query(
      `select next_billnote_no(current_tenant_id(), '') as n`,
    );
    no = `BN-${ym}-${String(seq.rows[0].n).padStart(3, '0')}`;

    const made = await c.query(
      `insert into billnotes (tenant_id, no, bill_date, due_date, party_id, party_name,
                              party_tax_id, party_addr_text, by_whom, note, created_by)
       values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [no, input.billDate, input.dueDate, input.partyId, input.partyName,
       input.partyTaxId, input.partyAddrText, input.byWhom, input.note, userId],
    );
    id = made.rows[0].id;
  }

  for (const docId of input.docIds) {
    try {
      await c.query(
        `insert into billnote_docs (tenant_id, billnote_id, doc_id)
         values (current_tenant_id(), $1, $2)`,
        [id, docId],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        const other = await c.query(
          `select b.no from billnote_docs bd join billnotes b on b.id = bd.billnote_id
            where bd.doc_id = $1 and not bd.voided limit 1`, [docId],
        );
        const d = await c.query(`select doc_no from documents where id = $1`, [docId]);
        throw new Error(
          `ใบ ${d.rows[0]?.doc_no ?? ''} อยู่ในใบวางบิล ${other.rows[0]?.no ?? 'ใบอื่น'} อยู่แล้ว` +
          ' — เอาออกจากใบนั้นก่อน',
        );
      }
      throw err;
    }
  }

  /* ยอดที่แจ้งไป ณ วันวางบิล เก็บไว้เทียบย้อนหลัง ส่วนหน้าจอใช้ยอดสด */
  const t = await c.query(`select ${ROW} from billnotes b where b.id = $1`, [id]);
  await c.query(`update billnotes set total_snapshot = $2 where id = $1`,
    [id, round2(Math.max(0, n(t.rows[0].total))).toFixed(2)]);

  return { id, no };
}

/** ยกเลิกใบวางบิล — ใบข้างในกลับไปวางบิลใบใหม่ได้ */
export async function voidBillnote(c: Client, id: string, reason: string): Promise<void> {
  const { rowCount } = await c.query(
    `update billnotes set status='void', voided_at=now(), voided_reason=$2
      where id=$1 and status <> 'void'`,
    [id, reason || 'ยกเลิกโดยผู้ใช้'],
  );
  if (!rowCount) throw new Error('ใบวางบิลนี้ถูกยกเลิกไปแล้ว');

  /* ปลดใบข้างในออกจากดัชนี "อยู่ได้ใบเดียว" ให้เอาไปวางบิลใหม่ได้ */
  await c.query(`update billnote_docs set voided = true where billnote_id = $1`, [id]);
}

/** ใบวางบิลที่ยังไม่ยกเลิกซึ่งใบแจ้งหนี้ใบนี้อยู่ — ใช้กันการยกเลิกใบแจ้งหนี้ */
export async function billnoteOfDoc(c: Client, docId: string): Promise<string | null> {
  const { rows } = await c.query(
    `select b.no from billnote_docs bd join billnotes b on b.id = bd.billnote_id
      where bd.doc_id = $1 and not bd.voided limit 1`,
    [docId],
  );
  return rows[0]?.no ?? null;
}
