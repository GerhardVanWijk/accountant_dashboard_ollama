import { supabase } from '@/config/supabase';

import { SupabaseSubscriptionRepository } from '../repositories/SupabaseSubscriptionRepository';
import { SubscriptionService } from './subscriptionService';

export { SubscriptionService } from './subscriptionService';

export const subscriptionService = new SubscriptionService(new SupabaseSubscriptionRepository(supabase));
