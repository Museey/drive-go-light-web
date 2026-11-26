import type pg from 'pg';

/**
 * นัดหมายและแจ้งเตือนลูกค้า (Light Plus · 02.5) — แกนที่คุยกับฐานข้อมูล
 *
 * นัดสองชนิดในตารางเดียว: repair = นัดรถเข้าซ่อม (มีเวลา) · remind = เตือนลูกค้า
 * (ถึงรอบเช็กระยะ เปลี่ยนถ่าย ต่อ พ.ร.บ./ภาษี) — ต่างกันแค่ป้ายและข้อความที่ร่างให้
 *
 * **ระบบไม่ส่งข้อความเอง** ร้านกดคัดลอกข้อความไปวางใน LINE หรือโทรหาลูกค้า แล้วกด "แจ้งแล้ว"
 * การส่งอัตโนมัติต้องผูก LINE Official Account ของแต่ละอู่ ซึ่งเป็นงานอีกก้อน
 *
 * รับ client ที่ตั้ง app.tenant_id แล้ว ไม่มี server-only (appointments-db.test.ts)
 */

type Db = Pick<pg.ClientBase, 'query'>;

export const APPT_KINDS = [
  { key: 'repair', label: 'นัดเข้าซ่อม' },
  { key: 'remind', label: 'เตือนลูกค้า' },
] as const;
export type ApptKind = (typeof APPT_KINDS)[number]['key'];

export const APPT_STATUS = [
  { key: 'open', label: 'รอ' },
  { key: 'done', label: 'เสร็จแล้ว' },
  { key: 'cancelled', label: 'ยกเลิก' },
] as const;
export type ApptStatus = (typeof APPT_STATUS)[number]['key'];

export const apptKindLabel = (k: string): string => APPT_KINDS.find((x) => x.key === k)?.label ?? k;
export const apptStatusLabel = (k: string): string => APPT_STATUS.find((x) => x.key === k)?.label ?? k;

export interface Appointment {
  id: string;
  kind: ApptKind;
  date: string;
  /** 'HH:MM' หรือ '' = ไม่ระบุเวลา */
  time: string;
  contactId: string | null;
  vehicleId: string | null;
  partyName: string;
  tel: string;
  plate: string;
  title: string;
  note: string;
  status: ApptStatus;
  notifiedAt: string | null;
}

export type AppointmentInput = Omit<Appointment, 'id' | 'status' | 'notifiedAt'> & { id?: string | null };

/** ตัวกรองของหน้ารายการ */
export const APPT_VIEWS = [
  { key: 'upcoming', label: 'ที่จะถึง' },
  { key: 'today', label: 'วันนี้' },
  { key: 'overdue', label: 'เลยกำหนด' },
  { key: 'done', label: 'เสร็จ / ยกเลิก' },
] as const;
export type ApptView = (typeof APPT_VIEWS)[number]['key'];

export const apptViewOf = (v: unknown): ApptView =>
  APPT_VIEWS.some((x) => x.key === v) ? (v as ApptView) : 'upcoming';

const COLS = `id, kind, appt_date::text as appt_date, coalesce(to_char(appt_time, 'HH24:MI'), '') as appt_time,
  contact_id, vehicle_id, party_name, tel, plate, title, note, status, notified_at`;

function apptOf(r: Record<string, unknown>): Appointment {
  return {
    id: String(r.id), kind: r.kind as ApptKind, date: String(r.appt_date), time: String(r.appt_time ?? ''),
    contactId: (r.contact_id as string | null) ?? null, vehicleId: (r.vehicle_id as string | null) ?? null,
    partyName: String(r.party_name ?? ''), tel: String(r.tel ?? ''), plate: String(r.plate ?? ''),
    title: String(r.title), note: String(r.note ?? ''), status: r.status as ApptStatus,
    notifiedAt: r.notified_at ? new Date(r.notified_at as string).toISOString() : null,
  };
}

/**
 * รายการนัดตามมุมมอง — `today` คือวันนี้ตามเวลาไทย ส่งเข้ามาจากผู้เรียก (todayIso)
 * ที่จะถึง/วันนี้/เลยกำหนด เรียงใกล้สุดก่อน · เสร็จ/ยกเลิก เรียงล่าสุดก่อน
 */
