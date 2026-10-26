import Link from 'next/link';
import { requireOperator } from '@/lib/ops-auth';
import { listShops, type ShopRow } from '@/lib/ops-console';
import { OpsShell } from './ops-shell';
import { thDate } from '@/lib/format';
import { lastUsed, needsFollowUp, usageLevel } from '@/lib/usage';
import { DocSpark, LastUsed } from './usage-bits';

export const dynamic = 'force-dynamic';

const MODE_LABEL = { trial: 'ทดลองใช้', active: 'ใช้งานอยู่', expired: 'หมดอายุ' } as const;
const MODE_COLOR = { trial: '#B4720B', active: '#1D8A5F', expired: '#B4342A' } as const;

/** ตัวกรองรายชื่อ — อยู่ใน URL จะได้ส่งลิงก์ให้กันหรือกดกลับมาแล้วยังอยู่ที่เดิม */
const FILTERS = {
  all: { label: 'ทั้งหมด', hit: () => true },
  quiet: { label: 'เงียบเกิน 7 วัน', hit: (_: ShopRow, at: string | null, now: Date) => usageLevel(at, now) === 'dormant' },
  never: { label: 'ยังไม่เคยเข้า', hit: (_: ShopRow, at: string | null) => at === null },
  follow: {
    label: 'ทดลองใช้ + เงียบ',
    hit: (s: ShopRow, at: string | null, now: Date) => needsFollowUp(s.license.mode, at, now),
  },
} as const;
type FilterKey = keyof typeof FILTERS;

export default async function OpsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string }>;
}) {
  const session = await requireOperator();
  const shops = await listShops(session);
  const sp = await searchParams;
  const filter: FilterKey = sp.filter && sp.filter in FILTERS ? sp.filter as FilterKey : 'all';
  const byUsed = sp.sort === 'used';
  const now = new Date();

  const rows = shops.map((s) => ({
    s, at: lastUsed(s.usage.lastSeenAt, s.usage.lastDocAt),
  }));
  const count = (k: FilterKey) => rows.filter((r) => FILTERS[k].hit(r.s, r.at, now)).length;

  const shown = rows.filter((r) => FILTERS[filter].hit(r.s, r.at, now));
  /* เรียงตามใช้ล่าสุด — ใหม่สุดก่อน ยังไม่เคยใช้ไว้ท้าย */
  if (byUsed) shown.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

  const expiring = shops.filter(
    (s) => s.license.mode !== 'expired' && s.license.daysLeft <= 30,
  ).length;
  const today = rows.filter((r) => usageLevel(r.at, now) === 'fresh').length;

  const href = (f: FilterKey, sort = byUsed) => {
    const q = new URLSearchParams();
    if (f !== 'all') q.set('filter', f);
    if (sort) q.set('sort', 'used');
    const s = q.toString();
    return s ? `/ops?${s}` : '/ops';
  };

  return (
    <OpsShell
      current="/ops"
      email={session.email}
      title="อู่ทั้งหมด"
      sub={
        `${shops.length} อู่ · ใช้ใน 24 ชม. ${today}`
        + (count('quiet') ? ` · เงียบเกิน 7 วัน ${count('quiet')}` : '')
        + (expiring ? ` · ใกล้หมดอายุใน 30 วัน ${expiring} อู่` : '')
      }
      actions={<Link className="btn primary" href="/ops/new">+ เปิดอู่ใหม่</Link>}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <Link key={k} href={href(k)} className="chip"
                aria-current={k === filter ? 'true' : undefined}
                style={k === filter
                  ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff', textDecoration: 'none' }
                  : { textDecoration: 'none' }}>
            {FILTERS[k].label}{k === 'all' ? '' : ` ${count(k)}`}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="body" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ชื่ออู่</th>
                  <th style={{ width: 110 }}>สถานะ</th>
                  <th style={{ width: 110 }}>ถึงวันที่</th>
                  <th className="num" style={{ width: 70 }}>เหลือ (วัน)</th>
                  <th style={{ width: 140 }}>
                    <Link href={href(filter, !byUsed)} style={{ color: 'inherit' }}
                          title="กดเพื่อเรียงตามใช้ล่าสุด / ตามชื่อ">
                      ใช้ล่าสุด {byUsed ? '↓' : '↕'}
                    </Link>
                  </th>
                  <th style={{ width: 190 }}>ใช้ใน 30 วัน</th>
                  <th className="num" style={{ width: 80 }}>ผู้ใช้</th>
                </tr>
              </thead>
              <tbody>
                {shown.length ? shown.map(({ s, at }) => (
                  <tr key={s.tenantId}>
                    <td>
                      <Link href={`/ops/shop/${s.tenantId}`}
                            style={{ textDecoration: 'underline' }}>{s.name}</Link>
                      {needsFollowUp(s.license.mode, at, now) ? (
                        <span className="chip warn" style={{ marginLeft: 8 }}
                              title="ทดลองใช้อยู่แต่ไม่ได้ใช้ — ควรโทรถามก่อนหมดช่วงทดลอง">
                          ควรโทรตาม
                        </span>
                      ) : null}
                      <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                        เปิดเมื่อ {thDate(s.createdOn)}
                      </div>
                    </td>
                    <td>
                      <span className="chip" style={{ color: MODE_COLOR[s.license.mode] }}>
                        {MODE_LABEL[s.license.mode]}
                      </span>
                    </td>
                    <td>{thDate(s.license.until)}</td>
                    <td className="num mono"
                        style={{ color: s.license.daysLeft <= 30 ? MODE_COLOR.expired : undefined }}>
                      {s.license.daysLeft}
                    </td>
                    <td><LastUsed at={at} now={now} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DocSpark values={s.usage.docsSpark} />
                        <span style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}
                              title="วันที่มีคนเข้าใช้หรือสร้างเอกสาร · จำนวนเอกสารที่สร้าง">
                          {s.usage.activeDays30} วัน · {s.usage.docs30} ใบ
                        </span>
                      </div>
                    </td>
                    <td className="num mono">
                      {s.userCount}{s.maxUsers === null ? '' : ` / ${s.maxUsers + 1}`}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="empty">
                    {shops.length ? 'ไม่มีอู่ที่ตรงกับตัวกรองนี้' : 'ยังไม่มีอู่ในระบบ — กดปุ่มเปิดอู่ใหม่'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        คอนโซลนี้เห็นข้อมูลการเป็นลูกค้ากับ<b>จำนวน</b>การใช้งาน (เวลาเข้าใช้ จำนวนเอกสาร) เท่านั้น
        — <b>ไม่เห็นลูกค้า เนื้อหาเอกสาร ยอดขาย หรือราคาของอู่</b> ซึ่งบังคับไว้ที่ตัวฐานข้อมูล
        ไม่ใช่แค่ไม่ได้ทำหน้าจอให้ดู
      </div>
    </OpsShell>
  );
}
