import { useEffect } from 'react';

/**
 * Canonical public origin for the marketing site. Single source of truth —
 * update here (and `public/sitemap.xml` / `public/robots.txt`) if a custom
 * domain is added. Vertex currently deploys to Cloudflare Pages.
 */
export const SITE_URL = 'https://vertex-accounting.pages.dev';

export const SITE_NAME = 'Vertex Accounting';
export const DEFAULT_TITLE = 'Vertex Accounting — cloud accounting for South African business';
export const DEFAULT_DESCRIPTION =
  'Vertex is cloud accounting software built for South African compliance: invoicing in rands, bank statement import and reconciliation, VAT201, SARS-table payroll, and IFRS-for-SMEs financial statements.';

const MARK = 'data-vertex-seo';

export interface SeoProps {
  /** Page title, without the site-name suffix. Omit for private/app pages. */
  title?: string;
  description?: string;
  /** Path only (e.g. "/product/banking"). Canonical = SITE_URL + this. */
  canonicalPath?: string;
  /** Private/app pages: emits `noindex, nofollow`, drops canonical + OG + JSON-LD. */
  noindex?: boolean;
  ogType?: 'website' | 'article';
  /** One or more Schema.org objects — rendered as <script type="application/ld+json">. Only on indexable pages. */
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"][${MARK}]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MARK, '');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="canonical"][${MARK}]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    el.setAttribute(MARK, '');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeMarked(selector: string): void {
  document.head.querySelectorAll(`${selector}[${MARK}]`).forEach((n) => n.remove());
}

/**
 * Head manager for a client-rendered Vite SPA — no dependency, no SSR.
 * Imperatively upserts `<title>`, description, robots, canonical, Open
 * Graph / Twitter and JSON-LD, tagging every node it owns with
 * `data-vertex-seo` so route changes replace rather than accumulate. Search
 * engines that render JavaScript (Google) pick these up; the authoritative
 * `noindex` for private routes is the `X-Robots-Tag` header in
 * `public/_headers`, this is defence in depth.
 */
export function Seo({ title, description, canonicalPath, noindex = false, ogType = 'website', structuredData }: SeoProps): null {
  const structuredJson = structuredData ? JSON.stringify(structuredData) : '';

  useEffect(() => {
    const resolvedDescription = description ?? DEFAULT_DESCRIPTION;
    document.title = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;

    upsertMeta('name', 'description', resolvedDescription);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    if (noindex) {
      removeMarked('link[rel="canonical"]');
      removeMarked('meta[property="og:title"]');
      removeMarked('meta[property="og:description"]');
      removeMarked('meta[property="og:type"]');
      removeMarked('meta[property="og:url"]');
      removeMarked('meta[property="og:site_name"]');
      removeMarked('meta[name="twitter:card"]');
      removeMarked('meta[name="twitter:title"]');
      removeMarked('meta[name="twitter:description"]');
      removeMarked('script[type="application/ld+json"]');
      return;
    }

    const canonical = canonicalPath ? `${SITE_URL}${canonicalPath}` : undefined;
    if (canonical) upsertCanonical(canonical);
    else removeMarked('link[rel="canonical"]');

    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', title ?? DEFAULT_TITLE);
    upsertMeta('property', 'og:description', resolvedDescription);
    upsertMeta('property', 'og:type', ogType);
    if (canonical) upsertMeta('property', 'og:url', canonical);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title ?? DEFAULT_TITLE);
    upsertMeta('name', 'twitter:description', resolvedDescription);

    removeMarked('script[type="application/ld+json"]');
    if (structuredJson) {
      const blocks: unknown[] = JSON.parse(structuredJson);
      const list = Array.isArray(blocks) ? blocks : [blocks];
      for (const block of list) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute(MARK, '');
        script.textContent = JSON.stringify(block);
        document.head.appendChild(script);
      }
    }
  }, [title, description, canonicalPath, noindex, ogType, structuredJson]);

  useEffect(() => {
    return () => {
      // Route change: drop everything this instance owned so the next page
      // starts clean. `<title>` is left for the next <Seo> to set.
      removeMarked('meta');
      removeMarked('link[rel="canonical"]');
      removeMarked('script[type="application/ld+json"]');
    };
  }, []);

  return null;
}
