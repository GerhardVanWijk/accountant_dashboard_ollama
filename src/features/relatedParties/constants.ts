import type { RelatedPartyRelationshipType } from '@/types/relatedParty';

export const RELATIONSHIP_TYPE_LABELS: Record<RelatedPartyRelationshipType, string> = {
  director: 'Director',
  shareholder: 'Shareholder',
  subsidiary: 'Subsidiary',
  associate: 'Associate',
  key_management: 'Key Management',
  other_related_entity: 'Other Related Entity',
};
