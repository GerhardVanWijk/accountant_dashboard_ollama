import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BoxesIcon } from 'lucide-react';
import { StatTile, StatStrip } from './stat-tile';

afterEach(cleanup);

describe('StatTile', () => {
  it('renders label, value and hint as plain presentation by default (no button)', () => {
    render(<StatTile icon={BoxesIcon} label="On hand" value="42" hint="At current WAC" />);
    expect(screen.getByText('On hand')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('At current WAC')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('becomes a labelled drill-down button when onActivate is supplied', () => {
    const onActivate = vi.fn();
    render(<StatTile label="On order" value="7" onActivate={onActivate} />);
    const btn = screen.getByRole('button', { name: 'View On order' });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('keeps a long currency value inside its own tile (overflow-wrap, no nowrap)', () => {
    render(<StatTile label="Stock value" value="R 1 574 853,75" />);
    const value = screen.getByText('R 1 574 853,75');
    expect(value.className).toContain('[overflow-wrap:anywhere]');
    expect(value.className).not.toContain('truncate');
    expect(value.className).not.toContain('whitespace-nowrap');
  });
});

describe('StatStrip', () => {
  it('caps the widest layout at the requested column count', () => {
    const { container } = render(
      <StatStrip columns={8}>
        <StatTile label="a" value="1" />
      </StatStrip>,
    );
    expect(container.firstElementChild?.className).toContain('xl:grid-cols-8');
    // never forces eight columns on a phone
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
  });
});
