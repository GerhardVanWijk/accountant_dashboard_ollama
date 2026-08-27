import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
];

const columns: DataTableColumn<Row>[] = [{ key: 'name', header: 'Name', cell: (row) => <span>{row.name}</span> }];

describe('DataTable — clickable rows (audit rule: applicable records must be clickable)', () => {
  it('does not attach row interaction when onRowClick is omitted', () => {
    render(<DataTable rows={rows} columns={columns} getRowKey={(r) => r.id} />);
    expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', () => {
    const onRowClick = vi.fn();
    render(<DataTable rows={rows} columns={columns} getRowKey={(r) => r.id} onRowClick={onRowClick} getRowAriaLabel={(r) => `Open ${r.name}`} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('opens a row via Enter for keyboard users', () => {
    const onRowClick = vi.fn();
    render(<DataTable rows={rows} columns={columns} getRowKey={(r) => r.id} onRowClick={onRowClick} getRowAriaLabel={(r) => `Open ${r.name}`} />);

    const row = screen.getByRole('button', { name: 'Open Beta' });
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('opens a row via Space for keyboard users', () => {
    const onRowClick = vi.fn();
    render(<DataTable rows={rows} columns={columns} getRowKey={(r) => r.id} onRowClick={onRowClick} getRowAriaLabel={(r) => `Open ${r.name}`} />);

    const row = screen.getByRole('button', { name: 'Open Alpha' });
    fireEvent.keyDown(row, { key: ' ' });

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('is keyboard-focusable when clickable', () => {
    render(<DataTable rows={rows} columns={columns} getRowKey={(r) => r.id} onRowClick={vi.fn()} getRowAriaLabel={(r) => `Open ${r.name}`} />);
    expect(screen.getByRole('button', { name: 'Open Alpha' })).toHaveAttribute('tabIndex', '0');
  });

  it('does not fire onRowClick when the click originates on a nested interactive element (row actions stay independent)', () => {
    const onRowClick = vi.fn();
    const onActionClick = vi.fn();
    const columnsWithAction: DataTableColumn<Row>[] = [
      ...columns,
      { key: 'actions', header: '', cell: (row) => <button onClick={() => onActionClick(row.id)}>Delete</button> },
    ];

    render(<DataTable rows={rows} columns={columnsWithAction} getRowKey={(r) => r.id} onRowClick={onRowClick} getRowAriaLabel={(r) => `Open ${r.name}`} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(onActionClick).toHaveBeenCalledWith('1');
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
