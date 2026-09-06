import { redirect } from 'next/navigation';

/**
 * ที่อยู่เดิมของหน้า 07.3 ก่อนเปลี่ยนชื่อให้ตรงกับเมนู
 * เก็บไว้เพราะลิงก์ที่เคยส่งให้กันแล้วต้องไม่ตาย
 */
export default function BackupRedirect(): never {
  redirect('/settings/import');
}
