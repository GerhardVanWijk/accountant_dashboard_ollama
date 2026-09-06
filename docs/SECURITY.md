# Security — Vertex Accounting

The real security boundary is **Supabase authentication + row-level
security (RLS)**, keyed on `profiles.role` + `get_my_company_id()`. Every
company-scoped table is RLS-isolated per company; superuser is the only
cross-company read path and it is audited. Nothing below relies on
frontend route hiding or `robots.txt`.

This document covers the web-layer hardening added in the Commercial
Foundation work. See also `docs/PERMISSIONS.md` (the three-layer access
model), `docs/KNOWN_ISSUES.md` (migrations 0065–0067), `docs/SEO.md`.

## HTTP security headers (`public/_headers`)

Applied by Cloudflare Pages at the edge to every response.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | XSS / injection containment |
| `X-Frame-Options` | `DENY` | clickjacking (legacy) |
| `Content-Security-Policy: frame-ancestors 'none'` | — | clickjacking (modern) |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | referrer leakage |
| `Permissions-Policy` | camera/mic/geolocation/USB/… `=()`, `payment=(self)` | disable unused APIs; keep `payment` for future Paystack |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | force HTTPS |
| `Cross-Origin-Opener-Policy` | `same-origin` | cross-origin isolation of the tab |

### Content-Security-Policy — allowed origins

```
default-src 'self'
script-src  'self' 'sha256-…'        ← the one inline theme-bootstrap script in index.html
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com
font-src    'self' https://fonts.gstatic.com
img-src     'self' data: blob:       ← data: for base64 company-logo data-URIs
connect-src 'self' https://bcaffvpibpitpuqglszn.supabase.co wss://bcaffvpibpitpuqglszn.supabase.co
worker-src  'self' blob:
frame-src   'none'   frame-ancestors 'none'   object-src 'none'
base-uri 'self'   form-action 'self'   upgrade-insecure-requests
```

- **No `'unsafe-eval'`** — verified: the production bundle contains no
  `eval(` / `new Function(` / `.wasm`.
- **`script-src` hash** — the SHA-256 of `index.html`'s inline theme script.
  `src/features/marketing/seo/staticSeoFiles.test.ts` recomputes it from
  `index.html` and fails the build if the two drift.
- **Paystack** — `frame-src https://checkout.paystack.com` and
  `connect-src`/`script-src` for `*.paystack.co` are added in Block 5 when
  the integration lands. `payment=(self)` in Permissions-Policy already
  anticipates it.
- **Custom domain** — update `connect-src` only if the Supabase URL
  changes; the domain move itself needs no CSP change.

> ⚠️ **Needs one browser-QA pass.** The CSP is derived from static analysis
> of the bundle and the known external resources (Supabase, Google Fonts,
> data-URI images). Confirm in a real browser that the app shell, fonts,
> Supabase REST + realtime, charts, logo upload/preview, and the print
> flows all work with the header enforced. If something is blocked, the fix
> is a one-line `_headers` edit + redeploy. Report → `docs/CURRENT_TASKS.md`.

## Private-route indexing

`X-Robots-Tag: noindex, nofollow` on every private route family +
`robots.txt` `Disallow` + `<meta name="robots">`. Belt, suspenders and a
second belt — none of it is access control. See `docs/SEO.md`.

## Build-artifact hygiene (audited 2026-09-06)

`dist/` after `npm run build`:

- **No source maps** (`vite.config.ts` sets no `build.sourcemap`; default is off).
- **No `.env`, `.sql`, `.pem`, `.key`, dumps or backups.**
- **No `service_role` / `SUPABASE_SERVICE_ROLE` / private-key strings** in
  any chunk (`grep`-verified).
- Frontend carries only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
  (the anon/publishable key — designed to be public; RLS is the boundary).
- `public/` holds only `_headers`, `_redirects`, `robots.txt`, `sitemap.xml`.

