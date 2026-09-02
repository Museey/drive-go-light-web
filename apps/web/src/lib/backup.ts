import type pg from 'pg';

/**
 * ส่งออกข้อมูลทั้งหมดเป็นไฟล์สำรอง
 *
 * รูปแบบเดียวกับที่โปรแกรมรุ่น HTML ใช้ทุกประการ ไม่ใช่รูปแบบของเราเอง
 * เพราะสองอย่างนี้:
 *   1. ลูกค้าเปิดไฟล์ที่ส่งออกด้วยโปรแกรมรุ่นเดิมได้ ถ้าวันหนึ่งอยากเลิกใช้เว็บ
 *      ข้อมูลเป็นของเขา ไม่ใช่ของเรา
 *   2. `packages/importer` อ่านไฟล์นี้ได้เลย จึงย้ายข้อมูลกลับเข้าระบบได้
 *      และทดสอบวนกลับได้ว่าส่งออกแล้วนำเข้าใหม่ยอดยังเท่าเดิม
 */
export interface BackupFile {
  schemaVersion: number;
  exportedFrom: string;
  exportedAt: string;
  shop: Record<string, unknown>;
  categories: string[];
  products: unknown[];
  customers: unknown[];
  vendors: unknown[];
  quotes: unknown[];
  invoices: unknown[];
  receipts: unknown[];
  purchases: unknown[];
  expenses: unknown[];
  users: unknown[];
  seq: Record<string, number>;
  lic: Record<string, unknown>;
  ignoredItems: string[];
  /** ใบวางบิล — รูปแบบเดียวกับ DB.billnotes ของรุ่น 6.4 */
  billnotes: unknown[];
  /** ใบเคลมสินค้าทั้งสองทิศทาง — รูปแบบเดียวกับ DB.claims ของรุ่น 6.4 */
  claims: unknown[];
  /** ใบตรวจนับสต๊อก — รูปแบบเดียวกับ DB.counts ของรุ่น 6.4 */
  counts: unknown[];
  ui: Record<string, unknown>;
  lastExportAt: number;
}

const n = (v: unknown): number => Number(v ?? 0);

/** คีย์ seq ของโปรแกรมเดิม ↔ ชนิดเอกสารของเรา */
const SEQ_KEY: Record<string, string> = { QT: 'q', IV: 'iv', IVT: 'ivt', RC: 'r', PO: 'p', EX: 'e' };

/**
 * ประกอบไฟล์สำรองจาก client ที่ตั้ง tenant ไว้แล้ว
 *
 * แยกจาก exportBackup() ที่ผูกกับ session เพื่อให้เทสต์เรียกได้ตรง ๆ
 * — ฟีเจอร์นี้เป็นเรื่องความเป็นเจ้าของข้อมูล ดูด้วยตาว่า "หน้าตาถูก" ไม่พอ
 *   ต้องพิสูจน์ได้ว่านำกลับเข้าระบบแล้วยอดยังเท่าเดิม
 */
