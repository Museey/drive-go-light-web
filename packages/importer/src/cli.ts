#!/usr/bin/env node
/**
 * นำเข้าไฟล์สำรองข้อมูล และสร้างบัญชีเจ้าของกิจการ
 *
 * นำเข้าไฟล์
 *   node dist/cli.js ./drivegolight-backup-2026-08-28.json \
 *     --url=postgresql://user:pass@host:5432/dgl \
 *     --name="อู่ ช่างเอ ออโต้เซอร์วิส" \
 *     --owner-email=owner@example.com
 *
 * สร้างบัญชีเจ้าของให้อู่ที่นำเข้าไปแล้ว
 *   node dist/cli.js --tenant=<uuid> --owner-email=owner@example.com --url=...
 *
 * ตัวเลือก
 *   --url=...            connection string (ถ้าไม่ใส่ใช้ตัวแปรแวดล้อม DATABASE_URL)
 *   --name=...           ชื่ออู่ (ถ้าไม่ใส่ใช้ shop.name จากไฟล์)
 *   --opening-date=...   วันที่ลงยอดสต๊อกยกมา (ค่าตั้งต้น = วันนี้)
 *   --owner-email=...    สร้างบัญชีเจ้าของกิจการแล้วพิมพ์ลิงก์ตั้งรหัสผ่าน
 *   --owner-name=...     ชื่อเจ้าของกิจการ
 *   --app-url=...        ที่อยู่เว็บสำหรับประกอบลิงก์ (ค่าตั้งต้น http://localhost:3100)
 *   --dry-run            ตรวจไฟล์และคำนวณยอดให้ดู แต่ไม่เขียนลงฐานข้อมูล
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { importBackup } from './import.js';
import { normalizeBackup, validateBackup } from './normalize.js';
import { createOwner, setupUrl } from './owner.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const existingTenant = arg('tenant');
const ownerEmail = arg('owner-email');
const appUrl = arg('app-url') ?? 'http://localhost:3100';

if (!file && !existingTenant) {
  console.error(
    'ใช้: node dist/cli.js <ไฟล์สำรอง.json> [--url=...] [--name=...] [--owner-email=...] [--dry-run]\n' +
    '     node dist/cli.js --tenant=<uuid> --owner-email=... [--url=...]',
  );
  process.exit(1);
}

let raw: any = null;

if (file) {
  raw = JSON.parse(readFileSync(file, 'utf8'));

  const problems = validateBackup(raw);
  if (problems.length) {
    console.error(`ไฟล์สำรองข้อมูลไม่ถูกต้อง พบปัญหา ${problems.length} จุด:`);
    problems.slice(0, 20).forEach((p) => console.error('  - ' + p));
    if (problems.length > 20) console.error(`  ...และอีก ${problems.length - 20} จุด`);
    process.exit(1);
  }

  const db = normalizeBackup(raw);
  console.log(`ไฟล์: ${file}`);
  console.log(`ร้าน: ${db.shop?.name} · VAT ${db.shop?.vatRate}%`);
  console.log(
    `ข้อมูล: สินค้า ${db.products.length} · ผู้ติดต่อ ${db.customers.length} · ` +
    `ใบเสนอราคา ${db.quotes.length} · ใบส่งมอบ ${db.invoices.length} · ` +
    `ใบเสร็จ ${db.receipts.length} · ใบซื้อ ${db.purchases.length} · ค่าใช้จ่าย ${db.expenses.length}`,
  );

  if (process.argv.includes('--dry-run')) {
    console.log('\n--dry-run: ไฟล์ผ่านการตรวจ ไม่ได้เขียนลงฐานข้อมูล');
    process.exit(0);
  }
}

const url = arg('url') ?? process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องระบุ --url= หรือตั้งตัวแปรแวดล้อม DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  let tenantId = existingTenant ?? '';

  if (raw) {
    const result = await importBackup(client, raw, {
      tenantName: arg('name'),
      openingStockDate: arg('opening-date'),
    });
    tenantId = result.tenantId;

    console.log(`\nนำเข้าสำเร็จ · tenant_id = ${result.tenantId}`);
    for (const [k, v] of Object.entries(result.counts)) console.log(`  ${k.padEnd(12)} ${v}`);

    if (result.warnings.length) {
      console.log(`\nเรื่องที่ต้องจัดการต่อ (${result.warnings.length} ข้อ):`);
      result.warnings.forEach((w) => console.log('  ⚠ ' + w));
    }
  }

  if (ownerEmail) {
    const owner = await createOwner(client, tenantId, ownerEmail, arg('owner-name') ?? '');

    if (!owner.setupToken) {
      console.log(`\nอู่นี้มีบัญชีเจ้าของกิจการอยู่แล้ว — ไม่ได้สร้างใหม่`);
    } else {
      console.log('\n─── บัญชีเจ้าของกิจการ ───');
      console.log(`  อีเมล      ${ownerEmail}`);
      console.log(`  ลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว หมดอายุ ${owner.expiresAt!.toLocaleDateString('th-TH')})`);
      console.log(`  ${setupUrl(appUrl, owner.setupToken)}`);
      console.log('\n  ส่งลิงก์นี้ให้เจ้าของอู่ทางช่องทางที่ปลอดภัย ใครถือลิงก์ก็ตั้งรหัสผ่านได้');
    }
  } else if (raw) {
    console.log('\n  ยังไม่มีบัญชีเจ้าของกิจการ — สร้างด้วย --owner-email=...');
  }
} catch (err) {
  console.error('\nทำงานไม่สำเร็จ — ไม่มีข้อมูลค้างในฐานข้อมูล (rollback แล้ว)');
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
