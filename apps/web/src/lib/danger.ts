import 'server-only';
import { mutate } from './mutate';
import { assertOwnerPasswordWith } from './trash-core';

/**
 * ลบข้อมูลของอู่ทั้งหมดอย่างถาวร
 *
 * มีไว้รองรับสิทธิ์ขอให้ลบข้อมูลตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
 * ทุกตารางผูก tenant_id ด้วย ON DELETE CASCADE อยู่แล้ว ลบแถวใน tenants
 * แถวเดียวจึงพาข้อมูลทั้งหมดไปด้วย รวมถึง session และลิงก์ตั้งรหัสผ่านในสคีมา auth
 *
 * เฉพาะเจ้าของกิจการ ต้องใส่รหัสผ่านของตัวเอง และพิมพ์ชื่ออู่ยืนยัน เพราะกดพลาดแล้วไม่มีทางกลับ
 * และหน้าจอบอกให้ส่งออกไฟล์สำรองก่อนเสมอ
 */
export async function deleteTenantData(confirmName: string, password: string): Promise<void> {
  return mutate('settings', async (c, userId, session) => {
    /* เฉพาะเจ้าของกิจการ และต้องใส่รหัสผ่านของเจ้าของซ้ำ — เกณฑ์เดียวกับการลบเอกสารถาวรในถังขยะ
       ลบทั้งอู่หนักกว่าลบเอกสารใบเดียวมาก จะปล่อยให้ผ่านง่ายกว่าไม่ได้
       ตรวจในทรานแซกชันเดียวกับที่ลบ · เครื่องที่เปิดค้างไว้แล้วคนอื่นมากดก็ลบไม่ได้ */
    await assertOwnerPasswordWith(c, { userId, role: session.role }, password);

    const { rows } = await c.query(
      `select name from tenants where id = current_tenant_id()`,
    );
    const actual = rows[0]?.name ?? '';

    if (confirmName.trim() !== actual.trim()) {
      throw new Error(`ชื่อที่พิมพ์ไม่ตรงกับชื่ออู่ — ต้องพิมพ์ว่า "${actual}" ให้ตรงทุกตัวอักษร`);
    }

    await c.query(`delete from tenants where id = current_tenant_id()`);
  }, { sub: 'shop', allowExpired: true });
}
