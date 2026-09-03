import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';

const n = (v: unknown): number => Number(v ?? 0);

export { PERM_KEYS, PERM_LABEL, type PermKey, type StaffUser } from './perms';
import { seatsLeft, type PermKey, type Perms, type StaffUser } from './perms';

/* =====================================================================
   ข้อมูลร้าน
   ===================================================================== */

export interface ShopSettings {
  name: string;
  taxId: string;
  addrText: string;
  tel: string;
  tel2: string;
  vatRate: number;
  whtRate: number;
  priceTier: 'A' | 'B' | 'C';
  proposerName: string;
  warrantyText: string;
  logoUrl: string;
}

export async function getShopSettings(): Promise<ShopSettings> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select name, tax_id, addr_text, tel, tel2, vat_rate, wht_rate,
              price_tier, proposer_name, warranty_text, logo_url
       from tenants where id = current_tenant_id()`,
    );
    const r = rows[0];
    return {
      name: r.name, taxId: r.tax_id ?? '', addrText: r.addr_text ?? '',
      tel: r.tel ?? '', tel2: r.tel2 ?? '',
      vatRate: n(r.vat_rate), whtRate: n(r.wht_rate),
      priceTier: r.price_tier, proposerName: r.proposer_name ?? '',
      warrantyText: r.warranty_text ?? '', logoUrl: r.logo_url ?? '',
    };
  });
}

/**
 * บันทึกข้อมูลร้าน
 *
 * อัตราภาษีที่แก้ตรงนี้มีผลกับเอกสารที่ออกใหม่เท่านั้น
 * เอกสารเดิมเก็บอัตรา ณ วันที่ออกไว้ในตัวเองแล้ว จึงไม่เปลี่ยนตาม
 */
export async function saveShopSettings(input: ShopSettings): Promise<void> {
  return mutate('settings', async (c) => {
    await c.query(
      `update tenants set name=$1, tax_id=$2, addr_text=$3, tel=$4, tel2=$5,
              vat_rate=$6, wht_rate=$7, price_tier=$8, proposer_name=$9,
              warranty_text=$10, logo_url=$11
       where id = current_tenant_id()`,
      [
        input.name, input.taxId || null, input.addrText, input.tel, input.tel2,
        input.vatRate, input.whtRate, input.priceTier, input.proposerName,
        input.warrantyText || null, input.logoUrl || null,
      ],
    );
  }, { sub: 'shop', allowExpired: true });
}

/* =====================================================================
   ผู้ใช้งาน
   ===================================================================== */

export async function listUsers(): Promise<StaffUser[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select id, code, name, email, role::text as role, perms, active,
              password_hash is not null as has_password, last_login_at, locked_until
       from users order by role, code`,
    );
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, email: r.email ?? '',
      role: r.role, perms: (r.perms ?? {}) as Perms, active: r.active,
      hasPassword: r.has_password, lastLoginAt: r.last_login_at,
      lockedUntil: r.locked_until,
    }));
  });
}

export interface StaffInput {
  id?: string;
  /** รหัสพนักงานสำหรับอ้างอิงในเอกสาร — ไม่ใช่รหัสเข้าระบบ */
  code: string;
  name: string;
  /** อีเมลที่ใช้เข้าระบบจริง */
  email: string;
  perms: Perms;
  active: boolean;
}

