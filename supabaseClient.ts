// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Get config from environment variables
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabaseConfig ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const checkDbHealth = async () => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('drivers').select('id').limit(1);
    return !error;
  } catch (err) {
    return false;
  }
};

export default supabase;