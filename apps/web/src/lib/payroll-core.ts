import type pg from 'pg';
import {
  isPeriod, lineNet, payLineProblem, periodEnd, suggestLine, type EmpType, type PayLine,
} from './payroll-calc';

/**
 * เงินเดือนและพนักงาน (Light Plus) — แกนที่คุยกับฐานข้อมูล
 *
 * รับ client ที่ตั้ง app.tenant_id แล้ว ไม่มี server-only — เทสต์เรียกกับฐานจริงได้ (payroll-db.test.ts)
 * ตัวที่ผูกกับ session และสิทธิ์อยู่ใน payroll.ts
 */

type Db = Pick<pg.ClientBase, 'query'>;

const n = (v: unknown): number => Number(v ?? 0);
const money = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);

/* =====================================================================
   ทะเบียนพนักงาน
   ===================================================================== */

export interface Employee {
  id: string;
  code: string;
  name: string;
  position: string;
  empType: EmpType;
  taxId: string;
  addrText: string;
  tel: string;
  baseSalary: number;
  ssoEnabled: boolean;
  whtRate: number;
  bankName: string;
  bankAccountNo: string;
  startedOn: string | null;
  active: boolean;
  note: string;
}

export type EmployeeInput = Omit<Employee, 'id' | 'active'> & { id?: string | null };

const EMP_COLS = `id, code, name, position, emp_type, coalesce(tax_id, '') as tax_id, addr_text, tel,
  base_salary, sso_enabled, wht_rate, bank_name, bank_account_no,
  started_on::text as started_on, active, note`;

function empOf(r: Record<string, unknown>): Employee {
  return {
    id: String(r.id), code: String(r.code), name: String(r.name), position: String(r.position ?? ''),
    empType: r.emp_type as EmpType, taxId: String(r.tax_id ?? ''), addrText: String(r.addr_text ?? ''),
    tel: String(r.tel ?? ''), baseSalary: n(r.base_salary), ssoEnabled: r.sso_enabled !== false,
    whtRate: n(r.wht_rate), bankName: String(r.bank_name ?? ''), bankAccountNo: String(r.bank_account_no ?? ''),
    startedOn: (r.started_on as string | null) ?? null, active: r.active !== false, note: String(r.note ?? ''),
  };
}

export async function listEmployeesWith(c: Db, opts: { all?: boolean } = {}): Promise<Employee[]> {
  const { rows } = await c.query(
    `select ${EMP_COLS} from employees ${opts.all ? '' : 'where active'} order by active desc, code`);
  return rows.map(empOf);
}

export async function getEmployeeWith(c: Db, id: string): Promise<Employee | null> {
  const { rows } = await c.query(`select ${EMP_COLS} from employees where id = $1`, [id]);
  return rows[0] ? empOf(rows[0]) : null;
}

/** รหัสถัดไป EMP-001 … — เลขสูงสุดที่มี + 1 (เหตุผลเดียวกับ nextKitCode) */
export async function nextEmployeeCodeWith(c: Db): Promise<string> {
  const { rows } = await c.query(
    `select coalesce(max((substring(code from '^EMP-([0-9]{1,9})$'))::int), 0) + 1 as n from employees`);
  return `EMP-${String(rows[0]?.n ?? 1).padStart(3, '0')}`;
}