/** รหัสพนักงานถัดไป — U01, U02, … เหมือน genUserCode() ของเดิม */
export async function nextUserCode(): Promise<string> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select coalesce(max(substring(code from '[0-9]+$')::int), 0) as last
       from users where code ~ '^U[0-9]+$'`,
    );
    return 'U' + String(Number(rows[0].last) + 1).padStart(2, '0');
  });
}

/**
 * เพิ่มหรือแก้พนักงาน
 *
 * ห้ามผู้ใช้ถอดสิทธิ์ตั้งค่าร้านหรือปิดการใช้งานของตัวเอง
 * ไม่งั้นเจ้าของอู่กดพลาดครั้งเดียวก็ล็อกตัวเองออกจากระบบถาวร
 */
export async function saveStaff(input: StaffInput, currentUserId: string): Promise<string> {
  return mutate('settings', async (c) => {
    if (input.id === currentUserId) {
      if (!input.active) throw new Error('ปิดการใช้งานบัญชีของตัวเองไม่ได้');
      if (input.perms.menus?.settings !== true) {
        throw new Error('ถอดสิทธิ์ตั้งค่าร้านของตัวเองไม่ได้ — จะเข้าหน้านี้ไม่ได้อีก');
      }
      if (input.perms.tabs?.['settings.staff'] === false) {
        throw new Error('ปิดแท็บตั้งค่าพนักงานของตัวเองไม่ได้ — จะเข้าหน้านี้ไม่ได้อีก');
      }
    }

    if (input.id) {
      const before = await c.query(`select role::text as role from users where id = $1`, [input.id]);
      if (!before.rows[0]) throw new Error('ไม่พบผู้ใช้');

      /* เจ้าของกิจการต้องเหลืออย่างน้อยหนึ่งคนที่ยังใช้งานได้เสมอ */
      if (before.rows[0].role === 'owner' && !input.active) {
        const others = await c.query(
          `select count(*)::int as c from users
           where role = 'owner' and active and id <> $1`, [input.id],
        );
        if (others.rows[0].c === 0) {
          throw new Error('ปิดการใช้งานเจ้าของกิจการคนสุดท้ายไม่ได้ — ตั้งเจ้าของคนใหม่ก่อน');
        }
      }

      await c.query(
        `update users set code=$2, name=$3, email=$4, perms=$5, active=$6 where id=$1`,
        [input.id, input.code, input.name, input.email || null,
         JSON.stringify(input.perms), input.active],
      );
      return input.id;
    }

    /* ที่นั่งพนักงานตามแพ็กเกจ — ตรวจตอนสร้างบัญชีใหม่เท่านั้น ไม่ตรวจตอนล็อกอิน
       ลดแพ็กเกจแล้วต้องไม่มีใครถูกล็อกออกจากระบบกลางดึกโดยไม่รู้ตัว
       เจ้าของกิจการไม่ถูกนับ เพราะที่นั่งที่ขายคือที่นั่งพนักงาน */
    const seat = await c.query(
      `select (select max_users from subscriptions
                order by expires_on desc limit 1) as max_users,
              (select count(*)::int from users
                where role = 'staff' and active) as staff`,
    );
    const max = seat.rows[0].max_users === null ? null : Number(seat.rows[0].max_users);
    if (seatsLeft(max, Number(seat.rows[0].staff)) === 0) {
      throw new Error(
        `แพ็กเกจนี้เปิดบัญชีพนักงานได้ ${max} คน — ` +
        'ปิดการเข้าใช้งานของคนที่ไม่ได้ทำงานแล้ว หรือติดต่อผู้ให้บริการเพื่อเพิ่มจำนวน',
      );
    }

    const { rows } = await c.query(
      `insert into users (tenant_id, code, name, email, role, perms, active)
       values (current_tenant_id(), $1, $2, $3, 'staff', $4, $5)
       returning id`,
      [input.code, input.name, input.email || null,
       JSON.stringify(input.perms), input.active],
    );
    return rows[0].id;
  }, { sub: 'staff', allowExpired: true });
}

/** ให้สิทธิ์เจ้าของกิจการกับพนักงานอีกคน — ใช้ตอนเปลี่ยนมือหรือมีหุ้นส่วน */
export async function promoteToOwner(userId: string): Promise<void> {
  return mutate('settings', async (c) => {
    await c.query(
      `update users set role = 'owner',
              perms = jsonb_build_object('menus', jsonb_build_object(
                'customer', true, 'income', true, 'expense', true,
                'stock', true, 'finance', true, 'settings', true))
       where id = $1`,
      [userId],
    );
  }, { sub: 'staff' });
}

export async function getUserById(id: string): Promise<StaffUser | null> {
  const all = await listUsers();
  return all.find((u) => u.id === id) ?? null;
}
