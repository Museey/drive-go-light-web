/**
 * DriveGo Light Plus กับฐานข้อมูลจริง (ไมเกรชัน 041) — ต่อในนาม role ของแอป อ่านเขียนผ่าน RLS เหมือนเครื่องจริง
 *
 *   แพ็กเกจ      อู่ไหนเป็น Plus ตัดสินจาก subscriptions.plan แถวที่หมดอายุช้าที่สุด
 *   เงินเดือน     เปิดงวด ค่าเสนอ บันทึก ยอดสุทธิที่ฐานคิดเอง การกันเดือนซ้ำ
 *   นัดหมาย      มุมมองสี่แบบ ตัวนับ การเติมจากทะเบียนลูกค้า และ **รอดจากการกู้คืนไฟล์สำรอง**
 *   เอกสารภาษี   ยอดตรงกับเอกสารต้นทางและตรงกับรายงานยอดขายเดิม (เงื่อนไขชุดเดียวกัน)
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { freshSchema, grantAppRole } from '../../../tools/test-schema.mjs';
import {
  appointmentCountsWith, appointmentPrefillWith, getAppointmentWith, listAppointmentsWith,
  saveAppointmentWith, setAppointmentNotifiedWith, setAppointmentStatusWith,
} from '../src/lib/appointments-core';
import { lineNet } from '../src/lib/payroll-calc';
import {
  addMissingToRunWith, createRunWith, getRunWith, listEmployeesWith, listRunsWith, nextEmployeeCodeWith,
  removeRunItemWith, saveEmployeeWith, saveRunWith, setEmployeeActiveWith, type EmployeeInput,
} from '../src/lib/payroll-core';
import { assertPlusWith, PLAN_LIGHT, PLAN_PLUS, PlusRequiredError, plusWith } from '../src/lib/plan-core';
import { previewBackup, restoreIntoTenant, wipeTenantData } from '../src/lib/restore-core';
import { exportBackupWith } from '../src/lib/backup';
import {
  payTaxWith, SALES_DOCS, vatInWith, vatOutWith, whtCertForDocWith, whtCertForEmployeeWith, whtPaidWith,
} from '../src/lib/tax-core';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const TODAY = '2026-11-24';

const emp = (over: Partial<EmployeeInput>): EmployeeInput => ({
  code: 'EMP-001', name: 'สมชาย ใจดี', position: 'ช่างยนต์', empType: 'full', taxId: '1234567890123',
  addrText: '1 ถ.ทดสอบ', tel: '', baseSalary: 18000, ssoEnabled: true, whtRate: 3,
  bankName: '', bankAccountNo: '', startedOn: null, note: '', ...over,
});

describe.skipIf(!DB_URL)('DriveGo Light Plus กับฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let theirs: string;

  const as = (tenant: string) => app.query(`select set_config('app.tenant_id', $1, false)`, [tenant]);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await grantAppRole(admin);

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    /* อู่ของเรามีเอกสารจริงจากไฟล์ชุดทดสอบ — รายงานภาษีต้องเทียบกับเอกสารที่หลากหลาย ไม่ใช่สองใบที่ปั้นเอง */
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    mine = (await importBackup(app, fixture, { tenantName: 'อู่ของเรา', openingStockDate: '2026-08-28' })).tenantId;
    theirs = (await admin.query(`insert into tenants (name) values ('อู่อื่น') returning id`)).rows[0].id;
    await as(mine);
  }, 240_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  /* ------------------------------------------------------------------ */
  describe('แพ็กเกจ', () => {
    const sub = (tenant: string, plan: string, days: number) => admin.query(
      `insert into subscriptions (tenant_id, plan, started_on, expires_on)
       values ($1, $2, current_date, current_date + $3::int)`, [tenant, plan, days]);

    it('อู่ที่ยังทดลองใช้ (ไม่มีแถว subscriptions) เป็น Light — ตัวปิดประตูโยนข้อความชวนอัปเกรด', async () => {
      await admin.query(`delete from subscriptions`);
      expect(await plusWith(app)).toBe(false);
      await expect(assertPlusWith(app)).rejects.toBeInstanceOf(PlusRequiredError);
      await expect(assertPlusWith(app)).rejects.toThrow('Light Plus');
    });

    it('แพ็กเกจ Light ไม่ใช่ Plus', async () => {
      await sub(mine, PLAN_LIGHT, 100);
      expect(await plusWith(app)).toBe(false);
    });

    it('บันทึกแพ็กเกจ Plus ที่หมดอายุช้ากว่า — เป็น Plus ทันที', async () => {
      await sub(mine, PLAN_PLUS, 200);
      expect(await plusWith(app)).toBe(true);
      await expect(assertPlusWith(app)).resolves.toBeUndefined();
    });

    it('แพ็กเกจ Plus ของอู่อื่นไม่ทำให้อู่เราเป็น Plus และกลับกัน (RLS)', async () => {
      await admin.query(`delete from subscriptions`);
      await sub(theirs, PLAN_PLUS, 300);
      expect(await plusWith(app)).toBe(false);
      await as(theirs);
      expect(await plusWith(app)).toBe(true);
      await as(mine);
    });

    it('ลดแพ็กเกจ — แถว Light ที่หมดอายุช้ากว่าแถว Plus ทำให้กลับเป็น Light', async () => {
      await sub(mine, PLAN_PLUS, 100);
      expect(await plusWith(app)).toBe(true);
      await sub(mine, PLAN_LIGHT, 400);
      expect(await plusWith(app)).toBe(false);
      /* คืนเป็น Plus ให้เทสต์ที่เหลือ */
      await sub(mine, PLAN_PLUS, 500);
      expect(await plusWith(app)).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('เงินเดือนและพนักงาน', () => {
    let somchai: string;
    let somying: string;
    let runId: string;

    it('รหัสพนักงานถัดไปเริ่มที่ EMP-001 แล้วนับต่อจากเลขสูงสุด', async () => {
      expect(await nextEmployeeCodeWith(app)).toBe('EMP-001');
      somchai = (await saveEmployeeWith(app, emp({}))).id;
      somying = (await saveEmployeeWith(app, emp({
        code: 'EMP-007', name: 'สมหญิง รักงาน', taxId: '', baseSalary: 9000, ssoEnabled: false, whtRate: 0,
      }))).id;
      expect(await nextEmployeeCodeWith(app)).toBe('EMP-008');
    });

    it('รหัสซ้ำในอู่เดียวกันถูกปฏิเสธ แต่อู่อื่นใช้รหัสเดียวกันได้', async () => {
      await expect(saveEmployeeWith(app, emp({ name: 'คนซ้ำ' }))).rejects.toMatchObject({ code: '23505' });
      await as(theirs);
      await expect(saveEmployeeWith(app, emp({ name: 'พนักงานอู่อื่น' }))).resolves.toBeTruthy();
      await as(mine);
    });

    it('เลขผู้เสียภาษีที่ไม่ครบ 13 หลักถูกฐานข้อมูลปฏิเสธ', async () => {
      await expect(saveEmployeeWith(app, emp({ code: 'EMP-X', taxId: '123' })))
        .rejects.toMatchObject({ code: '23514' });
    });

    it('คนที่ปิดใช้งานไม่อยู่ในรายการตั้งต้น แต่ยังเรียกดูได้', async () => {
      const gone = (await saveEmployeeWith(app, emp({ code: 'EMP-009', name: 'คนลาออก' }))).id;
      await setEmployeeActiveWith(app, gone, false);
      expect((await listEmployeesWith(app)).map((e) => e.code)).toEqual(['EMP-001', 'EMP-007']);
      expect((await listEmployeesWith(app, { all: true })).map((e) => e.code))
        .toEqual(['EMP-001', 'EMP-007', 'EMP-009']);
    });

    it('เปิดงวด — ใส่เฉพาะคนที่ใช้งานอยู่ พร้อมค่าเสนอจากทะเบียน', async () => {
      runId = (await createRunWith(app, { period: '2026-11' })).id;
      const run = (await getRunWith(app, runId))!;
      expect(run.payDate).toBe('2026-11-30');
      expect(run.items.map((i) => [i.code, i.base, i.sso, i.wht, i.net])).toEqual([
        ['EMP-001', 18000, 875, 540, 16585],
        ['EMP-007', 9000, 0, 0, 9000],
      ]);
      /* ชื่อและเลขผู้เสียภาษีถูกตรึงไว้ในบรรทัด */
      expect(run.items[0]!.name).toBe('สมชาย ใจดี');
      expect(run.items[0]!.taxId).toBe('1234567890123');
    });

    it('เปิดงวดเดือนเดิมซ้ำได้ข้อความที่อ่านรู้เรื่อง · งวดผิดรูปแบบถูกปฏิเสธ', async () => {
      await expect(createRunWith(app, { period: '2026-11' })).rejects.toThrow('เปิดไว้แล้ว');
      await expect(createRunWith(app, { period: '2026-13' })).rejects.toThrow('ไม่ถูกต้อง');
    });

    it('อู่ที่ไม่มีพนักงานใช้งานอยู่เปิดงวดไม่ได้ และไม่ทิ้งงวดเปล่าไว้', async () => {
      await as(theirs);
      await admin.query(`update employees set active = false where tenant_id = $1`, [theirs]);
      await expect(createRunWith(app, { period: '2026-11' })).rejects.toThrow('ยังไม่มีพนักงาน');
      expect(await listRunsWith(app)).toEqual([]);
      await as(mine);
    });

    it('บันทึกงวด — ยอดสุทธิฐานข้อมูลคิดเอง ตรงกับสูตรฝั่งหน้าเว็บทุกบรรทัด', async () => {
      const run = (await getRunWith(app, runId))!;
      const edited = run.items.map((i) => (i.code === 'EMP-001'
        ? { id: i.id, base: 18000, overtime: 1500.5, otherIncome: 300, sso: 875, wht: 594.02, otherDeduct: 200, note: 'ล่วงเวลา 10 ชม.' }
        : { id: i.id, base: 9000, overtime: 0, otherIncome: 0, sso: 0, wht: 0, otherDeduct: 0, note: '' }));
      await saveRunWith(app, { id: runId, payDate: '2026-11-28', note: 'งวดปกติ', items: edited });

      const after = (await getRunWith(app, runId))!;
      expect(after.payDate).toBe('2026-11-28');
      for (const it of after.items) expect(it.net).toBe(lineNet(it));
      expect(after.items[0]!.net).toBe(18131.48);
      expect(after.items[0]!.note).toBe('ล่วงเวลา 10 ชม.');

      const [row] = await listRunsWith(app);
      expect(row).toMatchObject({ period: '2026-11', people: 2, income: 28800.5, sso: 875, wht: 594.02, net: 27131.48 });
    });

    it('ยอดหักมากกว่าเงินได้ถูกปฏิเสธก่อนเขียน — งวดยังเป็นค่าเดิม', async () => {
      const run = (await getRunWith(app, runId))!;
      const bad = run.items.map((i) => ({
        id: i.id, base: 100, overtime: 0, otherIncome: 0, sso: 0, wht: 0, otherDeduct: 500, note: '',
      }));
      await expect(saveRunWith(app, { id: runId, payDate: '2026-11-28', note: '', items: bad })).rejects.toThrow('มากกว่าเงินได้');
      expect((await getRunWith(app, runId))!.items[0]!.base).toBe(18000);
    });

    it('บรรทัดที่ไม่ใช่ของงวดนี้ถูกปฏิเสธ', async () => {
      await expect(saveRunWith(app, {
        id: runId, payDate: '2026-11-28', note: '',
        items: [{ id: '00000000-0000-4000-8000-000000000000', base: 1, overtime: 0, otherIncome: 0, sso: 0, wht: 0, otherDeduct: 0, note: '' }],
      })).rejects.toThrow('โหลดหน้าใหม่');
    });

    it('แก้ทะเบียนพนักงานทีหลัง — ชื่อในงวดที่จ่ายไปแล้วไม่เปลี่ยน', async () => {
      await saveEmployeeWith(app, emp({ id: somchai, name: 'สมชาย เปลี่ยนนามสกุล' }));
      expect((await getRunWith(app, runId))!.items[0]!.name).toBe('สมชาย ใจดี');
    });

    it('เอาคนออกจากงวด แล้วเติมคนที่ขาดกลับได้ — ไม่เติมซ้ำคนที่อยู่แล้ว', async () => {
      const run = (await getRunWith(app, runId))!;
      await removeRunItemWith(app, runId, run.items.find((i) => i.employeeId === somying)!.id);
      expect((await getRunWith(app, runId))!.items).toHaveLength(1);
      expect(await addMissingToRunWith(app, runId)).toBe(1);
      expect(await addMissingToRunWith(app, runId)).toBe(0);
      expect((await getRunWith(app, runId))!.items.map((i) => i.code)).toEqual(['EMP-001', 'EMP-007']);
    });

    it('พนักงานที่มีงวดอ้างถึงลบไม่ได้ (on delete restrict)', async () => {
      await expect(app.query(`delete from employees where id = $1`, [somchai])).rejects.toMatchObject({ code: '23503' });
    });

    it('อู่อื่นมองไม่เห็นงวดและพนักงานของเรา', async () => {
      await as(theirs);
      expect(await getRunWith(app, runId)).toBeNull();
      expect((await listEmployeesWith(app, { all: true })).map((e) => e.name)).toEqual(['พนักงานอู่อื่น']);
      await as(mine);
    });

    it('ภ.ง.ด.1 และ สปส.1-10 ของงวดตรงกับงวดเงินเดือน', async () => {
      const pay = await payTaxWith(app, '2026-11');
      expect(pay.payDate).toBe('2026-11-28');
      expect(pay.rows.map((r) => [r.name, r.income, r.wht, r.ssoWage, r.sso])).toEqual([
        ['สมชาย ใจดี', 19800.5, 594.02, 17500, 875],
        ['สมหญิง รักงาน', 9000, 0, 0, 0],
      ]);
      expect(pay).toMatchObject({ income: 28800.5, wht: 594.02, sso: 875, ssoWage: 17500 });
      /* เดือนที่ยังไม่เปิดงวด */
      expect(await payTaxWith(app, '2026-10')).toMatchObject({ payDate: null, rows: [] });
    });

    it('50 ทวิ ของพนักงาน — รวมทุกงวดของปีภาษี · ปีที่ไม่มีงวดไม่ออก', async () => {
      const cert = (await whtCertForEmployeeWith(app, somchai, 2026))!;
      expect(cert).toMatchObject({
        form: 'pnd1', payeeTaxId: '1234567890123', income: 19800.5, wht: 594.02, sso: 875,
        paidOn: 'ปีภาษี 2569', refNo: 'EMP-001/2569',
      });
      /* หนังสือรับรองใช้ชื่อปัจจุบันจากทะเบียน */
      expect(cert.payeeName).toBe('สมชาย เปลี่ยนนามสกุล');
      expect(await whtCertForEmployeeWith(app, somchai, 2025)).toBeNull();
    });

    /* ภาษีเงินเดือนนับตามวันที่จ่ายเงิน ส่วนเงินสมทบนับตามงวดค่าจ้าง (ตรวจ 24 พ.ย. 2569)
       เดิมทั้งคู่นับตามงวด — งวด ธ.ค. ที่จ่าย 5 ม.ค. ไปอยู่ใน ภ.ง.ด.1 เดือน ธ.ค. และ 50 ทวิ ของปีก่อน */
    it('งวดที่จ่ายข้ามปี — ภ.ง.ด.1 และ 50 ทวิ ตามวันที่จ่าย · สปส.1-10 ตามงวด', async () => {
      const dec = (await createRunWith(app, { period: '2026-12', payDate: '2027-01-05' })).id;
      try {
        expect((await payTaxWith(app, '2026-12', 'payDate')).rows, 'ธ.ค. ยังไม่มีการจ่าย').toEqual([]);
        const jan = await payTaxWith(app, '2027-01', 'payDate');
        expect(jan.payDate).toBe('2027-01-05');
        expect(jan.rows.length).toBeGreaterThan(0);
        expect((await payTaxWith(app, '2026-12', 'period')).rows.length, 'เงินสมทบยังเป็นของงวด ธ.ค.')
          .toBe(jan.rows.length);

        /* ปีภาษี 2569 ไม่รวมงวดที่จ่ายปี 2570 */
        expect((await whtCertForEmployeeWith(app, somchai, 2026))!.income).toBe(19800.5);
        expect((await whtCertForEmployeeWith(app, somchai, 2027))!.income).toBe(jan.rows[0]!.income);
      } finally {
        await admin.query(`delete from payroll_runs where id = $1`, [dec]);
      }
    });

    it('เดือนเดียวจ่ายสองงวด — ภ.ง.ด.1 ของเดือนนั้นรวมทั้งสองงวด', async () => {
      const oct = (await createRunWith(app, { period: '2026-10', payDate: '2026-11-02' })).id;
      try {
        const nov = await payTaxWith(app, '2026-11', 'payDate');
        const one = await payTaxWith(app, '2026-11', 'period');
        expect(nov.rows.length).toBeGreaterThan(one.rows.length);
        expect(nov.income).toBeGreaterThan(one.income);
        expect(nov.payDate, 'แสดงวันที่จ่ายล่าสุดของเดือน').toBe('2026-11-28');
      } finally {
        await admin.query(`delete from payroll_runs where id = $1`, [oct]);
      }
    });

    it('งวดย้อนหลังก่อน ม.ค. 2569 เสนอเงินสมทบตามเพดานเดิม 750 บาท', async () => {
      const old = (await createRunWith(app, { period: '2025-12' })).id;
      try {
        const run = (await getRunWith(app, old))!;
        expect(run.items.find((i) => i.code === 'EMP-001')!.sso).toBe(750);
        expect((await payTaxWith(app, '2025-12', 'period')).rows[0]!.ssoWage).toBe(15000);
      } finally {
        await admin.query(`delete from payroll_runs where id = $1`, [old]);
      }
    });

    /* เดิมตัวเติมพนักงานเขียนบรรทัดด้วยรหัสงวดที่ส่งมาโดยไม่ตรวจว่าเป็นงวดของอู่ตัวเอง */
    it('เติมพนักงานหรือเอาออกจากงวดของอู่อื่นไม่ได้ — ไม่มีบรรทัดถูกเขียน', async () => {
      /* สร้างงวดของอู่อื่นด้วยสิทธิ์ผู้ดูแลฐาน — อู่นั้นไม่มีพนักงานที่ใช้งานอยู่แล้ว เปิดงวดเองไม่ได้ */
      const foreign = (await admin.query(
        `insert into payroll_runs (tenant_id, period, pay_date) values ($1, '2026-11', '2026-11-30') returning id`,
        [theirs])).rows[0].id as string;
      const count = async () => Number((await admin.query(
        `select count(*) as c from payroll_items where run_id = $1`, [foreign])).rows[0].c);
      const before = await count();

      await expect(addMissingToRunWith(app, foreign)).rejects.toThrow('ไม่พบงวดเงินเดือน');
      await expect(removeRunItemWith(app, foreign, '00000000-0000-4000-8000-000000000000'))
        .rejects.toThrow('ไม่พบงวดเงินเดือน');
      expect(await count()).toBe(before);
      await admin.query(`delete from payroll_runs where id = $1`, [foreign]);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('นัดหมายและแจ้งเตือนลูกค้า', () => {
    let contactId: string;
    let vehicleId: string;
    let todayAppt: string;

    it('เติมชื่อ เบอร์ ทะเบียนจากทะเบียนลูกค้า — ส่งแค่รถก็หาเจ้าของให้', async () => {
      const v = await admin.query(
        `select v.id, v.contact_id from vehicles v join contacts c on c.id = v.contact_id
          where v.tenant_id = $1 and v.plate_b <> '' order by c.code limit 1`, [mine]);
      vehicleId = v.rows[0].id;
      contactId = v.rows[0].contact_id;

      const pre = await appointmentPrefillWith(app, { vehicleId });
      expect(pre.contactId).toBe(contactId);
      expect(pre.vehicleId).toBe(vehicleId);
      expect(pre.partyName.length).toBeGreaterThan(0);
      expect(pre.plate.length).toBeGreaterThan(0);
      expect(pre.plate).not.toMatch(/\s{2,}/);
    });

    it('รหัสลูกค้าของอู่อื่นหรือที่ไม่มีอยู่ ไม่ถูกผูกกับนัด แต่นัดยังบันทึกได้', async () => {
      const theirContact = (await admin.query(
        `insert into contacts (tenant_id, code, first_name) values ($1, 'CUS-0001', 'ลูกค้าอู่อื่น') returning id`,
        [theirs])).rows[0].id;
      const { id } = await saveAppointmentWith(app, {
        kind: 'remind', date: '2026-12-15', time: '', contactId: theirContact, vehicleId: null,
        partyName: 'พิมพ์ชื่อเอง', tel: '', plate: '', title: 'ต่อ พ.ร.บ.', note: '',
      });
      const saved = (await getAppointmentWith(app, id))!;
      expect(saved.contactId).toBeNull();
      expect(saved.partyName).toBe('พิมพ์ชื่อเอง');
    });

    it('สี่มุมมอง — วันนี้ ที่จะถึง เลยกำหนด เสร็จ/ยกเลิก', async () => {
      const pre = await appointmentPrefillWith(app, { vehicleId });
      const mk = (date: string, time: string, title: string) => saveAppointmentWith(app, {
        kind: 'repair', date, time, title, note: '', ...pre,
      });
      todayAppt = (await mk(TODAY, '14:00', 'นัดบ่ายวันนี้')).id;
      await mk(TODAY, '09:00', 'นัดเช้าวันนี้');
      await mk('2026-11-20', '', 'นัดที่เลยมาแล้ว');
      const done = (await mk('2026-11-10', '', 'นัดที่เสร็จแล้ว')).id;
      await setAppointmentStatusWith(app, done, 'done');

      const titles = async (view: 'upcoming' | 'today' | 'overdue' | 'done') =>
        (await listAppointmentsWith(app, { view, today: TODAY })).map((a) => a.title);

      expect(await titles('today')).toEqual(['นัดเช้าวันนี้', 'นัดบ่ายวันนี้']);
      expect(await titles('upcoming')).toEqual(['นัดเช้าวันนี้', 'นัดบ่ายวันนี้', 'ต่อ พ.ร.บ.']);
      expect(await titles('overdue')).toEqual(['นัดที่เลยมาแล้ว']);
      expect(await titles('done')).toEqual(['นัดที่เสร็จแล้ว']);
      expect(await appointmentCountsWith(app, TODAY)).toEqual({ today: 2, overdue: 1, upcoming: 1 });
    });

    it('ค้นด้วยชื่อ ทะเบียน หรือเรื่อง', async () => {
      const hit = await listAppointmentsWith(app, { view: 'upcoming', today: TODAY, q: 'พ.ร.บ' });
      expect(hit.map((a) => a.title)).toEqual(['ต่อ พ.ร.บ.']);
      expect(await listAppointmentsWith(app, { view: 'upcoming', today: TODAY, q: 'ไม่มีคำนี้แน่นอน' })).toEqual([]);
    });

    it('จดว่าแจ้งลูกค้าแล้ว และยกเลิกการจดได้ — สถานะของนัดไม่เปลี่ยน', async () => {
      await setAppointmentNotifiedWith(app, todayAppt, true);
      let a = (await getAppointmentWith(app, todayAppt))!;
      expect(a.notifiedAt).not.toBeNull();
      expect(a.status).toBe('open');
      await setAppointmentNotifiedWith(app, todayAppt, false);
      a = (await getAppointmentWith(app, todayAppt))!;
      expect(a.notifiedAt).toBeNull();
    });

    it('อู่อื่นมองไม่เห็นนัดของเรา', async () => {
      await as(theirs);
      expect(await listAppointmentsWith(app, { view: 'upcoming', today: TODAY })).toEqual([]);
      expect(await getAppointmentWith(app, todayAppt)).toBeNull();
      await as(mine);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('เอกสารภาษี', () => {
    let month: string;

    it('เงื่อนไขเอกสารขายตรงกับ reports.ts ทุกตัวอักษร — ภาษีขายสองหน้าต้องไม่คลาดกัน', () => {
      const src = readFileSync(resolve(here, '../src/lib/reports.ts'), 'utf8');
      const start = src.indexOf('const SALES_DOCS = `') + 'const SALES_DOCS = `'.length;
      expect(start).toBeGreaterThan(100);
      expect(SALES_DOCS).toBe(src.slice(start, src.indexOf('`;', start)));
    });

    it('มีเดือนที่มีทั้งภาษีขายและภาษีซื้อให้ตรวจจริง', async () => {
      const { rows } = await admin.query(
        `select to_char(doc_date, 'YYYY-MM') as m
           from documents where tenant_id = $1 and status <> 'void' and vat_amount > 0
          group by 1 having count(*) filter (where direction = 'sell' and kind in ('IV','IVT')) > 0
                        and count(*) filter (where direction = 'buy') > 0
          order by count(*) desc limit 1`, [mine]);
      expect(rows[0]?.m).toBeTruthy();
      month = rows[0].m;
    });

    it('รายงานภาษีขาย — ยอดรวมเท่ากับที่รายงานยอดขายรวมไว้ และทุกแถวมีภาษี', async () => {
      const out = await vatOutWith(app, month);
      const want = await admin.query(
        `select count(*)::int as n, coalesce(sum(d.vat_amount), 0) as vat, coalesce(sum(d.net_amount), 0) as net
           from documents d
          where d.tenant_id = $1 and ${SALES_DOCS} and d.vat_amount > 0.004
            and to_char(d.doc_date, 'YYYY-MM') = $2`, [mine, month]);
      expect(out.rows.length).toBe(want.rows[0].n);
      expect(out.rows.length).toBeGreaterThan(0);
      expect(out.vat).toBe(Number(want.rows[0].vat));
      expect(out.net).toBe(Number(want.rows[0].net));
      expect(out.rows.every((r) => r.vat > 0 && r.direction === 'sell')).toBe(true);
      /* เรียงตามวันที่ */
      expect(out.rows.map((r) => r.docDate)).toEqual([...out.rows.map((r) => r.docDate)].sort());
    });

    it('ใบเสร็จที่ออกต่อจากใบส่งมอบไม่ถูกนับภาษีขายซ้ำ', async () => {
      const dup = await admin.query(
        `select count(*)::int as n from documents d join documents p on p.id = d.parent_doc_id
          where d.tenant_id = $1 and d.kind = 'RC' and p.kind in ('IV','IVT') and d.status <> 'void'
            and d.vat_amount > 0`, [mine]);
      expect(dup.rows[0].n, 'ไฟล์ชุดทดสอบต้องมีใบเสร็จที่ออกต่อจากใบส่งมอบ ไม่งั้นข้อนี้ไม่ได้ทดสอบอะไร').toBeGreaterThan(0);
      const rc = await admin.query(
        `select d.id, to_char(d.doc_date, 'YYYY-MM') as m from documents d join documents p on p.id = d.parent_doc_id
          where d.tenant_id = $1 and d.kind = 'RC' and p.kind in ('IV','IVT') and d.status <> 'void'
            and d.vat_amount > 0 limit 1`, [mine]);
      const report = await vatOutWith(app, rc.rows[0].m);
      expect(report.rows.map((r) => r.id)).not.toContain(rc.rows[0].id);
    });

    it('รายงานภาษีซื้อ — ยอดรวมเท่ากับผลรวมภาษีของใบซื้อและค่าใช้จ่ายในเดือน', async () => {
      const inn = await vatInWith(app, month);
      const want = await admin.query(
        `select coalesce(sum(vat_amount), 0) as vat, count(*)::int as n from documents
          where tenant_id = $1 and direction = 'buy' and status <> 'void' and vat_amount > 0.004
            and to_char(doc_date, 'YYYY-MM') = $2`, [mine, month]);
      expect(inn.rows.length).toBe(want.rows[0].n);
      expect(inn.vat).toBe(Number(want.rows[0].vat));
      expect(inn.rows.every((r) => r.direction === 'buy')).toBe(true);
    });

    it('เอกสารที่ยกเลิกหลุดจากรายงานทันที', async () => {
      const before = await vatOutWith(app, month);
      const victim = before.rows[0]!;
      await admin.query(
        `update documents set status = 'void', voided_at = now() where id = $1`, [victim.id]);
      const after = await vatOutWith(app, month);
      expect(after.rows.map((r) => r.id)).not.toContain(victim.id);
      expect(after.vat).toBe(Math.round((before.vat - victim.vat) * 100) / 100);
    });

    it('ภ.ง.ด.3 กับ ภ.ง.ด.53 — แยกตามชนิดผู้รับเงิน รวมกันเท่ากับภาษีที่อู่หักไว้ทั้งเดือน', async () => {
      /* ไฟล์ชุดทดสอบอาจไม่มีค่าใช้จ่ายที่หักภาษีครบสองชนิด — ใส่เองให้แน่ว่ามีทั้งบุคคลและนิติบุคคล */
      const ex = (no: string, type: string, name: string, net: number, wht: number, status = 'issued') => admin.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, expense_cat, party_type, party_name,
                                party_tax_id, vat_mode, wht_rate, subtotal, net_amount, wht_amount, grand_total, payable, voided_at)
         values ($1, 'EX', $2, '2031-05-10', $8::doc_status, 'rent', $3, $4, '1234567890123', 'none', 5, $5, $5, $6, $5, $7,
                 case when $8::text = 'void' then now() end)
         returning id`, [mine, no, type, name, net, wht, net - wht, status]);
      const person = (await ex('EX-T1', 'person', 'เจ้าของที่ดิน', 10000, 500)).rows[0].id;
      await ex('EX-T2', 'company', 'บริษัท ให้เช่า จำกัด', 20000, 1000);
      await ex('EX-T3', 'company', 'ใบที่ยกเลิก', 5000, 250, 'void');

      const p3 = await whtPaidWith(app, '2031-05', 'pnd3');
      const p53 = await whtPaidWith(app, '2031-05', 'pnd53');
      expect(p3.rows.map((r) => [r.partyName, r.base, r.rate, r.wht])).toEqual([['เจ้าของที่ดิน', 10000, 5, 500]]);
      expect(p53.rows.map((r) => [r.partyName, r.base, r.rate, r.wht])).toEqual([['บริษัท ให้เช่า จำกัด', 20000, 5, 1000]]);
      expect(p3.wht + p53.wht).toBe(1500);

      const cert = (await whtCertForDocWith(app, person))!;
      expect(cert).toMatchObject({ form: 'pnd3', payeeName: 'เจ้าของที่ดิน', income: 10000, wht: 500, paidOn: '2031-05-10', refNo: 'EX-T1' });
    });

    it('50 ทวิ ไม่ออกให้ใบที่ไม่ได้หักภาษี ใบขาย หรือใบของอู่อื่น', async () => {
      const sale = await admin.query(
        `select id from documents where tenant_id = $1 and kind = 'IVT' and status <> 'void' limit 1`, [mine]);
      expect(await whtCertForDocWith(app, sale.rows[0].id)).toBeNull();

      const own = await admin.query(`select id from documents where tenant_id = $1 and doc_no = 'EX-T2'`, [mine]);
      await as(theirs);
      expect(await whtCertForDocWith(app, own.rows[0].id)).toBeNull();
      expect((await whtPaidWith(app, '2031-05', 'pnd53')).rows).toEqual([]);
      await as(mine);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('ไฟล์สำรองมีข้อมูล Light Plus', () => {
    /* ภาพของข้อมูล Plus ที่ไม่ขึ้นกับรหัสแถว (รหัสถูกสร้างใหม่ตอนกู้คืน) */
    const snapshot = async () => ({
      emps: (await admin.query(
        `select code, name, position, emp_type, coalesce(tax_id,'') as tax_id, base_salary::float8 as base_salary,
                sso_enabled, wht_rate::float8 as wht_rate, active
           from employees where tenant_id = $1 order by code`, [mine])).rows,
      lines: (await admin.query(
        `select r.period, r.pay_date::text as pay_date, e.code, i.line_no, i.name, i.base::float8 as base,
                i.overtime::float8 as overtime, i.sso::float8 as sso, i.wht::float8 as wht, i.net::float8 as net
           from payroll_items i join payroll_runs r on r.id = i.run_id join employees e on e.id = i.employee_id
          where i.tenant_id = $1 order by r.period, i.line_no`, [mine])).rows,
      appts: (await admin.query(
        `select a.kind, a.appt_date::text as appt_date, a.title, a.party_name, a.plate, a.status,
                c.code as contact, (a.vehicle_id is not null) as has_vehicle
           from appointments a left join contacts c on c.id = a.contact_id
          where a.tenant_id = $1 order by a.appt_date, a.title`, [mine])).rows,
    });
    const restore = async (file: unknown) => {
      await app.query('begin');
      try {
        const r = await restoreIntoTenant(app as never, mine, JSON.parse(JSON.stringify(file)));
        await app.query('commit');
        return r;
      } catch (err) {
        await app.query('rollback');
        throw err;
      }
    };

    it('ส่งออกแล้วกู้คืน — พนักงาน งวดเงินเดือน นัดหมาย กลับมาเท่าเดิม และนัดยังผูกกับลูกค้าในทะเบียน', async () => {
      const before = await snapshot();
      expect(before.emps.length).toBeGreaterThan(0);
      expect(before.lines.length).toBeGreaterThan(0);
      expect(before.appts.some((a) => a.contact), 'ต้องมีนัดที่ผูกลูกค้าอยู่ก่อน').toBe(true);

      const file = await exportBackupWith(app);
      expect(file._plus!.employees!.length).toBe(before.emps.length);

      const r = await restore(file);
      expect(r.counts).toMatchObject({
        employees: before.emps.length, appointments: before.appts.length,
      });
      expect(await snapshot()).toEqual(before);
    });

    it('ไฟล์ที่ไม่มีข้อมูล Plus (รุ่น HTML หรือไฟล์เก่า) — กู้คืนแล้วข้อมูล Plus เดิมอยู่ครบ', async () => {
      const before = await snapshot();
      const full = await exportBackupWith(app);
      const file = JSON.parse(JSON.stringify(full)) as Record<string, unknown>;
      delete file._plus;
      await restore(file);
      const after = await snapshot();
      expect(after.emps).toEqual(before.emps);
      expect(after.lines).toEqual(before.lines);
      /* นัดไม่ถูกลบ แต่สายที่ผูกลูกค้าขาดเพราะทะเบียนลูกค้าถูกสร้างใหม่ — ชื่อที่ตรึงไว้ในแถวยังอยู่ */
      expect(after.appts.map((a) => [a.title, a.party_name])).toEqual(before.appts.map((a) => [a.title, a.party_name]));
      expect(after.appts.every((a) => a.contact === null)).toBe(true);

      /* กู้คืนไฟล์เต็มที่ส่งออกไว้ก่อนหน้า — นัดกลับมาผูกลูกค้าตามเดิม แม้ทะเบียนลูกค้าถูกสร้างใหม่สองรอบ */
      await restore(full);
      expect(await snapshot()).toEqual(before);
    });

    it('ผู้ไม่มีสิทธิ์เห็นเงินเดือนดาวน์โหลด — ไฟล์ไม่มีเงินเดือน และกู้คืนไฟล์นั้นไม่ลบเงินเดือนเดิม', async () => {
      const before = await snapshot();
      const file = await exportBackupWith(app, { payroll: false });
      expect(file._plus!.employees).toBeUndefined();
      expect(file._plus!.payrollRuns).toBeUndefined();
      expect(JSON.stringify(file._plus)).not.toContain('baseSalary');
      expect(file._plus!.appointments!.length).toBe(before.appts.length);

      await restore(file);
      const after = await snapshot();
      expect(after.emps).toEqual(before.emps);
      expect(after.lines).toEqual(before.lines);
    });

    it('ข้อมูลผิดรูปแบบในไฟล์ถูกข้ามพร้อมคำเตือน ไม่ล้มทั้งการกู้คืน', async () => {
      const before = await snapshot();
      const file = JSON.parse(JSON.stringify(await exportBackupWith(app)));
      file._plus.appointments.push({ date: 'ไม่ใช่วันที่', title: 'นัดเสีย' });
      file._plus.payrollRuns.push({ period: '2026-99', payDate: '2026-01-01', items: [] });
      file._plus.payrollRuns[0].items.push({ empId: 'ไม่มีคนนี้', name: 'ผี', base: 1 });

      const r = await restore(file);
      expect(r.warnings.join(' ')).toMatch(/นัดหมายในไฟล์ 1 รายการ/);
      expect(r.warnings.join(' ')).toMatch(/2026-99/);
      expect(r.warnings.join(' ')).toMatch(/บรรทัดเงินเดือน 1 บรรทัด/);
      expect(await snapshot()).toEqual(before);
    });

    it('ตัวอย่างก่อนกู้คืนนับข้อมูล Plus ในไฟล์ให้เห็น', async () => {
      const file = await exportBackupWith(app);
      const p = previewBackup(JSON.stringify(file));
      expect(p.counts.employees).toBe(file._plus!.employees!.length);
      expect(p.counts.payrollRuns).toBe(file._plus!.payrollRuns!.length);
      expect(p.counts.appointments).toBe(file._plus!.appointments!.length);
    });
  });

  describe('การกู้คืนไฟล์สำรอง', () => {
    it('ล้างข้อมูลธุรกิจแล้ว นัดยังอยู่ครบและยังอ่านรู้เรื่อง — พนักงานและงวดเงินเดือนไม่ถูกแตะ', async () => {
      const before = await listAppointmentsWith(app, { view: 'upcoming', today: TODAY });
      const linked = before.find((a) => a.contactId)!;
      expect(linked, 'ต้องมีนัดที่ผูกกับลูกค้าในทะเบียนอยู่ก่อน').toBeTruthy();
      const emps = (await listEmployeesWith(app, { all: true })).length;
      const runs = (await listRunsWith(app)).length;

      await app.query('begin');
      try {
        await wipeTenantData(app as never);
        await app.query('commit');
      } catch (err) {
        await app.query('rollback');
        throw err;
      }

      expect((await app.query(`select count(*)::int as n from contacts`)).rows[0].n).toBe(0);
      const after = await listAppointmentsWith(app, { view: 'upcoming', today: TODAY });
      expect(after.map((a) => a.title)).toEqual(before.map((a) => a.title));
      const same = after.find((a) => a.id === linked.id)!;
      expect(same.contactId).toBeNull();
      expect(same.vehicleId).toBeNull();
      expect(same.partyName).toBe(linked.partyName);
      expect(same.plate).toBe(linked.plate);

      expect((await listEmployeesWith(app, { all: true })).length).toBe(emps);
      expect((await listRunsWith(app)).length).toBe(runs);
    });
  });
});
