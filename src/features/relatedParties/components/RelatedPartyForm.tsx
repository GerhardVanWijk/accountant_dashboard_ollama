import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RelatedParty } from '@/types/relatedParty';
import { Button } from '@/components/ui/Button';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';
import { fieldError, fieldInput, fieldLabel } from './formStyles';
import type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from '../services';

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
 * zod), mirroring src/features/assets/components/AssetForm.tsx's shape.
 */
export function RelatedPartyForm({ relatedParty, onSubmit, onCancel }: RelatedPartyFormProps) {
  const {
    register,
    handleSubmit,
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
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div>
        <label className={fieldLabel} htmlFor="name">
          Name
        </label>
        <input id="name" className={fieldInput} {...register('name')} />
        {errors.name && <p className={fieldError}>{errors.name.message}</p>}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="relationshipType">
          Relationship Type
        </label>
        <select id="relationshipType" className={fieldInput} {...register('relationshipType')}>
          {Object.entries(RELATIONSHIP_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="relationshipDetail">
          Relationship Detail
        </label>
        <textarea
          id="relationshipDetail"
          rows={3}
          className={fieldInput}
          placeholder='e.g. "Holds 30% of issued shares", "CFO", "Wholly-owned subsidiary incorporated in..."'
          {...register('relationshipDetail')}
        />
      </div>

      <div className="flex items-center gap-sm">
        <input id="isActive" type="checkbox" className="h-4 w-4 rounded border-border" {...register('isActive')} />
        <label className="text-sm text-text-primary" htmlFor="isActive">
          Active
        </label>
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {relatedParty ? 'Save Changes' : 'Add Related Party'}
        </Button>
      </div>
    </form>
  );
}
