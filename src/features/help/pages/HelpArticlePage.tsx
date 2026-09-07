import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, KeyRound, Scale } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { getArticle, relatedArticles } from '../content';

export function HelpArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();
  const article = articleId ? getArticle(articleId) : undefined;

  if (!article) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Article not found" description="That help article does not exist or has moved." />
        <Empty className="py-10">
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            <Link to="/help" className="text-primary hover:underline">
              Back to the Help centre
            </Link>
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  const related = relatedArticles(article);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Help centre
      </Link>

      <PageHeader
        title={article.title}
        description={article.summary}
        actions={
          article.route ? (
            <Link to={article.route} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Open {article.category === 'Troubleshooting' ? 'the feature' : article.title}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      {(article.permissions || article.accountingImpact) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {article.permissions && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Permissions</span>
                <br />
                <span className="text-muted-foreground">{article.permissions}</span>
              </span>
            </div>
          )}
          {article.accountingImpact && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
              <Scale className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Accounting impact</span>
                <br />
                <span className="text-muted-foreground">{article.accountingImpact}</span>
              </span>
            </div>
          )}
        </div>
      )}

      <SectionCard bodyClassName="flex flex-col gap-6 p-5 sm:p-6">
        {article.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{section.heading}</h2>
            {Array.isArray(section.body) ? (
              <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{section.body}</p>
            )}
          </section>
        ))}
      </SectionCard>

      {related.length > 0 && (
        <SectionCard title="Related articles">
          <ul className="flex flex-col divide-y divide-border">
            {related.map((r) => (
              <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link to={`/help/${r.id}`} className="group flex flex-col gap-0.5 no-underline">
                  <span className="text-sm text-foreground group-hover:text-primary">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
