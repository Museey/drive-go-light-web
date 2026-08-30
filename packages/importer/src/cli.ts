#!/usr/bin/env node
/**
 * นำเข้าไฟล์สำรองข้อมูลจากบรรทัดคำสั่ง
 *
 *   node dist/cli.js ./drivegolight-backup-2026-08-28.json \
 *     --url=postgresql://user:pass@host:5432/dgl \
 *     --name="อู่ ช่างเอ ออโต้เซอร์วิส"
 *
 * ตัวเลือก
 *   --url=...            connection string (ถ้าไม่ใส่ใช้ตัวแปรแวดล้อม DATABASE_URL)
 *   --name=...           ชื่ออู่ (ถ้าไม่ใส่ใช้ shop.name จากไฟล์)
 *   --opening-date=...   วันที่ลงยอดสต๊อกยกมา (ค่าตั้งต้น = วันนี้)
 *   --dry-run            ตรวจไฟล์และคำนวณยอดให้ดู แต่ไม่เขียนลงฐานข้อมูล
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { importBackup } from './import.js';
import { normalizeBackup, validateBackup } from './normalize.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('ใช้: node dist/cli.js <ไฟล์สำรอง.json> [--url=...] [--name=...] [--dry-run]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, 'utf8'));

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

const url = arg('url') ?? process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องระบุ --url= หรือตั้งตัวแปรแวดล้อม DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const result = await importBackup(client, raw, {
    tenantName: arg('name'),
    openingStockDate: arg('opening-date'),
  });

  console.log(`\nนำเข้าสำเร็จ · tenant_id = ${result.tenantId}`);
  for (const [k, v] of Object.entries(result.counts)) console.log(`  ${k.padEnd(12)} ${v}`);

  if (result.warnings.length) {
    console.log(`\nเรื่องที่ต้องจัดการต่อ (${result.warnings.length} ข้อ):`);
    result.warnings.forEach((w) => console.log('  ⚠ ' + w));
  }
} catch (err) {
  console.error('\nนำเข้าไม่สำเร็จ — ไม่มีข้อมูลค้างในฐานข้อมูล (rollback แล้ว)');
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
