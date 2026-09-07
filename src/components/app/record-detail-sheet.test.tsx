import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  RecordDetailSheet,
  RecordDetailGrid,
  RecordDetailField,
  RelatedRecordsSection,
} from './record-detail-sheet';

afterEach(cleanup);

function getPanel() {
  return document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
}

describe('RecordDetailSheet width', () => {
  it('applies the compact width by default and a wider cap for width="wide"', () => {
    const { rerender } = render(
      <RecordDetailSheet open onOpenChange={vi.fn()} title="X" state="ready">
        <p>body</p>
      </RecordDetailSheet>,
    );
    // The override MUST be a data-[side=right] variant so it beats SheetContent's baked-in sm:max-w-sm.
    expect(getPanel().className).toContain('data-[side=right]:sm:max-w-[26rem]');

    rerender(
      <RecordDetailSheet open onOpenChange={vi.fn()} title="X" state="ready" width="wide">
        <p>body</p>
      </RecordDetailSheet>,
    );
    expect(getPanel().className).toContain('data-[side=right]:sm:max-w-2xl');
    expect(getPanel().className).not.toContain('data-[side=right]:sm:max-w-[26rem]');
  });

  it('renders a pinned footer only when ready and actions are supplied', () => {
    const { rerender } = render(
      <RecordDetailSheet open onOpenChange={vi.fn()} title="X" state="loading" actions={<button>Edit</button>}>
        <p>body</p>
      </RecordDetailSheet>,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

    rerender(
      <RecordDetailSheet open onOpenChange={vi.fn()} title="X" state="ready" actions={<button>Edit</button>}>
        <p>body</p>
      </RecordDetailSheet>,
    );
    const footer = screen.getByRole('button', { name: 'Edit' }).parentElement as HTMLElement;
    expect(footer.className).toContain('border-t');
    expect(footer.className).not.toContain('flex-1');
  });
});

describe('RelatedRecordsSection', () => {
  it('makes the whole row a button when onActivate is given', () => {
    const onActivate = vi.fn();
    render(<RelatedRecordsSection items={[{ label: 'Transactions', value: 'View transactions', onActivate }]} />);
    const row = screen.getByRole('button', { name: /Transactions/ });
    fireEvent.click(row);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('leaves a plain row (no button) when onActivate is absent', () => {
    render(<RelatedRecordsSection items={[{ label: 'GL posting', value: 'JE-1' }]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('JE-1')).toBeInTheDocument();
  });
});

describe('RecordDetailGrid', () => {
  it('never uses a three-column layout', () => {
    render(
      <RecordDetailGrid>
        <RecordDetailField label="A" value="1" />
        <RecordDetailField label="B" value="2" />
      </RecordDetailGrid>,
    );
    const grid = screen.getByText('A').closest('.grid') as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).not.toMatch(/grid-cols-3/);
  });
});
