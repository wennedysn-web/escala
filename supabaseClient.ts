
import { createClient } from '@supabase/supabase-js';

// Fallback to placeholder strings to prevent the library from crashing on load if env vars are missing.
// The app logic should check if these are real before making requests.
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured = 
  process.env.SUPABASE_URL && 
  process.env.SUPABASE_ANON_KEY && 
  process.env.SUPABASE_URL !== '' && 
  !process.env.SUPABASE_URL.includes('placeholder');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
