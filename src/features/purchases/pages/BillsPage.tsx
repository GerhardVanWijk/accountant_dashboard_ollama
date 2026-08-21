import { useState } from 'react';
import { useBills } from '../hooks/useBills';
import { BillList, BillDetail } from '../components';

/**
 * Page for managing supplier bills.
 * Displays a list of bills with filtering, sorting, and search.
 * Allows viewing details, creating, editing, and recording payments.
 */
export function BillsPage() {
  const { bills, isLoading, error } = useBills();
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const selectedBill = bills.find((b) => b.id === selectedBillId);

  if (selectedBill) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedBillId(null)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-text-primary hover:bg-secondary/80 transition-colors"
          >
            ← Back to Bills
          </button>
          <h1 className="text-2xl font-bold">Bill Details</h1>
        </div>
        <BillDetail bill={selectedBill} onClose={() => setSelectedBillId(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Supplier Bills</h1>
        <button className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-text-on-primary hover:bg-primary/90 transition-colors">
          + New Bill
        </button>
      </div>
      <BillList
        bills={bills}
        onSelect={setSelectedBillId}
        isLoading={isLoading}
        error={error?.message}
      />
    </div>
  );
}
