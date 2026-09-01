import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InventoryReportsHubPage } from './InventoryReportsHubPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports']}>
      <InventoryReportsHubPage />
    </MemoryRouter>,
  );
}

describe('InventoryReportsHubPage', () => {
  it('groups reports under Stock / Movement / Control / Analysis', () => {
    renderPage();
    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('Movement')).toBeInTheDocument();
    expect(screen.getByText('Control')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('links every report card to its own route', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /stock on hand/i })).toHaveAttribute('href', '/inventory/reports/stock-on-hand');
    expect(screen.getByRole('link', { name: /inventory reconciliation/i })).toHaveAttribute('href', '/inventory/reports/inventory-reconciliation');
    expect(screen.getByRole('link', { name: /slow-moving/i })).toHaveAttribute('href', '/inventory/reports/slow-moving');
  });
});
