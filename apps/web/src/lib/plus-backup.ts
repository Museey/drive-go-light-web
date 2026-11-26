import { randomUUID } from 'node:crypto';

/**
 * ข้อมูลของ Light Plus ในไฟล์สำรอง — ทะเบียนพนักงาน งวดเงินเดือน นัดหมาย (24 พ.ย. 2569)
 *
 * เดิมไฟล์สำรองไม่มีสามกลุ่มนี้เลย: ดาวน์โหลดไฟล์ไปเก็บแล้วเข้าใจว่าได้ครบ ทั้งที่เงินเดือนกับนัดไม่ได้ไปด้วย
 * และย้ายอู่ไปฐานข้อมูลใหม่แล้วข้อมูล Plus หายทั้งชุด — ขัดกับที่ระบบบอกว่า "ข้อมูลเป็นของอู่"
 *
 * อยู่ในคีย์ `_plus` ของไฟล์ (คีย์ขึ้นต้น _ = ของเว็บนี้เอง โปรแกรมรุ่น HTML ข้ามไป เปิดไฟล์ได้ตามเดิม)
 *
 * **กู้คืนทีละกลุ่มตามที่ไฟล์มี** — กลุ่มที่ไฟล์ไม่มี ข้อมูลเดิมของกลุ่มนั้นไม่ถูกแตะ
 *   - ไฟล์จากรุ่น HTML หรือไฟล์เก่าก่อนมีคีย์นี้ → ข้อมูล Plus ของอู่อยู่ครบเหมือนเดิม
 *   - ไฟล์ที่คนไม่มีสิทธิ์เห็นเงินเดือนเป็นคนดาวน์โหลด → มีแต่นัดหมาย เงินเดือนเดิมไม่ถูกลบทิ้งตอนกู้คืน
 *   - กลุ่มที่ไฟล์มี (แม้เป็นรายการว่าง) → แทนที่ของเดิมทั้งกลุ่ม ตามความหมายของ "กู้คืน"
 *
 * รหัสแถวสร้างใหม่ทุกครั้ง เหมือนที่ตัวนำเข้าทำกับลูกค้าและเอกสาร — ไฟล์เดียวกันกู้คืนลงสองอู่ได้โดยรหัสไม่ชน
 * นัดที่ผูกกับลูกค้า/รถในทะเบียน ผูกกลับตามแผนที่รหัสที่ตัวนำเข้าคืนมา · หาไม่เจอก็ยังมีชื่อ เบอร์ ทะเบียนที่ตรึงไว้ในแถว
 *
 * ไม่มี server-only — รับ client ที่ตั้ง tenant แล้ว ชุดทดสอบเรียกได้ตรง ๆ
 */

interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface PlusBackup {
  appointments?: unknown[];
  employees?: unknown[];
  payrollRuns?: unknown[];
}

