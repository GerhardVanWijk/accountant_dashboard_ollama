import type { Profile } from '@/types';
import type { ShellUser } from '@/lib/app/mock/admin';

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Real authenticated user data for the v0 app-shell's UserMenu (M6 —
 * replaces the src/lib/app/mock/admin.ts `currentUser` placeholder M0
 * deliberately left in place, docs/SUPABASE_MIGRATION_GUIDE.md). `Profile`
 * (src/types/user.ts) has no `avatar`/`initials` field and
 * `firstName`/`lastName`/`email` are all optional — this derives an
 * honest presentation rather than inventing any of them: falls back to
 * the email's local part when no name is set, and a generic "Account"
 * label only if neither is available (shouldn't happen for a real
 * authenticated profile, but the UI must not fabricate a name if it
 * somehow is).
 */
export function toShellUser(profile: Profile | null): ShellUser {
  if (!profile) {
    return { name: 'Account', email: '', role: '', initials: '?' };
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  const name = fullName || profile.email?.split('@')[0] || 'Account';

  return {
    name,
    email: profile.email ?? '',
    role: titleCase(profile.role),
    initials: initialsOf(name),
  };
}
