import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BoxesIcon } from 'lucide-react';
import { StatTile, StatStrip, StatTileGrid } from './stat-tile';

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

  it('a short word label wraps on whole words only — never letter-by-letter', () => {
    render(<StatTile label="Available" value="169" />);
    const label = screen.getByText('Available');
    // the letter-splitting culprit was [overflow-wrap:anywhere] on the label span
    expect(label.className).not.toContain('[overflow-wrap:anywhere]');
    expect(label.className).not.toContain('break-all');
  });

  describe('micro variant', () => {
    it('shows only the icon and figure on the tile; keeps the label + hint in the a11y tree', () => {
      const { container } = render(
        <StatTile variant="micro" icon={BoxesIcon} label="On hand" value="170" hint="Units in stock" />,
      );
      expect(screen.getByText('170')).toBeInTheDocument();
      // label + hint still present (screen readers, find-in-page) …
      expect(screen.getByText('On hand')).toHaveClass('sr-only');
      expect(screen.getByText('Units in stock')).toHaveClass('sr-only');
      // … and a tooltip trigger wraps the tile
      expect(container.querySelector('[data-slot="tooltip-trigger"]')).not.toBeNull();
    });

    it('stays a real drill-down button when onActivate is given', () => {
      const onActivate = vi.fn();
      render(<StatTile variant="micro" icon={BoxesIcon} label="On order" value="7" onActivate={onActivate} />);
      fireEvent.click(screen.getByRole('button', { name: 'View On order' }));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('a non-interactive micro tile is still focusable so the tooltip is reachable by keyboard', () => {
      render(<StatTile variant="micro" icon={BoxesIcon} label="WAC" value="R 783,08" />);
      const tile = screen.getByText('R 783,08').closest('[tabindex]');
      expect(tile).toHaveAttribute('tabindex', '0');
    });
  });

  it('size="compact" still maps to the compact variant (back-compat)', () => {
    render(<StatTile size="compact" icon={BoxesIcon} label="Committed" value="1" />);
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('StatTile trend', () => {
  it('renders a movement row against the previous period when trendPercent is given', () => {
    render(<StatTile label="Revenue" value="R 512 700,00" trendPercent={4.8} />);
    expect(screen.getByText('vs previous period')).toBeInTheDocument();
    expect(screen.getByText('+4.8%')).toBeInTheDocument();
  });

  it('omits the movement row when there is no trend', () => {
    render(<StatTile label="Revenue" value="R 512 700,00" />);
    expect(screen.queryByText('vs previous period')).not.toBeInTheDocument();
  });
});

describe('StatTileGrid', () => {
  it('renders one compact tile per metric and defaults the column cap to the metric count', () => {
    const { container } = render(
      <StatTileGrid
        metrics={[
          { label: 'Budget', value: 'R 100,00' },
          { label: 'Forecast', value: 'R 120,00' },
          { label: 'Actual', value: 'R 90,00' },
        ]}
      />,
    );
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('lg:grid-cols-3');
  });

  it('a metric can carry a drill-down handler', () => {
    const onActivate = vi.fn();
    render(<StatTileGrid metrics={[{ label: 'Overdue', value: 'R 5,00', onActivate }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Overdue' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

describe('StatStrip', () => {
  it('caps the widest layout at the requested column count', () => {
    const { container } = render(
      <StatStrip columns={8}>
        <StatTile label="a" value="1" />
      </StatStrip>,
    );
    // eight metrics only fan into a single row on a genuinely wide screen …
    expect(container.firstElementChild?.className).toContain('2xl:grid-cols-8');
    // … and never a labelled tile is crushed at the 1366px / `xl` breakpoint
    expect(container.firstElementChild?.className).toContain('lg:grid-cols-4');
    // never forces eight columns on a phone
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
  });
});
