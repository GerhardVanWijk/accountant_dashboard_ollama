import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpPage } from './HelpPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
}

describe('HelpPage', () => {
  it('browses articles by category, each linking to its help route', () => {
    renderPage();
    const gettingStarted = screen.getByRole('link', { name: /welcome to vertex accounting/i });
    expect(gettingStarted).toHaveAttribute('href', '/help/welcome');
    expect(screen.getByRole('link', { name: /^bank reconciliation/i })).toHaveAttribute('href', '/help/bank-reconciliation');
  });

  it('ranks a symptom search onto the right troubleshooting article', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/search help articles/i), { target: { value: "invoice won't post" } });
    const results = screen.getAllByRole('link');
    expect(results[0]).toHaveAttribute('href', '/help/ts-invoice-wont-post');
  });

  it('shows an honest empty state for a no-match search', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/search help articles/i), { target: { value: 'zzz-no-match-zzz' } });
    expect(screen.getByText('No matching articles')).toBeInTheDocument();
  });

  it('offers no live chat, ticketing or AI support', () => {
    renderPage();
    expect(screen.queryByText(/live chat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ticket/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai (support|assistant|chat)/i)).not.toBeInTheDocument();
  });
});
