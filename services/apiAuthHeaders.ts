import { supabase } from '../supabaseClient';

export async function buildAuthenticatedJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // The API will reject unauthenticated requests; callers keep their normal
    // error handling path.
  }

  return headers;
}
