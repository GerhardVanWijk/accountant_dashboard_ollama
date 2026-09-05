import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { DEFAULT_TITLE, Seo, SITE_URL } from './Seo';

function head() {
  return {
    title: document.title,
    description: document.head.querySelector('meta[name="description"]')?.getAttribute('content'),
    robots: document.head.querySelector('meta[name="robots"]')?.getAttribute('content'),
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ogTitle: document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ogUrl: document.head.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    twitterCard: document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
    jsonLd: [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
  };
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('[data-vertex-seo]').forEach((n) => n.remove());
  document.title = '';
});

describe('Seo', () => {
  it('sets a suffixed title, description, robots index, canonical and social tags for a public page', () => {
    render(
      <Seo
        title="Bank import & reconciliation"
        description="Import statements in CSV, OFX, QIF or MT940."
        canonicalPath="/product/banking"
        structuredData={{ '@type': 'BreadcrumbList' }}
      />,
    );
    const h = head();
    expect(h.title).toBe('Bank import & reconciliation · Vertex Accounting');
    expect(h.description).toContain('Import statements');
    expect(h.robots).toBe('index, follow');
    expect(h.canonical).toBe(`${SITE_URL}/product/banking`);
    expect(h.ogTitle).toBe('Bank import & reconciliation');
    expect(h.ogUrl).toBe(`${SITE_URL}/product/banking`);
    expect(h.twitterCard).toBe('summary_large_image');
    expect(h.jsonLd).toHaveLength(1);
    expect(h.jsonLd[0]).toContain('BreadcrumbList');
  });

  it('noindex mode emits noindex,nofollow and drops canonical, OG and JSON-LD', () => {
    render(<Seo noindex structuredData={{ '@type': 'X' }} canonicalPath="/admin/users" title="Users" />);
    const h = head();
    expect(h.robots).toBe('noindex, nofollow');
    expect(h.canonical).toBeUndefined();
    expect(h.ogTitle).toBeUndefined();
    expect(h.jsonLd).toHaveLength(0);
  });

  it('falls back to the default title/description when none is given', () => {
    render(<Seo canonicalPath="/" />);
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(head().description).toBeTruthy();
  });

  it('renders each Schema.org block as its own script tag', () => {
    render(<Seo title="Home" canonicalPath="/" structuredData={[{ '@type': 'Organization' }, { '@type': 'WebSite' }]} />);
    expect(head().jsonLd).toHaveLength(2);
  });
});
