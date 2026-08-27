import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { brand } from '../content';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';

/**
 * Interim landing target for the public "View live demo" CTA
 * (content-integrity + demo-access pass). This is deliberately NOT the
 * read-only demo itself — that requires its own auth/permission/data
 * architecture (isolated demo data, backend-enforced read-only access),
 * which is a separate, not-yet-approved piece of work. This page makes
 * no auth, database, or Supabase changes of any kind; it is a static
 * route reusing the existing marketing chrome (SiteHeader/SiteFooter),
 * added only so "View live demo" resolves to something real and honest
 * instead of a dead link or the real signup flow.
 */
export function DemoPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
          <div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-card/50 px-6 py-14 text-center md:px-14 md:py-20">
            <div className="relative flex flex-col items-center gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-muted px-3.5 py-1.5 text-xs font-medium text-brand">
                Coming soon
              </span>
              <h1 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
                We&apos;re building a safe, read-only live demo
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
                The live demo will let you explore {brand.fullName} with real sample data — no signup, no editing, nothing you do
                there touches a real account. We&apos;re finishing the access controls that keep it read-only before switching it
                on, so it isn&apos;t live just yet.
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Already have an account?{' '}
                <Link to={brand.signInHref} className="font-medium text-brand hover:underline">
                  Sign in
                </Link>
                .
              </p>
              <Button render={<Link to="/" />} nativeButton={false} variant="outline" className="mt-2 h-11 px-6">
                <ArrowLeftIcon data-icon="inline-start" />
                Back to the homepage
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
