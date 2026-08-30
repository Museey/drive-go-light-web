# DriveGoLight! Web

เว็บแอปบริหารงานอู่ซ่อมรถยนต์ — เขียนใหม่จากโปรแกรมรุ่นไฟล์ HTML เดี่ยว
ให้เป็น Next.js fullstack + Postgres

โปรแกรมรุ่นเดิมยังเป็นสินค้าที่ขายอยู่ ไม่ได้เลิกใช้ — แผนคือขายคู่กัน
(เว็บสำหรับอู่ที่ต้องการใช้หลายเครื่อง · ไฟล์ offline สำหรับอู่ที่เน็ตไม่ดีหรือไม่อยากฝากข้อมูลไว้บนเซิร์ฟเวอร์)

## โครงสร้าง

```
apps/web/          เว็บแอป Next.js (App Router)
db/                สคีมา Postgres + แผนที่การย้ายข้อมูลจากไฟล์เดิม
packages/core      สูตรคำนวณเงินและภาษี — TypeScript ล้วน ไม่พึ่ง DOM/DB
packages/importer  นำเข้าไฟล์สำรอง JSON ของโปรแกรมรุ่นเดิมเข้า Postgres
tools/             สคริปต์สร้างไฟล์สำรองชุดทดสอบ
legacy/            สำเนาตรึงรุ่นของโปรแกรมเดิม ใช้เป็นฐานอ้างอิงของเทสต์
```

## เริ่มต้น

ต้องใช้ Node 20 ขึ้นไป (ดู `.nvmrc`)

```bash
nvm use && npm install
```

```bash
npm test
```

เทสต์ของ `packages/importer` ต้องมี Postgres ถ้าไม่ตั้ง `DATABASE_URL` จะข้ามทั้งชุด

```bash
docker run -d --name dgl_pg -e POSTGRES_PASSWORD=x -e POSTGRES_DB=dgl -p 5433:5432 postgres:16-alpine
```

```bash
DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test
```

## เปิดเว็บดูข้อมูลจริง

เตรียมฐานข้อมูลและนำเข้าข้อมูลตัวอย่าง

```bash
docker run -d --name dgl_pg -e POSTGRES_PASSWORD=x -e POSTGRES_DB=dgl -p 5433:5432 postgres:16-alpine
```

```bash
psql postgresql://postgres:x@localhost:5433/dgl -v ON_ERROR_STOP=1 -f db/001_init.sql -f db/app-role.sql
```

```bash
npm run fixture && npm run build -w @drivegolight/core && npm run build -w @drivegolight/importer
```

```bash
node packages/importer/dist/cli.js fixtures/demo-backup.json --url=postgresql://postgres:x@localhost:5433/dgl
```

คัดลอก `apps/web/.env.example` เป็น `apps/web/.env.local` แล้วสั่ง

```bash
npm run dev
```

## การตัดสินใจหลักที่ยึดไว้

**ไม่แยก backend เป็น Go** — เขียน TypeScript ทั้งก้อน เพราะสูตรภาษี (VAT ยกยอด,
หัก ณ ที่จ่าย, ยอดรวม) ต้องใช้ร่วมกับโปรแกรมรุ่น offline ที่เป็น JavaScript
ถ้ามีสองภาษาจะกลายเป็นสูตรสองชุดที่วันหนึ่งให้เลขไม่ตรงกันแล้วหาสาเหตุไม่เจอ

**1 บัญชีผู้ใช้ = 1 อู่** — `users` ผูกกับ `tenant_id` เดียว ยังไม่รองรับผู้ใช้ที่อยู่หลายอู่

**ทุก query ต้องผ่าน `withTenant()`** — `app.tenant_id` ตั้งแบบ local ซึ่งมีผลเฉพาะในทรานแซกชัน
เรียก `pool.query()` ตรง ๆ แล้ว RLS จะกรองทุกแถวออกหมด และแอปจะไม่ยอมเริ่มทำงาน
ถ้าต่อฐานข้อมูลด้วย role ที่ข้าม RLS ได้ (superuser หรือ BYPASSRLS) เพราะกรณีนั้น
ข้อมูลจะรั่วข้ามอู่โดยไม่มีอาการอะไรให้เห็นเลย

**สูตรภาษีพอร์ตมาแบบตรงตัว** — `packages/core` ให้ผลเท่ากับโปรแกรมเดิมทุกบาททุกสตางค์
มีเทสต์เทียบกับโค้ดเดิมที่ดึงจาก `legacy/` อัตโนมัติ ถ้าเทสต์แดงแปลว่าพอร์ตผิด
**ห้ามแก้ค่าที่คาดหวังให้ผ่าน**

รายละเอียดอยู่ใน [`db/mapping.md`](db/mapping.md) · [`packages/core/README.md`](packages/core/README.md) ·
[`packages/importer/README.md`](packages/importer/README.md)

## ที่ยังไม่ได้ทำ

- **ระบบเข้าสู่ระบบจริง** — ตอนนี้ `/login` เป็นตัวสลับอู่สำหรับพัฒนาเท่านั้น
  ไม่มีการยืนยันตัวตน ห้ามขึ้น production ตามสภาพ
  ของจริงต้องมีฟังก์ชัน `SECURITY DEFINER` ไว้หา `users` จากอีเมล
  (เพราะ `users` มี RLS จึงหาไม่เจอถ้ายังไม่รู้ว่าอยู่อู่ไหน) + ตรวจรหัสผ่านด้วย argon2
- เมนู 02 · 04–08 ยังไม่ได้ทำ — ทำแล้วเฉพาะหน้าแรกกับรายรับ (อ่านอย่างเดียว)
- ยังสร้าง/แก้เอกสารไม่ได้ · ยังพิมพ์ไม่ได้
- ตาราง `vat_periods` สำหรับปิดงวด ภ.พ.30
