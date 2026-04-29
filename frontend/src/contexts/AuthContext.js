import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, setTokens, clearTokens, getAccessToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    // Only try to fetch user if we have a token
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authAPI.me();
      setUser(res.data);
    } catch {
      setUser(null);
      clearTokens();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    const data = res.data;
    // Store tokens from response body
    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token);
    }
    setUser({ id: data.id, email: data.email, name: data.name, role: data.role });
    return data;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    const resData = res.data;
    // Store tokens from response body
    if (resData.access_token) {
      setTokens(resData.access_token, resData.refresh_token);
    }
    setUser({ id: resData.id, email: resData.email, name: resData.name, role: resData.role });
    return resData;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // ignore
    }
    clearTokens();
    setUser(null);
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return roles.includes(user.role);
  };

  const value = { user, loading, login, register, logout, hasRole, fetchUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-sans">Loading ecosystem data...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  if (roles && !roles.includes(user.role) && user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-heading font-semibold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground mt-2">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
