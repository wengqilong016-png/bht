const SUPABASE_URL = 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_FULL_ANON_KEY'; // replace with actual key

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with env fallback
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'bht-driver-auth' } });

const checkOnline = async () => {
    // your existing online check implementation
};

module.exports = { supabase, checkOnline };