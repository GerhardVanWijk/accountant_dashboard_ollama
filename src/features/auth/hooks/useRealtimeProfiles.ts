import { useEffect, useState } from 'react';
import type { Profile } from '@/types';
import { supabase } from '@/config/supabase';
import { profileService } from '../services';

/**
 * Live-updating profiles list for one company (Phase T brief's Step 7 —
 * written against the current @supabase/supabase-js v2 realtime API:
 * `channel().on('postgres_changes', ...)`, not the v1-style
 * `.from(...).on(...)` shape the brief's own pseudocode used, which no
 * longer exists in this project's installed supabase-js version).
 * RLS still applies to realtime payloads the same as any other read, so a
 * user only ever receives change events for rows they could already query.
 */
export function useRealtimeProfiles(companyId: string | undefined) {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (!companyId) {
      setProfiles([]);
      return;
    }

    let cancelled = false;
    profileService.getByCompany(companyId).then((initial) => {
      if (!cancelled) setProfiles(initial);
    });

    const channel = supabase
      .channel(`profiles-company-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `company_id=eq.${companyId}` },
        () => {
          // Re-fetch rather than patch the payload in directly — keeps the
          // row-mapping logic in one place (SupabaseProfileRepository).
          profileService.getByCompany(companyId).then((next) => {
            if (!cancelled) setProfiles(next);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return profiles;
}
