import { Separator } from '@/components/ui/shadcn/separator';
import { Wordmark } from '@/components/app/wordmark';
import { brand, footerColumns } from '../content';

const legal = ['Terms of service', 'Privacy policy', 'POPIA statement', 'Security'];

/** Ported verbatim from accounting-v0-frontend/components/landing/site-footer.tsx (footer links are marketing placeholders in v0 too — all "#"). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-xs flex-col gap-4">
            <Wordmark />
            <p className="text-sm leading-relaxed text-muted-foreground">{brand.tagline}. Made in Johannesburg for businesses that file locally.</p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
            {footerColumns.map((column) => (
              <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">{column.heading}</h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {link}
                      </a>
                    </li>
                  ))}
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
              <li key={item}>
                <a href="#" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
