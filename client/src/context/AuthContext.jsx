import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import authApi from '../api/authApi';
import { toApiError } from '../api/axiosClient';
import { setAccessToken, clearAccessToken, setRememberedIdentifier } from '../utils/storage';
import { applyThemeToDom, THEME_STORAGE_KEY, THEME_CUSTOM_STORAGE_KEY } from './ThemeContext';

export const AuthContext = createContext(null);

/**
 * Holds the signed-in user for the whole app. On mount it tries a silent
 * refresh, so a page reload keeps the session without re-entering credentials.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await authApi.refresh();
        if (cancelled) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
        if (session.user?.theme) {
          const t = session.user.theme;
          applyThemeToDom(t.themeId, t.isCustom ? t.colors : null);
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, t.themeId);
            if (t.isCustom && t.colors) {
              window.localStorage.setItem(THEME_CUSTOM_STORAGE_KEY, JSON.stringify(t.colors));
            }
          } catch {}
        }
      } catch {
        if (!cancelled) clearAccessToken();
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async ({ identifier, password, remember }) => {
    try {
      const session = await authApi.login({ identifier, password, remember });
      setAccessToken(session.accessToken);
      setUser(session.user);
      setRememberedIdentifier(remember ? identifier : '');
      if (session.user?.theme) {
        const t = session.user.theme;
        applyThemeToDom(t.themeId, t.isCustom ? t.colors : null);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, t.themeId);
          if (t.isCustom && t.colors) {
            window.localStorage.setItem(THEME_CUSTOM_STORAGE_KEY, JSON.stringify(t.colors));
          }
        } catch {}
      }
      return { ok: true, user: session.user };
    } catch (error) {
      return { ok: false, error: toApiError(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, isAuthenticated: Boolean(user), isBootstrapping, login, logout }),
    [user, isBootstrapping, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
