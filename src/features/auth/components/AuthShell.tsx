import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

import { Wordmark } from '@/components/app/wordmark';

const assurances = [
  'SARS-aligned VAT201 and EMP201 workflows',
  'Bank feeds for Standard Bank, FNB, ABSA and Nedbank',
  'IFRS for SMEs statements, ready for your auditor',
  'POPIA-compliant hosting in South Africa',
];

/**
 * Split layout shared by every credential screen (Login/SignUp/Forgot/Reset
 * password) — ported from accounting-v0-frontend/components/auth/auth-shell.tsx
 * (M6). The right-hand reassurance panel is v0's marketing copy, collapses
 * on mobile; the form column is real. next/link swapped for react-router.
 */
export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
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
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium tracking-wide text-brand uppercase">Trusted by 2 400 South African businesses</p>
          <p className="text-xl leading-relaxed font-medium text-pretty">
            &ldquo;We closed our year-end in four days instead of three weeks. The VAT201 reconciliation alone saved our bookkeeper a fortnight.&rdquo;
          </p>
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">Thandiwe Nkosi</span>
            <span className="text-muted-foreground">Financial Director, Naledi Construction Group</span>
          </div>
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
