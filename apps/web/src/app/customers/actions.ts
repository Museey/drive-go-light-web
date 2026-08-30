'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteContact, saveContact } from '@/lib/contacts';
import { readVehicles } from '@/lib/read-vehicles';
import { digits, friendlyDbError, keepValues, str, type FormResult } from '@/lib/mutate';

export async function saveContactAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const id = str(fd, 'id') || undefined;
  const type = str(fd, 'type') === 'company' ? 'company' : 'person';
  const kind = str(fd, 'kind') === 'vendor' ? 'vendor' : 'customer';

  const kept = keepValues(fd);

  const code = str(fd, 'code');
  if (!code) return { error: 'ต้องกรอกรหัสผู้ติดต่อ', field: 'code', values: kept };

  const orgName = str(fd, 'orgName');
  const firstName = str(fd, 'firstName');
  const lastName = str(fd, 'lastName');

  if (type === 'company' && !orgName) {
    return { error: 'นิติบุคคลต้องกรอกชื่อบริษัท / ห้างหุ้นส่วน', field: 'orgName', values: kept };
  }
  if (type === 'person' && !firstName && !lastName) {
    return { error: 'บุคคลธรรมดาต้องกรอกชื่อหรือนามสกุลอย่างน้อยหนึ่งช่อง', field: 'firstName', values: kept };
  }

  const taxId = digits(fd, 'taxId');
  if (taxId && taxId.length !== 13) {
    return { error: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก — เว้นว่างไว้ได้ถ้ายังไม่ทราบ', field: 'taxId', values: kept };
  }

  let savedId: string;
  try {
    savedId = await saveContact({
      id, code, kind, type,
      prefix: str(fd, 'prefix'), firstName, lastName, orgName, taxId,
      addr: {
        no: str(fd, 'addr_no'), village: str(fd, 'addr_village'), moo: str(fd, 'addr_moo'),
        soi: str(fd, 'addr_soi'), road: str(fd, 'addr_road'),
        subdistrict: str(fd, 'addr_subdistrict'), district: str(fd, 'addr_district'),
        province: str(fd, 'addr_province'), zip: str(fd, 'addr_zip'),
      },
      addrText: str(fd, 'addrText'),
      tel: str(fd, 'tel'), tel2: str(fd, 'tel2'), email: str(fd, 'email'),
      note: str(fd, 'note'),
      creditDays: Math.max(0, Math.trunc(Number(str(fd, 'creditDays')) || 0)),
      vehicles: readVehicles(fd),
    });
  } catch (err) {
    return { error: friendlyDbError(err, { code: `รหัส "${code}" ถูกใช้ไปแล้ว` }), field: 'code', values: kept };
  }

  revalidatePath('/customers');
  redirect(`/customers/${savedId}?saved=1`);
}

export async function deleteContactAction(id: string): Promise<void> {
  const result = await deleteContact(id);
  if (!result.ok) {
    redirect(`/customers/${id}?error=${encodeURIComponent(result.reason ?? 'ลบไม่สำเร็จ')}`);
  }
  revalidatePath('/customers');
  redirect('/customers');
}