export function employeeProblem(e: EmployeeInput): { error: string; field: string } | null {
  if (!e.code.trim()) return { error: 'ต้องกรอกรหัสพนักงาน', field: 'code' };
  if (!e.name.trim()) return { error: 'ต้องกรอกชื่อพนักงาน', field: 'name' };
  if (e.taxId && !/^[0-9]{13}$/.test(e.taxId)) {
    return { error: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก', field: 'taxId' };
  }
  if (!Number.isFinite(e.baseSalary) || e.baseSalary < 0) {
    return { error: 'เงินเดือนต้องเป็นตัวเลขที่ไม่ติดลบ', field: 'baseSalary' };
  }
  if (!Number.isFinite(e.whtRate) || e.whtRate < 0 || e.whtRate > 100) {
    return { error: 'อัตราหักภาษี ณ ที่จ่ายต้องอยู่ระหว่าง 0 ถึง 100', field: 'whtRate' };
  }
  return null;
}

export async function saveEmployeeWith(c: Db, e: EmployeeInput): Promise<{ id: string }> {
  const args = [
    e.code.trim(), e.name.trim(), e.position.trim(), e.empType, e.taxId || null, e.addrText.trim(),
    e.tel.trim(), money(e.baseSalary), e.ssoEnabled, e.whtRate, e.bankName.trim(),
    e.bankAccountNo.trim(), e.startedOn || null, e.note.trim(),
  ];
  if (e.id) {
    const res = await c.query(
      `update employees set code=$2, name=$3, position=$4, emp_type=$5, tax_id=$6, addr_text=$7, tel=$8,
              base_salary=$9, sso_enabled=$10, wht_rate=$11, bank_name=$12, bank_account_no=$13,
              started_on=$14, note=$15
        where id=$1`, [e.id, ...args]);
    if (!res.rowCount) throw new Error('ไม่พบพนักงานคนนี้ — อาจถูกลบไปแล้ว');
    return { id: e.id };
  }
  const { rows } = await c.query(
    `insert into employees (tenant_id, code, name, position, emp_type, tax_id, addr_text, tel,
                            base_salary, sso_enabled, wht_rate, bank_name, bank_account_no, started_on, note)
     values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`, args);
  return { id: rows[0].id as string };
}

export async function setEmployeeActiveWith(c: Db, id: string, active: boolean): Promise<void> {
  await c.query(`update employees set active = $2 where id = $1`, [id, active]);
}

/* =====================================================================
   งวดเงินเดือน
   ===================================================================== */

export interface PayrollRunRow {
  id: string;
  period: string;
  payDate: string;
  note: string;
  people: number;
  income: number;
  sso: number;
  wht: number;
  net: number;
}

export interface PayrollItem extends PayLine {
  id: string;
  employeeId: string;
  code: string;
  name: string;
  position: string;
  taxId: string;
  net: number;
  note: string;
}

export interface PayrollRun {
  id: string;
  period: string;
  payDate: string;
  note: string;
  items: PayrollItem[];
}

export async function listRunsWith(c: Db): Promise<PayrollRunRow[]> {
  const { rows } = await c.query(
    `select r.id, r.period, r.pay_date::text as pay_date, r.note,
            count(i.id)::int as people,
            coalesce(sum(i.base + i.overtime + i.other_income), 0) as income,
            coalesce(sum(i.sso), 0) as sso, coalesce(sum(i.wht), 0) as wht,
            coalesce(sum(i.net), 0) as net
       from payroll_runs r left join payroll_items i on i.run_id = r.id
      group by r.id order by r.period desc`);
  return rows.map((r) => ({
    id: r.id, period: r.period, payDate: r.pay_date, note: r.note ?? '', people: r.people,
    income: n(r.income), sso: n(r.sso), wht: n(r.wht), net: n(r.net),
  }));
}

export async function getRunWith(c: Db, id: string): Promise<PayrollRun | null> {
  const head = await c.query(
    `select id, period, pay_date::text as pay_date, note from payroll_runs where id = $1`, [id]);
  if (!head.rows[0]) return null;
  const { rows } = await c.query(
    `select i.id, i.employee_id, e.code, i.name, i.position, i.tax_id,
            i.base, i.overtime, i.other_income, i.sso, i.wht, i.other_deduct, i.net, i.note
       from payroll_items i join employees e on e.id = i.employee_id
      where i.run_id = $1 order by i.line_no`, [id]);
  return {
    id: head.rows[0].id, period: head.rows[0].period, payDate: head.rows[0].pay_date,
    note: head.rows[0].note ?? '',
    items: rows.map((r) => ({
      id: r.id, employeeId: r.employee_id, code: r.code, name: r.name, position: r.position ?? '',
      taxId: r.tax_id ?? '', base: n(r.base), overtime: n(r.overtime), otherIncome: n(r.other_income),
      sso: n(r.sso), wht: n(r.wht), otherDeduct: n(r.other_deduct), net: n(r.net), note: r.note ?? '',
    })),
  };
}

/**
 * เปิดงวดใหม่ — ใส่พนักงานที่ใช้งานอยู่ทุกคนพร้อมค่าเสนอจากทะเบียน
 *
 * เดือนละหนึ่งงวด (unique tenant_id + period) — เปิดซ้ำเดือนเดิมได้ข้อความที่อ่านรู้เรื่อง
 * ไม่ใช่ข้อผิดพลาดจากฐานข้อมูล
 */
export async function createRunWith(
  c: Db, input: { period: string; payDate?: string; userId?: string | null },
): Promise<{ id: string }> {
  if (!isPeriod(input.period)) throw new Error('งวดเงินเดือนไม่ถูกต้อง — เลือกเดือนและปีอีกครั้ง');
  const dup = await c.query(`select id from payroll_runs where period = $1`, [input.period]);
  if (dup.rows[0]) throw new Error('งวดเดือนนี้เปิดไว้แล้ว — เปิดงวดเดิมเพื่อแก้ไขแทน');

  const emps = await listEmployeesWith(c);
  if (emps.length === 0) {
    throw new Error('ยังไม่มีพนักงานที่ใช้งานอยู่ — เพิ่มพนักงานในทะเบียนพนักงานก่อนเปิดงวด');
  }

  const { rows } = await c.query(
    `insert into payroll_runs (tenant_id, period, pay_date, created_by)
     values (current_tenant_id(), $1, $2, $3) returning id`,
    [input.period, input.payDate || periodEnd(input.period), input.userId ?? null]);
  const runId = rows[0].id as string;

  let line = 0;
  for (const e of emps) {
    const s = suggestLine(e, input.period);
    await c.query(
      `insert into payroll_items (tenant_id, run_id, employee_id, line_no, name, position, tax_id,
                                  base, overtime, other_income, sso, wht, other_deduct)
       values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [runId, e.id, ++line, e.name, e.position, e.taxId,
       money(s.base), money(s.overtime), money(s.otherIncome), money(s.sso), money(s.wht), money(s.otherDeduct)]);
  }
  return { id: runId };
}

/**
 * ล็อกแถวงวดก่อนแตะบรรทัดของมัน และยืนยันว่างวดนี้**เป็นของอู่ที่ล็อกอินอยู่** (อ่านผ่าน RLS)
 *
 * เดิมตัวเติมพนักงานเขียนบรรทัดด้วย run_id ที่ผู้เรียกส่งมาโดยไม่ตรวจ — foreign key ตรวจแค่ว่าแถวมีอยู่
 * และการตรวจนั้นไม่ผ่าน RLS จึงใส่บรรทัดลงงวดของอู่อื่นได้ถ้ารู้รหัสงวด (ตรวจ 24 พ.ย. 2569)
 * การล็อกยังกันสองเครื่องกดเติมพนักงานพร้อมกันแล้วได้เลขบรรทัดชนกัน
 * คืนงวด (YYYY-MM) ให้ผู้เรียกใช้คิดค่าเสนอตามกติกาของเดือนนั้น
 */
export async function lockRunWith(c: Db, runId: string): Promise<string> {
  const { rows } = await c.query(`select period from payroll_runs where id = $1 for update`, [runId]);
  if (!rows[0]) throw new Error('ไม่พบงวดเงินเดือนนี้ — อาจถูกลบไปแล้ว');
  return rows[0].period as string;
}

export interface RunItemInput extends PayLine {
  /** id ของบรรทัด (payroll_items.id) */
  id: string;
  note: string;
}

/**
 * บันทึกงวด — แก้ได้เฉพาะตัวเลขและหมายเหตุของบรรทัดที่มีอยู่
 * ชื่อและเลขผู้เสียภาษีที่ตรึงไว้ไม่ถูกแตะ · ยอดสุทธิฐานข้อมูลคิดเอง
 */
export async function saveRunWith(
  c: Db, input: { id: string; payDate: string; note: string; items: RunItemInput[] },
): Promise<void> {
  await lockRunWith(c, input.id);
  const run = await getRunWith(c, input.id);
  if (!run) throw new Error('ไม่พบงวดเงินเดือนนี้ — อาจถูกลบไปแล้ว');
  const names = new Map(run.items.map((i) => [i.id, i.name]));

  for (const it of input.items) {
    const name = names.get(it.id);
    if (!name) throw new Error('รายการพนักงานในงวดเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const bad = payLineProblem(it, name);
    if (bad) throw new Error(bad);
  }

  await c.query(`update payroll_runs set pay_date = $2, note = $3 where id = $1`,
    [input.id, input.payDate, input.note.trim()]);
  for (const it of input.items) {
    await c.query(
      `update payroll_items
          set base=$3, overtime=$4, other_income=$5, sso=$6, wht=$7, other_deduct=$8, note=$9
        where id = $1 and run_id = $2`,
      [it.id, input.id, money(it.base), money(it.overtime), money(it.otherIncome),
       money(it.sso), money(it.wht), money(it.otherDeduct), it.note.trim()]);
  }
}

/** เอาพนักงานออกจากงวด — เช่นคนที่ลาออกกลางเดือนแล้วไม่ได้จ่ายงวดนี้ */
export async function removeRunItemWith(c: Db, runId: string, itemId: string): Promise<void> {
  await lockRunWith(c, runId);
  await c.query(`delete from payroll_items where id = $1 and run_id = $2`, [itemId, runId]);
}

/** เติมพนักงานที่ใช้งานอยู่แต่ยังไม่อยู่ในงวด — คนที่เพิ่งเพิ่มเข้าทะเบียนหลังเปิดงวด */
export async function addMissingToRunWith(c: Db, runId: string): Promise<number> {
  const period = await lockRunWith(c, runId);
  const { rows } = await c.query(
    `select coalesce(max(line_no), 0) as last from payroll_items where run_id = $1`, [runId]);
  let line = n(rows[0]?.last);
  const have = await c.query(`select employee_id from payroll_items where run_id = $1`, [runId]);
  const inRun = new Set(have.rows.map((r) => r.employee_id as string));
  let added = 0;
  for (const e of await listEmployeesWith(c)) {
    if (inRun.has(e.id)) continue;
    const s = suggestLine(e, period);
    await c.query(
      `insert into payroll_items (tenant_id, run_id, employee_id, line_no, name, position, tax_id,
                                  base, sso, wht)
       values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [runId, e.id, ++line, e.name, e.position, e.taxId, money(s.base), money(s.sso), money(s.wht)]);
    added++;
  }
  return added;
}

export async function deleteRunWith(c: Db, id: string): Promise<void> {
  await c.query(`delete from payroll_runs where id = $1`, [id]);
}

export { lineNet };
