'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { query, requirePerm } from '@/lib/auth';
import { friendlyDbError, keepValues, money, qty, str, type FormResult } from '@/lib/mutate';
import { mutate } from '@/lib/mutate';
import { isClaimSide, saveClaim, voidClaim, type ClaimItemInput } from '@/lib/claims';
import { searchProducts } from '@/lib/sales';
import { searchCustomers } from '@/lib/sales';
import { searchVendors } from '@/lib/purchases';
import { plateOf } from '@/lib/doc-chain';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

/**
 * รายการสินค้าส่งมาเป็นชุดช่องที่ลงท้ายด้วยลำดับ — it{n}_pid, it{n}_qty, …
 * บรรทัดที่ไม่มีทั้งชื่อและสินค้าถือว่าเป็นแถวว่างที่ผู้ใช้ไม่ได้กรอก ข้ามไป
 */
function itemsOf(fd: FormData): ClaimItemInput[] {
  const items: ClaimItemInput[] = [];
  for (let i = 0; ; i++) {
    if (!fd.has(`it${i}_name`) && !fd.has(`it${i}_pid`)) break;
    const name = str(fd, `it${i}_name`);
    const pid = str(fd, `it${i}_pid`);
    if (!name && !pid) continue;
    items.push({
      productId: pid || null,
      code: str(fd, `it${i}_code`),
      oem: str(fd, `it${i}_oem`),
      name,
      unit: str(fd, `it${i}_unit`),
      qty: qty(fd, `it${i}_qty`),
      unitCost: money(fd, `it${i}_cost`),
    });
  }
  return items;
}

export async function saveClaimAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('stock');

  const side = str(fd, 'side');
  if (!isClaimSide(side)) return { error: 'ทิศทางของใบเคลมไม่ถูกต้อง' };

  const claimDate = str(fd, 'claimDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) {
    return { error: 'วันที่ไม่ถูกต้อง', field: 'claimDate', values: keepValues(fd) };
  }

  const vehRaw = str(fd, 'vehicle');
  let vehicle: Record<string, unknown> | null = null;
  if (vehRaw) {
    try { vehicle = JSON.parse(vehRaw); } catch { vehicle = null; }
  }

  let saved: { id: string };
  try {
    saved = await mutate('stock', (c, userId) => saveClaim(c, {
      side,
      kind: str(fd, 'kind'),
      claimDate,
      partyId: str(fd, 'partyId') || null,
      partyName: str(fd, 'partyName'),
      partyTel: str(fd, 'partyTel'),
      refNo: str(fd, 'refNo'),
      vehicleId: str(fd, 'vehicleId') || null,
      vehicle,
      /* ทะเบียนมาจากข้อมูลรถที่กรอก ไม่ใช่ช่องแยก — ที่เดียวกับเอกสารขาย
         ไม่งั้นค้นด้วยทะเบียนแล้วเจอเฉพาะบางชนิดเอกสาร */
      vehiclePlate: plateOf(vehicle as Record<string, string> | null),
      reason: str(fd, 'reason'),
      byWhom: str(fd, 'byWhom'),
      note: str(fd, 'note'),
      items: itemsOf(fd),
    }, userId), { sub: side === 'vendor' ? 'vclaim' : 'claim' });
  } catch (err) {
    return { error: describe(err, 'บันทึกใบเคลมไม่สำเร็จ'), values: keepValues(fd) };
  }

  revalidatePath('/stock');
  revalidatePath('/stock/claim');
  revalidatePath('/stock/vclaim');
  revalidatePath('/finance/pl');
  redirect(`/stock/claim/${saved.id}?saved=1`);
}

export async function voidClaimAction(id: string, reason: string): Promise<FormResult> {
  await requirePerm('stock');
  try {
    /* เคลมฝั่งลูกค้ากับฝั่งผู้ขายเป็นคนละแท็บ — ดูจากตัวใบจริง ไม่ใช่เชื่อผู้เรียก */
    const side = await query((c) =>
      c.query(`select side::text as side from claims where id = $1`, [id])
        .then((r) => (r.rows[0]?.side === 'vendor' ? 'vclaim' : 'claim')));
    await mutate('stock', (c, userId) => voidClaim(c, id, reason, userId), { sub: side });
  } catch (err) {
    return { error: describe(err, 'ยกเลิกใบเคลมไม่สำเร็จ') };
  }
  revalidatePath('/stock');
  revalidatePath('/stock/claim');
  revalidatePath('/stock/vclaim');
  revalidatePath(`/stock/claim/${id}`);
  revalidatePath('/finance/pl');
  return { ok: true };
}

/** ค้นสินค้าและคู่ค้าจากในฟอร์ม — ใช้ตัวเดียวกับที่ฟอร์มเอกสารใช้อยู่แล้ว */
export async function searchClaimPartsAction(q: string) {
  await requirePerm('stock');
  return searchProducts(q);
}

export async function searchClaimPartiesAction(side: string, q: string) {
  await requirePerm('stock');
  return side === 'vendor' ? searchVendors(q) : searchCustomers(q);
}
