import 'server-only';
import { query } from './auth';
import { plusWith } from './plan-core';

export {
  assertPlusWith, isPlusPlan, PLAN_CHOICES, PLAN_LIGHT, PLAN_PLUS, planLabel,
  PLUS_REQUIRED_MESSAGE, PlusRequiredError, plusWith,
} from './plan-core';

/** อู่ของผู้ใช้ที่ล็อกอินอยู่เป็น Light Plus ไหม — ใช้ในหน้าเพื่อเลือกระหว่างเนื้อหากับการ์ดชวนอัปเกรด */
export async function getPlus(): Promise<boolean> {
  return query((c) => plusWith(c));
}