export async function exportBackupWith(c: pg.PoolClient | pg.Client): Promise<BackupFile> {
  {
    const shopRes = await c.query(
      `select * from tenants where id = current_tenant_id()`,
    );
    const s = shopRes.rows[0];

    const cats = await c.query(
      `select id, name from product_categories order by sort_order, name`,
    );
    const catName = new Map(cats.rows.map((r) => [r.id, r.name]));

    const prods = await c.query(
      `select p.*, coalesce(st.qty_on_hand, 0) as qty, st.last_move_on
       from products p left join product_stock st on st.product_id = p.id
       order by p.code`,
    );

    const contacts = await c.query(`select * from contacts order by code`);
    const vehicles = await c.query(`select * from vehicles order by created_at`);

    const docs = await c.query(
      `select d.*, d.kind::text as kind_text, d.vat_mode::text as vat_mode_text,
              d.status::text as status_text, d.expense_cat::text as cat_text,
              q.doc_no as parent_no, q.kind::text as parent_kind
       from documents d left join documents q on q.id = d.parent_doc_id
       order by d.doc_date, d.doc_no`,
    );
    const items = await c.query(`select * from doc_items order by doc_id, line_no`);
    const pays = await c.query(`select * from payments order by doc_id, paid_on, created_at`);
    const users = await c.query(`select * from users order by code`);
    const seqs = await c.query(`select kind::text as kind, last_no from doc_sequences`);
    const billSeq = await c.query(`select coalesce(max(last_no), 0)::int as last_no from billnote_sequences`);
    const claimSeq = await c.query(
      `select side::text as side, max(last_no)::int as last_no
       from claim_sequences group by side`,
    );
    const countSeq = await c.query(
      `select coalesce(max(last_no), 0)::int as last_no from stock_count_sequences`,
    );
    const counts = await c.query(
      `select ct.*, ct.count_date::text as count_date, ct.status::text as status,
              coalesce(json_agg(json_build_object(
                'pid', i.product_id, 'code', p.code, 'name', p.name, 'unit', p.unit,
                'sys', coalesce(i.system_qty, s.qty_on_hand, 0)::float8,
                'cnt', i.counted_qty::float8,
                'cost', coalesce(i.unit_cost, p.last_cost)::float8
              ) order by i.line_no) filter (where i.id is not null), '[]') as items
       from stock_counts ct
       left join stock_count_items i on i.count_id = ct.id
       left join products p on p.id = i.product_id
       left join product_stock s on s.product_id = i.product_id
       group by ct.id
       order by ct.count_date, ct.no`,
    );
    const claims = await c.query(
      `select c.*, c.claim_date::text as claim_date, c.side::text as side,
              c.status::text as status,
              coalesce(json_agg(json_build_object(
                'pid', i.product_id, 'code', i.code, 'oem', i.oem, 'name', i.name,
                'unit', i.unit, 'qty', i.qty::float8, 'cost', i.unit_cost::float8,
                'cogs', i.cost_amount::float8
              ) order by i.line_no) filter (where i.id is not null), '[]') as items
       from claims c
       left join claim_items i on i.claim_id = c.id
       group by c.id
       order by c.claim_date, c.no`,
    );
    const ignored = await c.query(`select name_norm from ignored_item_names order by name_norm`);
    const billnotes = await c.query(
      `select b.*, b.bill_date::text as bill_date, b.due_date::text as due_date,
              b.status::text as status,
              coalesce(array_agg(d.id) filter (where d.id is not null), '{}') as inv_ids
       from billnotes b
       left join billnote_docs bd on bd.billnote_id = b.id
       left join documents d on d.id = bd.doc_id
       group by b.id
       order by b.bill_date, b.no`,
    );
    const sub = await c.query(
      `select started_on, expires_on from subscriptions
       order by expires_on desc limit 1`,
    );

    const itemsOf = (docId: string) =>
      items.rows.filter((i) => i.doc_id === docId).map((i) => ({
        pid: i.product_id,
        code: i.code, oem: i.oem, name: i.name, unit: i.unit,
        qty: n(i.qty), price: n(i.unit_price),
        ...(i.is_service ? { svc: true } : {}),
      }));

    const paysOf = (docId: string) =>
      pays.rows.filter((p) => p.doc_id === docId).map((p) => ({
        id: p.id, date: p.paid_on, amount: n(p.amount),
        method: p.method, ref: p.ref,
        ...(p.at_issue ? { atIssue: true } : {}),
      }));

    /** ส่วนที่เอกสารขายทุกชนิดมีเหมือนกัน */
    const salesDoc = (d: any) => ({
      id: d.id,
      no: d.doc_no,
      date: d.doc_date,
      custId: d.party_id,
      custType: d.party_type,
      taxId: d.party_tax_id,
      name: d.party_name,
      addr: d.party_addr ?? {},
      addrText: d.party_addr_text,
      tel: d.party_tel,
      email: d.party_email,
      veh: d.vehicle ?? {},
      vehId: d.vehicle_id,
      items: itemsOf(d.id),
      discount: n(d.discount),
      vatMode: d.vat_mode_text,
      whtRate: n(d.wht_rate),
      creditDays: Number(d.credit_days),
      warranty: d.warranty_text ?? '',
      receivedBy: d.received_by,
      deducted: d.wht_deducted,
      note: d.note,
      payments: paysOf(d.id),
      ...(d.status_text === 'void' ? { voided: true, voidedReason: d.voided_reason } : {}),
    });

    const buyDoc = (d: any) => ({
      id: d.id,
      no: d.doc_no,
      date: d.doc_date,
      invNo: d.ref_doc_no,
      items: itemsOf(d.id),
      discount: n(d.discount),
      vatMode: d.vat_mode_text,
      terms: Number(d.credit_days) > 0 ? 'credit' : 'cash',
      creditDays: Number(d.credit_days),
      note: d.note,
      payments: paysOf(d.id),
      paidNow: paysOf(d.id).some((p: any) => p.atIssue),
      payMethod: paysOf(d.id)[0]?.method ?? 'เงินสด',
      payRef: '',
      payDate: '',
      ...(d.status_text === 'void' ? { voided: true, voidedReason: d.voided_reason } : {}),
    });

    const byKind = (k: string) => docs.rows.filter((d) => d.kind_text === k);

    return {
      schemaVersion: 1,
      exportedFrom: 'DriveGoLight! Web',
      exportedAt: new Date().toISOString(),

      shop: {
        name: s.name,
        taxId: s.tax_id ?? '',
        addr: s.addr_text ?? '',
        tel: s.tel ?? '',
        tel2: s.tel2 ?? '',
        vatRate: n(s.vat_rate),
        whtRate: n(s.wht_rate),
        priceTier: s.price_tier,
        logo: s.logo_url ?? '',
        proposerName: s.proposer_name ?? '',
        warrantyText: s.warranty_text ?? '',
      },

      categories: cats.rows.map((r) => r.name),

      products: prods.rows.map((p) => ({
        id: p.id, code: p.code, oem: p.oem, barcode: p.barcode ?? '',
        name: p.name, unit: p.unit,
        cat: p.category_id ? (catName.get(p.category_id) ?? '') : '',
        cost: n(p.last_cost), pA: n(p.price_a), pB: n(p.price_b), pC: n(p.price_c),
        qty: n(p.qty), min: n(p.qty_min), max: n(p.qty_max),
        lastMove: p.last_move_on ?? '',
        ...(p.active ? {} : { active: false }),
      })),

      customers: contacts.rows.map((k) => ({
        id: k.id, code: k.code, kind: k.kind, type: k.type,
        prefix: k.prefix, firstName: k.first_name, lastName: k.last_name,
        orgName: k.org_name, taxId: k.tax_id ?? '',
        addr: k.addr ?? {}, addrText: k.addr_text,
        tel: k.tel, tel2: k.tel2, email: k.email ?? '', note: k.note,
        creditDays: Number(k.credit_days), created: k.created_on,
        vehicles: vehicles.rows.filter((v) => v.contact_id === k.id).map((v) => ({
          id: v.id, brand: v.brand, model: v.model, year: v.year, color: v.color,
          plateA: v.plate_a, plateB: v.plate_b, plateProv: v.plate_province,
          engineNo: v.engine_no, chassisNo: v.chassis_no, mileage: v.mileage,
          lastService: v.last_service_on ?? '',
        })),
      })),

      /* ทะเบียนผู้ขายรวมอยู่ใน customers แล้วตั้งแต่รุ่น 3.x — เก็บ array ว่างไว้ให้ครบรูปแบบ */
      vendors: [],

      quotes: byKind('QT').map((d) => ({
        ...salesDoc(d),
        tier: d.price_tier ?? 'A',
        status: d.status_text === 'billed' ? 'billed' : 'open',
        complaints: d.complaints ?? ['', '', ''],
        findings: d.findings ?? ['', '', ''],
        approver: d.approver ?? '',
        proposer: d.proposer ?? '',
      })),

      invoices: [...byKind('IV'), ...byKind('IVT')].map((d) => ({
        ...salesDoc(d),
        kind: d.kind_text,
        quoteId: d.parent_kind === 'QT' ? d.parent_doc_id : null,
        quoteNo: d.parent_kind === 'QT' ? d.parent_no : '',
        invId: null, invNo: '',
      })),

      receipts: byKind('RC').map((d) => ({
        ...salesDoc(d),
        kind: 'RC',
        invId: d.parent_kind === 'IV' || d.parent_kind === 'IVT' ? d.parent_doc_id : null,
        invNo: d.parent_kind === 'IV' || d.parent_kind === 'IVT' ? d.parent_no : '',
        quoteId: d.parent_kind === 'QT' ? d.parent_doc_id : null,
        quoteNo: d.parent_kind === 'QT' ? d.parent_no : '',
        pay: { cash: false, transfer: false, card: false, credit: false, days: Number(d.credit_days) },
      })),

      purchases: byKind('PO').map((d) => ({
        ...buyDoc(d),
        vendorId: d.party_id,
        vendorName: d.party_name,
        vendorTaxId: d.party_tax_id,
        vendorTel: d.party_tel,
        vendorAddr: d.party_addr_text,
        received: d.goods_received,
      })),

      expenses: byKind('EX').map((d) => ({
        ...buyDoc(d),
        cat: d.cat_text ?? 'other',
        whtRate: n(d.wht_rate),
        assetLife: d.asset_life_yrs ?? 5,
        payeeId: d.party_id,
        payeeName: d.party_name,
        payeeTaxId: d.party_tax_id,
        payeeTel: d.party_tel,
        payeeAddr: d.party_addr_text,
      })),

      /* ไม่ส่งออกรหัสผ่านแม้จะเป็นค่าที่แฮชแล้ว — ไฟล์สำรองถูกส่งต่อทางไลน์กันได้ง่าย */
      users: users.rows
        .filter((u) => u.role !== 'owner')
        .map((u) => ({
          id: u.id, code: u.code, name: u.name, active: u.active,
          created: u.created_at?.toISOString?.().slice(0, 10) ?? '',
          perms: Object.fromEntries((u.perms ?? []).map((p: string) => [p, true])),
        })),

      seq: {
        ...Object.fromEntries(
          seqs.rows.map((r) => [SEQ_KEY[r.kind] ?? r.kind, Number(r.last_no)]),
        ),
        /* ตัวนับใบวางบิล — ชื่อคีย์ bn ตรงกับ DB.seq.bn ของรุ่น 6.4 */
        bn: Number(billSeq.rows[0]?.last_no ?? 0),
        /* ตัวนับใบเคลม — cl ฝั่งลูกค้า vc ฝั่งผู้ขาย เหมือนรุ่น 6.4 */
        cl: Number(claimSeq.rows.find((r) => r.side === 'customer')?.last_no ?? 0),
        vc: Number(claimSeq.rows.find((r) => r.side === 'vendor')?.last_no ?? 0),
        /* ตัวนับใบตรวจนับ — ชื่อคีย์ ct ตรงกับ DB.seq.ct ของรุ่น 6.4 */
        ct: Number(countSeq.rows[0]?.last_no ?? 0),
      } as Record<string, number>,

      lic: sub.rows[0]
        ? { installedAt: sub.rows[0].started_on, key: '', expires: sub.rows[0].expires_on }
        : { installedAt: '', key: '', expires: '' },

      ignoredItems: ignored.rows.map((r) => r.name_norm),

      /* ใบวางบิล — รูปแบบเดียวกับ DB.billnotes ของรุ่น 6.4 เพื่อให้เปิดด้วยโปรแกรมเดิมได้
         invIds อ้าง id ของเอกสารในไฟล์นี้ (คีย์เดียวกับที่ quotes/invoices/receipts ใช้)
         ต่างจากรุ่นเดิมตรงที่อ้างใบเสร็จได้ด้วย เพราะเราวางบิลจากใบค้างชำระทุกชนิด */
      billnotes: billnotes.rows.map((b) => ({
        id: b.id,
        no: b.no,
        date: b.bill_date,
        dueDate: b.due_date ?? '',
        custId: b.party_id,
        name: b.party_name ?? '',
        taxId: b.party_tax_id ?? '',
        addr: b.party_addr_text ?? '',
        byWhom: b.by_whom ?? '',
        note: b.note ?? '',
        total: n(b.total_snapshot),
        invIds: b.inv_ids ?? [],
        ...(b.status === 'void' ? { void: true } : {}),
      })),

      /* ใบเคลม — รูปแบบเดียวกับ DB.claims ของรุ่น 6.4 เพื่อให้เปิดด้วยโปรแกรมเดิมได้
         veh เก็บทั้งก้อนเหมือนเดิม ฝั่งผู้ขายไม่มีรถจึงเป็นออบเจกต์ว่าง
         deducted เป็น true เมื่อใบยังไม่ถูกยกเลิก ตรงกับความหมายของธงในรุ่นเดิม */
      claims: claims.rows.map((r) => ({
        id: r.id,
        no: r.no,
        side: r.side,
        kind: r.kind,
        date: r.claim_date,
        custId: r.party_id,
        name: r.party_name ?? '',
        tel: r.party_tel ?? '',
        refNo: r.ref_no ?? '',
        veh: {
          ...(r.vehicle ?? {}),
          ...(r.vehicle_plate ? { plateB: r.vehicle_plate } : {}),
        },
        reason: r.reason ?? '',
        byWhom: r.by_whom ?? '',
        note: r.note ?? '',
        items: r.items,
        deducted: r.status !== 'void',
        ...(r.status === 'void' ? { void: true } : {}),
      })),

      /* ใบตรวจนับ — รูปแบบเดียวกับ DB.counts ของรุ่น 6.4
         cnt เป็น null ได้ แปลว่ายังไม่ได้กรอก ต่างจาก 0 ที่แปลว่านับแล้วไม่เจอ */
      counts: counts.rows.map((r) => ({
        id: r.id,
        no: r.no,
        date: r.count_date,
        note: r.note ?? '',
        applied: r.status === 'applied',
        items: r.items,
      })),

      ui: s.ui_prefs ?? {},
      lastExportAt: Date.now(),
    };
  }
}

/* ตัวห่อที่ผูกกับ session อยู่ที่ route ไม่ใช่ที่นี่ — โมดูลนี้จะได้ไม่ต้อง import อะไร
   ที่เป็น server-only แล้วเทสต์เรียกใช้ได้ */

/** ชื่อไฟล์ตามแบบเดิม ให้ลูกค้าเห็นแล้วรู้ทันทีว่าคือไฟล์เดียวกัน */
export function backupFileName(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `drivegolight-backup-${iso}.json`;
}
