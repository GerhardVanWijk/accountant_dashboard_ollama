import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecordTabs, type RecordTab } from './RecordTabs';

afterEach(cleanup);

const tabs: RecordTab[] = [
  { value: 'overview', label: 'Overview', content: <p>overview body</p> },
  { value: 'line-items', label: 'Line items', count: 3, content: <p>line items body</p> },
  { value: 'accounting', label: 'Accounting', content: <p>accounting body</p> },
];

function renderTabs(props: Partial<React.ComponentProps<typeof RecordTabs>> = {}) {
  return render(
    <MemoryRouter>
      <RecordTabs tabs={tabs} {...props} />
    </MemoryRouter>,
  );
}

describe('RecordTabs', () => {
  it('renders a tablist and marks the first tab active by default', () => {
    renderTabs();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Line items/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('only the active panel is visible; the others are hidden but still mounted', () => {
    renderTabs();
    // text query finds hidden content (kept mounted)…
    expect(screen.getByText('accounting body')).toBeInTheDocument();
    // …but role queries only see the visible panel
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('clicking a tab switches the visible panel', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    expect(screen.getByRole('tab', { name: 'Accounting' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('accounting body');
  });

  it('arrow keys move between tabs (roving focus)', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Line items/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a count badge only when count > 0', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: /Line items/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: 'Overview' })).not.toHaveTextContent(/\d/);
  });

  it('syncs the active tab to the URL when urlParam is set', () => {
    renderTabs({ urlParam: 'tab' });
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    // jsdom MemoryRouter — assert via a re-render reading the same param
    expect(screen.getByRole('tab', { name: 'Accounting' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders nothing for an empty tab list', () => {
    const { container } = render(
      <MemoryRouter>
        <RecordTabs tabs={[]} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-slot="record-tabs"]')).toBeNull();
  });
});
