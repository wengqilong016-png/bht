import { useEffect, useReducer } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import {
  fetchCurrentUserProfile,
  restoreCurrentUserFromSession,
  signOutCurrentUser,
} from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthState = {
  currentUser: User | null;
  userRole: 'admin' | 'driver' | null;
  lang: 'zh' | 'sw';
  isInitializing: boolean;
};

type AuthAction =
  | { type: 'SET_USER'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_LANG'; lang: 'zh' | 'sw' }
  | { type: 'FINISH_INITIALIZING' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.user,
        userRole: action.user.role as 'admin' | 'driver',
        lang: action.user.role === 'admin' ? 'zh' : 'sw',
        isInitializing: false,
      };
    case 'LOGOUT':
      return { ...state, currentUser: null, userRole: null, isInitializing: false };
    case 'SET_LANG':
      return { ...state, lang: action.lang };
    case 'FINISH_INITIALIZING':
      return { ...state, isInitializing: false };
    default:
      return state;
  }
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

const AUTH_INIT_TIMEOUT_MS = 20000;

export function useAuthBootstrap() {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'zh',
    isInitializing: true,
  });

  useEffect(() => {
    if (!supabase) {
      dispatch({ type: 'FINISH_INITIALIZING' });
      return;
    }

    const loadUser = async () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<{ success: false; error: 'Timeout' }>(
        (resolve) => {
          timeoutId = setTimeout(() => resolve({ success: false, error: 'Timeout' }), AUTH_INIT_TIMEOUT_MS);
        }
      );
      const result = await Promise.race([restoreCurrentUserFromSession(), timeout]);
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (!result.success) {
        const err = (result as { error: string }).error;
        if (err !== 'No active session' && err !== 'Timeout') {
          await signOutCurrentUser();
        }
        dispatch({ type: 'FINISH_INITIALIZING' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'USER_UPDATED' || _event === 'INITIAL_SESSION') return;

      try {
        if (!session?.user) {
          dispatch({ type: 'LOGOUT' });
          return;
        }
        const result = await fetchCurrentUserProfile(session.user.id, session.user.email || '');
        if (!result.success) {
          await signOutCurrentUser();
          dispatch({ type: 'LOGOUT' });
          return;
        }
        dispatch({ type: 'SET_USER', user: result.user });
      } catch (err) {
        console.error('[Auth] onAuthStateChange error:', err);
        dispatch({ type: 'LOGOUT' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (user: User) => dispatch({ type: 'SET_USER', user });

  const handleLogout = async () => {
    await signOutCurrentUser();
    dispatch({ type: 'LOGOUT' });
  };

  const setLang = (lang: 'zh' | 'sw') => dispatch({ type: 'SET_LANG', lang });

  return { ...state, handleLogin, handleLogout, setLang };
}
