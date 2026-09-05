import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import {
  HOME_STRUCTURED_DATA,
  MARKETING_SEO,
  MARKETING_SEO_BY_PATH,
  breadcrumbStructuredData,
} from './marketingSeo';

/**
 * Every top-level string-path route in the real router that is NOT an auth
 * screen is a public marketing page and must have an SEO entry.
 */
const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);
const PUBLIC_ROUTES = routes
  .map((r) => r.path)
  .filter((p): p is string => typeof p === 'string' && p !== '/' && !AUTH_PATHS.has(p));

describe('marketing SEO catalogue', () => {
  it('has an entry for the homepage and every public marketing route', () => {
    expect(MARKETING_SEO_BY_PATH.has('/')).toBe(true);
    expect(PUBLIC_ROUTES.length).toBeGreaterThanOrEqual(14);
    for (const path of PUBLIC_ROUTES) {
      expect(MARKETING_SEO_BY_PATH.has(path), `SEO entry for ${path}`).toBe(true);
    }
  });

  it('every entry has a unique, non-empty title and a meta description within a sane length', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const e of MARKETING_SEO) {
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.description.length).toBeGreaterThanOrEqual(50);
      expect(e.description.length).toBeLessThanOrEqual(320);
      expect(titles.has(e.title), `duplicate title: ${e.title}`).toBe(false);
      expect(descriptions.has(e.description), `duplicate description`).toBe(false);
      titles.add(e.title);
      descriptions.add(e.description);
    }
  });

  it('sub-pages get a two-level BreadcrumbList; the homepage does not', () => {
    expect(breadcrumbStructuredData(MARKETING_SEO_BY_PATH.get('/')!)).toBeNull();
    const crumb = breadcrumbStructuredData(MARKETING_SEO_BY_PATH.get('/product/banking')!);
    expect(crumb).toMatchObject({ '@type': 'BreadcrumbList' });
    expect((crumb!.itemListElement as unknown[]).length).toBe(2);
  });

  it('home structured data is Organization + WebSite + SoftwareApplication, and fabricates nothing', () => {
    const types = HOME_STRUCTURED_DATA.map((b) => b['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication']);
    const json = JSON.stringify(HOME_STRUCTURED_DATA);
    // no reviews / ratings / awards / prices / customer counts
    expect(json).not.toMatch(/aggregateRating|ratingValue|reviewCount|review|award|"offers"|priceCurrency/i);
    expect(json).not.toMatch(/\d[\d ,]*\s*(businesses|customers|users|clients)/i);
  });
});
