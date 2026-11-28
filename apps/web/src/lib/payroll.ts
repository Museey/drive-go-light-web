import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { assertPlusWith } from './plan-core';
import {
  addMissingToRunWith, createRunWith, deleteRunWith, getEmployeeWith, getRunWith, listEmployeesWith,
  listRunsWith, nextEmployeeCodeWith, removeRunItemWith, saveEmployeeWith, saveRunWith,
  setEmployeeActiveWith, type Employee, type EmployeeInput, type PayrollRun, type PayrollRunRow,
  type RunItemInput,
} from './payroll-core';

export type {
  Employee, EmployeeInput, PayrollItem, PayrollRun, PayrollRunRow, RunItemInput,
} from './payroll-core';
export { employeeProblem } from './payroll-core';

/**
 * เงินเดือนและพนักงาน (06.5 · 06.6) — ผูกกับ session
 *
 * ทุกตัวตรวจแพ็กเกจ Plus ในทรานแซกชันเดียวกับงานจริง ทั้งอ่านและเขียน
 * สิทธิ์ผูกกับแท็บ finance.payroll (ทะเบียนพนักงานเป็นแท็บลูก ใช้สิทธิ์เดียวกัน)
 * หน้าที่เรียกต้อง requireTab('finance', 'payroll') เองก่อนเสมอ
 */

const SUB = { sub: 'payroll' } as const;

export async function listEmployees(opts: { all?: boolean } = {}): Promise<Employee[]> {
  return query(async (c) => { await assertPlusWith(c); return listEmployeesWith(c, opts); });
}

export async function getEmployee(id: string): Promise<Employee | null> {
  return query(async (c) => { await assertPlusWith(c); return getEmployeeWith(c, id); });
}

export async function nextEmployeeCode(): Promise<string> {
  return query(async (c) => { await assertPlusWith(c); return nextEmployeeCodeWith(c); });
}

export async function saveEmployee(e: EmployeeInput): Promise<{ id: string }> {
  return mutate('finance', async (c) => { await assertPlusWith(c); return saveEmployeeWith(c, e); }, SUB);
}

export async function setEmployeeActive(id: string, active: boolean): Promise<void> {
  return mutate('finance', async (c) => { await assertPlusWith(c); await setEmployeeActiveWith(c, id, active); }, SUB);
}

export async function listRuns(): Promise<PayrollRunRow[]> {
  return query(async (c) => { await assertPlusWith(c); return listRunsWith(c); });
}

export async function getRun(id: string): Promise<PayrollRun | null> {
  return query(async (c) => { await assertPlusWith(c); return getRunWith(c, id); });
}

export async function createRun(period: string): Promise<{ id: string }> {
  return mutate('finance', async (c, userId) => {
    await assertPlusWith(c);
    return createRunWith(c, { period, userId });
  }, SUB);
}

export async function saveRun(input: {
  id: string; payDate: string; note: string; items: RunItemInput[];
}): Promise<void> {
  return mutate('finance', async (c) => { await assertPlusWith(c); await saveRunWith(c, input); }, SUB);
}

export async function removeRunItem(runId: string, itemId: string): Promise<void> {
  return mutate('finance', async (c) => { await assertPlusWith(c); await removeRunItemWith(c, runId, itemId); }, SUB);
}

export async function addMissingToRun(runId: string): Promise<number> {
  return mutate('finance', async (c) => { await assertPlusWith(c); return addMissingToRunWith(c, runId); }, SUB);
}

export async function deleteRun(id: string): Promise<void> {
  return mutate('finance', async (c) => { await assertPlusWith(c); await deleteRunWith(c, id); }, SUB);
}
