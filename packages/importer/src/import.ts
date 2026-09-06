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
import { createHash, randomUUID } from 'node:crypto';
import {
  exTotals, isServiceItem, num, poTotals, recTotals, round2, totalsOf,
} from '@drivegolight/core';
import { permsFromLegacy, type PermKey, type ShopContext, type VatMode } from '@drivegolight/core';
import { picsFromBackup } from './pics.js';

/**
 * ผังเมนูย่อยของระบบใหม่ — ใช้ตอนกางสิทธิ์รูปแบบเก่าให้เป็นรายแท็บ
 * ต้องตรงกับ SUB_KEYS ใน apps/web/src/components/menu-map.ts (มีเทสต์เทียบให้)
 */
const SUB_KEYS: Record<PermKey, string[]> = {
  customer: ['customer', 'vendor'],
  income: ['quote', 'invoice', 'receipt', 'billing'],
  expense: ['purchase', 'expense'],
  stock: ['list', 'pending', 'claim', 'vclaim', 'count'],
  finance: ['sales', 'ar', 'ap', 'pl'],
  settings: ['shop', 'staff', 'import'],
};
import { addrLine, normalizeBackup, validateBackup } from './normalize.js';
import type { BackupFile } from './normalize.js';
import { unsupportedCollections, unsupportedWarnings } from './support.js';

