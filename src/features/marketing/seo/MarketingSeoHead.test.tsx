import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SITE_URL } from '@/lib/seo/Seo';
import { MarketingSeo } from './MarketingSeoHead';

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('[data-vertex-seo]').forEach((n) => n.remove());
  document.title = '';
});

function metaContent(selector: string) {
  return document.head.querySelector(selector)?.getAttribute('content');
}

describe('MarketingSeo (route-aware head)', () => {
  it('applies the homepage entry + the full Schema.org graph at "/"', () => {
    render(<MemoryRouter initialEntries={['/']}><MarketingSeo /></MemoryRouter>);
    expect(document.title).toMatch(/South African business · Vertex Accounting/);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/`);
    expect(metaContent('meta[name="robots"]')).toBe('index, follow');
    const ld = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('|');
    expect(ld).toContain('"Organization"');
    expect(ld).toContain('"WebSite"');
    expect(ld).toContain('"SoftwareApplication"');
  });

  it('applies a product page entry + a BreadcrumbList at "/product/banking"', () => {
    render(<MemoryRouter initialEntries={['/product/banking']}><MarketingSeo /></MemoryRouter>);
    expect(document.title).toContain('Bank import & reconciliation');
    expect(metaContent('meta[name="description"]')).toContain('CSV, OFX');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/product/banking`);
    const ld = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('|');
    expect(ld).toContain('"BreadcrumbList"');
    expect(ld).not.toContain('"Organization"');
  });
});
