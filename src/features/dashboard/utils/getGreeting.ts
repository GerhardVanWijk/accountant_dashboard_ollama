/**
 * Time-of-day greeting for the dashboard header. A pure function (takes
 * `now` as a parameter) so it's testable without mocking the global Date
 * — per docs/DO_NOT_BREAK.md, this kind of derived display logic still
 * belongs in a util, not inlined in the page component.
 */
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