const n = (v: unknown): number => Number(v ?? 0);
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const day = (v: unknown): string | null => {
  const s = text(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const money = (v: unknown): string => {
  const x = Math.round(Number(v) * 100) / 100;
  return (Number.isFinite(x) && x > 0 ? x : 0).toFixed(2);
};

/**
 * `payroll: false` = ผู้ดาวน์โหลดไม่มีสิทธิ์เห็นเงินเดือน — ทะเบียนพนักงานและงวดเงินเดือนไม่ลงไฟล์
 * (ไฟล์สำรองต้องไม่เป็นทางอ้อมให้เห็นเงินเดือนที่หน้าจอซ่อนไว้)
 */
export async function exportPlusWith(c: SqlClient, opts: { payroll?: boolean } = {}): Promise<PlusBackup> {
  const appts = await c.query(
    `select id, kind, appt_date::text as appt_date, appt_time::text as appt_time, contact_id, vehicle_id,
            party_name, tel, plate, title, note, status, notified_at, created_at
       from appointments order by appt_date, created_at, id`);
  const out: PlusBackup = {
    appointments: appts.rows.map((a) => ({
      id: a.id, kind: a.kind, date: a.appt_date, time: a.appt_time ?? null,
      custId: a.contact_id ?? null, vehId: a.vehicle_id ?? null,
      name: a.party_name, tel: a.tel, plate: a.plate, title: a.title, note: a.note,
      status: a.status,
      notifiedAt: a.notified_at ? new Date(a.notified_at).toISOString() : null,
      createdAt: a.created_at ? new Date(a.created_at).toISOString() : null,
    })),
  };
  if (opts.payroll === false) return out;

  const emps = await c.query(
    `select id, code, name, position, emp_type, tax_id, addr_text, tel, base_salary, sso_enabled, wht_rate,
            bank_name, bank_account_no, started_on::text as started_on, active, note
       from employees order by code, id`);
  out.employees = emps.rows.map((e) => ({
    id: e.id, code: e.code, name: e.name, position: e.position, type: e.emp_type,
    taxId: e.tax_id ?? '', addr: e.addr_text, tel: e.tel,
    baseSalary: n(e.base_salary), sso: e.sso_enabled === true, whtRate: n(e.wht_rate),
    bankName: e.bank_name, bankAccountNo: e.bank_account_no,
    startedOn: e.started_on ?? null, active: e.active === true, note: e.note,
  }));

  const runs = await c.query(
    `select id, period, pay_date::text as pay_date, note from payroll_runs order by period`);
  const items = await c.query(
    `select run_id, employee_id, line_no, name, position, tax_id, base, overtime, other_income,
            sso, wht, other_deduct, note
       from payroll_items order by run_id, line_no`);
  out.payrollRuns = runs.rows.map((r) => ({
    id: r.id, period: r.period, payDate: r.pay_date, note: r.note,
    items: items.rows.filter((i) => i.run_id === r.id).map((i) => ({
      empId: i.employee_id, name: i.name, position: i.position, taxId: i.tax_id,
      base: n(i.base), overtime: n(i.overtime), otherIncome: n(i.other_income),
      sso: n(i.sso), wht: n(i.wht), otherDeduct: n(i.other_deduct), note: i.note,
    })),
  }));
  return out;
}

/** จำนวนรายการของแต่ละกลุ่มในไฟล์ — ใช้บอกผู้ใช้ก่อนกู้คืน · กลุ่มที่ไฟล์ไม่มีไม่ขึ้น */
export function plusCounts(plus: unknown): Record<string, number> {
  const p = isPlus(plus) ? plus : {};
  const out: Record<string, number> = {};
  if (Array.isArray(p.appointments) && p.appointments.length) out.appointments = p.appointments.length;
  if (Array.isArray(p.employees) && p.employees.length) out.employees = p.employees.length;
  if (Array.isArray(p.payrollRuns) && p.payrollRuns.length) out.payrollRuns = p.payrollRuns.length;
  return out;
}

const isPlus = (v: unknown): v is PlusBackup => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const EMP_TYPES = new Set(['full', 'probation', 'temp']);
const APPT_KINDS = new Set(['repair', 'remind']);
const APPT_STATUS = new Set(['open', 'done', 'cancelled']);

/**
 * เขียนข้อมูล Plus จากไฟล์ลงอู่ที่ตั้งไว้ใน client — ต้องเรียกในทรานแซกชันเดียวกับการกู้คืนส่วนอื่น
 * พังกลางทางแล้วทั้งการกู้คืนย้อนกลับ ไม่เหลือสภาพที่เงินเดือนหายแต่เอกสารกู้แล้ว
 *
 * ค่าที่ผิดรูปแบบถูกปัดให้เข้าเกณฑ์ของตาราง (เช่นประเภทการจ้างที่ไม่รู้จัก → ประจำ) และบอกเป็นคำเตือน
 * ไม่ล้มทั้งการกู้คืนเพราะนัดแถวเดียวพิมพ์วันที่ผิด
 */
export async function restorePlusWith(
  c: SqlClient,
  plus: unknown,
  maps: { contacts?: ReadonlyMap<string, string>; vehicles?: ReadonlyMap<string, string> } = {},
): Promise<{ counts: Record<string, number>; warnings: string[] }> {
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  if (!isPlus(plus)) return { counts, warnings };

  /* ---------- เงินเดือน: ต้องมีทั้งทะเบียนพนักงานและงวดในไฟล์ จึงจะแทนที่ ---------- */
  if (Array.isArray(plus.employees) && Array.isArray(plus.payrollRuns)) {
    await c.query(`delete from payroll_runs`);     /* บรรทัดของงวดไปด้วย cascade — ต้องไปก่อนพนักงาน (restrict) */
    await c.query(`delete from employees`);

    const empId = new Map<string, string>();
    const seenCode = new Set<string>();
    let skippedEmp = 0;
    for (const raw of plus.employees as Record<string, unknown>[]) {
      const code = text(raw?.code).trim();
      const name = text(raw?.name).trim();
      if (!code || !name || seenCode.has(code)) { skippedEmp++; continue; }
      seenCode.add(code);
      const id = randomUUID();
      empId.set(text(raw.id), id);
      const taxId = text(raw.taxId).replace(/\D/g, '');
      await c.query(
        `insert into employees (id, tenant_id, code, name, position, emp_type, tax_id, addr_text, tel,
                                base_salary, sso_enabled, wht_rate, bank_name, bank_account_no,
                                started_on, active, note)
         values ($1, current_tenant_id(), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, code, name, text(raw.position), EMP_TYPES.has(text(raw.type)) ? text(raw.type) : 'full',
         taxId.length === 13 ? taxId : null, text(raw.addr), text(raw.tel),
         money(raw.baseSalary), raw.sso !== false, Math.min(100, Math.max(0, n(raw.whtRate) || 0)),
         text(raw.bankName), text(raw.bankAccountNo), day(raw.startedOn), raw.active !== false, text(raw.note)]);
    }
    counts.employees = empId.size;
    if (skippedEmp) warnings.push(`ทะเบียนพนักงานในไฟล์ ${skippedEmp} แถวไม่มีรหัสหรือชื่อ หรือรหัสซ้ำ — ข้ามไป`);

    let runs = 0;
    let lostLines = 0;
    const seenPeriod = new Set<string>();
    for (const raw of plus.payrollRuns as Record<string, unknown>[]) {
      const period = text(raw?.period);
      const payDate = day(raw?.payDate);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !payDate || seenPeriod.has(period)) {
        warnings.push(`งวดเงินเดือน "${period || '?'}" ในไฟล์ไม่ถูกต้องหรือซ้ำ — ข้ามไป`);
        continue;
      }
      seenPeriod.add(period);
      const runId = randomUUID();
      await c.query(
        `insert into payroll_runs (id, tenant_id, period, pay_date, note)
         values ($1, current_tenant_id(), $2, $3, $4)`, [runId, period, payDate, text(raw.note)]);
      runs++;

      let line = 0;
      const inRun = new Set<string>();
      for (const it of (Array.isArray(raw.items) ? raw.items : []) as Record<string, unknown>[]) {
        const emp = empId.get(text(it?.empId));
        /* บรรทัดที่หาพนักงานไม่เจอ หรือคนเดียวกันซ้ำในงวด เขียนไม่ได้ (คีย์นอกและ unique ของตาราง) */
        if (!emp || inRun.has(emp)) { lostLines++; continue; }
        inRun.add(emp);
        await c.query(
          `insert into payroll_items (tenant_id, run_id, employee_id, line_no, name, position, tax_id,
                                      base, overtime, other_income, sso, wht, other_deduct, note)
           values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [runId, emp, ++line, text(it.name), text(it.position), text(it.taxId),
           money(it.base), money(it.overtime), money(it.otherIncome),
           money(it.sso), money(it.wht), money(it.otherDeduct), text(it.note)]);
      }
    }
    counts.payrollRuns = runs;
    if (lostLines) warnings.push(`บรรทัดเงินเดือน ${lostLines} บรรทัดอ้างพนักงานที่ไม่มีในไฟล์หรือซ้ำในงวดเดียวกัน — ข้ามไป`);
  }

  /* ---------- นัดหมาย ---------- */
  if (Array.isArray(plus.appointments)) {
    await c.query(`delete from appointments`);
    let made = 0;
    let skipped = 0;
    for (const raw of plus.appointments as Record<string, unknown>[]) {
      const date = day(raw?.date);
      const title = text(raw?.title).trim();
      if (!date || !title) { skipped++; continue; }
      const time = /^\d{2}:\d{2}(:\d{2})?$/.test(text(raw.time)) ? text(raw.time) : null;
      const at = (v: unknown) => { const d = new Date(text(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
      await c.query(
        `insert into appointments (tenant_id, kind, appt_date, appt_time, contact_id, vehicle_id,
                                   party_name, tel, plate, title, note, status, notified_at, created_at)
         values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, coalesce($13::timestamptz, now()))`,
        [APPT_KINDS.has(text(raw.kind)) ? text(raw.kind) : 'repair', date, time,
         maps.contacts?.get(text(raw.custId)) ?? null, maps.vehicles?.get(text(raw.vehId)) ?? null,
         text(raw.name), text(raw.tel), text(raw.plate), title, text(raw.note),
         APPT_STATUS.has(text(raw.status)) ? text(raw.status) : 'open',
         raw.notifiedAt ? at(raw.notifiedAt) : null, raw.createdAt ? at(raw.createdAt) : null]);
      made++;
    }
    counts.appointments = made;
    if (skipped) warnings.push(`นัดหมายในไฟล์ ${skipped} รายการไม่มีวันที่หรือเรื่องที่นัด — ข้ามไป`);
  }

  return { counts, warnings };
}
