import { useEffect, useState } from 'react';
import type { Invoice } from '@/types';
import { invoiceService, type CreateInvoiceDTO } from '@/services';

function getInvoiceService() {
  return invoiceService;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const service = getInvoiceService();
    service
      .getInvoices()
      .then((data) => {
        setInvoices(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const refetch = async () => {
    const service = getInvoiceService();
    try {
      const data = await service.getInvoices();
      setInvoices(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return { invoices, loading, error, refetch };
}

export function useInvoice(id: string | undefined) {
  const [invoice, setInvoice] = useState<Invoice | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const service = getInvoiceService();
    service
      .getInvoice(id)
      .then((data) => {
        setInvoice(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  return { invoice, loading, error };
}

export function useInvoiceMutations() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);

  const createInvoice = async (data: CreateInvoiceDTO) => {
    setSaving(true);
    try {
      const service = getInvoiceService();
      await service.createInvoice(data);
      setError(null);
    } catch (err) {
      setError({ message: (err as Error).message });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const updateInvoice = async (id: string, data: Partial<Invoice>) => {
    setSaving(true);
    try {
      const service = getInvoiceService();
      await service.updateInvoice(id, data);
      setError(null);
    } catch (err) {
      setError({ message: (err as Error).message });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    setSaving(true);
    try {
      const service = getInvoiceService();
      await service.deleteInvoice(id);
      setError(null);
    } catch (err) {
      setError({ message: (err as Error).message });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Posts the invoice to the GL and transitions draft -> sent, via
   * invoiceService.postInvoice() (see InvoiceService.markInvoiceAsSent()).
   * This is the ONLY legitimate way an invoice's status should ever
   * change from 'draft' — see docs/KNOWN_ISSUES.md's now-resolved "no way
   * to post an invoice from the UI" entry.
   */
  const markInvoiceAsSent = async (id: string) => {
    setSaving(true);
    try {
      const service = getInvoiceService();
      const invoice = await service.markInvoiceAsSent(id);
      setError(null);
      return invoice;
    } catch (err) {
      setError({ message: (err as Error).message });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  /** Copies an invoice into a new DRAFT invoice (never posts) — see InvoiceService.copyToNewDraftInvoice(). */
  const copyInvoice = async (id: string) => {
    setSaving(true);
    try {
      const service = getInvoiceService();
      const invoice = await service.copyToNewDraftInvoice(id);
      setError(null);
      return invoice;
    } catch (err) {
      setError({ message: (err as Error).message });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return {
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markInvoiceAsSent,
    copyInvoice,
    saving,
    error,
  };
}
