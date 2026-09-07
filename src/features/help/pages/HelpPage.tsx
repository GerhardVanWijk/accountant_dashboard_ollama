import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Search } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { Input } from '@/components/ui/shadcn/input';
import { HELP_ARTICLES, HELP_CATEGORY_ORDER, articlesByCategory, searchHelp } from '../content';

/**
 * Help Centre — route `/help`. A real, searchable knowledge base for the
 * implemented Vertex product. Search ranks title / exact / keyword matches
 * far above body-only matches, so a symptom ("invoice won't post") lands on
 * the right troubleshooting article. No live chat, ticketing or AI support
 * — none of those exist, and a fake button would be worse than none.
 */
export function HelpPage() {
  const [term, setTerm] = useState('');
  const results = useMemo(() => searchHelp(term), [term]);
  const searching = term.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Help centre"
        description="Guides, answers and troubleshooting for running your books in Vertex."
      />

      <SectionCard>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={'Search — try "VAT", "invoice won’t post", "reconcile", "add a user"'}
            aria-label="Search help articles"
            className="pl-9"
          />
        </div>
      </SectionCard>

      {searching ? (
        <SectionCard title={`${results.length} result${results.length === 1 ? '' : 's'} for "${term.trim()}"`}>
          {results.length === 0 ? (
            <Empty className="py-8">
              <Search className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
              <EmptyTitle>No matching articles</EmptyTitle>
              <EmptyDescription>Try a feature name, or the exact wording of the problem you are seeing.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {results.map(({ article, snippet }) => (
                <li key={article.id} className="py-3 first:pt-0 last:pb-0">
                  <Link to={`/help/${article.id}`} className="group flex flex-col gap-1 no-underline">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground group-hover:text-primary">{article.title}</span>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {article.category}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{snippet ?? article.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Start here">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {articlesByCategory('Getting started').map((article) => (
                <Link
                  key={article.id}
                  to={`/help/${article.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LifeBuoy className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{article.title}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{article.summary}</span>
                </Link>
              ))}
            </div>
          </SectionCard>

          {HELP_CATEGORY_ORDER.filter((c) => c !== 'Getting started').map((category) => {
            const articles = articlesByCategory(category);
            if (articles.length === 0) return null;
            return (
              <SectionCard key={category} title={category}>
                <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <Link
                        to={`/help/${article.id}`}
                        className="group flex flex-col gap-0.5 py-1 no-underline"
                      >
                        <span className="text-sm text-foreground group-hover:text-primary">{article.title}</span>
                        <span className="text-xs text-muted-foreground">{article.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}

          <p className="text-xs text-muted-foreground">{HELP_ARTICLES.length} articles. Everything here reflects behaviour that is actually built.</p>
        </>
      )}
    </div>
  );
}
