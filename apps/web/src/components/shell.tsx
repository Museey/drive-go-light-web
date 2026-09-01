import { requireSession } from '@/lib/auth';
import { MenuBar } from './menu-bar';
import { BackFab } from './back-fab';

export async function Shell({
  current, title, sub, actions, children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="app">
      <MenuBar session={session} current={current} />
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
      <BackFab />
    </div>
  );
}