/** ส่วนของ pg client ที่ importer ใช้ — รับได้ทั้ง Client และ PoolClient */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ImportOptions {
  /** ชื่ออู่ ถ้าไม่ระบุใช้ shop.name จากไฟล์ */
  tenantName?: string;
  /**
   * กู้คืนทับอู่ที่มีอยู่แล้ว แทนที่จะสร้างอู่ใหม่
   *
   * ผู้เรียกต้องล้างข้อมูลเดิมของอู่นั้นมาก่อน ตัวนำเข้าไม่ล้างให้
   * และจะไม่แตะผู้ใช้งานกับการสมัครใช้บริการ — สองอย่างนี้เป็นของระบบเว็บ
   * ไม่ได้อยู่ในไฟล์สำรอง (ไฟล์เดิมไม่มีรหัสผ่าน) ถ้าเขียนทับจะล็อกทุกคนออกจากระบบ
   */
  intoTenantId?: string;
  /** ให้ผู้เรียกคุมทรานแซกชันเอง — ใช้ตอนเรียกจากในเว็บซึ่งเปิดทรานแซกชันไว้แล้ว */
  externalTransaction?: boolean;
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

  /* บอกก่อนว่ามีอะไรในไฟล์ที่จะไม่ตามมา — ต้องอยู่เหนือสุดของ warnings
     เพราะเป็นเรื่องข้อมูลหาย ไม่ใช่เรื่องรายละเอียดปลีกย่อย */
  const dropped = unsupportedCollections(raw);

  const db = normalizeBackup(raw);
  const shop = db.shop as Record<string, any>;
  const ctx: ShopContext = { vatRate: shop.vatRate };
  const warnings: string[] = [...unsupportedWarnings(dropped)];

  const restoring = Boolean(options.intoTenantId);
  const tenantId = options.intoTenantId ?? randomUUID();
  const openingDate = options.openingStockDate ?? new Date().toISOString().slice(0, 10);
  const owned = !options.externalTransaction;

  if (owned) await client.query('begin');
  try {
    // ต้องตั้ง tenant ก่อนแทรกแถวแรก ไม่งั้น RLS ปฏิเสธทุกอย่างรวมถึงตาราง tenants เอง
    if (owned) await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);

    /* ---------- ร้าน ---------- */
    const taxId = digitsOnly(shop.taxId);
    if (shop.taxId && taxId.length !== 13) {
      warnings.push(`เลขประจำตัวผู้เสียภาษีของร้าน "${shop.taxId}" ไม่ครบ 13 หลัก — บันทึกเป็นค่าว่าง`);
    }
    if (shop.logo) {
      warnings.push('โลโก้เดิมฝังเป็น base64 ในไฟล์ — ต้องอัปโหลดขึ้น object storage แล้วตั้ง logo_url เอง');
    }

    await client.query(
      restoring
        ? `update tenants set name=$2, tax_id=$3, addr_text=$4, tel=$5, tel2=$6,
                  vat_rate=$7, wht_rate=$8, price_tier=$9, proposer_name=$10,
                  warranty_text=$11, ui_prefs=$12
             where id = $1`
        : `insert into tenants (id, name, tax_id, addr_text, tel, tel2, vat_rate, wht_rate,
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

    /* ---------- ผู้ใช้งาน ----------
       สิทธิ์ในไฟล์เดิมมีสองรูปแบบปนกัน แปลงครั้งเดียวตอนนำเข้าด้วย permsFromLegacy
       จะได้ไม่ต้องแบกทางเลือกสองทางไว้ในโค้ดที่ใช้งานประจำวัน */
    const userRows = restoring ? [] : (db.users ?? []).map((u: any) => [
      randomUUID(), tenantId, text(u.code), text(u.name), 'staff',
      JSON.stringify(permsFromLegacy(u.perms, (m) => SUB_KEYS[m] ?? [])),
      u.active !== false, text(u.id),
    ]);
    await insertRows(client, 'users',
      ['id', 'tenant_id', 'code', 'name', 'role', 'perms', 'active', 'legacy_id'], userRows);

    if (restoring) {
      warnings.push(
        'ผู้ใช้งานและรหัสผ่านเดิมในระบบยังอยู่เหมือนเดิม ไม่ได้เอาจากไฟล์ ' +
        '(ไฟล์สำรองไม่มีรหัสผ่าน ถ้าเขียนทับจะเข้าระบบไม่ได้ทั้งอู่)',
      );
    } else {
      if (userRows.length) {
        warnings.push(
          `นำเข้าผู้ใช้ ${userRows.length} คนโดยไม่เอารหัสผ่านเดิมมาด้วย ` +
          '(ไฟล์เดิมเก็บเป็นข้อความธรรมดา) — ต้องให้ทุกคนตั้งรหัสผ่านใหม่',
        );
      }
      warnings.push('ยังไม่มีบัญชีเจ้าของกิจการ — สร้างด้วย --owner-email= แล้วส่งลิงก์ตั้งรหัสผ่านให้เจ้าของอู่');
    }

    /* ---------- ลิขสิทธิ์ ---------- */
    if (db.lic?.expires && !restoring) {
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

    /* บาร์โค้ดห้ามซ้ำในตารางใหม่ แต่รุ่นเดิมไม่ได้บังคับ — ตัวหลังกลายเป็นค่าว่างแล้วเตือน */
    const seenBarcode = new Set<string>();
    let dupBarcode = 0;

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

      let barcode: string | null = text(p.barcode).trim().toUpperCase() || null;
      if (barcode && seenBarcode.has(barcode)) { barcode = null; dupBarcode++; }
      if (barcode) seenBarcode.add(barcode);

      productRows.push([
        id, tenantId, code, text(p.oem), barcode, text(p.name), text(p.unit),
        p.cat ? (catId.get(p.cat) ?? null) : null,
        money(num(p.cost)), money(num(p.pA)), money(num(p.pB)), money(num(p.pC)),
        qty(num(p.min)), qty(num(p.max)), text(p.id),
      ]);
    }
    if (dupBarcode) {
      warnings.push(
        `บาร์โค้ดซ้ำกัน ${dupBarcode} รายการ — เว้นว่างไว้ให้ตัวที่ซ้ำ ` +
        '(ตั้งใหม่ได้ที่หน้าสินค้า กดปุ่มสร้างให้)',
      );
    }
    await insertRows(client, 'products',
      ['id', 'tenant_id', 'code', 'oem', 'barcode', 'name', 'unit', 'category_id',
       'last_cost', 'price_a', 'price_b', 'price_c', 'qty_min', 'qty_max', 'legacy_id'],
      productRows);

    /* ---------- รูปสินค้า ---------- */
    const { rows: picRows, skipped: picSkipped } = picsFromBackup(db);
    const picValues: unknown[][] = [];
    for (const r of picRows) {
      const pid = productId.get(r.legacyProductId);
      if (!pid) continue;
      picValues.push([
        pid, tenantId, createHash('sha256').update(r.full).digest('hex'), r.mime,
        r.full, r.thumb, r.full.length + r.thumb.length,
      ]);
    }
    /* ความกว้างและสูงเว้นว่างไว้ — อ่านไม่ได้ที่นี่เพราะไม่มีตัวถอดรูปฝั่งเซิร์ฟเวอร์
       ใส่ค่าปลอมแล้วหลอกตัวเองว่ารู้ แย่กว่าการบอกตรง ๆ ว่าไม่ทราบ
       การอัปโหลดครั้งถัดไปจะเขียนค่าจริงทับให้เอง */
    if (picValues.length) {
      await insertRows(client, 'product_pics',
        ['product_id', 'tenant_id', 'sha', 'mime', 'full_bytes', 'thumb_bytes', 'bytes'],
        picValues);
    }
    if (picSkipped) {
      warnings.push(`รูปสินค้า ${picSkipped} รูปในไฟล์อ่านไม่ออก — ข้ามไป ข้อมูลอื่นครบ`);
    }

    /* ---------- สต๊อกยกมา ---------- */
    const stockRows = db.products
      .filter((p: any) => num(p.qty) !== 0)
      .map((p: any) => [
        randomUUID(), tenantId, productId.get(p.id), p.lastMove || openingDate,
        qty(num(p.qty)), money(num(p.cost)), money(num(p.qty) * num(p.cost)),
        'opening', 'ยอดยกมาจากโปรแกรมรุ่น HTML',
      ]);
    await insertRows(client, 'stock_moves',
      ['id', 'tenant_id', 'product_id', 'moved_on', 'qty_delta', 'unit_cost', 'cost_amount',
       'reason', 'note'],
      stockRows);

    /* ---------- ผู้ติดต่อและรถ ---------- */
    const contactId = new Map<string, string>();
    const contactById = new Map<string, any>();
    const contactRows: unknown[][] = [];
    let badTaxIdCount = 0;
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

      /* เลขผู้เสียภาษีที่ไม่ครบ 13 หลักยังเก็บไว้ ไม่ลบทิ้ง — เป็นสิ่งที่ผู้ใช้กรอกเอง
         อาจเป็นเลขบัตรประชาชนหรือกรอกไม่จบ ทิ้งไปแล้วกู้ไม่ได้ แค่เตือนให้ไปแก้ */
      const contactTaxId = digitsOnly(c.taxId) || null;
      if (contactTaxId && contactTaxId.length !== 13) badTaxIdCount++;

      contactRows.push([
        id, tenantId, code, c.kind === 'vendor' ? 'vendor' : 'customer', type,
        text(c.prefix), firstName, lastName, orgName,
        contactTaxId,
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

    if (badTaxIdCount) {
      warnings.push(
        `ผู้ติดต่อ ${badTaxIdCount} รายมีเลขประจำตัวผู้เสียภาษีไม่ครบ 13 หลัก — ` +
        'เก็บค่าเดิมไว้ให้แล้ว แต่ต้องแก้ก่อนออกใบกำกับภาษีให้รายนั้น',
      );
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
    /**
     * คีย์ด้วยตัวออบเจกต์เอกสาร ไม่ใช่ legacy id
     *
     * uid() ของโปรแกรมเดิมคือ Math.random().toString(36).slice(2,10) ซึ่งไม่รับประกัน
     * ว่าไม่ซ้ำข้ามอาเรย์ ใบเสร็จกับใบซื้ออาจได้ id เดียวกันได้ ถ้าใช้ id เป็นคีย์
     * เอกสารใบหลังจะทับใบหน้าแล้วสองใบได้ uuid เดียวกัน → ชน primary key
     */
    const docUuid = new Map<any, string>();

    /**
     * ตารางใหม่บังคับ UNIQUE (tenant_id, kind, doc_no) แต่โปรแกรมเดิมไม่ได้บังคับอะไรเลย
     * ไฟล์จริงจึงมีเลขที่ซ้ำหรือว่างได้ — ต้องทำให้ไม่ชนโดยไม่ทิ้งเอกสารใบไหน
     */
    const takenDocNo = new Set<string>();
    let generatedNoCount = 0;
    let renamedNoCount = 0;

    const uniqueDocNo = (kind: string, raw: string): string => {
      let base = raw.trim();
      if (!base) {
        base = `${kind}-นำเข้า-${String(++generatedNoCount).padStart(4, '0')}`;
      }
      let candidate = base;
      let suffix = 1;
      while (takenDocNo.has(`${kind}|${candidate}`)) {
        suffix++;
        candidate = `${base}-${suffix}`;
      }
      if (candidate !== base) renamedNoCount++;
      takenDocNo.add(`${kind}|${candidate}`);
      return candidate;
    };
    const docRows: unknown[][] = [];
    const itemRows: unknown[][] = [];
    const paymentRows: unknown[][] = [];
    const missingProduct = new Set<string>();

    /** เตรียมแถวเอกสารหนึ่งใบ พร้อมรายการและการชำระเงิน */
    const addDoc = (
      d: any,
      kind: 'QT' | 'IV' | 'IVT' | 'RC' | 'PO' | 'EX',
      opts: {
        /** ออบเจกต์เอกสารต้นทาง (ใบเสนอราคา/ใบส่งมอบ) ไม่ใช่ id */
        parent?: any;
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
      const id = docUuid.get(d)!;
      const t = opts.totals;

      docRows.push([
        id, tenantId, kind, uniqueDocNo(kind, text(d.no)), d.date, opts.status,
        opts.parent ? (docUuid.get(opts.parent) ?? null) : null,
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
        `${kind}:${text(d.id)}`,
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

    // จองรหัสให้ทุกเอกสารก่อน เพื่อให้ผูก parent ได้โดยไม่ต้องสนลำดับ
    for (const d of [...db.quotes, ...db.invoices, ...db.receipts, ...db.purchases, ...db.expenses]) {
      docUuid.set(d, randomUUID());
    }

    // หา parent ต้องมองในอาเรย์ที่ถูกต้องเท่านั้น — quoteId ชี้ใบเสนอราคา invId ชี้ใบส่งมอบ
    const quoteByLegacy = new Map<string, any>(db.quotes.map((q: any) => [q.id, q]));
    const invoiceByLegacy = new Map<string, any>(db.invoices.map((i: any) => [i.id, i]));
    if (quoteByLegacy.size < db.quotes.length || invoiceByLegacy.size < db.invoices.length) {
      warnings.push('พบเอกสารที่มี id ซ้ำกันในไฟล์ — การเชื่อมโยงเอกสารบางใบอาจไม่ครบ');
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
        parent: inv.quoteId ? quoteByLegacy.get(inv.quoteId) : null,
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
        parent: (r.invId ? invoiceByLegacy.get(r.invId) : null)
                ?? (r.quoteId ? quoteByLegacy.get(r.quoteId) : null),
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

    if (renamedNoCount) {
      warnings.push(
        `เลขที่เอกสารซ้ำ ${renamedNoCount} ใบ — เติมเลขต่อท้ายให้ไม่ชน ` +
        '(โปรแกรมเดิมไม่ได้บังคับว่าเลขที่ห้ามซ้ำ)',
      );
    }
    if (generatedNoCount) {
      warnings.push(`เอกสาร ${generatedNoCount} ใบไม่มีเลขที่ — ออกเลขให้ใหม่โดยขึ้นต้นด้วยชนิดเอกสาร`);
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

    /* ---------- ใบวางบิล ---------- */
    /**
     * ใบวางบิลอ้างเอกสารด้วย id ที่ใช้กันทั้งไฟล์ (bn.invIds)
     *
     * โปรแกรมเดิมอ่านจาก DB.invoices อย่างเดียว แต่ไฟล์ที่ส่งออกจากระบบใหม่
     * อาจอ้างใบเสร็จด้วย เพราะเราวางบิลจากใบค้างชำระทุกชนิด — จึงรวมทุกกลุ่มไว้ในแมป
     *
     * uid() ของโปรแกรมเดิมไม่รับประกันว่าไม่ซ้ำข้ามอาเรย์ ถ้าเจอ id ซ้ำให้ยึดใบแรก
     * แล้วเตือน ดีกว่าเดาว่าใบไหนคือใบที่ตั้งใจวางบิล
     */
    const uuidByLegacy = new Map<string, string>();
    let ambiguousDocId = 0;
    for (const d of [...db.invoices, ...db.receipts, ...db.quotes, ...db.purchases, ...db.expenses]) {
      const uuid = docUuid.get(d);
      const legacy = text(d?.id);
      if (!uuid || !legacy) continue;
      if (uuidByLegacy.has(legacy)) { ambiguousDocId++; continue; }
      uuidByLegacy.set(legacy, uuid);
    }

    const billnoteRows: unknown[][] = [];
    const billnoteDocRows: unknown[][] = [];
    const takenBillNo = new Set<string>();
    /* ใบหนึ่งอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ใบเดียว — ฐานบังคับด้วย partial unique index */
    const docTaken = new Set<string>();
    let missingBillDoc = 0;
    let dupBillDoc = 0;
    let renamedBillNo = 0;

    for (const b of db.billnotes ?? []) {
      const voided = b?.void === true;

      let no = text(b?.no).trim() || `BN-นำเข้า-${String(billnoteRows.length + 1).padStart(4, '0')}`;
      if (takenBillNo.has(no)) {
        let suffix = 1;
        const base = no;
        while (takenBillNo.has(no)) { suffix++; no = `${base}-${suffix}`; }
        renamedBillNo++;
      }
      takenBillNo.add(no);

      const docIds: string[] = [];
      for (const legacy of (Array.isArray(b?.invIds) ? b.invIds : [])) {
        const uuid = uuidByLegacy.get(text(legacy));
        if (!uuid) { missingBillDoc++; continue; }
        if (docIds.includes(uuid)) continue;
        if (!voided && docTaken.has(uuid)) { dupBillDoc++; continue; }
        if (!voided) docTaken.add(uuid);
        docIds.push(uuid);
      }

      const id = randomUUID();
      billnoteRows.push([
        id, tenantId, no,
        text(b?.date) || openingDate,
        text(b?.dueDate) || null,
        b?.custId ? (contactId.get(text(b.custId)) ?? null) : null,
        text(b?.name), digitsOnly(b?.taxId), text(b?.addr),
        text(b?.byWhom), text(b?.note),
        money(num(b?.total)),
        voided ? 'void' : 'issued',
        voided ? new Date().toISOString() : null,
      ]);
      for (const docId of docIds) billnoteDocRows.push([tenantId, id, docId, voided]);
    }

    await insertRows(client, 'billnotes',
      ['id', 'tenant_id', 'no', 'bill_date', 'due_date', 'party_id',
       'party_name', 'party_tax_id', 'party_addr_text', 'by_whom', 'note',
       'total_snapshot', 'status', 'voided_at'],
      billnoteRows);
    await insertRows(client, 'billnote_docs',
      ['tenant_id', 'billnote_id', 'doc_id', 'voided'], billnoteDocRows);
    await insertRows(client, 'billnote_sequences', ['tenant_id', 'period', 'last_no'],
      [[tenantId, '', Math.max(0, Math.trunc(num(db.seq?.bn)))]]);

    if (renamedBillNo) {
      warnings.push(`เลขที่ใบวางบิลซ้ำ ${renamedBillNo} ใบ — เติมเลขต่อท้ายให้ไม่ชน`);
    }
    if (missingBillDoc) {
      warnings.push(
        `ใบวางบิลอ้างถึงเอกสาร ${missingBillDoc} ใบที่ไม่มีในไฟล์แล้ว — ตัดออกจากใบวางบิล ` +
        '(ยอดที่แจ้งไปตอนวางบิลยังเก็บไว้ครบ)',
      );
    }
    if (dupBillDoc) {
      warnings.push(
        `เอกสาร ${dupBillDoc} ใบถูกวางบิลซ้ำมากกว่าหนึ่งใบ — คงไว้ในใบวางบิลใบแรก ` +
        '(ระบบใหม่ไม่ให้ใบเดียวอยู่ในใบวางบิลที่ยังไม่ยกเลิกสองใบ ไม่งั้นจะเก็บเงินซ้ำ)',
      );
    }
    if (ambiguousDocId) {
      warnings.push(
        `มีเอกสาร ${ambiguousDocId} ใบที่ใช้ id เดิมซ้ำกับใบอื่น — ` +
        'ใบวางบิลที่อ้าง id เหล่านั้นยึดเอกสารใบแรกที่เจอ',
      );
    }

    /* ---------- ใบเคลมสินค้า ---------- */
    /**
     * **ไม่สร้างแถวสต๊อกจากใบเคลมที่นำเข้า**
     *
     * ยอดคงเหลือในไฟล์เป็นยอดหลังหักเคลมไปแล้ว ตัวนำเข้าลงเป็นยอดยกมาตามนั้น
     * ถ้าสร้างแถวตัดสต๊อกตามใบเคลมอีก ของจะถูกหักสองรอบ แล้วสินค้าทุกตัวที่เคยเคลม
     * จะติดลบทันทีที่นำเข้าเสร็จ
     *
     * ต้นทุนที่ติดมากับใบ (it.cogs ของรุ่นเดิม) ถูกเก็บลง claim_items.cost_amount
     * งบกำไรขาดทุนอ่านจากคอลัมน์นั้นเมื่อไม่มีแถวในบัญชีสต๊อก ประวัติค่าใช้จ่ายจึงไม่หาย
     */
    const CLAIM_KIND: Record<string, string[]> = {
      customer: ['warranty', 'supplier', 'damage', 'other'],
      vendor: ['defect', 'wrong', 'damaged', 'return', 'other'],
    };

    const claimRows: unknown[][] = [];
    const claimItemRows: unknown[][] = [];
    const takenClaimNo = new Set<string>();
    const claimSeen = { customer: 0, vendor: 0 };
    let renamedClaimNo = 0;
    let fixedClaimKind = 0;
    let claimMissingProduct = 0;

    for (const cl of db.claims ?? []) {
      const side = cl?.side === 'vendor' ? 'vendor' : 'customer';
      claimSeen[side]++;

      let kind = text(cl?.kind);
      if (!CLAIM_KIND[side]!.includes(kind)) { kind = 'other'; fixedClaimKind++; }

      const prefix = side === 'vendor' ? 'VC' : 'CL';
      let no = text(cl?.no).trim()
        || `${prefix}-นำเข้า-${String(claimRows.length + 1).padStart(4, '0')}`;
      if (takenClaimNo.has(no)) {
        const b = no;
        let suffix = 1;
        while (takenClaimNo.has(no)) { suffix++; no = `${b}-${suffix}`; }
        renamedClaimNo++;
      }
      takenClaimNo.add(no);

      const voided = cl?.void != null;
      const veh = (cl?.veh && typeof cl.veh === 'object') ? cl.veh as Record<string, unknown> : {};
      const plate = [veh.plateA, veh.plateB].map(text).filter(Boolean).join(' ');
      const hasVeh = side === 'customer'
        && Object.values(veh).some((v) => text(v).trim() !== '');

      const id = randomUUID();
      claimRows.push([
        id, tenantId, no, side, kind,
        text(cl?.date) || openingDate,
        cl?.custId ? (contactId.get(text(cl.custId)) ?? null) : null,
        text(cl?.name), text(cl?.tel), text(cl?.refNo),
        hasVeh ? JSON.stringify(veh) : null,
        side === 'customer' ? plate : '',
        /* ฐานบังคับว่าต้องมีเหตุผล ไฟล์เก่าเว้นว่างได้ */
        text(cl?.reason).trim() || 'ไม่ได้ระบุเหตุผลไว้ในไฟล์เดิม',
        text(cl?.byWhom), text(cl?.note),
        voided ? 'void' : 'issued',
        voided ? new Date().toISOString() : null,
        voided ? text((cl.void as Record<string, unknown>)?.reason) : null,
      ]);

      const items = Array.isArray(cl?.items) ? cl.items : [];
      let line = 0;
      for (const it of items) {
        const q = num(it?.qty);
        if (!(q > 0)) continue;                      // ฐานบังคับ qty > 0
        const pid = it?.pid ? (productId.get(text(it.pid)) ?? null) : null;
        if (it?.pid && !pid) claimMissingProduct++;
        const cogs = num(it?.cogs);
        claimItemRows.push([
          randomUUID(), tenantId, id, ++line, pid,
          text(it?.code), text(it?.oem), text(it?.name), text(it?.unit),
          qty(q), money(num(it?.cost)),
          cogs > 0 ? money(cogs) : null,
        ]);
      }
    }

    await insertRows(client, 'claims',
      ['id', 'tenant_id', 'no', 'side', 'kind', 'claim_date', 'party_id',
       'party_name', 'party_tel', 'ref_no', 'vehicle', 'vehicle_plate',
       'reason', 'by_whom', 'note', 'status', 'voided_at', 'voided_reason'],
      claimRows);
    await insertRows(client, 'claim_items',
      ['id', 'tenant_id', 'claim_id', 'line_no', 'product_id',
       'code', 'oem', 'name', 'unit', 'qty', 'unit_cost', 'cost_amount'],
      claimItemRows);
    await insertRows(client, 'claim_sequences', ['tenant_id', 'side', 'period', 'last_no'], [
      [tenantId, 'customer', '', Math.max(0, Math.trunc(num(db.seq?.cl)), claimSeen.customer)],
      [tenantId, 'vendor', '', Math.max(0, Math.trunc(num(db.seq?.vc)), claimSeen.vendor)],
    ]);

    if (renamedClaimNo) {
      warnings.push(`เลขที่ใบเคลมซ้ำ ${renamedClaimNo} ใบ — เติมเลขต่อท้ายให้ไม่ชน`);
    }
    if (fixedClaimKind) {
      warnings.push(
        `ใบเคลม ${fixedClaimKind} ใบมีประเภทที่ระบบใหม่ไม่รู้จัก — ตั้งเป็น "อื่น ๆ" ให้ ` +
        '(เหตุผลที่กรอกไว้ยังอยู่ครบ)',
      );
    }
    if (claimMissingProduct) {
      warnings.push(
        `บรรทัดในใบเคลม ${claimMissingProduct} รายการอ้างถึงสินค้าที่ไม่มีในทะเบียนแล้ว — ` +
        'บันทึกเป็นรายการที่ไม่ผูกทะเบียน (ชื่อ จำนวน และต้นทุนยังอยู่ครบ)',
      );
    }
    if (claimRows.length) {
      warnings.push(
        `ใบเคลม ${claimRows.length} ใบถูกนำเข้าโดย**ไม่ตัดสต๊อกซ้ำ** — ` +
        'ยอดคงเหลือที่ยกมาเป็นยอดหลังหักเคลมไปแล้ว มูลค่าที่จ่ายออกยังขึ้นในงบตามเดิม',
      );
    }

    /* ---------- ใบตรวจนับสต๊อก ---------- */
    /**
     * **ไม่สร้างแถวสต๊อกจากใบตรวจนับที่นำเข้า** ด้วยเหตุผลเดียวกับใบเคลม —
     * ยอดคงเหลือในไฟล์เป็นยอดหลังปรับตามผลตรวจนับไปแล้ว ปรับซ้ำจะเพี้ยนสองรอบ
     *
     * บรรทัดที่อ้างสินค้าที่ถูกลบไปแล้วต้องตัดทิ้ง เพราะ product_id เป็น not null
     * — การนับของที่ไม่มีในทะเบียนไม่มีความหมาย ต่างจากใบเคลมที่ยังเก็บชื่อไว้ได้
     */
    const countRows: unknown[][] = [];
    const countItemRows: unknown[][] = [];
    const takenCountNo = new Set<string>();
    let renamedCountNo = 0;
    let countMissingProduct = 0;
    let countDupProduct = 0;

    for (const ct of db.counts ?? []) {
      let no = text(ct?.no).trim()
        || `CT-นำเข้า-${String(countRows.length + 1).padStart(4, '0')}`;
      if (takenCountNo.has(no)) {
        const b = no;
        let suffix = 1;
        while (takenCountNo.has(no)) { suffix++; no = `${b}-${suffix}`; }
        renamedCountNo++;
      }
      takenCountNo.add(no);

      const applied = ct?.applied === true;
      const id = randomUUID();
      countRows.push([
        id, tenantId, no,
        text(ct?.date) || openingDate,
        text(ct?.note),
        applied ? 'applied' : 'draft',
        applied ? new Date().toISOString() : null,
      ]);

      const seenProduct = new Set<string>();
      let line = 0;
      for (const it of (Array.isArray(ct?.items) ? ct.items : [])) {
        const pid = it?.pid ? productId.get(text(it.pid)) : null;
        if (!pid) { countMissingProduct++; continue; }
        if (seenProduct.has(pid)) { countDupProduct++; continue; }
        seenProduct.add(pid);

        /* ช่องว่างต้องยังเป็นช่องว่าง ไม่ใช่ศูนย์ — ความต่างนี้คือทั้งหมดของโมดูลนี้ */
        const raw = it?.cnt;
        const counted = (raw === null || raw === undefined || String(raw).trim() === '')
          ? null : qty(num(raw));

        countItemRows.push([
          randomUUID(), tenantId, id, ++line, pid, counted,
          applied ? qty(num(it?.sys)) : null,
          applied ? money(num(it?.cost)) : null,
        ]);
      }
    }

    await insertRows(client, 'stock_counts',
      ['id', 'tenant_id', 'no', 'count_date', 'note', 'status', 'applied_at'],
      countRows);
    await insertRows(client, 'stock_count_items',
      ['id', 'tenant_id', 'count_id', 'line_no', 'product_id',
       'counted_qty', 'system_qty', 'unit_cost'],
      countItemRows);
    await insertRows(client, 'stock_count_sequences', ['tenant_id', 'period', 'last_no'],
      [[tenantId, '', Math.max(0, Math.trunc(num(db.seq?.ct)), countRows.length)]]);

    if (renamedCountNo) {
      warnings.push(`เลขที่ใบตรวจนับซ้ำ ${renamedCountNo} ใบ — เติมเลขต่อท้ายให้ไม่ชน`);
    }
    if (countMissingProduct) {
      warnings.push(
        `บรรทัดในใบตรวจนับ ${countMissingProduct} รายการอ้างถึงสินค้าที่ไม่มีในทะเบียนแล้ว — ` +
        'ตัดออกจากใบ (การนับของที่ไม่มีในทะเบียนไม่มีความหมาย)',
      );
    }
    if (countDupProduct) {
      warnings.push(
        `สินค้าตัวเดียวถูกนับซ้ำในใบเดียวกัน ${countDupProduct} รายการ — คงไว้บรรทัดแรก`,
      );
    }
    if (countRows.length) {
      warnings.push(
        `ใบตรวจนับ ${countRows.length} ใบถูกนำเข้าโดย**ไม่ปรับสต๊อกซ้ำ** — ` +
        'ยอดคงเหลือที่ยกมาเป็นยอดหลังปรับตามผลตรวจนับไปแล้ว',
      );
    }

    /* ---------- ชื่อรายการที่สั่งไม่ให้เตือน ---------- */
    const ignoredRows = [...new Set((db.ignoredItems ?? []).map(normName))]
      .filter(Boolean)
      .map((n) => [tenantId, n]);
    await insertRows(client, 'ignored_item_names', ['tenant_id', 'name_norm'], ignoredRows);

    if (owned) await client.query('commit');

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
        billnotes: billnoteRows.length,
        claims: claimRows.length,
        counts: countRows.length,
      },
      warnings,
    };
  } catch (err) {
    if (owned) await client.query('rollback');
    throw err;
  }
}

/** บวกวันแบบเดียวกับ addDays() ของโปรแกรมเดิม */
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
