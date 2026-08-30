# แผนที่การย้ายข้อมูล — ไฟล์สำรอง JSON เดิม → Postgres

อ้างอิงโครงสร้างเดิมจาก `legacy/drivegolight-3.6.html` (สำเนาตรึงรุ่นของโปรแกรมเดิม) — `validateBackupShape()`, `loadDB()`
และกลุ่มฟังก์ชัน `blank*()` ทั้งหมด

ไฟล์สำรองของลูกค้า 1 ไฟล์ = 1 แถวใน `tenants` เสมอ

## ตารางเทียบ

| ของเดิม (JSON) | ตารางใหม่ | หมายเหตุการแปลง |
|---|---|---|
| `shop` | `tenants` | `logo` (base64) → อัปโหลดขึ้น object storage แล้วเก็บ `logo_url` |
| `shop.ownerPass` | — | ของเดิมเป็น plaintext — **ไม่นำเข้าเลย** เจ้าของต้องสมัครบัญชีใหม่ผ่านหน้าเว็บ (importer เตือนเรื่องนี้ทุกครั้ง) |
| `users[]` | `users` | `pass` ทิ้ง ออกลิงก์ตั้งรหัสใหม่แทน · `perms{}` (object ของ boolean) → `perms text[]` เอาเฉพาะคีย์ที่เป็น true |
| `categories[]` (array ของ string) | `product_categories` | ตั้ง `sort_order` ตามลำดับใน array เดิม |
| `products[]` | `products` + `stock_moves` | `cost` → `last_cost` · `pA/pB/pC` → `price_a/b/c` · `min/max` → `qty_min/qty_max` · `cat` (ชื่อหมวดเป็น string) → หา `category_id` · **`qty` → สร้าง 1 แถวใน `stock_moves` reason='opening'** วันที่ `lastMove` |
| `customers[]` | `contacts` + `vehicles` | `kind` ใช้ได้ตรง ๆ (ของเดิมย้าย `vendors[]` เข้ามาแล้วใน `loadDB()`) · `vehicles[]` แตกออกเป็นตารางลูก |
| `vendors[]` | `contacts` (kind='vendor') | ไฟล์ที่ยังมี array นี้ค้างคือไฟล์เก่า ให้แปลงตามตรรกะ `loadDB()` แล้วรวมเข้า `contacts` |
| `quotes[]` | `documents` kind='QT' + `doc_items` | `status:'open'` → `'issued'` · `status:'billed'` → `'billed'` · `complaints[]`/`findings[]` เข้าคอลัมน์ `text[]` |
| `invoices[]` | `documents` kind='IV' หรือ `'IVT'` | ใช้ `r.kind` ของเดิม (ไฟล์เก่าไม่มี → `loadDB()` เติม `'IVT'` ให้) |
| `receipts[]` | `documents` kind='RC' | ไฟล์เก่าไม่มี `kind` → เติม `'RC'` |
| `purchases[]` | `documents` kind='PO' | `invNo` → `ref_doc_no` · `vendorName/TaxId/Tel/Addr` → `party_*` · `received` → `goods_received` · **ไม่สร้าง `stock_moves` ย้อนหลัง** ดูข้อ 4 ด้านล่าง |
| `expenses[]` | `documents` kind='EX' | `cat` → `expense_cat` · `assetLife` → `asset_life_yrs` (เก็บเฉพาะหมวด asset) · `payeeName/TaxId/Tel/Addr` → `party_*` |
| `*.items[]` | `doc_items` | `pid` → `product_id` · `svc` → `is_service` · **ไฟล์เก่าไม่มี `svc` ใช้ `code === 'LAB'` แทน** ตาม `isServiceItem()` |
| `*.payments[]` | `payments` | `atIssue` → `at_issue` |
| `*.pay{}` (cash/transfer/card) | `payments` (`at_issue = true`) | แตกเป็นแถวละช่องทางเฉพาะที่ยอด > 0 · `pay.days`/`pay.due` → `credit_days`/`due_date` บนเอกสาร |
| `*.addr{}` | `party_addr` jsonb | โครงสร้าง 9 ฟิลด์เหมือนเดิม ไม่แตกเป็นคอลัมน์ เพราะใช้แค่พิมพ์ ไม่เคย query |
| `*.veh{}` | `vehicle` jsonb + `vehicle_plate` | `vehicle_plate` = `plateA + ' ' + plateB` ไว้ค้นหา |
| `seq{}` | `doc_sequences` | `q→QT · iv→IV · ivt→IVT · r→RC · p→PO · e→EX` (คีย์ `c`/`v` เป็นเลขรหัสลูกค้า/ผู้ขาย เก็บแยก) |
| `ignoredItems[]` | `ignored_item_names` | |
| `ui{}` | `tenants.ui_prefs` | |
| `lic{}` | `subscriptions` | `expires` → `expires_on` · ตัว key ทิ้ง ไม่ต้องเก็บ |
| `schemaVersion`, `lastExportAt` | — | ไม่ต้องย้าย |

