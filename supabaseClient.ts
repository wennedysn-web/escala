
import { createClient } from '@supabase/supabase-js';

// Utilizando as credenciais reais fornecidas pelo usuário
const supabaseUrl = 'https://zwgcmyotzjfwvhgqgcad.supabase.co';
const supabaseAnonKey = 'sb_publishable_FP5Ukh5MKYUGJkbV1s3_GQ_F8oBRvRK';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
