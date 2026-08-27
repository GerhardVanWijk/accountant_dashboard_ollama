import { integrations } from '../content';

/**
 * Ported from accounting-v0-frontend/components/landing/logo-cloud.tsx.
 * v0's original listed named bank/service integrations (FNB, PayFast,
 * SARS eFiling, etc.) that don't exist as live integrations in this app —
 * content-integrity pass replaced the list with the real statement
 * formats src/features/banking/utils/statementParsers.ts actually parses.
 */
export function LogoCloud() {
  return (
    <section aria-label="Integrations" className="border-y border-border/60 bg-card/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-7 px-5 py-12">
        <p className="text-center text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Import statements in the formats your bank already exports
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {integrations.map((name) => (
            <li key={name} className="text-sm font-medium tracking-tight text-muted-foreground/70 transition-colors hover:text-foreground">
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
