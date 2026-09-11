/* สร้างอัตโนมัติจากโฟลเดอร์ db/ — ห้ามแก้ด้วยมือ
   สร้างใหม่ด้วย: node tools/gen-migrations.mjs
   มีเทสต์ตรวจว่าตรงกับโฟลเดอร์จริง (ops.test.ts) */

export const EXPECTED_MIGRATIONS: readonly string[] = [
  '001_init.sql',
  '002_auth.sql',
  '003_fifo.sql',
  '004_billnotes.sql',
  '005_claims.sql',
  '006_counts.sql',
  '007_perms.sql',
  '008_ops.sql',
  '009_edits.sql',
  '010_pics.sql',
  '011_ops_console.sql',
  '012_auth_rls.sql',
  '013_ops_grants.sql',
  '014_shop_bank.sql',
  '015_expiry.sql',
  '016_count_cost.sql',
  '017_view_security.sql',
  '018_unvoid.sql',
  '019_owner_perms.sql',
];
