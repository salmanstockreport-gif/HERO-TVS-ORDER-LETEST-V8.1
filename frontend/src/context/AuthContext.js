import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("hmc_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        // /auth/me returns raw user doc which now includes role/systems/permissions
        setUser(r.data);
      })
      .catch(() => {
        localStorage.removeItem("hmc_token");
        localStorage.removeItem("hmc_user");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("hmc_token", data.access_token);
    localStorage.setItem("hmc_user", JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("hmc_token");
    localStorage.removeItem("hmc_user");
    localStorage.removeItem("hmc_system");
    setUser(null);
    window.location.href = "/login";
  };

  const isOwner = user?.role === "owner";
  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.role === "owner") return true;
    return !!(user.permissions && user.permissions[perm]);
  };
  const canAccessSystem = (sys) => {
    if (!user) return false;
    if (user.role === "owner") return true;
    return (user.systems || []).includes(sys);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isOwner,
        hasPermission,
        canAccessSystem,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
