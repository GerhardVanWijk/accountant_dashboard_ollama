import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WarehouseReference, WarehouseRoute, warehouseRefText } from './warehouse-reference';

afterEach(cleanup);

const main = { id: 'w1', code: 'WH-001', name: 'Main Distribution Centre - Montague Gardens' };
const jhb = { id: 'w2', code: 'WH-002', name: 'Johannesburg Satellite Branch - Midrand' };

describe('warehouseRefText', () => {
  it('prefers the code, falls back to the name, never a raw UUID', () => {
    expect(warehouseRefText(main)).toBe('WH-001');
    expect(warehouseRefText({ name: 'Legacy WH' })).toBe('Legacy WH');
    expect(warehouseRefText({ code: 'ef0e5f2a-1111-4b2c-8d3e-000000000000', name: 'Real Name' })).toBe('Real Name');
    expect(warehouseRefText(undefined)).toBe('—');
    expect(warehouseRefText(undefined, 'n/a')).toBe('n/a');
  });
});

describe('WarehouseReference', () => {
  it('compact: shows the code, keeps the full name in the accessible name + a tooltip trigger', () => {
    const { container } = render(<WarehouseReference warehouse={main} />);
    expect(screen.getByText('WH-001')).toBeInTheDocument();
    expect(screen.queryByText(main.name)).not.toBeInTheDocument(); // name only in the (closed) tooltip
    const trigger = container.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-label', `WH-001 — ${main.name}`);
  });

  it('compact: resolves by id from a warehouses list', () => {
    render(<WarehouseReference id="w2" warehouses={[main, jhb]} />);
    expect(screen.getByText('WH-002')).toBeInTheDocument();
  });

  it('name variant: shows the full descriptive name and no tooltip', () => {
    const { container } = render(<WarehouseReference warehouse={main} variant="name" />);
    expect(screen.getByText(main.name)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
  });

  it('falls back to the name when the warehouse has no code (never a UUID)', () => {
    render(<WarehouseReference warehouse={{ id: 'w9', name: 'Uncoded Depot' }} />);
    expect(screen.getByText('Uncoded Depot')).toBeInTheDocument();
    expect(screen.queryByText('w9')).not.toBeInTheDocument();
  });

  it('shows the plain fallback, not a UUID, when nothing resolves', () => {
    render(<WarehouseReference id="deadbeef-dead-4bee-8dead-deadbeefdead" warehouses={[main]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('WarehouseRoute', () => {
  it('renders CODE → CODE with both full names in the accessible label', () => {
    const { container } = render(<WarehouseRoute from={main} to={jhb} />);
    expect(screen.getByText('WH-001')).toBeInTheDocument();
    expect(screen.getByText('WH-002')).toBeInTheDocument();
    expect(screen.queryByText(main.name)).not.toBeInTheDocument();

    const trigger = container.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-label')).toContain('WH-001');
    expect(trigger?.getAttribute('aria-label')).toContain(main.name);
    expect(trigger?.getAttribute('aria-label')).toContain(jhb.name);
  });

  it('resolves both ends by id', () => {
    render(<WarehouseRoute fromId="w1" toId="w2" warehouses={[main, jhb]} />);
    expect(screen.getByText('WH-001')).toBeInTheDocument();
    expect(screen.getByText('WH-002')).toBeInTheDocument();
  });
});
