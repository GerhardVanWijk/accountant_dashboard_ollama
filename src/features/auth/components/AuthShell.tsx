import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

import { Wordmark } from '@/components/app/wordmark';
import { Seo } from '@/lib/seo/Seo';

/** Capability statements verified against src/features/* — no bank "feeds" (import only), no certification claims. */
const assurances = [
  'Invoice in rands with 15% VAT handled for you',
  'Import and reconcile bank statements — CSV, OFX, QIF, MT940',
  'VAT201 built continuously from posted transactions',
  'Payroll on verified SARS tax tables',
  'Income Statement, Balance Sheet and Cash Flow on IFRS-for-SMEs lines',
];

/**
 * Split layout shared by every credential screen (Login/SignUp/Forgot/Reset
 * password) — ported from accounting-v0-frontend/components/auth/auth-shell.tsx
 * (M6). The right-hand panel lists real, verified capabilities (the v0
 * template's fabricated "2 400 businesses" stat and named testimonial were
 * removed 2026-09-06, same content-integrity rule the homepage already
 * follows). Every credential screen is `noindex`. next/link → react-router.
 */
export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <Seo noindex />
      <div className="flex flex-col gap-8 px-6 py-10 sm:px-12 lg:px-16">
        <Link to="/" className="w-fit" aria-label="Vertex Accounting home">
          <Wordmark />
        </Link>

        <div className="flex flex-1 items-center">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        </div>

        {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
      </div>

      <aside className="hidden flex-col justify-between gap-10 border-l border-border bg-card p-12 lg:flex">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wide text-brand uppercase">Cloud accounting for South African business</p>
          <p className="text-xl leading-relaxed font-medium text-pretty">
            Your invoicing, banking, VAT, payroll and financial statements in one place — built for South African compliance.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {assurances.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              <span className="leading-relaxed text-muted-foreground text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
