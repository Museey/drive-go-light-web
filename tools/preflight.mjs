/** ตรวจความพร้อมก่อนเปิดให้คนนอกใช้ — ตัวจริงอยู่ที่ preflight.impl.mjs */
import { requireNode } from './node-guard.mjs';
requireNode(20, './preflight.impl.mjs');
