/** ตรวจว่าฐานข้อมูลที่ได้มาทำสิ่งที่แอปต้องการได้ครบไหม — ตัวจริงอยู่ที่ probe-db.impl.mjs */
import { requireNode } from './node-guard.mjs';
requireNode(20, './probe-db.impl.mjs');
