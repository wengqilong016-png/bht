// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Get config from environment variables with hardcoded fallbacks.
// NOTE: Development environments are allowed to use the fallback values below.
// In a future phase, this should be replaced with a stricter configuration
// source (e.g. a config panel or .env validation) to avoid accidental
// production use of development credentials.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

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