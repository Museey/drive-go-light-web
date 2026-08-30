/**
 * นำเข้าไฟล์สำรองข้อมูล JSON ของ DriveGoLight! รุ่น HTML เข้า Postgres
 *
 * หลักการ
 *   - ทำงานในทรานแซกชันเดียว ล้มที่ไหนก็ไม่มีข้อมูลค้าง
 *   - ยอดเงินทุกช่องคำนวณใหม่ด้วย @drivegolight/core ไม่ได้ก๊อปมาจากไฟล์
 *     (ไฟล์เดิมไม่ได้เก็บยอดไว้ คำนวณสดตอนแสดงผลทุกครั้ง)
 *   - id เดิมเก็บไว้ในคอลัมน์ legacy_id ทำให้รันซ้ำได้และตามรอยกลับไปหาไฟล์ต้นทางได้
 *   - สต๊อกลงเป็นรายการยกมา (opening) ก้อนเดียว ไม่สร้างประวัติย้อนหลัง
 *     เพราะ products.qty ในไฟล์เดิมเป็นยอดสะสมที่ผ่านการบวกลบมาแล้ว
 *     ถ้าลงประวัติซื้อ/ขายด้วยจะกลายเป็นนับสองรอบ
 */
import { randomUUID } from 'node:crypto';
import {
  exTotals, isServiceItem, num, poTotals, recTotals, round2, totalsOf,
} from '@drivegolight/core';
import type { ShopContext, VatMode } from '@drivegolight/core';
import { addrLine, normalizeBackup, validateBackup } from './normalize.js';
import type { BackupFile } from './normalize.js';

/** ส่วนของ pg client ที่ importer ใช้ — รับได้ทั้ง Client และ PoolClient */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ImportOptions {
  /** ชื่ออู่ ถ้าไม่ระบุใช้ shop.name จากไฟล์ */
  tenantName?: string;
  /** วันที่ลงยอดสต๊อกยกมา ถ้าไม่ระบุใช้วันที่นำเข้า */
  openingStockDate?: string;
  /** เลขที่เอกสารรีเซ็ตรายเดือนหรือไม่ — ค่าตั้งต้นคือไม่รีเซ็ต ตามพฤติกรรมโปรแกรมเดิม */
  monthlyDocSequence?: boolean;
}

export interface ImportResult {
  tenantId: string;
  counts: Record<string, number>;
  /** เรื่องที่ต้องบอกผู้ใช้ — ไม่ถึงกับ error แต่ห้ามเงียบ */
  warnings: string[];
}

const KIND_SEQ_KEY: Record<string, string> = { QT: 'q', IV: 'iv', IVT: 'ivt', RC: 'r', PO: 'p', EX: 'e' };

const normName = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const digitsOnly = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const money = (n: number) => round2(n).toFixed(2);
const qty = (n: number) => n.toFixed(3);
const text = (v: unknown) => String(v ?? '');

/** แทรกทีละก้อน ไม่ให้เกินขีดจำกัดพารามิเตอร์ของ Postgres (65535) */
async function insertRows(
  client: SqlClient,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (!rows.length) return;
  const perRow = columns.length;
  const maxRows = Math.max(1, Math.floor(60000 / perRow));

  for (let start = 0; start < rows.length; start += maxRows) {
    const chunk = rows.slice(start, start + maxRows);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const ph = row.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      return `(${ph.join(',')})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`,
      values,
    );
  }
}

/**
 * นำเข้าไฟล์สำรองข้อมูลหนึ่งไฟล์เป็นอู่หนึ่งราย
 * โยน Error พร้อมรายละเอียดถ้าไฟล์ไม่ผ่านการตรวจโครงสร้าง
 */
