import { NavLink } from 'react-router-dom';
import { navigation } from '@/config/navigation';
import { cn } from '@/utils/cn';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-panel md:flex">
      <div className="flex h-16 items-center border-b border-border px-lg">
        <span className="text-lg font-semibold text-text-primary">Accounting Suite</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-sm py-lg" aria-label="Primary">
        {navigation.map((section) => (
          <div key={section.section} className="mb-lg">
            <p className="px-sm pb-xs text-xs font-semibold uppercase tracking-wide text-text-muted">
              {section.section}
            </p>
            <ul className="flex flex-col gap-xs">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-md px-sm py-xs text-sm text-text-secondary hover:bg-background hover:text-text-primary',
                        isActive && 'bg-background text-primary',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