export async function listAppointmentsWith(
  c: Db, opts: { view: ApptView; today: string; q?: string; limit?: number },
): Promise<Appointment[]> {
  const params: unknown[] = [opts.today];
  let where: string;
  let order = 'appt_date, appt_time nulls last, created_at';
  switch (opts.view) {
    case 'today': where = `status = 'open' and appt_date = $1`; break;
    case 'overdue': where = `status = 'open' and appt_date < $1`; break;
    case 'done': where = `status <> 'open' and $1::date is not null`; order = 'appt_date desc, created_at desc'; break;
    default: where = `status = 'open' and appt_date >= $1`;
  }
  const term = (opts.q ?? '').trim();
  if (term) {
    params.push(`%${term}%`);
    where += ` and (party_name ilike $${params.length} or tel ilike $${params.length}
                    or plate ilike $${params.length} or title ilike $${params.length})`;
  }
  params.push(opts.limit ?? 300);
  const { rows } = await c.query(
    `select ${COLS} from appointments where ${where} order by ${order} limit $${params.length}`, params);
  return rows.map(apptOf);
}

/** จำนวนนัดที่ยังรออยู่ แยกวันนี้กับเลยกำหนด — ขึ้นเป็นตัวเลขบนแท็บ */
export async function appointmentCountsWith(c: Db, today: string): Promise<{ today: number; overdue: number; upcoming: number }> {
  const { rows } = await c.query(
    `select count(*) filter (where appt_date = $1)::int as today,
            count(*) filter (where appt_date < $1)::int as overdue,
            count(*) filter (where appt_date > $1)::int as upcoming
       from appointments where status = 'open'`, [today]);
  return { today: rows[0]?.today ?? 0, overdue: rows[0]?.overdue ?? 0, upcoming: rows[0]?.upcoming ?? 0 };
}

export async function getAppointmentWith(c: Db, id: string): Promise<Appointment | null> {
  const { rows } = await c.query(`select ${COLS} from appointments where id = $1`, [id]);
  return rows[0] ? apptOf(rows[0]) : null;
}

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function appointmentProblem(a: AppointmentInput): { error: string; field: string } | null {
  if (!ISO_DATE.test(a.date)) return { error: 'ต้องเลือกวันที่นัด', field: 'date' };
  if (a.time && !HHMM.test(a.time)) return { error: 'เวลาต้องเป็นรูปแบบ ชช:นน เช่น 09:30', field: 'time' };
  if (!a.title.trim()) return { error: 'ต้องกรอกเรื่องที่นัด เช่น เช็กระยะ 40,000 กม.', field: 'title' };
  if (!a.partyName.trim() && !a.tel.trim() && !a.plate.trim()) {
    return { error: 'ต้องมีชื่อลูกค้า เบอร์โทร หรือทะเบียนรถอย่างน้อยหนึ่งอย่าง', field: 'partyName' };
  }
  if (a.kind !== 'repair' && a.kind !== 'remind') return { error: 'ชนิดของนัดไม่ถูกต้อง', field: 'kind' };
  return null;
}

