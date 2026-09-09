import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RecordTabs, type RecordTab } from './RecordTabs';

afterEach(cleanup);

const tabs: RecordTab[] = [
  { value: 'overview', label: 'Overview', content: <p>overview body</p> },
  { value: 'line-items', label: 'Line items', count: 3, content: <p>line items body</p> },
  { value: 'accounting', label: 'Accounting', content: <p>accounting body</p> },
];

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderTabs(props: Partial<React.ComponentProps<typeof RecordTabs>> = {}, entries = ['/x']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <RecordTabs tabs={tabs} {...props} />
      <Search />
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

  it('only the active panel is shown; every other panel carries the hidden attribute', () => {
    const { container } = renderTabs();
    const panels = Array.from(container.querySelectorAll('[role="tabpanel"]'));
    expect(panels).toHaveLength(3);
    const visible = panels.filter((p) => !p.hasAttribute('hidden'));
    expect(visible).toHaveLength(1);
    expect(visible[0]).toHaveTextContent('overview body');
    // panels are kept mounted (find-in-page / anchors still reach them)…
    expect(screen.getByText('accounting body')).toBeInTheDocument();
    // …but only the active one is in the accessibility tree
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('clicking tab A hides panel A and shows only panel B', () => {
    const { container } = renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));

    expect(screen.getByRole('tab', { name: 'Accounting' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByRole('tabpanel')).toHaveTextContent('accounting body');
    const panels = Array.from(container.querySelectorAll('[role="tabpanel"]'));
    const shown = panels.filter((p) => !p.hasAttribute('hidden'));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('accounting body');
    // the previously-active Overview panel is now hidden
    expect(panels.find((p) => p.textContent?.includes('overview body'))).toHaveAttribute('hidden');
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
    expect(screen.getByRole('tab', { name: 'Accounting' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('search')).toHaveTextContent('tab=accounting');
    // switching back to the default tab clears the param rather than pinning it
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab=');
  });

  it('opens the tab named in ?tab= on first render', () => {
    renderTabs({ urlParam: 'tab' }, ['/x?tab=line-items']);
    expect(screen.getByRole('tab', { name: /Line items/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the first tab when ?tab= names an unknown tab', () => {
    renderTabs({ urlParam: 'tab' }, ['/x?tab=nonsense']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not touch the URL when urlParam is omitted', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    expect(screen.getByTestId('search')).toHaveTextContent('');
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
