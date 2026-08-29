import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';

export interface FormTab {
  value: string;
  label: ReactNode;
  content: ReactNode;
  /** Marks the trigger with an error dot — e.g. this tab holds an invalid field. */
  hasError?: boolean;
  disabled?: boolean;
}

export interface FormTabsProps {
  tabs: FormTab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  /** Override the default `flex flex-col gap-6` inner layout of each panel. */
  panelClassName?: string;
}

/**
 * The tab region of a `FormShell` (P3B.5). Use INSTEAD of `FormBody`.
 *
 * `flex min-h-0 flex-1 flex-col` inside the fixed-height shell means the
 * tab list is pinned and each panel is its own scroll area — so switching
 * tabs never changes the outer width or height, and the footer never moves
 * (the tab-resize bug the audit found hand-rolled three different ways).
 * Panels are `keepMounted` so a tab's scroll position and un-committed
 * input survive a round-trip to another tab. The active tab uses the
 * brand-green `line` treatment from the shared `Tabs`.
 */
export function FormTabs({ tabs, value, onValueChange, className, panelClassName }: FormTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className={cn('min-h-0 flex-1', className)}
      data-slot="form-tabs"
    >
      <TabsList
        variant="line"
        className="w-full shrink-0 justify-start overflow-x-auto border-b border-border px-4 sm:px-6"
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
            {tab.label}
            {tab.hasError ? (
              <span
                aria-hidden="true"
                className="ml-1.5 inline-block size-1.5 rounded-full bg-destructive align-middle"
              />
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          keepMounted
          className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:px-6 sm:py-5"
        >
          <div className={cn('flex flex-col gap-6', panelClassName)}>{tab.content}</div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