## จุดที่ต้องคำนวณใหม่ตอน import ไม่ใช่ copy

ของเดิมคำนวณยอดสด ๆ ตอน render ทุกครั้ง ไม่ได้เก็บไว้ ตารางใหม่เก็บยอดไว้บนเอกสาร
เพราะเอกสารที่ออกไปแล้วต้องไม่เปลี่ยนตาม `shop.vatRate` ที่แก้ทีหลัง

ตอน import ให้เรียกฟังก์ชันใน `packages/core` (ที่ port มาจากของเดิม) แล้วเขียนผลลง
`subtotal / net_amount / vat_amount / wht_amount / grand_total / payable`

| คอลัมน์ | ฟังก์ชันเดิม |
|---|---|
| `subtotal`, `net_amount`, `vat_amount`, `grand_total` | `totalsOf()` |
| `wht_amount` (เอกสารขาย) | `whtBaseOf()` × `whtRate` |
| `wht_amount`, `payable` (ค่าใช้จ่าย) | `exTotals()` |
| `payable` (ใบซื้อ) | `poTotals()` — ฝั่งซื้อไม่หัก ณ ที่จ่าย เท่ากับ `grand_total` |
| `due_date` | `dueDate()` / `poDue()` / `exDue()` |
| `vat_rate` | `shop.vatRate` ณ ตอน import (ของเดิมไม่ได้เก็บไว้ในเอกสาร — ค่าที่ได้จึงเป็นค่าปัจจุบัน ยอมรับความคลาดเคลื่อนนี้ครั้งเดียว) |

**เขียน test เทียบก่อนปล่อยจริง**: import ไฟล์สำรองของลูกค้าจริง แล้วเทียบยอดรวมทุกใบ
กับที่โปรแกรมเดิมแสดง ถ้าไม่ตรงแม้บาทเดียวคือ port สูตรผิด

## ข้อควรระวังของไฟล์เก่า

`loadDB()` มีการเติมค่าและแปลงโครงสร้างหลายจุดสำหรับไฟล์รุ่นก่อน — importer ต้องทำซ้ำทั้งหมด
ก่อนเริ่มแปลง ไม่งั้นไฟล์เก่าจะพังกลางทาง

- `customers[].kind` ไม่มี → เติม `'customer'`
- `vendors[]` ที่ยังไม่ว่าง → ย้ายเข้า `customers` เป็น `kind:'vendor'`
- `vehicles[].engineNo` / `chassisNo` ไม่มี → เติม `''`
- `receipts[].kind` ไม่มี → `'RC'` · `invoices[].kind` ไม่มี → `'IVT'`
- `purchases`/`expenses` ที่ยังใช้ `terms:'cash'` → `paidNow = true`
- `users[].perms` รุ่นเก่าใช้คีย์ `quote`/`receipt`/`purchase` → รวมเป็น `income`/`expense` ตาม `migrateUserPerms()`

## เรื่องที่ต้องตัดสินใจก่อนเขียน importer

1. **เลขที่เอกสารรีเซ็ตรายเดือนหรือไม่** — ของเดิมเลขที่เป็น `IVT-202608-001` มี YYYYMM อยู่ในเลข
   แต่ `DB.seq` เป็นตัวนับรวมที่ไม่เคยรีเซ็ต เดือนถัดไปจึงได้ `IVT-202609-002` ไม่ใช่ `001`
   ตารางใหม่รองรับทั้งสองแบบผ่านคอลัมน์ `period` (`''` = นับต่อเนื่องแบบเดิม, `'YYYYMM'` = รีเซ็ตรายเดือน)
   **ผมแนะนำให้คงพฤติกรรมเดิมไว้** — ลูกค้าที่ย้ายมาจะได้ไม่เจอเลขที่ซ้ำกับเอกสารที่ออกไปแล้ว

2. **1 บัญชีผู้ใช้ อยู่ได้หลายอู่ไหม** — ถ้าอนาคตมีอู่หลายสาขา หรือให้นักบัญชีภายนอกเข้าดูได้
   ต้องแยกเป็น `accounts` (ตัวตน + รหัสผ่าน) กับ `memberships` (ใครอยู่อู่ไหน สิทธิ์อะไร)
   สคีมานี้ยังผูก `users` ไว้กับ `tenant_id` เดียว — เปลี่ยนทีหลังได้แต่เจ็บ ตัดสินใจก่อนเริ่มดีกว่า

3. **โลโก้** — ของเดิมฝัง base64 ในไฟล์ ต้องมี object storage (S3/R2/Supabase Storage) ตั้งแต่วันแรก
   ไม่ควรเก็บ base64 ลง Postgres

