import React, { useState } from 'react';
import type { Invoice, DocumentLineItem } from '@/types';

interface InvoiceFormProps {
  invoice?: Invoice;
  customers: Map<string, string>; // customerId -> customerName
  onSubmit: (data: Partial<Invoice>) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  invoice,
  customers,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<Partial<Invoice>>(
    invoice || {
      invoiceNumber: '',
      customerId: '',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lineItems: [{ id: 'li_1', description: '', quantity: 0, unitPrice: 0, taxAmount: 0, lineTotal: 0 }],
      subtotal: 0,
      taxTotal: 0,
      total: 0,
      amountPaid: 0,
      currency: 'ZAR',
      status: 'draft',
      notes: '',
    },
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateLineItem = (index: number, field: keyof DocumentLineItem, value: string | number) => {
    const lineItems = [...(formData.lineItems || [])];
    lineItems[index] = { ...lineItems[index], [field]: value };

    // Auto-calculate line total and tax
    if (field === 'quantity' || field === 'unitPrice') {
      const lineTotal = lineItems[index].quantity * lineItems[index].unitPrice;
      lineItems[index].lineTotal = lineTotal;
      // Assuming default 15% tax (VAT)
      lineItems[index].taxAmount = lineTotal * 0.15;
    }

    // Recalculate invoice totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const total = subtotal + taxTotal;

    setFormData({
      ...formData,
      lineItems,
      subtotal,
      taxTotal,
      total,
    });
  };

  const addLineItem = () => {
    const lineItems = [...(formData.lineItems || [])];
    lineItems.push({
      id: `li_${Date.now()}`,
      description: '',
      quantity: 0,
      unitPrice: 0,
      taxAmount: 0,
      lineTotal: 0,
    });
    setFormData({ ...formData, lineItems });
  };

  const removeLineItem = (index: number) => {
    const lineItems = (formData.lineItems || []).filter((_, i) => i !== index);
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const total = subtotal + taxTotal;
    setFormData({
      ...formData,
      lineItems,
      subtotal,
      taxTotal,
      total,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.invoiceNumber?.trim()) {
      newErrors.invoiceNumber = 'Invoice number is required';
    }
    if (!formData.customerId) {
      newErrors.customerId = 'Customer is required';
    }
    if (!formData.issueDate) {
      newErrors.issueDate = 'Issue date is required';
    }
    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    }
    if (!formData.lineItems || formData.lineItems.length === 0) {
      newErrors.lineItems = 'At least one line item is required';
    } else {
      formData.lineItems.forEach((item, idx) => {
        if (!item.description?.trim()) {
          newErrors[`lineItem_${idx}_description`] = 'Description is required';
        }
        if (item.quantity <= 0) {
          newErrors[`lineItem_${idx}_quantity`] = 'Quantity must be greater than 0';
        }
        if (item.unitPrice <= 0) {
          newErrors[`lineItem_${idx}_unitPrice`] = 'Unit price must be greater than 0';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Basic Details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Invoice Number</label>
          <input
            type="text"
            value={formData.invoiceNumber || ''}
            onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded bg-panel text-text"
            disabled={isLoading}
          />
          {errors.invoiceNumber && <div className="text-danger text-xs mt-1">{errors.invoiceNumber}</div>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Customer</label>
          <select
            value={formData.customerId || ''}
            onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded bg-panel text-text"
            disabled={isLoading}
          >
            <option value="">Select Customer</option>
            {Array.from(customers.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {errors.customerId && <div className="text-danger text-xs mt-1">{errors.customerId}</div>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Issue Date</label>
          <input
            type="date"
            value={formData.issueDate?.split('T')[0] || ''}
            onChange={(e) => setFormData({ ...formData, issueDate: e.target.value + 'T00:00:00.000Z' })}
            className="w-full px-3 py-2 border border-border rounded bg-panel text-text"
            disabled={isLoading}
          />
          {errors.issueDate && <div className="text-danger text-xs mt-1">{errors.issueDate}</div>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <input
            type="date"
            value={formData.dueDate?.split('T')[0] || ''}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value + 'T00:00:00.000Z' })}
            className="w-full px-3 py-2 border border-border rounded bg-panel text-text"
            disabled={isLoading}
          />
          {errors.dueDate && <div className="text-danger text-xs mt-1">{errors.dueDate}</div>}
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button
            type="button"
            onClick={addLineItem}
            disabled={isLoading}
            className="text-sm px-3 py-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
          >
            Add Item
          </button>
        </div>

        {errors.lineItems && <div className="text-danger text-xs mb-2">{errors.lineItems}</div>}

        <div className="space-y-2 border border-border rounded p-4 bg-panel">
          {(formData.lineItems || []).map((item, idx) => (
            <div key={item.id} className="grid grid-cols-[2fr_80px_100px_80px_100px_40px] gap-2">
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                className="px-2 py-1 border border-border rounded bg-background text-text text-sm"
                disabled={isLoading}
              />
              <input
                type="number"
                placeholder="Qty"
                value={item.quantity || ''}
                onChange={(e) => updateLineItem(idx, 'quantity', parseFloat(e.target.value))}
                className="px-2 py-1 border border-border rounded bg-background text-text text-sm"
                disabled={isLoading}
              />
              <input
                type="number"
                placeholder="Unit Price"
                value={item.unitPrice || ''}
                onChange={(e) => updateLineItem(idx, 'unitPrice', parseFloat(e.target.value))}
                className="px-2 py-1 border border-border rounded bg-background text-text text-sm"
                disabled={isLoading}
              />
              <div className="px-2 py-1 text-sm text-text-secondary">{(item.lineTotal || 0).toFixed(2)}</div>
              <div className="px-2 py-1 text-sm text-text-secondary">{(item.taxAmount || 0).toFixed(2)}</div>
              <button
                type="button"
                onClick={() => removeLineItem(idx)}
                disabled={isLoading}
                className="text-danger hover:text-danger/80 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Totals Summary */}
      <div className="grid grid-cols-4 gap-4 p-4 bg-panel border border-border rounded">
        <div>
          <div className="text-xs text-text-muted mb-1">Subtotal</div>
          <div className="text-lg font-semibold tabular-nums">{(formData.subtotal || 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Tax</div>
          <div className="text-lg font-semibold tabular-nums">{(formData.taxTotal || 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Total</div>
          <div className="text-lg font-semibold text-positive tabular-nums">{(formData.total || 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Status</div>
          <select
            value={formData.status || 'draft'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as Invoice['status'] })}
            className="px-2 py-1 border border-border rounded bg-background text-text text-sm"
            disabled={isLoading}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded bg-panel text-text text-sm"
          rows={3}
          placeholder="Optional notes for this invoice"
          disabled={isLoading}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save Invoice'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-border rounded hover:bg-panel disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};
