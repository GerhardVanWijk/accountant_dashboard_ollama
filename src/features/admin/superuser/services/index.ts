import { supabase } from '@/config/supabase';
import { SupabasePlatformAdminRepository } from '../repositories/SupabasePlatformAdminRepository';
import { PlatformAdminService } from './platformAdminService';

export { PlatformAdminService } from './platformAdminService';

export const platformAdminService = new PlatformAdminService(new SupabasePlatformAdminRepository(supabase));
