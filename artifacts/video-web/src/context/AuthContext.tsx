import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clearUser, loadUser, saveUser, type VidehUser } from "@/lib/auth";

type AuthContextValue = {
  user: VidehUser | null;
  setUser: (u: VidehUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<VidehUser | null>(() => loadUser());

  const setUser = useCallback((u: VidehUser | null) => {
    if (u) saveUser(u);
    else clearUser();
    setUserState(u);
  }, []);

  const logout = useCallback(() => setUser(null), [setUser]);

  const value = useMemo(() => ({ user, setUser, logout }), [user, setUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
