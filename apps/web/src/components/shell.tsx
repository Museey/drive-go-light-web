import { requireSession } from '@/lib/auth';
import { MenuBar } from './menu-bar';

export async function Shell({
  current, title, sub, actions, doc, children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  /** หน้าเอกสารรายใบ — หัวแถบเป็นสีเขียวเหมือนหน้าต่างเอกสารของรุ่น 6.4 */
  doc?: boolean;
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="app">
      <MenuBar session={session} current={current} />
      <div className="main">
        <div className={doc ? 'topbar doc' : 'topbar'}>
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
