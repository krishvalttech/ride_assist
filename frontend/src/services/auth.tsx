// Email/password session: token in secure storage, Bearer header on API calls.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/auth`;

export interface AuthUser {
  user_id: string;
  email: string;
}

async function call<T>(path: string, body?: object, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No internet connection — try again");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : "Something went wrong — try again");
  }
  return data as T;
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
    void (async () => {
      const saved = await storage.secureGet(TOKEN_KEY, "");
      if (saved) {
        try {
          setUser(await call<AuthUser>("/me", undefined, saved));
          setToken(saved);
        } catch (error) {
          // Keep the session when offline; drop it only when the server rejects it.
          if (error instanceof Error && error.message.startsWith("No internet")) {
            const cached = await storage.getItem(USER_KEY, "");
            if (cached) {
              setToken(saved);
              setUser(JSON.parse(cached) as AuthUser);
            }
          } else await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
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
      login: async (email, password) =>
        startSession(await call("/login", { email: email.trim().toLowerCase(), password })),
      register: async (email, password) =>
        startSession(await call("/register", { email: email.trim().toLowerCase(), password })),
      logout: async () => {
        try {
          if (token) await call("/logout", {}, token);
        } catch {
          // Local sign-out still happens.
        }
        await storage.secureRemove(TOKEN_KEY);
        await storage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      },
      forgotPassword: async (email) =>
        (await call<{ message: string }>("/forgot-password", { email: email.trim().toLowerCase() })).message,
      resetPassword: async (email, code, newPassword) =>
        (
          await call<{ message: string }>("/reset-password", {
            email: email.trim().toLowerCase(),
            code: code.trim(),
            new_password: newPassword,
          })
        ).message,
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
