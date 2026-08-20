import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePreference } from '@/stores/themeStore';
import type { IconName } from '@/config/icons';
import { cn } from '@/utils/cn';

const options: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light theme', icon: 'themeLight' },
  { value: 'dark', label: 'Dark theme', icon: 'themeDark' },
  { value: 'system', label: 'System theme', icon: 'themeSystem' },
];

/** Dark / Light / System theme switcher, backed by useThemeStore (Zustand, persisted). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-xs rounded-md border border-border bg-panel p-xs"
    >
      {options.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-sm text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            theme === value && 'bg-primary text-on-accent',
          )}
        >
          <Icon name={icon} size={14} />
        </button>
      ))}
    </div>
  );
}
