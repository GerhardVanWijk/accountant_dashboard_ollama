import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { Button } from '@/components/ui/shadcn/button';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormShell } from './FormShell';
import { FormHeader } from './FormHeader';
import { FormBody, FormLoading } from './FormBody';
import { FormFooter } from './FormFooter';
import { FormTabs, type FormTab } from './FormTabs';

function shell() {
  return document.querySelector('[data-slot="form-shell"]') as HTMLElement | null;
}

const TABS: FormTab[] = [
  { value: 'general', label: 'General', content: <div>general-panel</div> },
  {
    value: 'financial',
    label: 'Financial',
    content: (
      <div>
        financial-panel
        {Array.from({ length: 40 }).map((_, i) => (
          <p key={i}>row {i}</p>
        ))}
      </div>
    ),
  },
];

function TabbedForm(props: Partial<React.ComponentProps<typeof FormShell>>) {
  const [tab, setTab] = useState('general');
  return (
    <FormShell open onClose={vi.fn()} size="md" mode="edit" {...props}>
      <FormHeader title="Edit customer" recordRef="CUS-0142" />
      <FormTabs tabs={TABS} value={tab} onValueChange={setTab} />
      <FormFooter>
        <Button variant="outline" type="button">
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </FormFooter>
    </FormShell>
  );
}

describe('FormShell — sizing (P3B.1 / P3I #1-#4, #7)', () => {
  it('applies the width + height class for its size token', () => {
    render(
      <FormShell open onClose={vi.fn()} size="lg">
        <FormHeader title="Invoice" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    const el = shell()!;
    expect(el.className).toContain('sm:max-w-[72rem]'); // lg width — shared business-document width (Part E)
    expect(el.className).toContain('md:h-[min(calc(100dvh-2rem),52rem)]'); // lg fixed height
  });

  it.each(['sm', 'md', 'lg', 'xl'] as const)('size "%s" is viewport-capped on mobile', (size) => {
    render(
      <FormShell open onClose={vi.fn()} size={size}>
        <FormHeader title="x" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    expect(shell()!.className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('height="natural" drops the fixed-height frame', () => {
    render(
      <FormShell open onClose={vi.fn()} size="md" height="natural">
        <FormHeader title="x" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    const el = shell()!;
    expect(el.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(el.className).not.toContain('md:h-[min(');
  });

  it('does not change width or height when the tab changes (STABLE FORM SIZE)', () => {
    render(<TabbedForm />);
    const before = shell()!.className;

    fireEvent.click(screen.getByRole('tab', { name: 'Financial' }));

    expect(shell()!.className).toBe(before);
    // base-ui sets its own --nested-dialogs var; assert no width/height style crept in
    expect(shell()!.style.width).toBe('');
    expect(shell()!.style.height).toBe('');
    expect(shell()!.style.maxHeight).toBe('');
  });

  it('scrolls the body internally, not the shell', () => {
    render(<TabbedForm />);
    // active tab panel is the scroll region
    const panel = document.querySelector('[data-slot="form-tabs"] [role="tabpanel"]') as HTMLElement;
    expect(panel.className).toContain('overflow-y-auto');
    expect(panel.className).toContain('min-h-0');
    // the shell itself clips, it never scrolls
    expect(shell()!.className).toContain('overflow-hidden');
  });

  it('FormBody is the single scroll region for a non-tabbed form', () => {
    render(
      <FormShell open onClose={vi.fn()}>
        <FormHeader title="x" />
        <FormBody>body</FormBody>
        <FormFooter>
          <Button type="submit">Save</Button>
        </FormFooter>
      </FormShell>,
    );
    const body = document.querySelector('[data-slot="form-body"]') as HTMLElement;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('min-h-0');
  });
});

describe('FormShell — footer + loading preserve the shell (P3I #5, #6)', () => {
  it('keeps the footer mounted across a tab change', () => {
    render(<TabbedForm />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Financial' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('a loading body does not collapse the shell', () => {
    render(
      <FormShell open onClose={vi.fn()} size="md">
        <FormHeader title="Loading customer" />
        <FormBody>
          <FormLoading label="Loading customer…" />
        </FormBody>
        <FormFooter>
          <Button type="submit">Save</Button>
        </FormFooter>
      </FormShell>,
    );
    expect(shell()!.className).toContain('md:h-[min(calc(100dvh-2rem),44rem)]');
    expect(screen.getByText('Loading customer…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('FormShell — unsaved-changes guard (P3C / P3I #8-#11, #17)', () => {
  it('a dirty CREATE form prompts before closing', () => {
    const onClose = vi.fn();
    render(
      <FormShell open onClose={onClose} mode="create" isDirty>
        <FormHeader title="New customer" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a dirty EDIT form prompts before closing', () => {
    const onClose = vi.fn();
    render(
      <FormShell open onClose={onClose} mode="edit" isDirty>
        <FormHeader title="Edit customer" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('confirming the discard prompt closes; keeping editing does not', () => {
    const onClose = vi.fn();
    render(
      <FormShell open onClose={onClose} mode="edit" isDirty>
        <FormHeader title="Edit customer" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a CLEAN form closes with no prompt', () => {
    const onClose = vi.fn();
    render(
      <FormShell open onClose={onClose} mode="edit" isDirty={false}>
        <FormHeader title="Edit customer" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a DETAIL surface never prompts, even when isDirty is (wrongly) set', () => {
    const onClose = vi.fn();
    render(
      <FormShell open onClose={onClose} mode="detail" isDirty>
        <FormHeader title="Journal JE-0171" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a DETAIL surface does not render a <form> and never submits (posted record stays non-editable)', () => {
    const onSubmit = vi.fn();
    render(
      <FormShell open onClose={vi.fn()} mode="detail" onSubmit={onSubmit}>
        <FormHeader title="Journal JE-0171" />
        <FormBody>body</FormBody>
        <FormFooter>
          <Button type="submit">Save</Button>
        </FormFooter>
      </FormShell>,
    );
    expect(shell()!.querySelector('form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('an EDIT form wraps its content in a <form> and submits', () => {
    const onSubmit = vi.fn();
    render(
      <FormShell open onClose={vi.fn()} mode="edit" onSubmit={onSubmit}>
        <FormHeader title="Edit" />
        <FormBody>body</FormBody>
        <FormFooter>
          <Button type="submit">Save</Button>
        </FormFooter>
      </FormShell>,
    );
    expect(shell()!.querySelector('form')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('FormTabs — active tab styling + select readability (P3I #12, #13)', () => {
  it('marks the active tab selected and uses the brand line treatment', () => {
    render(<TabbedForm />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-variant', 'line');

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Financial' }));
    expect(screen.getByRole('tab', { name: 'Financial' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders a native select inside the body untouched (dark-mode option rule is global)', () => {
    render(
      <FormShell open onClose={vi.fn()}>
        <FormHeader title="x" />
        <FormBody>
          <NativeSelect aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </NativeSelect>
        </FormBody>
      </FormShell>,
    );
    const select = screen.getByLabelText('Status');
    expect(select).toHaveAttribute('data-slot', 'native-select');
    expect(within(select).getByText('Active')).toBeInTheDocument();
  });
});

describe('FormShell — closed', () => {
  it('renders nothing when open is false', () => {
    render(
      <FormShell open={false} onClose={vi.fn()}>
        <FormHeader title="x" />
        <FormBody>body</FormBody>
      </FormShell>,
    );
    expect(shell()).toBeNull();
  });
});
