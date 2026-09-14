'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createLiveSearch, type Runner } from './live-search-core';

/**
 * ค้นหาสด — ผูกช่องพิมพ์เข้ากับ server action แล้วได้ผลกลับมาเป็น state
 *
 *   const { results, busy, clear } = useLiveSearch(query, searchProductsAction, { onFound: learn });
 *
 * ตรรกะเรื่องหน่วงเวลาและกันผลสลับอยู่ใน live-search-core.ts (มีเทสต์)
 * ตัวนี้แค่ต่อสายเข้า React: สร้างแกนครั้งเดียวต่อคอมโพเนนต์ ส่งคำค้นทุกครั้งที่เปลี่ยน
 * และถือ `run`/`onFound` ล่าสุดไว้ใน ref เพื่อไม่ต้องสร้างแกนใหม่เมื่อฟังก์ชันเปลี่ยนตัว
 */
export function useLiveSearch<T>(
  query: string,
  run: Runner<T>,
  opts: { delay?: number; min?: number; onFound?: (found: T[]) => void } = {},
) {
  const [st, setSt] = useState<{ results: T[] | null; busy: boolean }>({ results: null, busy: false });

  const runRef = useRef(run);
  runRef.current = run;
  const foundRef = useRef(opts.onFound);
  foundRef.current = opts.onFound;

  const core = useMemo(() => createLiveSearch<T>(
    (q) => runRef.current(q),
    (patch) => {
      setSt((s) => ({ ...s, ...patch }));
      if (patch.results) foundRef.current?.(patch.results);
    },
    { delay: opts.delay, min: opts.min },
  ), []);   // eslint-disable-line react-hooks/exhaustive-deps -- สร้างครั้งเดียว ตั้งใจ

  useEffect(() => { core.query(query); }, [query, core]);
  useEffect(() => () => core.dispose(), [core]);

  return { results: st.results, busy: st.busy, clear: core.clear };
}
