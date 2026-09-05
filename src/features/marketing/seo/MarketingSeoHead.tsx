import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';

import { Seo } from '@/lib/seo/Seo';
import { HOME_STRUCTURED_DATA, MARKETING_SEO_BY_PATH, breadcrumbStructuredData } from './marketingSeo';

/**
 * Drops the right `<Seo>` for whichever public marketing page is mounted.
 * Rendered by `MarketingPageShell` (every `/product`, `/company`,
 * `/resources`, `/legal` page + `/demo`) and by `HomePage`. A path with no
 * entry in `marketingSeo.ts` still gets a canonical + indexable defaults
 * rather than being dropped from search entirely.
 */
export function MarketingSeo(): ReactElement {
  const { pathname } = useLocation();
  const entry = MARKETING_SEO_BY_PATH.get(pathname);

  if (!entry) {
    return <Seo canonicalPath={pathname} />;
  }

  const isHome = entry.path === '/';
  const breadcrumb = breadcrumbStructuredData(entry);
  const structuredData = isHome ? HOME_STRUCTURED_DATA : breadcrumb ? [breadcrumb] : undefined;

  return (
    <Seo
      title={entry.title}
      description={entry.description}
      canonicalPath={entry.path}
      ogType={isHome ? 'website' : 'article'}
      structuredData={structuredData}
    />
  );
}
