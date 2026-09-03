import { fireEvent, screen, within } from '@testing-library/react';

/**
 * Pick an option from a Vertex `EnumSelect` (base-ui `Select`) in jsdom.
 *
 * The base-ui Select trigger is a `<button role="combobox">`, not a native
 * `<select>` — `userEvent.selectOptions` / `fireEvent.change` do nothing.
 * Its listbox opens on click and each option needs
 * `pointerdown` + `pointerup` + `click` to commit the selection in jsdom.
 *
 * @param trigger  the trigger element, or an accessible-name matcher to
 *                 look it up by (`getByLabelText` then `getByRole`).
 * @param optionName  the visible option label (string or RegExp).
 */
export function selectEnumOption(
  trigger: HTMLElement | string | RegExp,
  optionName: string | RegExp,
): void {
  const triggerEl =
    typeof trigger === 'string' || trigger instanceof RegExp
      ? (screen.queryByLabelText(trigger) ?? screen.getByRole('combobox', { name: trigger }))
      : trigger;

  fireEvent.click(triggerEl);
  const option = screen.getByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

/**
 * Pick an option from a Vertex `SearchableSelect` / `*Combobox` (base-ui
 * `Combobox`) in jsdom. Unlike `Select`, a single `click` on the option
 * commits it. The list renders on trigger click.
 */
export function selectSearchableOption(
  trigger: HTMLElement | string | RegExp,
  optionName: string | RegExp,
): void {
  const triggerEl =
    typeof trigger === 'string' || trigger instanceof RegExp
      ? (screen.queryByLabelText(trigger) ?? screen.getByRole('combobox', { name: trigger }))
      : trigger;

  fireEvent.click(triggerEl);
  const rows = screen.getAllByRole('option');
  const target = rows.find((r) =>
    typeof optionName === 'string'
      ? r.textContent?.includes(optionName)
      : optionName.test(r.textContent ?? ''),
  );
  if (!target) throw new Error(`No option row matching ${String(optionName)}`);
  fireEvent.click(target);
}

/** Same, but scoped to a container (e.g. a dialog). */
export function selectEnumOptionWithin(
  container: HTMLElement,
  trigger: HTMLElement | string | RegExp,
  optionName: string | RegExp,
): void {
  const triggerEl =
    typeof trigger === 'string' || trigger instanceof RegExp
      ? (within(container).queryByLabelText(trigger) ??
        within(container).getByRole('combobox', { name: trigger }))
      : trigger;

  fireEvent.click(triggerEl);
  const option = screen.getByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}
