import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@/lib/seo/Seo';
import { PUBLIC_CANONICAL_PATHS } from './marketingSeo';

/**
 * BLOCK 2 (2026-09-06) — guards the real static SEO / security files in
 * `public/` against drift. `public/*` is copied verbatim to `dist/` by
 * Vite and served by Cloudflare Pages ahead of the SPA `_redirects`
 * fallback.
 */

const PUBLIC = join(process.cwd(), 'public');
const robots = readFileSync(join(PUBLIC, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
const headers = readFileSync(join(PUBLIC, '_headers'), 'utf8');
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const PRIVATE_PREFIXES = [
  '/login', '/signup', '/forgot-password', '/reset-password', '/onboarding', '/companies',
  '/financial-periods', '/settings', '/admin/', '/accounting/', '/sales/', '/purchases/',
  '/banking/', '/inventory/', '/payroll/', '/tax/', '/reports/', '/compliance/',
  '/related-parties/', '/foreign-exchange/', '/leases/',
];

describe('sitemap.xml', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('lists exactly the public canonical marketing paths', () => {
    const expected = PUBLIC_CANONICAL_PATHS.map((p) => `${SITE_URL}${p === '/' ? '/' : p}`).sort();
    expect([...locs].sort()).toEqual(expected);
  });

  it('contains no authenticated / application route', () => {
    for (const loc of locs) {
      const path = loc.replace(SITE_URL, '') || '/';
      for (const priv of PRIVATE_PREFIXES) {
        expect(path.startsWith(priv), `${path} is private`).toBe(false);
      }
    }
  });

  it('is well-formed and absolute-URL only', () => {
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const loc of locs) expect(loc.startsWith('https://')).toBe(true);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap', () => {
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('disallows every private area and no public one', () => {
    const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    expect(disallows).toContain('/login');
    expect(disallows).toContain('/admin/');
    expect(disallows).toContain('/sales/');
    for (const d of disallows) {
      expect(PUBLIC_CANONICAL_PATHS.includes(d), `${d} is a public page`).toBe(false);
      expect(d.startsWith('/product'), `${d}`).toBe(false);
    }
  });
});

describe('_headers', () => {
  it('sets the core security headers site-wide', () => {
    const globalBlock = headers.split(/\n(?=\/)/).find((b) => b.trimStart().startsWith('/*')) ?? '';
    expect(globalBlock).toMatch(/X-Frame-Options:\s*DENY/i);
    expect(globalBlock).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(globalBlock).toMatch(/Referrer-Policy:\s*strict-origin-when-cross-origin/i);
    expect(globalBlock).toMatch(/Strict-Transport-Security:\s*max-age=\d+/i);
    expect(globalBlock).toMatch(/Permissions-Policy:/i);
    expect(globalBlock).toMatch(/Content-Security-Policy:/i);
  });

  it('CSP: locks default-src to self, forbids framing, allows only the origins the app actually uses', () => {
    const csp = /Content-Security-Policy:\s*(.+)/i.exec(headers)?.[1] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain('https://bcaffvpibpitpuqglszn.supabase.co');
    expect(csp).toContain('wss://bcaffvpibpitpuqglszn.supabase.co');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain('img-src \'self\' data: blob:');
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('CSP script-src hash matches index.html\'s inline theme bootstrap (catches silent drift)', () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
    expect(inline).toContain('data-theme');
    const hash = `sha256-${createHash('sha256').update(inline, 'utf8').digest('base64')}`;
    expect(headers).toContain(`'${hash}'`);
  });

  it('emits X-Robots-Tag noindex for every private route family', () => {
    for (const priv of ['/login', '/signup', '/onboarding', '/settings', '/admin/*', '/sales/*', '/banking/*', '/payroll/*', '/reports/*']) {
      const block = headers.split(/\n(?=\/)/).find((b) => b.trimStart().startsWith(priv));
      expect(block, `rule for ${priv}`).toBeTruthy();
      expect(block).toMatch(/X-Robots-Tag:\s*noindex/i);
    }
  });

  it('does NOT noindex any public marketing path', () => {
    for (const p of PUBLIC_CANONICAL_PATHS) {
      const block = headers.split(/\n(?=\/)/).find((b) => {
        const first = b.trimStart().split('\n')[0].trim();
        return first === p || (first.endsWith('/*') && p.startsWith(first.slice(0, -2)));
      });
      if (block) expect(block).not.toMatch(/X-Robots-Tag/i);
    }
  });
});
