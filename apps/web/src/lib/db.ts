import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { SHOP_TZ, today } from '@drivegolight/core';

/**
 * คอลัมน์ date (oid 1082) ต้องกลับมาเป็นสตริง 'YYYY-MM-DD'
 *
 * ค่าตั้งต้นของ pg คือแปลงเป็น JS Date ที่เที่ยงคืนตามเวลาเครื่อง พอเรียก
 * toISOString() ต่อจะได้วันที่ก่อนหน้า 1 วันเสมอในเขตเวลาไทย (UTC+7)
 * วันครบกำหนดชำระและวันที่บนเอกสารจะเพี้ยนทั้งระบบ
 *
 * เป็นบั๊กเดียวกับที่โปรแกรมรุ่นเดิมเคยเจอ — ดูคอมเมนต์เหนือ iso() ใน legacy/
 */
pg.types.setTypeParser(1082, (v) => v);

/** numeric (oid 1700) กลับมาเป็นสตริงตามค่าตั้งต้นอยู่แล้ว — แปลงเองตอนใช้ ห้ามให้ pg ปัดให้ */

declare global {
  // eslint-disable-next-line no-var
  var __dglPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var __dglRlsChecked: boolean | undefined;
  // eslint-disable-next-line no-var
  var __dglTzChecked: boolean | undefined;
}

function makePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('ยังไม่ได้ตั้งตัวแปรแวดล้อม DATABASE_URL — ดู apps/web/.env.example');
  }
  /**
   * จำนวน connection สูงสุดต่อโพรเซส
   *
   * แต่ละ connection กิน RAM ฝั่ง Postgres ราว 5–10 MB ซึ่งสำคัญมากบนแพ็กเกจเล็ก
   * ที่มี RAM ไม่กี่ร้อยเมกะไบต์ — ตั้งสูงเกินแล้วฐานข้อมูลจะโดนฆ่าเพราะหน่วยความจำหมด
   * ก่อนที่ CPU จะทำงานหนักเสียอีก
   *
   * ตั้งได้จาก DB_POOL_MAX เพื่อปรับตามแพ็กเกจโดยไม่ต้องแก้โค้ด
   * ค่าตั้งต้น 5 พอสำหรับอู่หลักสิบราย — คิวรีที่หนักที่สุดในระบบใช้เวลาไม่ถึง 2 ms
   */
  const max = Number(process.env.DB_POOL_MAX) || 5;
  /**
   * รอ connection ว่างได้ไม่เกิน 10 วินาที แล้วให้คำขอนั้นล้ม — **ไม่ใช่รอไปตลอดกาล**
   *
   * ค่าตั้งต้นของ pg คือรอไม่มีกำหนด ถ้า pool ตัน (ดู acquire() ข้างล่าง) ทุกคำขอที่ต้องใช้ฐาน
   * จะค้างทั้งเซิร์ฟเวอร์ ทุกอู่ที่อยู่บนเครื่องเดียวกัน จนกว่าจะมีคนรีสตาร์ต — เจอจริงตอนยิง
   * รับชำระพร้อมกัน 10 เครื่อง (21 ก.ย. 2569) · คิวรีของระบบใช้เวลาหลักมิลลิวินาที
   * รอ 10 วินาทีแล้วยังไม่ได้แปลว่ามีอะไรผิดปกติแน่ ล้มแล้วบอกผู้ใช้ดีกว่าแขวนทุกคนไว้
   */
  return new pg.Pool({ connectionString, max, connectionTimeoutMillis: 10_000 });
}

/**
 * การขอ connection ซ้อนในคำขอเดียวกัน — ต้นเหตุของ pool ตัน
 *
 * คำขอที่ถือ connection ในทรานแซกชันอยู่แล้ว ขออีกเส้น (เช่นเรียก requireEdit หรือ query()
 * ซึ่งไปโหลดเซสชันใหม่) ถ้ามีคำขอแบบนี้พร้อมกันเท่ากับขนาด pool ต่างคนต่างถือหนึ่งเส้นแล้วรอเส้นที่สอง
 * ซึ่งไม่มีวันว่าง — ใช้ connection ที่ถืออยู่ หรือโหลดของที่ต้องใช้ก่อนเปิดทรานแซกชันแทน
 */
