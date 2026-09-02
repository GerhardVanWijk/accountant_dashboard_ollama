import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

const OPTIONS: SearchableSelectOption[] = [
  { value: 'p1', label: 'Black Toner Cartridge', keywords: 'CON-001 toner', description: 'On hand: 165' },
  { value: 'p2', label: '2-Colour Printing Calculator', keywords: 'PRN-008 calculator', description: 'On hand: 12' },
  { value: 'p3', label: 'A4 Copy Paper (Box)', keywords: 'PPR-020 paper', description: 'On hand: 400' },
];

function Harness({ onChange }: { onChange?: (v: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <SearchableSelect
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      placeholder="Select a product"
      aria-label="Product"
    />
  );
}

afterEach(cleanup);

describe('SearchableSelect', () => {
  it('shows the placeholder until a value is chosen', () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('Select a product');
  });

  it('opens, filters by hidden keyword, and selects a row', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    const search = await screen.findByPlaceholderText('Search…');
    fireEvent.change(search, { target: { value: 'PRN-008' } });

    await waitFor(() => {
      expect(screen.getByText('2-Colour Printing Calculator')).toBeInTheDocument();
      expect(screen.queryByText('Black Toner Cartridge')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('2-Colour Printing Calculator'));
    expect(onChange).toHaveBeenCalledWith('p2');
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('2-Colour Printing Calculator');
  });

  it('renders an empty message when nothing matches', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.change(await screen.findByPlaceholderText('Search…'), { target: { value: 'zzzz' } });
    expect(await screen.findByText('No matches found.')).toBeInTheDocument();
  });
});