export async function saveAppointmentWith(
  c: Db, a: AppointmentInput, userId?: string | null,
): Promise<{ id: string }> {
  /* ลูกค้า/รถที่อ้างต้องเป็นของอู่นี้ — RLS ทำให้ของอู่อื่นมองไม่เห็น คีย์นอกจึงล้มเอง
     แต่ตรวจก่อนเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง (ลูกค้าถูกลบระหว่างเปิดฟอร์มค้างไว้) */
  let contactId = a.contactId;
  let vehicleId = a.vehicleId;
  if (contactId) {
    const ok = await c.query(`select 1 from contacts where id = $1`, [contactId]);
    if (!ok.rows[0]) { contactId = null; vehicleId = null; }
  }
  if (vehicleId) {
    const ok = await c.query(`select 1 from vehicles where id = $1`, [vehicleId]);
    if (!ok.rows[0]) vehicleId = null;
  }
  const args = [
    a.kind, a.date, a.time || null, contactId, vehicleId, a.partyName.trim(), a.tel.trim(),
    a.plate.trim(), a.title.trim(), a.note.trim(),
  ];
  if (a.id) {
    const res = await c.query(
      `update appointments set kind=$2, appt_date=$3, appt_time=$4, contact_id=$5, vehicle_id=$6,
              party_name=$7, tel=$8, plate=$9, title=$10, note=$11
        where id=$1`, [a.id, ...args]);
    if (!res.rowCount) throw new Error('ไม่พบนัดนี้ — อาจถูกลบไปแล้ว');
    return { id: a.id };
  }
  const { rows } = await c.query(
    `insert into appointments (tenant_id, kind, appt_date, appt_time, contact_id, vehicle_id,
                               party_name, tel, plate, title, note, created_by)
     values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [...args, userId ?? null]);
  return { id: rows[0].id as string };
}

export async function setAppointmentStatusWith(c: Db, id: string, status: ApptStatus): Promise<void> {
  await c.query(`update appointments set status = $2 where id = $1`, [id, status]);
}

/** จดว่าแจ้งลูกค้าแล้ว (หรือยกเลิกการจด) — ไม่เปลี่ยนสถานะของนัด */
export async function setAppointmentNotifiedWith(c: Db, id: string, notified: boolean): Promise<void> {
  await c.query(
    `update appointments set notified_at = case when $2 then now() else null end where id = $1`,
    [id, notified]);
}

export async function deleteAppointmentWith(c: Db, id: string): Promise<void> {
  await c.query(`delete from appointments where id = $1`, [id]);
}

/** ค่าตั้งต้นของฟอร์มจากลูกค้า/รถในทะเบียน — ใช้ตอนกด "+ นัดหมาย" จากหน้าลูกค้า */
export async function appointmentPrefillWith(
  c: Db, ids: { contactId?: string | null; vehicleId?: string | null },
): Promise<Pick<Appointment, 'contactId' | 'vehicleId' | 'partyName' | 'tel' | 'plate'>> {
  const out = { contactId: null as string | null, vehicleId: null as string | null, partyName: '', tel: '', plate: '' };
  let contactId = ids.contactId ?? null;

  if (ids.vehicleId) {
    const { rows } = await c.query(
      `select id, contact_id, trim(plate_a || ' ' || plate_b || ' ' || plate_province) as plate
         from vehicles where id = $1`, [ids.vehicleId]);
    if (rows[0]) {
      out.vehicleId = rows[0].id;
      out.plate = String(rows[0].plate ?? '').replace(/\s+/g, ' ').trim();
      contactId = contactId ?? rows[0].contact_id;
    }
  }
  if (contactId) {
    const { rows } = await c.query(
      `select id, tel,
              case when type = 'company' then org_name
                   else trim(prefix || first_name || ' ' || last_name) end as name
         from contacts where id = $1`, [contactId]);
    if (rows[0]) {
      out.contactId = rows[0].id;
      out.partyName = String(rows[0].name ?? '').trim();
      out.tel = String(rows[0].tel ?? '');
    }
  }
  return out;
}

/* =====================================================================
   ข้อความแจ้งลูกค้า — ร่างให้ ร้านคัดลอกไปวางใน LINE เอง
   ===================================================================== */

const TH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function thShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${TH_ABBR[m - 1]} ${y + 543}`;
}

/**
 * ข้อความที่ร่างให้ร้านส่งหาลูกค้า — ภาษาสุภาพ สั้น ลงท้ายชื่อและเบอร์ร้าน
 * ช่องไหนว่างก็ข้ามทั้งวรรค ไม่ทิ้ง "ทะเบียน " ลอย ๆ ไว้ในข้อความ
 */
export function appointmentMessage(
  a: Pick<Appointment, 'kind' | 'date' | 'time' | 'partyName' | 'plate' | 'title'>,
  shop: { name: string; tel?: string | null },
): string {
  const who = a.partyName.trim() ? `เรียน คุณ${a.partyName.trim().replace(/^คุณ/, '')}` : 'เรียนลูกค้า';
  const car = a.plate.trim() ? ` รถทะเบียน ${a.plate.trim()}` : '';
  const when = `${thShort(a.date)}${a.time ? ` เวลา ${a.time} น.` : ''}`;
  const body = a.kind === 'repair'
    ? `${shop.name} ขอยืนยันนัดหมาย${car} เรื่อง ${a.title.trim()} วันที่ ${when}`
    : `${shop.name} ขอแจ้งเตือน${car} ถึงกำหนด ${a.title.trim()} ประมาณวันที่ ${when}`;
  const tail = shop.tel?.trim()
    ? `สอบถามหรือเลื่อนนัดได้ที่ ${shop.tel.trim()} ขอบคุณครับ/ค่ะ`
    : 'สอบถามหรือเลื่อนนัดได้ทางช่องทางนี้ ขอบคุณครับ/ค่ะ';
  return `${who}\n${body}\n${tail}`;
}