export class NestedConnectionError extends Error {
  constructor() {
    super(
      'ขอ connection ฐานข้อมูลซ้อนขณะที่คำขอนี้ถืออยู่แล้วหนึ่งเส้น — ถ้ามีคำขอแบบนี้พร้อมกันเท่าขนาด pool '
      + 'เซิร์ฟเวอร์จะค้างทั้งตัว ให้ใช้ client ที่ส่งเข้ามา หรือโหลดของที่ต้องใช้ก่อนเปิดทรานแซกชัน (db.ts)',
    );
    this.name = 'NestedConnectionError';
  }
}

/** คำขอนี้ (async context เดียวกัน) ถือ connection อยู่หรือไม่ */
const holding = new AsyncLocalStorage<true>();

/**
 * ขอ connection จาก pool — ทางเดียวที่ withTenant และ withoutTenant ใช้
 *
 * ขอซ้อน: ตอนพัฒนาและตอนรันเทสต์โยนทันที ให้ชุดทดสอบทั้งหมด (รวม e2e) กวาดหาจุดที่หลุดให้
 * บนเครื่องจริงแค่บันทึกไว้แล้วทำต่อ — การขอซ้อนเส้นเดียวไม่ได้ทำให้พังถ้าไม่ได้มาพร้อมกันหลายคำขอ
 * การโยนทิ้งบนเครื่องจริงจะเปลี่ยนความเสี่ยงเป็นความเสียหายแน่นอน · กันค้างด้วย connectionTimeoutMillis แทน
 */
async function acquire(): Promise<pg.PoolClient> {
  if (holding.getStore()) {
    const err = new NestedConnectionError();
    if (process.env.NODE_ENV !== 'production') throw err;
    console.error(err);
  }
  try {
    return await getPool().connect();
  } catch (err) {
    if (err instanceof Error && /timeout exceeded when trying to connect/i.test(err.message)) {
      throw new Error('ระบบกำลังมีคนใช้งานพร้อมกันมาก รอบนี้จึงยังไม่ได้บันทึก — รอสักครู่แล้วลองอีกครั้ง');
    }
    throw err;
  }
}

/**
 * สร้าง pool ตอนเรียกใช้จริง ไม่ใช่ตอน import โมดูล
 *
 * `next build` จะ import โมดูลของทุกหน้าเพื่อเก็บข้อมูลหน้า ถ้าสร้าง pool
 * ที่ระดับโมดูล การ build จะพังทันทีเมื่อไม่มี DATABASE_URL — ซึ่งเป็นเรื่องปกติ
 * ของเครื่อง CI และของนักพัฒนาที่ยังไม่ได้ตั้งฐานข้อมูล **การ build ไม่ควรต้อง
 * มีฐานข้อมูล** ให้พังตอนมีคนขอข้อมูลจริงแทน
 *
 * dev server รีโหลดโมดูลบ่อย — เก็บ pool ไว้บน globalThis กัน connection รั่ว
 */
function getPool(): pg.Pool {
  return globalThis.__dglPool ?? (globalThis.__dglPool = makePool());
}

/**
 * ตรวจว่า role ที่ต่ออยู่ไม่ข้าม Row Level Security
 *
 * superuser และ role ที่มี BYPASSRLS จะมองเห็นข้อมูลทุกอู่โดยไม่มีอาการผิดปกติ
 * ให้เห็นเลย — แอปจะดูเหมือนทำงานได้ปกติจนกว่าจะมีอู่ที่สอง แล้วข้อมูลรั่วข้ามกัน
 * ยอมให้พังตั้งแต่ต้นดีกว่าปล่อยให้เงียบ
 */
