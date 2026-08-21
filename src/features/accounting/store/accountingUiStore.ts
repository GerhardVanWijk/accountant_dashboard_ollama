import { create } from 'zustand';
import type { ID } from '@/types';

interface AccountingUiState {
  /** The account currently selected on the General Ledger detail page — kept
   * here (rather than component state) so the selection survives navigating
   * away and back, per docs/ARCHITECTURE.md's Zustand-for-feature-UI-state
   * convention. */
  selectedLedgerAccountId: ID | null;
  setSelectedLedgerAccountId: (id: ID | null) => void;
}

export const useAccountingUiStore = create<AccountingUiState>((set) => ({
  selectedLedgerAccountId: null,
  setSelectedLedgerAccountId: (id) => set({ selectedLedgerAccountId: id }),
}));
