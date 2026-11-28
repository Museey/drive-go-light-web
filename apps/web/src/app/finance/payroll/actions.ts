'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { digits, flag, friendlyDbError, keepValues, money, str, type FormResult } from '@/lib/mutate';
import { isPeriod, type EmpType } from '@/lib/payroll-calc';
import {
  addMissingToRun, createRun, deleteRun, employeeProblem, removeRunItem, saveEmployee, saveRun,
  setEmployeeActive, type EmployeeInput, type RunItemInput,
} from '@/lib/payroll';

/**
 * action ของเงินเดือนและพนักงาน (06.5 · 06.6)
 * ทุกตัวตรวจสิทธิ์แท็บเองก่อน — แพ็กเกจ Plus และสิทธิ์แก้ไขตรวจซ้ำในตัวบันทึก (payroll.ts)
 */

const BAD = 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่';
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function describe(err: unknown, fallback: string, labels: Record<string, string> = {}): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err, labels);
  return err instanceof Error ? err.message : fallback;
}

/* ---------- ทะเบียนพนักงาน ---------- */

export async function saveEmployeeAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  const id = str(fd, 'id');
  if (id && !isUuid(id)) return { error: BAD };

  const type = str(fd, 'empType');
  const input: EmployeeInput = {
    id: id || null,
    code: str(fd, 'code'),
    name: str(fd, 'name'),
    position: str(fd, 'position'),
    empType: (['full', 'probation', 'temp'].includes(type) ? type : 'full') as EmpType,
    taxId: digits(fd, 'taxId'),
    addrText: str(fd, 'addrText'),
    tel: str(fd, 'tel'),
    baseSalary: money(fd, 'baseSalary'),
    ssoEnabled: flag(fd, 'ssoEnabled'),
    whtRate: Number(str(fd, 'whtRate').replace(/,/g, '')) || 0,
    bankName: str(fd, 'bankName'),
    bankAccountNo: str(fd, 'bankAccountNo'),
    startedOn: ISO_DATE.test(str(fd, 'startedOn')) ? str(fd, 'startedOn') : null,
    note: str(fd, 'note'),
  };
  const bad = employeeProblem(input);
  if (bad) return { ...bad, values: keepValues(fd) };

  try {
    await saveEmployee(input);
  } catch (err) {
    return {
      error: describe(err, 'บันทึกพนักงานไม่สำเร็จ', { code: 'รหัสพนักงานนี้มีอยู่แล้ว — เปลี่ยนรหัสแล้วบันทึกอีกครั้ง' }),
      values: keepValues(fd),
    };
  }
  revalidatePath('/finance/payroll/employees');
  redirect('/finance/payroll/employees?saved=1');
}

export async function setEmployeeActiveAction(id: string, active: boolean): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  if (!isUuid(id)) return { error: BAD };
  try {
    await setEmployeeActive(id, active);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }
  revalidatePath('/finance/payroll/employees');
  return { ok: true };
}

/* ---------- งวดเงินเดือน ---------- */

export async function createRunAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  const period = str(fd, 'period');
  if (!isPeriod(period)) return { error: 'เลือกเดือนของงวดเงินเดือนก่อน', field: 'period' };

  let run: { id: string };
  try {
    run = await createRun(period);
  } catch (err) {
    return { error: describe(err, 'เปิดงวดเงินเดือนไม่สำเร็จ'), values: keepValues(fd) };
  }
  revalidatePath('/finance/payroll');
  redirect(`/finance/payroll/${run.id}`);
}

/** บรรทัดส่งมาเป็นชุดช่อง it{n}_id, it{n}_base … แบบเดียวกับชุดอะไหล่ */
function itemsOf(fd: FormData): RunItemInput[] {
  const items: RunItemInput[] = [];
  for (let i = 0; fd.has(`it${i}_id`); i++) {
    items.push({
      id: str(fd, `it${i}_id`),
      base: money(fd, `it${i}_base`),
      overtime: money(fd, `it${i}_ot`),
      otherIncome: money(fd, `it${i}_inc`),
      sso: money(fd, `it${i}_sso`),
      wht: money(fd, `it${i}_wht`),
      otherDeduct: money(fd, `it${i}_ded`),
      note: str(fd, `it${i}_note`),
    });
  }
  return items;
}

export async function saveRunAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  const id = str(fd, 'id');
  const payDate = str(fd, 'payDate');
  if (!isUuid(id)) return { error: BAD };
  if (!ISO_DATE.test(payDate)) return { error: 'ต้องระบุวันที่จ่ายเงินเดือน', field: 'payDate' };

  const items = itemsOf(fd);
  if (items.some((it) => !isUuid(it.id))) return { error: BAD };

  try {
    await saveRun({ id, payDate, note: str(fd, 'note'), items });
  } catch (err) {
    return { error: describe(err, 'บันทึกงวดเงินเดือนไม่สำเร็จ') };
  }
  revalidatePath('/finance/payroll');
  revalidatePath(`/finance/payroll/${id}`);
  return { ok: true };
}

export async function removeRunItemAction(runId: string, itemId: string): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  if (!isUuid(runId) || !isUuid(itemId)) return { error: BAD };
  try {
    await removeRunItem(runId, itemId);
  } catch (err) {
    return { error: describe(err, 'เอาพนักงานออกจากงวดไม่สำเร็จ') };
  }
  revalidatePath(`/finance/payroll/${runId}`);
  return { ok: true };
}

export async function addMissingAction(runId: string): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  if (!isUuid(runId)) return { error: BAD };
  try {
    const added = await addMissingToRun(runId);
    revalidatePath(`/finance/payroll/${runId}`);
    return { ok: true, values: { added: String(added) } };
  } catch (err) {
    return { error: describe(err, 'เพิ่มพนักงานเข้างวดไม่สำเร็จ') };
  }
}

export async function deleteRunAction(id: string): Promise<FormResult> {
  await requireTab('finance', 'payroll');
  if (!isUuid(id)) return { error: BAD };
  try {
    await deleteRun(id);
  } catch (err) {
    return { error: describe(err, 'ลบงวดเงินเดือนไม่สำเร็จ') };
  }
  revalidatePath('/finance/payroll');
  return { ok: true };
}