async function assertRlsEnforced(client: pg.PoolClient): Promise<void> {
  if (globalThis.__dglRlsChecked) return;

  const { rows } = await client.query<{
    rolsuper: boolean; rolbypassrls: boolean; owns_unforced: string | null;
  }>(
    `select r.rolsuper, r.rolbypassrls,
            (select string_agg(c.relname, ', ' order by c.relname)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind = 'r'
                and c.relrowsecurity
                and not c.relforcerowsecurity
                and pg_get_userbyid(c.relowner) = current_user) as owns_unforced
       from pg_roles r where r.rolname = current_user`,
  );
  const role = rows[0];
  if (role?.rolsuper || role?.rolbypassrls) {
    throw new Error(
      'แอปต่อฐานข้อมูลด้วย role ที่ข้าม Row Level Security ได้ ' +
      '(superuser หรือมี BYPASSRLS) — ข้อมูลจะรั่วข้ามอู่โดยไม่มีอาการให้เห็น\n' +
      'สร้าง role สำหรับแอปด้วย db/app-role.sql แล้วเปลี่ยน DATABASE_URL ไปใช้ role นั้น',
    );
  }

  /**
   * ชั้นที่มาแทน force row level security ของตาราง users กับ tenants
   *
   * สองตารางนั้นปิด force ไว้โดยตั้งใจ เพราะฟังก์ชัน auth.* ต้องหาผู้ใช้จากอีเมล
   * ข้ามทุกอู่ตอนล็อกอิน (ดู db/012_auth_rls.sql) ผลข้างเคียงคือ **เจ้าของตาราง
   * อ่านข้ามอู่ได้** ตราบใดที่แอปไม่ได้ต่อด้วย role ที่เป็นเจ้าของ ก็ไม่มีปัญหา
   *
   * ตรวจตรงนี้เพราะถ้าวันหนึ่งมีคนตั้ง DATABASE_URL ให้ชี้ไปที่ role เจ้าของ
   * (ซึ่งเป็นสิ่งที่ทำง่ายมากตอนกู้ระบบตอนตีสาม) ข้อมูลจะรั่วข้ามอู่ทันที
   * โดยไม่มีอาการอะไรให้เห็นเลย — ยอมให้พังตั้งแต่ต้นดีกว่า
   */
  if (role?.owns_unforced) {
    throw new Error(
      `แอปต่อฐานข้อมูลด้วย role ที่เป็นเจ้าของตาราง ${role.owns_unforced} ` +
      'ซึ่งปิด force row level security ไว้ — เจ้าของตารางจึงอ่านข้ามอู่ได้ ' +
      'และข้อมูลจะรั่วโดยไม่มีอาการให้เห็น\n' +
      'ตั้ง DATABASE_URL ให้ชี้ไปที่ role ของแอป (dgl_app) ไม่ใช่ role ของผู้ดูแล',
    );
  }
  globalThis.__dglRlsChecked = true;
}

/**
 * ตรวจว่าฐานข้อมูลกับแอปเห็นวันที่ตรงกัน
 *
 * ค่าตั้งต้นของหลายคอลัมน์เป็น current_date และรายงานหลายตัวเทียบกับ current_date
 * ส่วนแอปคิดวันที่ตามเวลาไทยเสมอ ถ้าฐานข้อมูลตั้งเป็น UTC (ค่าตั้งต้นของ Docker
 * และเซิร์ฟเวอร์ส่วนใหญ่) ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าสองฝั่งจะต่างกันหนึ่งวัน
 * แล้วเอกสารกับการเคลื่อนไหวสต๊อกของงานเดียวกันจะลงคนละวัน โดยไม่มีอาการให้เห็น
 *
 * แก้ด้วย db/app-role.sql ซึ่งตั้ง timezone ให้ role ของแอปไว้แล้ว
 */
async function assertClockAgrees(client: pg.PoolClient): Promise<void> {
  if (globalThis.__dglTzChecked) return;

  const { rows } = await client.query<{ db_date: string; tz: string }>(
    `select current_date::text as db_date, current_setting('timezone') as tz`,
  );
  const dbDate = rows[0]?.db_date;
  const appDate = today();

  if (dbDate !== appDate) {
    throw new Error(
      `ฐานข้อมูลกับแอปเห็นวันที่ไม่ตรงกัน — ฐานข้อมูลว่า ${dbDate} แอปว่า ${appDate} ` +
      `(เขตเวลาของฐานข้อมูลคือ ${rows[0]?.tz} แอปใช้ ${SHOP_TZ})
` +
      'เอกสารกับการเคลื่อนไหวสต๊อกจะลงคนละวัน แก้ด้วยการรัน db/app-role.sql ' +
      `หรือสั่ง alter role dgl_app set timezone = '${SHOP_TZ}';`,
    );
  }
  globalThis.__dglTzChecked = true;
}

