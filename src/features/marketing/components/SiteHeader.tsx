import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MenuIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/shadcn/sheet';
import { Wordmark } from '@/components/app/wordmark';
import { brand, navLinks } from '../content';

/**
 * Ported from accounting-v0-frontend/components/landing/site-header.tsx.
 * next/link swapped for react-router-dom's Link on the two real CTAs
 * (Sign in / View live demo); the nav items themselves are same-page
 * anchor links (#features etc.), left as plain <a>. The primary CTA was
 * "Start free trial" until the content-integrity pass — there is no
 * trial/billing system to start, so it now points at the read-only /demo
 * interim page instead of /signup.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5">
        <a href="#top" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Wordmark />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button render={<Link to={brand.signInHref} />} nativeButton={false} variant="ghost" className="h-10 px-4">
            Sign in
          </Button>
          <Button render={<Link to={brand.demoHref} />} nativeButton={false} className="h-10 bg-brand px-4 text-brand-foreground hover:bg-brand/90">
            View live demo
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="outline" size="icon-lg" className="md:hidden" />}>
            <MenuIcon />
            <span className="sr-only">Open menu</span>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>
                <Wordmark />
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 p-4">
              <Button render={<Link to={brand.signInHref} onClick={() => setOpen(false)} />} nativeButton={false} variant="outline" className="h-10 w-full">
                Sign in
              </Button>
              <Button
                render={<Link to={brand.demoHref} onClick={() => setOpen(false)} />}
                nativeButton={false}
                className="h-10 w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                View live demo
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
