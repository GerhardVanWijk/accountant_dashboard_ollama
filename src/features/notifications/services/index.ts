import { supabase } from '@/config/supabase';
import { SupabaseNotificationRepository } from '../repositories/SupabaseNotificationRepository';
import { NotificationService } from './notificationService';

export { NotificationService } from './notificationService';

export const notificationService = new NotificationService(
  new SupabaseNotificationRepository(supabase),
);