/**
 * รัน query ในนามของอู่หนึ่งราย
 *
 * ทุกการอ่านเขียนข้อมูลต้องผ่านฟังก์ชันนี้ ห้ามเรียก pool.query() ตรง ๆ
 * เพราะ app.tenant_id ตั้งแบบ local ซึ่งมีผลเฉพาะในทรานแซกชัน ถ้าไม่มีทรานแซกชัน
 * RLS จะกรองทุกแถวออกหมด (หรือแย่กว่านั้นคือใช้ค่าที่ค้างจาก request ก่อน)
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
  userId: string | null = null,
): Promise<T> {
  const client = await acquire();
  try {
    await assertRlsEnforced(client);
    await assertClockAgrees(client);
    await client.query('begin');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
    /**
     * ใครเป็นคนทำ — trigger ประวัติการบันทึกเอกสารอ่านค่านี้
     *
     * ตั้งแบบ local เหมือน app.tenant_id เพื่อไม่ให้ค่าค้างข้าม request
     * connection ถูกใช้ซ้ำจาก pool ถ้าตั้งแบบ session ค่าของคนก่อนหน้าจะติดมา
     * แล้วประวัติจะบันทึกชื่อผิดคนโดยไม่มีอาการอะไรให้เห็น
     */
    await client.query(`select set_config('app.user_id', $1, true)`, [userId ?? '']);
    const result = await holding.run(true, () => fn(client));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    await noteFailure(client, err, tenantId);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * บันทึกข้อผิดพลาดที่หลุดออกจากการทำงานกับฐานข้อมูล
 *
 * ที่นี่คือจุดคอขวดที่แคบที่สุดของฝั่งเซิร์ฟเวอร์ — ทุกหน้า ทุก action
 * และทุก route ที่ทำงานจริงต้องผ่านทางนี้ ดักที่เดียวจึงครอบคลุมเกือบทั้งหมด
 * โดยไม่ต้องไปแก้ทุกจุดแล้วลืมจุดใดจุดหนึ่ง
 *
 * (เคยลองใช้ instrumentation.ts ของ Next ซึ่งเป็นที่ที่ควรใช้ที่สุด แต่ไฟล์นั้น
 *  ถูกรวมเข้าไปในทุก runtime ที่ Next รองรับ การ import ตัวต่อฐานข้อมูลจึงทำให้
 *  ทั้งแอป bundle ไม่ผ่าน เพราะ pg ต้องการโมดูล fs ที่ runtime อื่นไม่มี)
 *
 * ห้ามโยนต่อไม่ว่าเกิดอะไรขึ้น — ตัวบันทึกที่พังแล้วกลบข้อผิดพลาดตัวจริงทิ้ง
 * คือของที่ทำให้ไล่ปัญหาไม่ได้เลย
 */
async function noteFailure(
  client: pg.PoolClient, err: unknown, tenantId: string | null,
): Promise<void> {
  try {
    const { recordErrorWith } = await import('./ops-core');
    const e = err as Error & { digest?: string };
    await recordErrorWith(client, {
      kind: 'server',
      message: e?.message ?? String(err),
      stack: e?.stack ?? null,
      digest: e?.digest ?? null,
      tenantId,
    });
  } catch {
    /* เงียบไว้ */
  }
}

/**
 * query ที่ไม่ผูกกับอู่ใดอู่หนึ่ง — ใช้ได้เฉพาะตอนเข้าสู่ระบบและงานดูแลระบบ
 * ตาราง tenants มี RLS อยู่ด้วย จึงอ่านได้เฉพาะคอลัมน์ที่นโยบายอนุญาต
 */
export async function withoutTenant<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await acquire();
  try {
    await assertRlsEnforced(client);
    await assertClockAgrees(client);
    return await holding.run(true, () => fn(client));
  } finally {
    client.release();
  }
}

export type { PoolClient } from 'pg';
