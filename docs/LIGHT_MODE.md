# Light mode — softened authenticated theme (2026-09-08)

Branch `import-export-light-mode-2026-09-08`. Goal: make the authenticated
accounting app calmer for long sessions — less pure white, less glare, softer
borders, charcoal-navy text — without touching dark mode or the marketing site.

## How the theme is wired (why this was a token-only change)

- `src/styles/tokens.css` holds two systems: the legacy `--color-*` tokens
  (marketing) and the "v0" shadcn tokens (`--background`, `--card`, `--muted`,
  `--border`, `--input`, `--foreground`, …).
- The authenticated app renders inside `.app-shell` (`AppLayout.tsx`), and the
  `.app-shell` block at the bottom of `tokens.css` **remaps**
  `--color-background/-border/-primary/-secondary` onto the v0 tokens. So
  inside the app, every `bg-background` / `border-border` / `bg-card` /
  `bg-muted` / `border-input` resolves to a v0 token.
- Marketing pages have no `.app-shell`, so they keep the legacy `--color-*`
  values **untouched** — zero marketing regression by construction.
- A codebase audit found the authenticated app is fully tokenised: **0**
  `bg-white` / `text-black` / `bg-gray-*` / `bg-slate-*` / arbitrary color
  literals outside 3 deliberate paper-white surfaces. So softening the light
  v0 `:root` values calms the whole product with almost no per-page work.

## Token changes (LIGHT values only — the `:root` v0 block)

| Token | Before | After | Effect |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` (pure white) | `oklch(0.977 0.0018 250)` | soft cool off-white app canvas |
| `--foreground` | `oklch(0.145 0 0)` (near-black) | `oklch(0.248 0.014 262)` | charcoal-navy body/heading text |
| `--card` / `--popover` | `oklch(1 0 0)` | unchanged (white) | cards read as elevated against the softer canvas |
| `--card-foreground` / `--popover-foreground` | `oklch(0.145 0 0)` | `oklch(0.248 0.014 262)` | matches `--foreground` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.957 0.003 255)` | table headers / nested panels sit between canvas and card |
| `--secondary` | `oklch(0.97 0 0)` | `oklch(0.955 0.0035 255)` | secondary surfaces |
| `--secondary-foreground` / `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.29 0.013 262)` | slightly softer |
| `--muted-foreground` | `oklch(0.556 0 0)` (~4.5:1) | `oklch(0.505 0.008 260)` (~5.6:1) | secondary text more readable |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.949 0.0045 258)` | hover/selected surface, a hair deeper than muted |
| `--border` | `oklch(0.922 0 0)` | `oklch(0.906 0.004 258)` | gentle cool borders |
| `--input` | `oklch(0.922 0 0)` | `oklch(0.888 0.005 258)` | field borders a touch stronger so inputs don't vanish |

Every changed neutral carries a small cool chroma (H≈255–262) so the app
reads as a cool neutral, never beige and never a blue-tinted corporate theme.

## Component changes (light-only, dark paths untouched)

| File | Change |
|---|---|
| `input.tsx`, `textarea.tsx`, `select.tsx` (trigger), `combobox.tsx` (trigger) | `bg-transparent` → `bg-muted/55`. Dark keeps its existing `dark:bg-input/30`. Fields now sit on a soft surface instead of glowing white. |
| `chart.tsx` (tooltip) | `bg-background` → `bg-popover` so the floating tooltip stays a crisp surface over the softer chart card. |
| `DataMigrationOverviewPage.tsx` | removed an SLC hardcoded navy shadow (`shadow-[0_1px_2px_rgb(7_20_40_/_4%)]`) → design-system `shadow-sm`. |

Cards (`card.tsx`), tables (`table.tsx`, `data-table.tsx`), dialogs/sheets,
popovers, status badges and the topbar are **entirely token-driven** and were
not edited — they soften automatically.

## Dark mode

Not changed. The `[data-theme='dark']` blocks in `tokens.css` are byte-for-byte
identical; `src/styles/light-mode-tokens.test.ts` asserts this. The
`bg-muted/55` field fill is overridden by `dark:bg-input/30` in dark.

## Status colours

Left as-is. The status surface tokens (`--positive-surface` etc.) are already
10–15 % alpha washes — soft, not neon — and are shared with dark mode, so
changing them risked dark. Badges remain immediately legible.

## Charts

Chart series use `var(--chart-1..5)`, which `.app-shell` maps to the brand
palette (green / blue / amber / red / purple) — unaffected. Gridlines and axis
labels use `--border` / `--muted-foreground`, which soften slightly but stay
above contrast minimums. Tooltip moved to `bg-popover` (see above).

## Representative-page review (code / component level — no browser)

The audit is at the token layer: every row below relies on shared semantic
tokens unless noted.

| Page / area | Tokenised | Exception found | Fixed | Intentional white |
|---|---|---|---|---|
| Dashboard | ✅ | — | — | — |
| Customers / Suppliers / Quotes / Invoices / Bills | ✅ | — | — | — |
| Banking / Bank Reconciliation | ✅ | — | — | — |
| Inventory Overview / Products / Categories / Warehouses | ✅ | — | — | — |
| General Ledger / Journal Entry / Trial Balance | ✅ | — | — | — |
| VAT / Tax pages | ✅ | — | — | — |
| Reports / Forecasting (Recharts) | ✅ | chart tooltip on `bg-background` | ✅ → `bg-popover` | — |
| Administration (Users, Audit Trail, Access Log) | ✅ | — | — | — |
| Documents / Notifications | ✅ | — | — | — |
| Import / Export (7 pages) | ✅ | SLC hardcoded shadow on 1 card | ✅ → `shadow-sm` | — |
| Settings / Accounting Settings / Plan & Billing | ✅ | — | — | — |
| Help Centre | ✅ | — | — | — |
| Superuser console | ✅ | — | — | — |
| Company profile — logo preview (`CompanyForm.tsx`, `CompanyPage.tsx`) | ✅ | — | — | **`bg-white` kept** — a logo may be a transparent PNG designed for white |
| Invoice / document paper preview (`BusinessDocument.tsx`) | n/a | — | — | **paper-white kept by design** (print/PDF fidelity) |
| Public marketing site | n/a (legacy `--color-*`) | — | — | intentional identity preserved (no `.app-shell`) |

Forms, selects, dropdowns, dialogs and sheets were reviewed via their shared
primitives (`input`/`textarea`/`select`/`combobox`/`dialog`/`sheet`/`popover`
/`card`/`table`) — all token-driven, all soften with the canvas.

## Responsive

No layout properties changed — only colour tokens and four `bg-*` utility
swaps on form primitives. No new overflow, scrollbars, or clipped dropdowns
possible from this change. `type-check` / `lint` / `test` / `build` all green.

## Follow-up (browser QA)

A human should confirm the softened light mode at 1920 / 1440 / 1366 / tablet
/ mobile across the representative pages, and re-confirm dark mode is visually
identical to before.
