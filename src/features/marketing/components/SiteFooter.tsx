import { Link } from 'react-router-dom';

import { Separator } from '@/components/ui/shadcn/separator';
import { Wordmark } from '@/components/app/wordmark';
import { brand, footerColumns, type FooterLink } from '../content';

const legal: FooterLink[] = [
  { label: 'Terms of service', href: '/legal/terms' },
  { label: 'Privacy policy', href: '/legal/privacy' },
  { label: 'POPIA statement', href: '/legal/popia' },
  { label: 'Security', href: '/legal/security' },
];

/**
 * Ported from accounting-v0-frontend/components/landing/site-footer.tsx.
 * v0's original had every link as a "#" placeholder. Public-website-
 * completion pass: a link renders as a real react-router Link once its
 * page exists (footerColumns/`legal` above carry an `href`), and still
 * renders as a plain "#" anchor otherwise — same visual treatment
 * either way, only the destination differs.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-xs flex-col gap-4">
            <Wordmark />
            <p className="text-sm leading-relaxed text-muted-foreground">{brand.tagline}. Made in Cape Town for businesses that file locally.</p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
            {footerColumns.map((column) => (
              <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">{column.heading}</h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) =>
                    link.href ? (
                      <li key={link.label}>
                        <Link to={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                          {link.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                          {link.label}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand.fullName} (Pty) Ltd. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {legal.map((item) => (
              <li key={item.label}>
                {item.href ? (
                  <Link to={item.href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <a href="#" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
