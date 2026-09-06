/**
 * แยกไฟล์ SQL ออกเป็นคำสั่งทีละคำสั่ง
 *
 * ต้องแยกเองเพราะ `alter type ... add value` อยู่ในทรานแซกชันเดียวกับที่ใช้ค่าใหม่ไม่ได้
 * ตัว pg ส่งทั้งก้อนเป็นทรานแซกชันเดียว ไฟล์ไมเกรชันที่เพิ่มค่า enum แล้วใช้ทันที
 * จึงพังถ้าส่งรวดเดียว — psql แก้ด้วยการ commit ทีละคำสั่ง เราทำแบบเดียวกัน
 *
 * ตัวแบ่งต้องรู้จักสี่อย่างที่ ; ข้างในไม่ใช่ตัวจบคำสั่ง
 *   'ข้อความ'      สตริง
 *   "ชื่อคอลัมน์"    ตัวระบุที่ใส่เครื่องหมายคำพูด
 *   $$ ... $$      ตัวฟังก์ชัน plpgsql ซึ่งมี ; เต็มไปหมด
 *   -- และ /* *​/   คอมเมนต์
 */

/** @param {string} text @returns {string[]} คำสั่งที่ตัดช่องว่างหัวท้ายแล้ว ไม่รวมตัวว่าง */
export function splitStatements(text) {
  const parts = [];
  let buf = '';
  let i = 0;
  let dollar = null;
  let quote = null;
  let line = false;
  let block = false;

  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);

    if (line) { buf += ch; if (ch === '\n') line = false; i++; continue; }
    if (block) {
      buf += ch;
      if (two === '*/') { buf += '/'; i += 2; block = false; } else i++;
      continue;
    }
    if (dollar) {
      if (text.startsWith(dollar, i)) { buf += dollar; i += dollar.length; dollar = null; }
      else { buf += ch; i++; }
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (two === '--') { buf += two; i += 2; line = true; continue; }
    if (two === '/*') { buf += two; i += 2; block = true; continue; }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; i++; continue; }

    const dm = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
    if (dm) { dollar = dm[0]; buf += dollar; i += dollar.length; continue; }

    if (ch === ';') { parts.push(buf); buf = ''; i++; continue; }
    buf += ch;
    i++;
  }
  if (buf.trim()) parts.push(buf);

  return parts.filter((p) => p.trim().length > 0);
}

/** รันทีละคำสั่งด้วย client ที่ส่งเข้ามา — ไม่ห่อทรานแซกชันให้ ตั้งใจ */
export async function runStatements(client, text) {
  for (const stmt of splitStatements(text)) {
    await client.query(stmt);
  }
}

/**
 * บอกทางแก้เมื่อต่อฐานข้อมูลไม่ได้เพราะ SSL
 *
 * มีสองอาการที่ต่างกันและแก้คนละแบบ ข้อความดิบจาก Node/Postgres แยกไม่ออก
 *
 *   "SSL/TLS required"        ผู้ให้บริการบังคับ SSL แต่ URL ยังไม่ได้บอกให้ใช้
 *                             → ต้อง **เติม** sslmode เข้าไป
 *
 *   "self-signed certificate" URL บอกให้ใช้ SSL แล้ว แต่ pg รุ่นนี้ตีความ
 *                             sslmode=require เป็น verify-full ซึ่งตรวจสายใบรับรอง
 *                             เต็มรูปแบบ แล้วล้มกับใบที่ผู้ให้บริการออกเอง
 *                             → ต้อง **เปลี่ยน** เป็น no-verify
 */
export function sslHint(err) {
  const m = String(err?.message ?? err);

  if (/SSL\/TLS required|server does not support SSL|no pg_hba.*SSL/i.test(m)) {
    return [
      'ฐานข้อมูลนี้บังคับให้เชื่อมต่อแบบเข้ารหัส แต่ connection string ยังไม่ได้บอกไว้',
      '',
      'เติมท้าย connection string ด้วย  ?sslmode=no-verify',
      '  ...render.com/dgl?sslmode=no-verify',
      '',
      'ถ้ามี ? อยู่แล้วให้ใช้ &sslmode=no-verify แทน',
    ].join('\n');
  }

  if (/certificate|self.signed|SELF_SIGNED|unable to verify/i.test(m)) {
    return [
      'ต่อไม่ได้เพราะการตรวจใบรับรอง SSL',
      '',
      'เปลี่ยนท้าย connection string จาก  ?sslmode=require',
      'เป็น  ?sslmode=no-verify  แล้วรันใหม่',
      '',
      'no-verify ยังเข้ารหัสการเชื่อมต่ออยู่ แค่ไม่ตรวจว่าใบรับรองออกโดยใคร',
      'ซึ่งยอมรับได้เพราะเราต่อไปที่ชื่อโฮสต์ที่ผู้ให้บริการให้มาโดยตรง',
    ].join('\n');
  }

  return null;
}