4. **ยอดสต๊อกเริ่มต้น** — `products.qty` ของเดิมเป็นยอดสะสมที่ผ่านการ `+=`/`-=` มาแล้ว
   ตาราง `stock_moves` ไม่มีทางสร้างประวัติย้อนหลังให้ตรงได้ จึงลงเป็นรายการ `opening` ก้อนเดียว
   แล้วเริ่มนับประวัติจริงตั้งแต่วันย้ายระบบ — ต้องบอกลูกค้าให้ชัด

   **ห้ามสร้าง `stock_moves` จากใบซื้อ/ใบเสร็จเก่าเพิ่มด้วย** เพราะ `products.qty` รวมผลของ
   เอกสารเหล่านั้นไปแล้ว ถ้าลงทั้งสองอย่างยอดคงเหลือจะกลายเป็นสองเท่า
   (importer มีเทสต์ยืนยันว่ายอดคงเหลือหลังนำเข้าตรงกับ `products.qty` ทุกตัว)

5. **ภ.พ.30 / เครดิตภาษียกยอด** — `vatChain()` เดิมคำนวณสดจากเอกสารทั้งหมด
   ถ้าจะให้ยื่นภาษีจริงได้ ต้องมีตาราง `vat_periods` ที่ "ปิดงวด" ล็อกตัวเลขไว้ ไม่ให้ย้อนไปแก้เอกสารเดือนที่ยื่นแล้ว
   ยังไม่ใส่ในสคีมานี้ — เป็นงานเฟส 2 แต่ควรวางแผนไว้

## สิ่งที่แก้ให้แล้วในสคีมานี้ (ต่างจากของเดิมโดยตั้งใจ)

- **สต๊อกเป็นบัญชีเดินสะพัด** — ของเดิม `products.qty` ถูกบวกตอนบันทึกใบซื้อ ([drivegolight.html:3766](../legacy/drivegolight-3.6.html:3766))
  และลบตอนออกใบเสร็จ ([:5247](../legacy/drivegolight-3.6.html:5247)) ถ้าแก้หรือลบเอกสารทีหลัง ยอดเพี้ยนเงียบ ๆ ตรวจย้อนไม่ได้
- **เลขที่เอกสารออกใน transaction** — ของเดิม `DB.seq` นับในเครื่อง สองคนกดพร้อมกันได้เลขซ้ำ
- **เอกสารยกเลิกด้วย `status='void'`** ไม่ลบทิ้ง — เอกสารภาษีที่ออกแล้วลบไม่ได้ตามกฎหมาย
- **`payments` เป็นตารางจริง** — ของเดิมเก็บเป็น array ในเอกสาร รวมยอดค้างชำระทั้งร้านต้องวนทุกใบ
- **รหัสผ่านเป็น hash** — ของเดิมทั้ง `users[].pass` และ `shop.ownerPass` เป็น plaintext
- **ลิขสิทธิ์อยู่ฝั่ง server** — `makeKey()`/`checkKey()` ([:770](../legacy/drivegolight-3.6.html:770)) ปลอมรหัสได้จาก DevTools
  ตามที่คอมเมนต์ในโค้ดเดิมเตือนไว้เอง

## รันสคีมา

```bash
docker run -d --name dgl_pg -e POSTGRES_PASSWORD=x -e POSTGRES_DB=dgl -p 5432:5432 postgres:16-alpine
```

```bash
psql "postgresql://postgres:x@localhost:5432/dgl" -v ON_ERROR_STOP=1 -f db/001_init.sql
```

แอปต้องต่อด้วย role ที่ **ไม่ใช่** superuser และตั้ง tenant ทุก request ก่อน query
ไม่งั้น RLS ถูกข้ามทั้งหมด

```sql
SET LOCAL app.tenant_id = '<uuid ของอู่>';
```

`SET LOCAL` ไม่รับพารามิเตอร์ผูกค่า ถ้าส่ง uuid มาจากตัวแปรต้องใช้ `set_config()` แทน

```sql
SELECT set_config('app.tenant_id', $1, true);   -- true = มีผลเฉพาะในทรานแซกชันนี้
```

## ⚠ คอลัมน์ date กับเขตเวลา

ไดรเวอร์ `pg` คืนคอลัมน์ `date` มาเป็น JS `Date` ที่เที่ยงคืนตามเวลาเครื่อง
เรียก `.toISOString()` ต่อเมื่อไหร่ ได้วันที่ก่อนหน้า 1 วันทันทีในเขตเวลาไทย (UTC+7)
ตั้งค่านี้ครั้งเดียวตอนเริ่มแอป

```ts
pg.types.setTypeParser(1082, (v) => v);   // date → สตริง 'YYYY-MM-DD'
```
