export interface JournalEntryFilters {
  search: string;
  source: string | 'all';
}

export const defaultJournalEntryFilters: JournalEntryFilters = {
  search: '',
  source: 'all',
};
