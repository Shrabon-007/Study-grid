import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, getSession, saveSession } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getSession());
  const [loading, setLoading] = useState(Boolean(getSession()?.token));

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      return;
    }
    api("/auth/me")
      .then((payload) => {
        const user = payload.data?.user || {};
        const next = { ...session, userId: user._id || user.id || session.userId, role: user.role || session.role, name: user.name || session.name, email: user.email || session.email, profile: payload.data?.profile || session.profile };
        saveSession(next);
        setSession(next);
      })
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    session,
    loading,
    setSession: (next) => { saveSession(next); setSession(next); },
    logout: () => { clearSession(); setSession(null); },
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
