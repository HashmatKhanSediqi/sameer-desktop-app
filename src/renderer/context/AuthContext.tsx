import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface AuthContextValue {
  sessionId: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; errorCode: string }>;
  logout: () => Promise<void>;
  clearLocalSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setIsInitializing(false);
  }, []);

  const login = useCallback(async (loginUsername: string, loginPassword: string) => {
    const result = await window.api.auth.login({
      username: loginUsername,
      password: loginPassword,
    });

    if (!result.ok) {
      return { ok: false as const, errorCode: result.errorCode };
    }

    setSessionId(result.data.sessionId);
    setUsername(result.data.username);
    return { ok: true as const };
  }, []);

  const logout = useCallback(async () => {
    if (sessionId) {
      await window.api.auth.logout({ sessionId });
    }
    setSessionId(null);
    setUsername(null);
  }, [sessionId]);

  const clearLocalSession = useCallback(() => {
    setSessionId(null);
    setUsername(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      sessionId,
      username,
      isAuthenticated: sessionId !== null,
      isInitializing,
      login,
      logout,
      clearLocalSession,
    }),
    [sessionId, username, isInitializing, login, logout, clearLocalSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
