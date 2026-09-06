# SEO — Vertex Accounting

Scope: the **public marketing site only**. Authenticated accounting routes
are deliberately kept out of every search index (see § Private routes).
The truth rule from the public-website content audit still governs
everything here: no fabricated reviews, ratings, awards, customer counts,
prices or certifications.

## Architecture

Vertex is a client-rendered Vite SPA (no SSR). SEO metadata is managed at
runtime by a tiny dependency-free head manager:

| Piece | File | Purpose |
|---|---|---|
| `<Seo>` | `src/lib/seo/Seo.tsx` | Imperatively upserts `<title>`, description, `robots`, canonical, Open Graph / Twitter, JSON-LD. Every node it owns is tagged `data-vertex-seo` so route changes replace rather than accumulate. |
| `SITE_URL` | `src/lib/seo/Seo.tsx` | `https://vertex-accounting.pages.dev` — single source of truth. Change here + `public/robots.txt` + `public/sitemap.xml` if a custom domain is added. |
| `MARKETING_SEO` | `src/features/marketing/seo/marketingSeo.ts` | Per-page `{ path, title, description, breadcrumb }` + `HOME_STRUCTURED_DATA`. |
| `<MarketingSeo>` | `src/features/marketing/seo/MarketingSeoHead.tsx` | Reads the current path, drops the right `<Seo>`. Rendered by `MarketingPageShell` (all `/product`, `/company`, `/resources`, `/legal` pages + `/demo`) and by `HomePage`. |

Google renders JavaScript, so runtime `<head>` mutation is indexed. The
**authoritative** `noindex` for private routes is the `X-Robots-Tag`
response header (`public/_headers`) — the `<meta name="robots">` is
defence in depth.

## Per-page metadata

Every public page has a unique `<title>` (suffixed ` · Vertex Accounting`),
a unique 120–320-char meta description written from what the app actually
does, a self-referential `<link rel="canonical">`, and Open Graph +
`twitter:card` tags. Each `/product/*` page's copy is verified against
`src/features/*` — see the page component doc comments and `content.ts`.

Semantic heading hierarchy was already fixed in the v0 truth-audit pass:
`Hero` is the homepage `<h1>`; every standalone sub-page renders
`SectionHeading` with `headingTag="h1"` (one h1 per page). Images on
marketing pages carry real `alt` text.

## Structured data (Schema.org, JSON-LD)

Emitted only on indexable pages.

| Page | Blocks |
|---|---|
| `/` (homepage) | `Organization` + `WebSite` + `SoftwareApplication` (`applicationCategory: BusinessApplication`, `operatingSystem: Web`, `areaServed: South Africa`). **No** `offers` / `aggregateRating` / `review` — added only when real. |
| every sub-page | `BreadcrumbList` (Home → page) |

`src/features/marketing/seo/marketingSeo.test.ts` asserts the graph
contains no `aggregateRating`, `review`, `award`, `offers`, `priceCurrency`
or "N businesses/customers/users" strings.

## robots.txt

`public/robots.txt` (real static file, copied to `dist/` by Vite, served
by Cloudflare Pages ahead of the SPA `_redirects` fallback). `Disallow`s
every private route family and points at the sitemap. **robots.txt is not
access control** — Supabase auth + RLS remain the boundary.

## sitemap.xml

`public/sitemap.xml` — **public canonical marketing URLs only** (16), kept
in lockstep with `PUBLIC_CANONICAL_PATHS` and checked by
`src/features/marketing/seo/staticSeoFiles.test.ts` (fails if a private
path appears or a public path is missing). No `/login`, `/signup`,
`/onboarding`, `/dashboard`, `/companies`, `/customers`, `/invoices`,
`/reports`, `/admin`, `/settings`, `/audit`, … ever.

## Private routes — never indexed

`public/_headers` sends `X-Robots-Tag: noindex, nofollow` for every private
route family (`/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/onboarding`, `/companies`, `/financial-periods`, `/settings*`, `/admin/*`,
`/accounting/*`, `/sales/*`, `/purchases/*`, `/banking/*`, `/inventory/*`,
`/assets/{register,depreciation,disposals,tax-register}`, `/payroll/*`,
`/tax/*`, `/reports/*`, `/compliance/*`, `/related-parties/*`,
`/foreign-exchange/*`, `/leases/*`). `<Seo noindex>` also fires from
`AppLayout`, `OnboardingPage`, `SuperUserDashboardPage` and `AuthShell`.

`/` is shared (marketing homepage when logged out, dashboard when logged
in) — same URL — so it is **indexable**; a crawler with no session only
ever sees the marketing homepage.

## Content quality

Professional South African accounting language used naturally — "South
African accounting software", "VAT201", "bank reconciliation", "PAYE / UIF
/ SDL", "IFRS for SMEs financial statements", "budgeting and forecasting" —
no keyword stuffing, no thin AI-generated pages. Pages describe real Vertex
functionality only.

## Not done / deployment-level

- **OG image** — no `og:image` asset exists yet. Add a branded 1200×630 PNG
  to `public/` and an `upsertMeta('property', 'og:image', …)` in `<Seo>`.
- **Custom domain** — update `SITE_URL`, `robots.txt`, `sitemap.xml`, and
  the CSP `connect-src` note if one is added.
- **Google Search Console / Bing verification** — a `<meta>` verification
  token or DNS TXT record; deployment-level.
- **CSP browser confirmation** — see `docs/SECURITY.md`.
