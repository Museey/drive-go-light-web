/**
 * ปลายทางหลังกดบันทึก — การ์ดบันทึกแล้ว (PLAN-save-popup-wht-2569-09-16.md ข้อ 1–2)
 *
 * returnTo มาจากผู้ใช้ (ช่องซ่อน / Referer) ถ้าไม่กรอง ใครก็ทำลิงก์ให้กดบันทึกแล้วเด้งไปเว็บอื่นได้
 */
import { describe, expect, it } from 'vitest';
import { isSavedKind, safeBack, withSaved, withoutSaved } from '../src/lib/saved-target';

describe('withSaved — ต่อค่าการ์ดเข้ากับปลายทาง', () => {
  it('ปลายทางไม่มี query', () => {
    expect(withSaved('/customers/new', 'contact', 'abc')).toBe('/customers/new?saved=contact&savedId=abc');
  });
  it('ปลายทางมี query เดิม — คงไว้ ต่อท้าย', () => {
    expect(withSaved('/income?kind=RC&hist=1', 'sales', 'x1')).toBe('/income?kind=RC&hist=1&saved=sales&savedId=x1');
  });
  it('ลบการ์ดรอบก่อนที่ค้างอยู่ ไม่ให้มีสองชุด', () => {
    expect(withSaved('/income?kind=RC&saved=sales&savedId=old', 'sales', 'new')).toBe('/income?kind=RC&saved=sales&savedId=new');
  });
});

describe('withoutSaved', () => {
  it('เหลือ query อื่นครบ', () => {
    expect(withoutSaved('/expense?kind=PO&saved=buy&savedId=1&hist=1')).toBe('/expense?kind=PO&hist=1');
  });
  it('ไม่มีอะไรเหลือ — ตัด ? ทิ้ง', () => {
    expect(withoutSaved('/stock/new?saved=product&savedId=1')).toBe('/stock/new');
  });
});

describe('safeBack — หน้าที่จะกลับไปหลังแก้ไข', () => {
  const INCOME = ['/income'];

  it('path ภายในที่อยู่ในหมวดเดียวกัน — รับ', () => {
    expect(safeBack('/income?kind=RC&hist=1', INCOME)).toBe('/income?kind=RC&hist=1');
    expect(safeBack('/income/5b1c6f0e-1111-4222-8333-944455556666', INCOME)).toBe('/income/5b1c6f0e-1111-4222-8333-944455556666');
  });

  it('Referer เป็น URL เต็ม — เอาเฉพาะ path + query', () => {
    expect(safeBack('https://app.drivegolight.com/income/walkin?hist=1', INCOME)).toBe('/income/walkin?hist=1');
  });

  it('ลบการ์ดที่ค้างใน Referer', () => {
    expect(safeBack('http://localhost:3100/income?kind=RC&saved=sales&savedId=1', INCOME)).toBe('/income?kind=RC');
  });

  it('กัน open redirect — //host · \\ · javascript: · ไม่ใช่ path', () => {
    expect(safeBack('//evil.example/income', INCOME)).toBeNull();
    expect(safeBack('/\\evil.example', INCOME)).toBeNull();
    expect(safeBack('javascript:alert(1)', INCOME)).toBeNull();
    expect(safeBack('income', INCOME)).toBeNull();
    expect(safeBack('', INCOME)).toBeNull();
    expect(safeBack(null, INCOME)).toBeNull();
  });

  it('หมวดกว้างสุด "/" ยังกัน //host — ตัวกรองขึ้นต้นไม่พอ ต้องมีด่าน // ของมันเอง', () => {
    expect(safeBack('//evil.example/income', ['/'])).toBeNull();
    expect(safeBack('/income?kind=RC', ['/'])).toBe('/income?kind=RC');
  });

  it('โดเมนอื่นใน URL เต็ม — ได้แค่ path ภายในเว็บเราเสมอ ไม่พาออกนอกเว็บ', () => {
    expect(safeBack('https://evil.example/income', INCOME)).toBe('/income');
  });

  it('นอกหมวด หรือชื่อขึ้นต้นคล้ายกัน — ไม่รับ', () => {
    expect(safeBack('/finance/ar', INCOME)).toBeNull();
    expect(safeBack('/incomex', INCOME)).toBeNull();
  });

  it('หน้าแก้ไข / หน้าพิมพ์ — ไม่กลับไป (จะเจอฟอร์มซ้ำหรือหน้ากระดาษ)', () => {
    expect(safeBack('/income/abc/edit', INCOME)).toBeNull();
    expect(safeBack('/income/abc/print?saved=1', INCOME)).toBeNull();
  });

  it('รับหลายหมวด', () => {
    expect(safeBack('/customers?kind=customer', ['/customers', '/income'])).toBe('/customers?kind=customer');
  });
});

describe('isSavedKind', () => {
  it('รับเฉพาะชนิดที่รู้จัก', () => {
    expect(isSavedKind('sales')).toBe(true);
    expect(isSavedKind('contact')).toBe(true);
    expect(isSavedKind('1')).toBe(false);
    expect(isSavedKind(undefined)).toBe(false);
  });
});
