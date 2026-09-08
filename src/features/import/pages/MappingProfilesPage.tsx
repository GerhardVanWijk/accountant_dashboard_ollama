import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { listMappingProfiles, setMappingProfileActive, duplicateMappingProfile } from '../migration/importMappingProfileService';
import type { ImportMappingProfile } from '../migration/types';

export function MappingProfilesPage() {
  const [profiles, setProfiles] = useState<ImportMappingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setProfiles(await listMappingProfiles());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mapping profiles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleToggleActive(profile: ImportMappingProfile) {
    try {
      await setMappingProfileActive(profile.id, !profile.isActive);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update this profile.');
    }
  }

  async function handleDuplicate(profile: ImportMappingProfile) {
    const name = window.prompt('Name for the duplicated profile:', `${profile.name} (copy)`);
    if (!name) return;
    try {
      await duplicateMappingProfile(profile, name);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate this profile.');
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Mapping Profiles"
        description="Saved column, account and tax mappings — reused automatically the next time a file from the same source system is imported. System profiles (shared, evidence-based) cannot be edited; company profiles can."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/imports" />}>
            Back to overview
          </Button>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard bodyClassName="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : profiles.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No saved mapping profiles yet — profiles are created from the Mapping step of an import wizard once support for saving from there is used, or built directly by an administrator.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {profiles.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                {/* min-w-0 lets this block shrink below its content's natural width — otherwise an unusually long profile name (a single unbroken token) would push the row, and the page, wider than the viewport. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium break-words">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.sourceSystem} · {p.importType} · {p.isSystem ? 'System' : 'Company'} {p.isActive ? '' : '· Inactive'}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handleDuplicate(p)}>
                    Duplicate
                  </Button>
                  {!p.isSystem && (
                    <Button variant="ghost" size="sm" onClick={() => void handleToggleActive(p)}>
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
