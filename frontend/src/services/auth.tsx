// Email/password session: token in secure storage, Bearer header on API calls.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiRequest, ApiError } from "@/src/services/apiClient";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export interface AuthUser {
  user_id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const [savedToken, cachedUserRaw] = await Promise.all([
        storage.secureGet(TOKEN_KEY, ""),
        storage.getItem(USER_KEY, ""),
      ]);

      let initialUser: AuthUser | null = null;
      if (cachedUserRaw) {
        try {
          initialUser = JSON.parse(cachedUserRaw) as AuthUser;
        } catch {
          initialUser = null;
        }
      }

      if (savedToken && initialUser) {
        // Optimistic hydration: render main interface immediately without blocking on network
        if (isMounted) {
          setToken(savedToken);
          setUser(initialUser);
          setLoading(false);
        }

        // Validate token in the background with timeout
        try {
          const verified = await apiRequest<AuthUser>("/api/auth/me", {
            token: savedToken,
            timeoutMs: 8000,
          });
          if (isMounted) {
            setUser(verified);
            await storage.setItem(USER_KEY, JSON.stringify(verified));
          }
        } catch (error) {
          // Drop the session ONLY when the server explicitly rejects the token (401)
          if (error instanceof ApiError && error.isAuthError) {
            if (isMounted) {
              setToken(null);
              setUser(null);
            }
            await storage.secureRemove(TOKEN_KEY);
            await storage.removeItem(USER_KEY);
          }
          // Network errors, timeouts, or 5xx preserve offline access
        }
      } else if (savedToken) {
        // Token exists but no cached user metadata: must fetch /me
        try {
          const fetched = await apiRequest<AuthUser>("/api/auth/me", {
            token: savedToken,
            timeoutMs: 8000,
          });
          if (isMounted) {
            setToken(savedToken);
            setUser(fetched);
            await storage.setItem(USER_KEY, JSON.stringify(fetched));
          }
        } catch (error) {
          if (error instanceof ApiError && error.isAuthError) {
            await storage.secureRemove(TOKEN_KEY);
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      } else {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const startSession = useCallback(async (res: { access_token: string; user: AuthUser }) => {
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await storage.setItem(USER_KEY, JSON.stringify(res.user));
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const res = await apiRequest<{ access_token: string; user: AuthUser }>("/api/auth/login", {
          method: "POST",
          body: { email: email.trim().toLowerCase(), password },
        });
        await startSession(res);
      },
      register: async (email, password) => {
        const res = await apiRequest<{ access_token: string; user: AuthUser }>("/api/auth/register", {
          method: "POST",
          body: { email: email.trim().toLowerCase(), password },
        });
        await startSession(res);
      },
      logout: async () => {
        try {
          if (token) {
            await apiRequest<{ ok: boolean }>("/api/auth/logout", {
              method: "POST",
              token,
              timeoutMs: 4000,
            });
          }
        } catch {
          // Local sign-out still happens even if offline or server is down
        }
        await storage.secureRemove(TOKEN_KEY);
        await storage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      },
      forgotPassword: async (email) => {
        const res = await apiRequest<{ message: string }>("/api/auth/forgot-password", {
          method: "POST",
          body: { email: email.trim().toLowerCase() },
        });
        return res.message;
      },
      resetPassword: async (email, code, newPassword) => {
        const res = await apiRequest<{ message: string }>("/api/auth/reset-password", {
          method: "POST",
          body: {
            email: email.trim().toLowerCase(),
            code: code.trim(),
            new_password: newPassword,
          },
        });
        return res.message;
      },
    }),
    [user, loading, token, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
