import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RelatedParty } from '@/types/relatedParty';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';
import type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from '../services';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const relatedPartySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  relationshipType: z.enum(['director', 'shareholder', 'subsidiary', 'associate', 'key_management', 'other_related_entity']),
  relationshipDetail: z.string().trim().optional(),
  isActive: z.boolean(),
});

export type RelatedPartyFormValues = z.infer<typeof relatedPartySchema>;

export interface RelatedPartyFormProps {
  relatedParty?: RelatedParty;
  onSubmit: (data: CreateRelatedPartyDTO | UpdateRelatedPartyDTO) => Promise<void>;
  onCancel: () => void;
}

function toDefaultValues(relatedParty?: RelatedParty): RelatedPartyFormValues {
  return {
    name: relatedParty?.name ?? '',
    relationshipType: relatedParty?.relationshipType ?? 'director',
    relationshipDetail: relatedParty?.relationshipDetail ?? '',
    isActive: relatedParty?.isActive ?? true,
  };
}

/**
 * Create/edit form for the Related Party Register (react-hook-form +
 * zod), mirroring AssetForm.tsx's shape. Re-skinned onto v0's
 * Field/Input/Textarea/Checkbox (M13); validation and submit wiring
 * unchanged.
 */
export function RelatedPartyForm({ relatedParty, onSubmit, onCancel }: RelatedPartyFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RelatedPartyFormValues>({
    resolver: zodResolver(relatedPartySchema),
    defaultValues: toDefaultValues(relatedParty),
  });

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      name: data.name,
      relationshipType: data.relationshipType,
      relationshipDetail: data.relationshipDetail || undefined,
      isActive: data.isActive,
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input id="name" {...register('name')} />
        <FieldError errors={[errors.name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="relationshipType">Relationship Type</FieldLabel>
        <select id="relationshipType" className={selectClassName} {...register('relationshipType')}>
          {Object.entries(RELATIONSHIP_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field>
        <FieldLabel htmlFor="relationshipDetail">Relationship Detail</FieldLabel>
        <Textarea id="relationshipDetail" rows={3} placeholder='e.g. "Holds 30% of issued shares", "CFO", "Wholly-owned subsidiary incorporated in..."' {...register('relationshipDetail')} />
      </Field>

      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox id="isActive" checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
            <FieldLabel htmlFor="isActive">Active</FieldLabel>
          </Field>
        )}
      />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {relatedParty ? 'Save Changes' : 'Add Related Party'}
        </Button>
      </div>
    </form>
  );
}
