import { describe, expect, it } from 'vitest';
import { csvField, csvNumber, csvText, mapHeaders, parseCsv } from '../src/lib/csv';

describe('อ่านไฟล์ CSV', () => {
  it('อ่านตารางธรรมดาได้', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('รองรับคอมมาในค่าที่อยู่ในเครื่องหมายคำพูด', () => {
    expect(parseCsv('code,name\nBRK-1,"ผ้าเบรกหน้า, หลัง"'))
      .toEqual([['code', 'name'], ['BRK-1', 'ผ้าเบรกหน้า, หลัง']]);
  });

  it('รองรับเครื่องหมายคำพูดซ้อนในค่า', () => {
    expect(parseCsv('name\n"ยาง 15"" ขอบใหญ่"')).toEqual([['name'], ['ยาง 15" ขอบใหญ่']]);
  });

  it('รองรับขึ้นบรรทัดใหม่ภายในค่า', () => {
    expect(parseCsv('name\n"บรรทัดหนึ่ง\nบรรทัดสอง"'))
      .toEqual([['name'], ['บรรทัดหนึ่ง\nบรรทัดสอง']]);
  });

  it('อ่านไฟล์ที่ขึ้นบรรทัดแบบวินโดวส์ได้', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('ตัด BOM ที่ Excel ใส่มาให้ออก', () => {
    expect(parseCsv('﻿รหัสสินค้า,ชื่อ\nBRK-1,ผ้าเบรก')[0]![0]).toBe('รหัสสินค้า');
  });

  it('ข้ามบรรทัดว่างท้ายไฟล์', () => {
    expect(parseCsv('a\n1\n\n\n')).toEqual([['a'], ['1']]);
  });

  it('ช่องว่างยังเป็นช่องว่าง ไม่ถูกตัดออกจากแถว', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});

describe('เขียนไฟล์ CSV', () => {
  it('ใส่เครื่องหมายคำพูดเฉพาะเมื่อจำเป็น', () => {
    expect(csvField('ผ้าเบรก')).toBe('ผ้าเบรก');
    expect(csvField('ผ้าเบรก, หลัง')).toBe('"ผ้าเบรก, หลัง"');
    expect(csvField('ยาง 15" ขอบใหญ่')).toBe('"ยาง 15"" ขอบใหญ่"');
    expect(csvField('สอง\nบรรทัด')).toBe('"สอง\nบรรทัด"');
  });

  it('เขียนแล้วอ่านกลับได้ค่าเดิม', () => {
    const values = ['ปกติ', 'มี, คอมมา', 'มี"คำพูด', 'มี\nบรรทัด', ''];
    const line = values.map(csvField).join(',');
    expect(parseCsv(`h1,h2,h3,h4,h5\n${line}`)[1]).toEqual(values);
  });
});

describe('จับหัวคอลัมน์', () => {
  it('รู้จักหัวตารางภาษาไทยของเรา', () => {
    const map = mapHeaders(['รหัสสินค้า', 'ชื่อสินค้า', 'ราคา A', 'คงเหลือ']);
    expect(map).toEqual({ code: 0, name: 1, priceA: 2, qty: 3 });
  });

  it('รับหัวตารางภาษาอังกฤษที่คนมักใช้', () => {
    const map = mapHeaders(['SKU', 'Name', 'Price', 'Stock']);
    expect(map.code).toBe(0);
    expect(map.name).toBe(1);
    expect(map.priceA).toBe(2);
    expect(map.qty).toBe(3);
  });

  it('ไม่สนตัวพิมพ์ใหญ่เล็กและช่องว่างหัวท้าย', () => {
    expect(mapHeaders(['  code  ', 'NAME']).code).toBe(0);
    expect(mapHeaders(['  code  ', 'NAME']).name).toBe(1);
  });

  it('คอลัมน์ที่ไม่รู้จักถูกข้ามไป ไม่ทำให้พัง', () => {
    const map = mapHeaders(['รหัสสินค้า', 'คอลัมน์แปลก', 'ชื่อสินค้า']);
    expect(map.code).toBe(0);
    expect(map.name).toBe(2);
  });

  it('หัวซ้ำใช้อันแรก', () => {
    expect(mapHeaders(['code', 'sku']).code).toBe(0);
  });
});

describe('อ่านค่าจากช่อง', () => {
  it('ตัวเลขที่มีคอมมาอ่านได้', () => {
    expect(csvNumber(['1,250.50'], 0)).toBe(1250.5);
  });

  it('ช่องว่างหรืออ่านไม่ออกได้ศูนย์', () => {
    expect(csvNumber([''], 0)).toBe(0);
    expect(csvNumber(['ไม่ใช่ตัวเลข'], 0)).toBe(0);
    expect(csvNumber(['1'], undefined)).toBe(0);
  });

  it('ข้อความถูกตัดช่องว่างหัวท้าย', () => {
    expect(csvText(['  ผ้าเบรก  '], 0)).toBe('ผ้าเบรก');
    expect(csvText([], 5)).toBe('');
  });
});
