import { getShop } from '@/lib/queries';
import { Rail } from './rail';

export async function Shell({
  current, title, sub, actions, children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const shop = await getShop();
  return (
    <div className="app">
      <Rail shopName={shop.name} current={current} />
      <div className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          <div className="spacer" />
          {actions}
        </div>
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
