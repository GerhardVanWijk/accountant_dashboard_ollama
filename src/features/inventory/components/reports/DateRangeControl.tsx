import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect } from '@/components/app/combobox';
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from '../../reports/dateRange';

const DATE_RANGE_PRESET_OPTIONS = (Object.keys(DATE_RANGE_PRESET_LABELS) as DateRangePreset[]).map((p) => ({
  value: p,
  label: DATE_RANGE_PRESET_LABELS[p],
}));

interface DateRangeControlProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  /** Only read/editable while `preset === 'custom'` — otherwise these reflect the resolved preset range, read-only. */
  start: string;
  end: string;
  onCustomChange: (range: { start: string; end: string }) => void;
  idPrefix: string;
}

/**
 * One consistent date-range control (spec §18/§19) — a preset dropdown
 * (`resolveDateRangePreset` owns what each preset actually resolves to) plus
 * two date inputs that become editable only for `'custom'`; for every other
 * preset they show the resolved range read-only so the report's active
 * period is always visible on screen, not just implied by the dropdown
 * label.
 */
export function DateRangeControl({ preset, onPresetChange, start, end, onCustomChange, idPrefix }: DateRangeControlProps) {
  const isCustom = preset === 'custom';
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-40">
        <FieldLabel htmlFor={`${idPrefix}-preset`}>Date range</FieldLabel>
        <EnumSelect
          id={`${idPrefix}-preset`}
          value={preset}
          onValueChange={(v) => onPresetChange(v as DateRangePreset)}
          options={DATE_RANGE_PRESET_OPTIONS}
        />
      </Field>
      <Field className="w-36">
        <FieldLabel htmlFor={`${idPrefix}-start`}>From</FieldLabel>
        <Input
          id={`${idPrefix}-start`}
          type="date"
          value={start}
          disabled={!isCustom}
          onChange={(e) => onCustomChange({ start: e.target.value, end })}
        />
      </Field>
      <Field className="w-36">
        <FieldLabel htmlFor={`${idPrefix}-end`}>To</FieldLabel>
        <Input
          id={`${idPrefix}-end`}
          type="date"
          value={end}
          disabled={!isCustom}
          onChange={(e) => onCustomChange({ start, end: e.target.value })}
        />
      </Field>
    </div>
  );
}