The service-role key exists only server-side and is used only by future
Supabase Edge Functions (Paystack webhook verification, invitation email).
It must never enter Vite/client code or a committed file.

## Rate limiting & bot mitigation

A public site cannot be made un-scrapable. What is in place / planned:

| Surface | Mechanism | State |
|---|---|---|
| Login / signup / password reset | Supabase Auth built-in throttling | active (Supabase-managed) |
| Company creation | `create_company_and_become_admin` rejects a caller who already has a company; one atomic txn | active (0066) |
| `user_roles` / profile privilege changes | `protect_profile_privileged_columns` + `user_roles_company_integrity` triggers | active (0065–0067) |
| Activation-code attempts | rate limit + lockout in the Edge Function | **Block 5** (pending Paystack) |
| Invitation creation / acceptance | per-admin + per-email limits, single-use time-limited token | **Block 4** |
| Edge WAF / bot fight mode / Turnstile on public forms | Cloudflare dashboard | **deployment-level — NOT active.** The Cloudflare account that hosts the `vertex-accounting` Pages project is not reachable from this environment. Recommended: enable *Bot Fight Mode*, a rate-limiting rule on `/login` and `/signup` (e.g. 10 req/min/IP), and Turnstile on the public Contact form and (Block 4) the invitation-accept page. Documented, **not pretended to be on.** |

## Cross-company data-exposure

Re-verified during the 0065 work: RLS confines every company-scoped read
and write to the caller's company; `add_existing_user_to_company` /
`create_company_and_become_admin` never trust a client-supplied actor
(always `auth.uid()`); the bootstrap trigger bypass permits only the exact
first-company transition into an *empty* company. A full cross-company
read/write sweep across every table is a Block-D QA task.

## Client suspension (migration 0070)

`companies.is_active` is now **enforced**: `get_my_company_id()` returns
`NULL` for a member of a company whose `is_active = false`, so every
company-scoped RLS clause (`company_id = (select get_my_company_id())`)
denies — reads *and* writes. `0070` also adds `suspended_at` /
`suspended_by` / `suspension_reason`. A superuser (scoped by
`get_my_role()`) is unaffected and remains the recovery path.

`set_company_suspended(company_id, suspend, reason)` — superuser-only,
audited (`platform` module). It only flips `is_active` + the metadata; it
deletes nothing, touches no GL / inventory / Paystack. RouteGuard shows a
dedicated "workspace suspended" screen (via `my_workspace_suspended()`).

## Superuser platform administration (migration 0070)

The Vertex Platform Administration Console (`docs/SUPERUSER_PLATFORM_ADMIN.md`)
is a **platform-admin surface, not an accounting-data browser** — its reads
return account administration metadata and configuration *health* (counts,
booleans), never a customer balance / journal / invoice / payroll / tax
figure. Every write is a `SECURITY DEFINER` RPC that re-checks
`public.get_my_role() IS DISTINCT FROM 'superuser'` (a `NULL` role → blocked,
not bypassed); `EXECUTE` revoked from `anon`. A company Admin cannot call
any of them. `audit_log_entries_select_superuser` is the only new RLS
policy (a parallel superuser read path; the company-scoped policy is
unchanged). Advisors after 0070: **0 ERROR** (+10 WARN, all the same
`authenticated_security_definer_function_executable` class the invitation
RPCs already carry).

| Surface | Mechanism | State |
|---|---|---|
| Client suspend / reactivate | `set_company_suspended` (superuser-only, audited) + `get_my_company_id()` NULL-gate | active (0070) |
| Manual subscription override | `superuser_set_subscription_plan` / `_status` (audited, `provider='manual'`) | active (0070) |
| Superuser member / role / invitation administration | `superuser_set_member_access` / `_remove_member_from_company` / `_assign_role` / `_unassign_role` / `_create_company_invitation` / `_revoke_company_invitation` | active (0070) |
| Support access to accounting data | Request / time-limited session / audited entry+exit | **designed, NOT built** (see console doc §1) |
