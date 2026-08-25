/**
 * Minimal placeholder data for the ported v0 shell chrome — NOT full
 * application data. Ported from accounting-v0-frontend/lib/app/mock/admin.ts.
 *
 * M6 (docs/SUPABASE_MIGRATION_GUIDE.md) wired UserMenu to real
 * authStore/profile data (src/features/auth/utils/shellUser.ts) — the
 * `currentUser` placeholder this file used to export is gone, but the
 * `ShellUser` shape below is still real (toShellUser() maps a real Profile
 * onto it). M10 removed the `notifications`/`ShellNotification` mock the
 * same way: this app still has no notifications backend/table anywhere in
 * the Supabase schema, so `notification-menu.tsx` now renders an honest
 * empty state instead of fabricated alerts (docs/SA_SPEC_GAP_ANALYSIS.md).
 */

/** Shape the app-shell's UserMenu renders — real data (src/features/auth/utils/shellUser.ts), kept here since this is where the shell-chrome types already live. */
export interface ShellUser {
  name: string;
  email: string;
  role: string;
  initials: string;
}
