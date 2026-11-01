/**
 * แจ้งเตือนข้อผิดพลาดเข้า Telegram ของผู้ให้บริการ
 *
 * ส่งแค่ **ชนิด หน้า และจำนวนครั้ง** ไม่ส่งข้อความผิดพลาด — ข้อความมีข้อมูลลูกค้าติดมาเสมอ
 * และ Telegram คือการส่งออกนอกฐานข้อมูลของเรา อยากเห็นข้อความเต็มให้ใช้ tools/errors.sh
 *
 * รวบเป็นรอบ ไม่ส่งทีละรายการ — หน้าที่พังหนึ่งหน้าอาจยิงข้อผิดพลาดเป็นสิบในวินาทีเดียว
 * รอสักครู่ให้ชุดนั้นมาครบก่อนส่ง และเว้นระยะระหว่างรอบไว้ไม่ให้โทรศัพท์สั่นไม่หยุด
 *
 * เก็บของรอส่งไว้ในหน่วยความจำของโปรเซสเดียว พอสำหรับ Render ที่รันเครื่องเดียว
 * ถ้าเครื่องรีสตาร์ทระหว่างรอ รอบนั้นหายไป — ยอมได้ เพราะทุกแถวยังอยู่ใน ops.errors
 *
 * ไม่ตั้ง TELEGRAM_BOT_TOKEN กับ TELEGRAM_CHAT_ID = ไม่ทำอะไรเลย (เครื่องนักพัฒนา ชุดทดสอบ)
 */

export interface AlertItem {
  kind: string;
  path: string | null;
}

export interface AlerterOptions {
  /** ส่งข้อความหนึ่งก้อน — ห้ามโยน ถ้าโยนมาก็กลืนทิ้ง */
  send: (text: string) => Promise<void>;
  /** รอให้ชุดข้อผิดพลาดมาครบก่อนส่ง */
  batchMs?: number;
  /** ระยะห่างขั้นต่ำระหว่างสองรอบ */
  gapMs?: number;
  /** ลิงก์ที่แนบท้ายข้อความ */
  link?: string | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => void;
}

/** กลุ่มที่เก็บรอส่งได้มากสุด — ทางเข้าของฝั่งเบราว์เซอร์ไม่ต้องล็อกอิน path จึงสุ่มมาได้ไม่จำกัด */
const MAX_GROUPS = 20;
/** บรรทัดที่แสดงในข้อความหนึ่งก้อน ที่เหลือรวมเป็นบรรทัดเดียว */
const MAX_LINES = 8;

/**
 * path ที่จะส่งออก — ตัด query และ hash ทิ้ง เพราะคำค้นที่ผู้ใช้พิมพ์ (ชื่อ เบอร์โทร ทะเบียนรถ)
 * มักอยู่ตรงนั้น แล้วตัดความยาว เพราะ path จากเบราว์เซอร์ใครจะส่งอะไรมาก็ได้
 */
export function alertPath(path: string | null): string {
  const p = (path ?? '').split(/[?#]/)[0].trim();
  if (!p) return '-';
  return p.length > 60 ? p.slice(0, 60) + '…' : p;
}

export function formatAlert(
  groups: Map<string, { kind: string; path: string; n: number }>,
  link: string | null,
): string {
  const list = [...groups.values()].sort((a, b) => b.n - a.n);
  const total = list.reduce((s, g) => s + g.n, 0);
  const lines = list.slice(0, MAX_LINES).map((g) =>
    `• ${g.kind} ที่ ${g.path}${g.n > 1 ? ` × ${g.n}` : ''}`);
  const rest = list.slice(MAX_LINES);
  if (rest.length) {
    lines.push(`• อีก ${rest.length} กลุ่ม รวม ${rest.reduce((s, g) => s + g.n, 0)} ครั้ง`);
  }
  return [
    `🚨 DriveGoLight: ข้อผิดพลาด ${total} ครั้ง`,
    ...lines,
    '',
    link ? `ดูข้อความเต็ม: tools/errors.sh หรือ ${link}` : 'ดูข้อความเต็ม: tools/errors.sh',
  ].join('\n');
}

export function createAlerter(opts: AlerterOptions) {
  const batchMs = opts.batchMs ?? 30_000;
  const gapMs = opts.gapMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => {
    const t = setTimeout(fn, ms);
    /* ไม่ให้ตัวจับเวลาค้างโปรเซสไว้ตอนปิดเครื่อง */
    t.unref?.();
  });

  const pending = new Map<string, { kind: string; path: string; n: number }>();
  let overflow = 0;
  let waiting = false;
  let lastSent = -Infinity;

  async function flush(): Promise<void> {
    waiting = false;
    if (pending.size === 0 && overflow === 0) return;
    const groups = new Map(pending);
    if (overflow) groups.set('\u0000overflow', { kind: 'อื่น ๆ', path: 'หลายหน้า', n: overflow });
    pending.clear();
    overflow = 0;
    lastSent = now();
    try {
      await opts.send(formatAlert(groups, opts.link ?? null));
    } catch {
      /* ส่งไม่ได้ก็ปล่อยไป — ห้ามบันทึกเป็นข้อผิดพลาดใหม่ ไม่งั้นวนไม่รู้จบ */
    }
  }

  return {
    note(item: AlertItem): void {
      const path = alertPath(item.path);
      const key = `${item.kind}\u0000${path}`;
      const g = pending.get(key);
      if (g) g.n++;
      else if (pending.size < MAX_GROUPS) pending.set(key, { kind: item.kind, path, n: 1 });
      else overflow++;

      if (waiting) return;
      waiting = true;
      const delay = Math.max(batchMs, lastSent + gapMs - now());
      setTimer(() => { void flush(); }, delay);
    },
    /** สำหรับชุดทดสอบ */
    flush,
  };
}

/** ส่งข้อความผ่าน Bot API — ข้อความล้วน ไม่ใช้ HTML เพราะ path มาจากเบราว์เซอร์ได้ */
function telegramSender(token: string, chatId: string) {
  return async (text: string): Promise<void> => {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5_000),
    });
  };
}

let shared: ReturnType<typeof createAlerter> | null | undefined;

/**
 * แจ้งว่ามีข้อผิดพลาดหนึ่งรายการ — ไม่รอ ไม่โยน
 *
 * อ่านค่าตั้งครั้งแรกที่ถูกเรียกแล้วจำไว้ แก้ค่าใน Render แล้วเว็บรีสตาร์ทเองอยู่แล้ว
 */
export function alertError(item: AlertItem): void {
  try {
    if (shared === undefined) {
      const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
      const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
      const base = process.env.APP_URL?.replace(/\/+$/, '');
      shared = token && chatId
        ? createAlerter({
          send: telegramSender(token, chatId),
          link: base ? `${base}/ops/errors` : null,
        })
        : null;
    }
    shared?.note(item);
  } catch {
    /* เงียบไว้ */
  }
}