export async function importBackup(
  client: SqlClient,
  raw: BackupFile,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const problems = validateBackup(raw);
  if (problems.length) {
    const shown = problems.slice(0, 15).join('\n  - ');
    const more = problems.length > 15 ? `\n  ...และอีก ${problems.length - 15} จุด` : '';
    throw new Error(`ไฟล์สำรองข้อมูลไม่ถูกต้อง พบปัญหา ${problems.length} จุด:\n  - ${shown}${more}`);
  }

  const db = normalizeBackup(raw);
  const shop = db.shop as Record<string, any>;
  const ctx: ShopContext = { vatRate: shop.vatRate };
  const warnings: string[] = [];

  const tenantId = randomUUID();
  const openingDate = options.openingStockDate ?? new Date().toISOString().slice(0, 10);

  await client.query('begin');
  try {
    // ต้องตั้ง tenant ก่อนแทรกแถวแรก ไม่งั้น RLS ปฏิเสธทุกอย่างรวมถึงตาราง tenants เอง
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);

    /* ---------- ร้าน ---------- */
    const taxId = digitsOnly(shop.taxId);
    if (shop.taxId && taxId.length !== 13) {
      warnings.push(`เลขประจำตัวผู้เสียภาษีของร้าน "${shop.taxId}" ไม่ครบ 13 หลัก — บันทึกเป็นค่าว่าง`);
    }
    if (shop.logo) {
      warnings.push('โลโก้เดิมฝังเป็น base64 ในไฟล์ — ต้องอัปโหลดขึ้น object storage แล้วตั้ง logo_url เอง');
    }

    await client.query(
      `insert into tenants (id, name, tax_id, addr_text, tel, tel2, vat_rate, wht_rate,
                            price_tier, proposer_name, warranty_text, ui_prefs)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        tenantId,
        options.tenantName ?? text(shop.name) ?? 'อู่',
        taxId.length === 13 ? taxId : null,
        text(shop.addr), text(shop.tel), text(shop.tel2),
        num(shop.vatRate), num(shop.whtRate),
        ['A', 'B', 'C'].includes(shop.priceTier) ? shop.priceTier : 'A',
        text(shop.proposerName), shop.warrantyText ? text(shop.warrantyText) : null,
        JSON.stringify(db.ui ?? {}),
      ],
    );

    /* ---------- ผู้ใช้งาน ---------- */
    const PERM_KEYS = ['customer', 'income', 'expense', 'stock', 'finance', 'settings'];
    const userRows = (db.users ?? []).map((u: any) => [
      randomUUID(), tenantId, text(u.code), text(u.name), 'staff',
      PERM_KEYS.filter((k) => u.perms?.[k]), u.active !== false, text(u.id),
    ]);
    await insertRows(client, 'users',
      ['id', 'tenant_id', 'code', 'name', 'role', 'perms', 'active', 'legacy_id'], userRows);

    if (userRows.length) {
      warnings.push(
        `นำเข้าผู้ใช้ ${userRows.length} คนโดยไม่เอารหัสผ่านเดิมมาด้วย ` +
        '(ไฟล์เดิมเก็บเป็นข้อความธรรมดา) — ต้องให้ทุกคนตั้งรหัสผ่านใหม่',
      );
    }
    warnings.push('ยังไม่มีบัญชีเจ้าของกิจการ — ต้องสมัครและตั้งรหัสผ่านผ่านหน้าเว็บ');

    /* ---------- ลิขสิทธิ์ ---------- */
    if (db.lic?.expires) {
      await client.query(
        `insert into subscriptions (tenant_id, plan, started_on, expires_on, note)
         values ($1,'light-yearly',$2,$3,$4)`,
        [tenantId, db.lic.installedAt || openingDate, db.lic.expires, 'ย้ายมาจากรหัสลิขสิทธิ์ในไฟล์ HTML'],
      );
    }

    /* ---------- หมวดหมู่และสินค้า ---------- */
    const catId = new Map<string, string>();
    const catRows = (db.categories ?? []).map((name, i) => {
      const id = randomUUID();
      catId.set(name, id);
      return [id, tenantId, name, i];
    });
    await insertRows(client, 'product_categories', ['id', 'tenant_id', 'name', 'sort_order'], catRows);

    const productId = new Map<string, string>();
    const productRows: unknown[][] = [];
    const seenCode = new Map<string, number>();

    for (const p of db.products) {
      const id = randomUUID();
      productId.set(p.id, id);

      // ทะเบียนสินค้าเดิมไม่ได้บังคับรหัสไม่ซ้ำ แต่ตารางใหม่บังคับ
      let code = text(p.code);
      const dup = seenCode.get(code);
      if (dup !== undefined) {
        const next = dup + 1;
        seenCode.set(code, next);
        const fixed = `${code}-${next}`;
        warnings.push(`รหัสสินค้า "${code}" ซ้ำ — เปลี่ยนเป็น "${fixed}"`);
        code = fixed;
      } else {
        seenCode.set(code, 1);
      }

      productRows.push([
        id, tenantId, code, text(p.oem), text(p.name), text(p.unit),
        p.cat ? (catId.get(p.cat) ?? null) : null,
        money(num(p.cost)), money(num(p.pA)), money(num(p.pB)), money(num(p.pC)),
        qty(num(p.min)), qty(num(p.max)), text(p.id),
      ]);
    }
    await insertRows(client, 'products',
      ['id', 'tenant_id', 'code', 'oem', 'name', 'unit', 'category_id',
       'last_cost', 'price_a', 'price_b', 'price_c', 'qty_min', 'qty_max', 'legacy_id'],
      productRows);

    /* ---------- สต๊อกยกมา ---------- */
    const stockRows = db.products
      .filter((p: any) => num(p.qty) !== 0)
      .map((p: any) => [
        randomUUID(), tenantId, productId.get(p.id), p.lastMove || openingDate,
        qty(num(p.qty)), money(num(p.cost)), 'opening', 'ยอดยกมาจากโปรแกรมรุ่น HTML',
      ]);
    await insertRows(client, 'stock_moves',
      ['id', 'tenant_id', 'product_id', 'moved_on', 'qty_delta', 'unit_cost', 'reason', 'note'],
      stockRows);

    /* ---------- ผู้ติดต่อและรถ ---------- */
    const contactId = new Map<string, string>();
    const contactById = new Map<string, any>();
    const contactRows: unknown[][] = [];
    const vehicleRows: unknown[][] = [];
    const vehicleId = new Map<string, string>();
    const seenContactCode = new Map<string, number>();
    let custSeq = 0;
    let vendSeq = 0;

    for (const c of db.customers) {
      const id = randomUUID();
      contactId.set(c.id, id);
      contactById.set(c.id, c);

      let code = text(c.code);
      if (!code) {
        code = c.kind === 'vendor'
          ? 'VEN-' + String(++vendSeq).padStart(4, '0')
          : 'CUS-' + String(++custSeq).padStart(4, '0');
      }
      const dup = seenContactCode.get(code);
      if (dup !== undefined) {
        seenContactCode.set(code, dup + 1);
        code = `${code}-${dup + 1}`;
      } else {
        seenContactCode.set(code, 1);
      }

      // ตารางใหม่บังคับว่าต้องมีชื่อ — ของเดิมปล่อยว่างได้
      let type = c.type === 'company' ? 'company' : 'person';
      let orgName = text(c.orgName);
      let firstName = text(c.firstName);
      const lastName = text(c.lastName);
      if (type === 'company' && !orgName) {
        orgName = firstName || lastName || `ไม่ระบุชื่อ (${code})`;
        warnings.push(`ผู้ติดต่อ ${code} เป็นนิติบุคคลแต่ไม่มีชื่อ — ใส่ "${orgName}" ให้แทน`);
      }
      if (type === 'person' && !firstName && !lastName) {
        if (orgName) { type = 'company'; }
        else {
          firstName = `ไม่ระบุชื่อ (${code})`;
          warnings.push(`ผู้ติดต่อ ${code} ไม่มีชื่อ — ใส่ "${firstName}" ให้แทน`);
        }
      }

      contactRows.push([
        id, tenantId, code, c.kind === 'vendor' ? 'vendor' : 'customer', type,
        text(c.prefix), firstName, lastName, orgName,
        digitsOnly(c.taxId) || null,
        JSON.stringify(c.addr ?? {}), text(c.addrText),
        text(c.tel), text(c.tel2), c.email ? text(c.email) : null, text(c.note),
        Math.max(0, Math.trunc(num(c.creditDays))),
        c.created || openingDate, text(c.id),
      ]);

      for (const v of c.vehicles ?? []) {
        const vid = randomUUID();
        vehicleId.set(v.id, vid);
        vehicleRows.push([
          vid, tenantId, id, text(v.brand), text(v.model), text(v.year), text(v.color),
          text(v.plateA), text(v.plateB), text(v.plateProv),
          text(v.engineNo), text(v.chassisNo), text(v.mileage),
          v.lastService || null, text(v.id),
        ]);
      }
    }

    await insertRows(client, 'contacts',
      ['id', 'tenant_id', 'code', 'kind', 'type', 'prefix', 'first_name', 'last_name', 'org_name',
       'tax_id', 'addr', 'addr_text', 'tel', 'tel2', 'email', 'note', 'credit_days',
       'created_on', 'legacy_id'],
      contactRows);

    await insertRows(client, 'vehicles',
      ['id', 'tenant_id', 'contact_id', 'brand', 'model', 'year', 'color',
       'plate_a', 'plate_b', 'plate_province', 'engine_no', 'chassis_no', 'mileage',
       'last_service_on', 'legacy_id'],
      vehicleRows);

    /* ---------- เอกสาร ---------- */
    const docId = new Map<string, string>();
    const docRows: unknown[][] = [];
    const itemRows: unknown[][] = [];
    const paymentRows: unknown[][] = [];
    const missingProduct = new Set<string>();

    /** เตรียมแถวเอกสารหนึ่งใบ พร้อมรายการและการชำระเงิน */
    const addDoc = (
      d: any,
      kind: 'QT' | 'IV' | 'IVT' | 'RC' | 'PO' | 'EX',
      opts: {
        parentLegacyId?: string | null;
        totals: { subtotal: number; net: number; vat: number; wht: number; grand: number; payable: number };
        party: {
          id: string | null; type: string; name: string; taxId: string;
          tel: string; email: string; addr: unknown; addrText: string;
        };
        vehicle: any | null;
        vatMode: VatMode;
        status: string;
        creditDays: number;
        dueDate: string | null;
      },
    ) => {
      const id = docId.get(d.id)!;
      const t = opts.totals;

      docRows.push([
        id, tenantId, kind, text(d.no), d.date, opts.status,
        opts.parentLegacyId ? (docId.get(opts.parentLegacyId) ?? null) : null,
        text(d.invNo),
        opts.party.id, opts.party.type, opts.party.name, digitsOnly(opts.party.taxId),
        opts.party.tel, opts.party.email, JSON.stringify(opts.party.addr ?? {}), opts.party.addrText,
        opts.vehicle ? (vehicleId.get(d.vehId) ?? null) : null,
        opts.vehicle ? JSON.stringify(opts.vehicle) : null,
        opts.vehicle ? [opts.vehicle.plateA, opts.vehicle.plateB].filter(Boolean).join(' ') : '',
        kind === 'QT' && ['A', 'B', 'C'].includes(d.tier) ? d.tier : null,
        money(num(d.discount)), opts.vatMode, num(shop.vatRate), num(d.whtRate),
        money(t.subtotal), money(t.net), money(t.vat), money(t.wht), money(t.grand), money(t.payable),
        opts.creditDays, opts.dueDate,
        kind === 'QT' ? (d.complaints ?? []).map(text) : null,
        kind === 'QT' ? (d.findings ?? []).map(text) : null,
        kind === 'QT' ? text(d.approver) : '',
        kind === 'QT' ? text(d.proposer) : '',
        d.warranty ? text(d.warranty) : null,
        text(d.receivedBy),
        !!d.deducted,
        kind === 'PO' ? !!d.received : false,
        kind === 'EX' ? d.cat : null,
        kind === 'EX' && d.cat === 'asset' && num(d.assetLife) > 0 ? Math.trunc(num(d.assetLife)) : null,
        text(d.note),
        text(d.id),
      ]);

      (d.items ?? []).forEach((it: any, i: number) => {
        let pid: string | null = null;
        if (it.pid) {
          pid = productId.get(it.pid) ?? null;
          if (!pid) missingProduct.add(it.pid);
        }
        itemRows.push([
          randomUUID(), tenantId, id, i + 1, pid,
          text(it.code), text(it.oem), text(it.name) || '(ไม่ระบุชื่อรายการ)', text(it.unit),
          qty(num(it.qty)), money(num(it.price)), isServiceItem(it),
        ]);
      });

      for (const p of d.payments ?? []) {
        const amount = round2(num(p.amount));
        if (amount <= 0) continue;   // ตารางใหม่ไม่รับยอดชำระศูนย์หรือติดลบ
        paymentRows.push([
          randomUUID(), tenantId, id, p.date || d.date, money(amount),
          text(p.method) || 'เงินสด', text(p.ref), !!p.atIssue,
        ]);
      }
    };

    // จองรหัสให้ทุกเอกสารก่อน เพื่อให้ผูก parent ข้ามชนิดได้โดยไม่ต้องสนลำดับ
    for (const d of [...db.quotes, ...db.invoices, ...db.receipts, ...db.purchases, ...db.expenses]) {
      docId.set(d.id, randomUUID());
    }

    const partyFromContact = (id: string | null, fallbackType: string) => {
      const c = id ? contactById.get(id) : null;
      return c ? (c.type === 'company' ? 'company' : 'person') : fallbackType;
    };

    /* ใบเสนอราคา */
    for (const q of db.quotes) {
      const t = totalsOf(q, ctx);
      addDoc(q, 'QT', {
        totals: { subtotal: t.sub, net: t.net, vat: t.vat, wht: 0, grand: t.grand, payable: t.grand },
        party: {
          id: q.custId ? (contactId.get(q.custId) ?? null) : null,
          type: q.custType === 'company' ? 'company' : 'person',
          name: text(q.name), taxId: text(q.taxId), tel: text(q.tel), email: text(q.email),
          addr: q.addr, addrText: addrLine(q.addr),
        },
        vehicle: q.veh ?? null,
        vatMode: (q.vatMode as VatMode) ?? 'ex',
        status: q.status === 'billed' ? 'billed' : 'issued',
        creditDays: 0,
        dueDate: null,
      });
    }

    /* ใบส่งมอบ / ใบแจ้งหนี้ */
    for (const inv of db.invoices) {
      const kind: 'IV' | 'IVT' = inv.kind === 'IV' ? 'IV' : 'IVT';
      // ชนิดเอกสารบังคับโหมดภาษีอยู่แล้ว (enforceVat ของเดิม) — บังคับซ้ำกันไฟล์เพี้ยน
      const forced: VatMode = kind === 'IV' ? 'none' : 'ex';
      if (inv.vatMode !== forced) {
        warnings.push(`เอกสาร ${inv.no} มี vatMode = "${inv.vatMode}" ซึ่งขัดกับชนิด ${kind} — แก้เป็น "${forced}"`);
        inv.vatMode = forced;
      }
      const t = recTotals(inv, ctx);
      const creditDays = Math.max(0, Math.trunc(num(inv.creditDays)));
      addDoc(inv, kind, {
        parentLegacyId: inv.quoteId ?? null,
        totals: { subtotal: t.sub, net: t.net, vat: t.vat, wht: t.wht, grand: t.grand, payable: t.payable },
        party: {
          id: inv.custId ? (contactId.get(inv.custId) ?? null) : null,
          type: partyFromContact(inv.custId, inv.custType === 'company' ? 'company' : 'person'),
          name: text(inv.name), taxId: text(inv.taxId), tel: text(inv.tel), email: text(inv.email),
          addr: inv.addr, addrText: text(inv.addrText) || addrLine(inv.addr),
        },
        vehicle: inv.veh ?? null,
        vatMode: forced,
        status: 'issued',
        creditDays,
        dueDate: addDaysIso(inv.date, creditDays),
      });
    }

    /* ใบเสร็จรับเงิน */
    for (const r of db.receipts) {
      const t = recTotals(r, ctx);
      const onCredit = !!r.pay?.credit;
      const creditDays = onCredit ? Math.max(0, Math.trunc(num(r.pay?.days))) : 0;
      addDoc(r, 'RC', {
        parentLegacyId: r.invId ?? r.quoteId ?? null,
        totals: { subtotal: t.sub, net: t.net, vat: t.vat, wht: t.wht, grand: t.grand, payable: t.payable },
        party: {
          id: r.custId ? (contactId.get(r.custId) ?? null) : null,
          type: partyFromContact(r.custId, r.custType === 'company' ? 'company' : 'person'),
          name: text(r.name), taxId: text(r.taxId), tel: text(r.tel), email: text(r.email),
          addr: r.addr, addrText: text(r.addrText) || addrLine(r.addr),
        },
        vehicle: r.veh ?? null,
        vatMode: (r.vatMode as VatMode) ?? 'ex',
        status: 'issued',
        creditDays,
        dueDate: onCredit ? addDaysIso(r.date, creditDays) : r.date,
      });
    }

    /* ใบซื้อ */
    for (const p of db.purchases) {
      const t = poTotals(p, ctx);
      const onCredit = p.terms === 'credit';
      const creditDays = onCredit ? Math.max(0, Math.trunc(num(p.creditDays))) : 0;
      addDoc(p, 'PO', {
        totals: { subtotal: t.sub, net: t.net, vat: t.vat, wht: 0, grand: t.grand, payable: t.payable },
        party: {
          id: p.vendorId ? (contactId.get(p.vendorId) ?? null) : null,
          type: partyFromContact(p.vendorId, 'company'),
          name: text(p.vendorName), taxId: text(p.vendorTaxId), tel: text(p.vendorTel), email: '',
          addr: {}, addrText: text(p.vendorAddr),
        },
        vehicle: null,
        vatMode: (p.vatMode as VatMode) ?? 'ex',
        status: 'issued',
        creditDays,
        dueDate: onCredit ? addDaysIso(p.date, creditDays) : p.date,
      });
    }

    /* ค่าใช้จ่าย */
    for (const e of db.expenses) {
      const t = exTotals(e, ctx);
      const onCredit = e.terms === 'credit';
      const creditDays = onCredit ? Math.max(0, Math.trunc(num(e.creditDays))) : 0;
      addDoc(e, 'EX', {
        totals: { subtotal: t.sub, net: t.net, vat: t.vat, wht: t.wht, grand: t.grand, payable: t.payable },
        party: {
          id: e.payeeId ? (contactId.get(e.payeeId) ?? null) : null,
          type: partyFromContact(e.payeeId, 'company'),
          name: text(e.payeeName), taxId: text(e.payeeTaxId), tel: text(e.payeeTel), email: '',
          addr: {}, addrText: text(e.payeeAddr),
        },
        vehicle: null,
        vatMode: (e.vatMode as VatMode) ?? 'none',
        status: 'issued',
        creditDays,
        dueDate: onCredit ? addDaysIso(e.date, creditDays) : e.date,
      });
    }

    if (missingProduct.size) {
      warnings.push(
        `มีบรรทัดในเอกสารอ้างถึงสินค้า ${missingProduct.size} รายการที่ไม่มีในทะเบียนแล้ว — ` +
        'บันทึกเป็นรายการที่ไม่ผูกทะเบียน (ชื่อและราคายังอยู่ครบ)',
      );
    }

    await insertRows(client, 'documents',
      ['id', 'tenant_id', 'kind', 'doc_no', 'doc_date', 'status', 'parent_doc_id', 'ref_doc_no',
       'party_id', 'party_type', 'party_name', 'party_tax_id', 'party_tel', 'party_email',
       'party_addr', 'party_addr_text', 'vehicle_id', 'vehicle', 'vehicle_plate',
       'price_tier', 'discount', 'vat_mode', 'vat_rate', 'wht_rate',
       'subtotal', 'net_amount', 'vat_amount', 'wht_amount', 'grand_total', 'payable',
       'credit_days', 'due_date', 'complaints', 'findings', 'approver', 'proposer',
       'warranty_text', 'received_by', 'wht_deducted', 'goods_received',
       'expense_cat', 'asset_life_yrs', 'note', 'legacy_id'],
      docRows);

    await insertRows(client, 'doc_items',
      ['id', 'tenant_id', 'doc_id', 'line_no', 'product_id', 'code', 'oem', 'name', 'unit',
       'qty', 'unit_price', 'is_service'],
      itemRows);

    await insertRows(client, 'payments',
      ['id', 'tenant_id', 'doc_id', 'paid_on', 'amount', 'method', 'ref', 'at_issue'],
      paymentRows);

    /* ---------- ตัวนับเลขที่เอกสาร ---------- */
    const period = options.monthlyDocSequence ? new Date().toISOString().slice(0, 7).replace('-', '') : '';
    const seqRows = Object.entries(KIND_SEQ_KEY)
      .map(([kind, key]) => [tenantId, kind, period, Math.max(0, Math.trunc(num(db.seq?.[key])))]);
    await insertRows(client, 'doc_sequences', ['tenant_id', 'kind', 'period', 'last_no'], seqRows);

    /* ---------- ชื่อรายการที่สั่งไม่ให้เตือน ---------- */
    const ignoredRows = [...new Set((db.ignoredItems ?? []).map(normName))]
      .filter(Boolean)
      .map((n) => [tenantId, n]);
    await insertRows(client, 'ignored_item_names', ['tenant_id', 'name_norm'], ignoredRows);

    await client.query('commit');

    return {
      tenantId,
      counts: {
        users: userRows.length,
        categories: catRows.length,
        products: productRows.length,
        stockMoves: stockRows.length,
        contacts: contactRows.length,
        vehicles: vehicleRows.length,
        documents: docRows.length,
        docItems: itemRows.length,
        payments: paymentRows.length,
      },
      warnings,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

/** บวกวันแบบเดียวกับ addDays() ของโปรแกรมเดิม */
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
