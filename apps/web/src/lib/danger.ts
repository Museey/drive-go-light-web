import 'server-only';
import { mutate } from './mutate';

/**
 * ลบข้อมูลของอู่ทั้งหมดอย่างถาวร
 *
 * มีไว้รองรับสิทธิ์ขอให้ลบข้อมูลตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
 * ทุกตารางผูก tenant_id ด้วย ON DELETE CASCADE อยู่แล้ว ลบแถวใน tenants
 * แถวเดียวจึงพาข้อมูลทั้งหมดไปด้วย รวมถึง session และลิงก์ตั้งรหัสผ่านในสคีมา auth
 *
 * ให้พิมพ์ชื่ออู่ยืนยันก่อน เพราะกดพลาดแล้วไม่มีทางกลับ
 * และหน้าจอบอกให้ส่งออกไฟล์สำรองก่อนเสมอ
 */
export async function deleteTenantData(confirmName: string): Promise<void> {
  return mutate('settings', async (c) => {
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
