import type { DifferenceTimeline } from '../detectors/timeline';
import { formatDate } from '@/lib/app/format';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';

export interface DifferenceTimelinePanelProps {
  timeline: DifferenceTimeline;
  onSelectDate?: (date: string) => void;
}

/** "When did the difference start?" — a clickable date trail, per the spec's Difference Timeline UI. */
export function DifferenceTimelinePanel({ timeline, onSelectDate }: DifferenceTimelinePanelProps) {
  if (timeline.points.length === 0) {
    return <p className="text-sm text-muted-foreground">No dated evidence to build a timeline from yet — run the investigation first.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {timeline.firstAppearanceDate && (
        <p className="text-sm">
          The unexplained difference first appears on <span className="font-semibold">{formatDate(timeline.firstAppearanceDate)}</span>.
        </p>
      )}
      <ol className="flex flex-col gap-1">
        {timeline.points.map((point) => (
          <li key={point.date}>
            <button
              type="button"
              onClick={() => onSelectDate?.(point.date)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                point.date === timeline.firstAppearanceDate && 'bg-status-warning-muted',
              )}
            >
              <span>{formatDate(point.date)}</span>
              <Amount value={point.cumulativeAmount} plain className="text-xs" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
