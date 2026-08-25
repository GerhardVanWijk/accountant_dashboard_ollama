import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpPage } from './HelpPage';

describe('HelpPage', () => {
  it('links every topic card to a real internal route', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /invoices and payments/i })).toHaveAttribute('href', '/sales/invoices');
    expect(screen.getByRole('link', { name: /vat and tax/i })).toHaveAttribute('href', '/tax/vat-return');
  });

  it('filters the FAQ list as the user searches', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );

    const before = screen.getAllByRole('button', { expanded: false }).length;
    fireEvent.change(screen.getByLabelText(/search help articles/i), { target: { value: 'zzz-no-match-zzz' } });

    expect(screen.getByText('No matching articles')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { expanded: false }).length).toBeLessThan(before);
  });

  it('does not offer live chat, ticketing, or any support capability that does not exist', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/live chat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ticket/i)).not.toBeInTheDocument();
  });
});
