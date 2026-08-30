import Link from 'next/link';

/** แท็บย่อยของเมนูบัญชี/การเงิน — เลขตรงกับโปรแกรมเดิม */
const TABS = [
  { key: 'sales', no: '06.1', label: 'ยอดขาย', href: '/finance/sales', ready: false },
  { key: 'ar', no: '06.2', label: 'ลูกหนี้', href: '/finance/ar', ready: true },
  { key: 'ap', no: '06.3', label: 'เจ้าหนี้', href: '/finance/ap', ready: false },
  { key: 'pl', no: '06.4', label: 'กำไรขาดทุน', href: '/finance/pl', ready: false },
];

export function FinanceNav({ current }: { current: string }) {
  return (
    <div className="tag-row" style={{ marginBottom: 18 }}>
      {TABS.map((t) => {
        const on = t.key === current;
        const style = on
          ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
          : t.ready ? undefined : { opacity: 0.45 };
        return t.ready ? (
          <Link key={t.key} className="chip" href={t.href} style={style}>
            <span className="mono" style={{ opacity: 0.6, marginRight: 5 }}>{t.no}</span>{t.label}
          </Link>
        ) : (
          <span key={t.key} className="chip" style={style} title="ยังไม่ได้ทำ">
            <span className="mono" style={{ opacity: 0.6, marginRight: 5 }}>{t.no}</span>{t.label}
          </span>
        );
      })}
    </div>
  );
}
