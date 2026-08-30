import { describe, expect, it } from 'vitest';
import { readVehicles } from '../src/lib/read-vehicles';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('อ่านข้อมูลรถออกจากฟอร์ม', () => {
  it('ไม่มีรถเลยได้อาเรย์ว่าง', () => {
    expect(readVehicles(fd({ code: 'CUS-0001' }))).toEqual([]);
  });

  it('อ่านได้ครบทุกช่อง', () => {
    const v = readVehicles(fd({
      'veh[0][brand]': 'Toyota', 'veh[0][model]': 'Revo', 'veh[0][year]': '2565',
      'veh[0][color]': 'เทา', 'veh[0][plateA]': 'กข', 'veh[0][plateB]': '7788',
      'veh[0][plateProvince]': 'นนทบุรี', 'veh[0][mileage]': '45200',
      'veh[0][engineNo]': 'E-1', 'veh[0][chassisNo]': 'C-1',
    }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ brand: 'Toyota', plateB: '7788', plateProvince: 'นนทบุรี' });
  });

  it('ข้ามแถวที่กด “เพิ่มรถ” แล้วไม่ได้กรอกอะไรเลย', () => {
    const v = readVehicles(fd({
      'veh[0][brand]': 'Toyota', 'veh[0][plateB]': '1111',
      'veh[1][brand]': '', 'veh[1][model]': '', 'veh[1][plateB]': '',
    }));
    expect(v).toHaveLength(1);
    expect(v[0]!.plateB).toBe('1111');
  });

  it('เก็บแถวที่กรอกแค่บางช่อง — รู้แต่ทะเบียนยังไม่รู้ยี่ห้อก็ต้องบันทึกได้', () => {
    const v = readVehicles(fd({ 'veh[0][plateA]': 'ขก', 'veh[0][plateB]': '4321' }));
    expect(v).toHaveLength(1);
    expect(v[0]!.brand).toBe('');
  });

  it('รถที่บันทึกไว้แล้วไม่หายแม้ล้างทุกช่อง — ต้องกดเอาออกเท่านั้น', () => {
    const v = readVehicles(fd({
      'veh[0][id]': 'abc-123', 'veh[0][brand]': '', 'veh[0][plateB]': '',
    }));
    expect(v).toHaveLength(1);
    expect(v[0]!.id).toBe('abc-123');
  });

  it('เรียงตามลำดับที่แสดงในฟอร์ม ไม่ใช่ลำดับตัวอักษร', () => {
    const v = readVehicles(fd({
      'veh[10][plateB]': 'สิบ', 'veh[2][plateB]': 'สอง', 'veh[1][plateB]': 'หนึ่ง',
    }));
    expect(v.map((x) => x.plateB)).toEqual(['หนึ่ง', 'สอง', 'สิบ']);
  });

  it('ตัดช่องว่างหัวท้ายออก', () => {
    const v = readVehicles(fd({ 'veh[0][brand]': '  Honda  ', 'veh[0][plateB]': ' 9999 ' }));
    expect(v[0]).toMatchObject({ brand: 'Honda', plateB: '9999' });
  });
});
