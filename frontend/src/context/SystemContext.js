import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const SYSTEMS = {
  hero: {
    key: "hero",
    label: "Hero MotoCorp",
    subtitle: "Hero Parts Ordering",
    partsLabel: "Hero Parts",
    accent: "#E31837",
    accentDeep: "#B31229",
    searchEndpoint: "/hero/search",
    orderPrefix: "HMC-",
  },
  tvs: {
    key: "tvs",
    label: "TVS Motor",
    subtitle: "TVS Parts Ordering",
    partsLabel: "TVS Parts",
    accent: "#1E3A8A",
    accentDeep: "#122958",
    searchEndpoint: "/tvs/search",
    orderPrefix: "TVS-",
  },
};

const STORAGE_KEY = "hmc_system";

const SystemContext = createContext(null);

export function SystemProvider({ children }) {
  const { user } = useAuth();
  const [system, setSystemState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });

  // When user changes (login/logout), reconcile the stored system with what
  // the user actually has access to.
  useEffect(() => {
    if (!user) {
      // Keep the stored system so we don't lose the pick on refresh, but the
      // Layout gate will re-check availability.
      return;
    }
    const allowed = user.systems || [];
    if (system && allowed.includes(system)) return;
    // Auto-pick if only one available; else clear to force /select-system.
    if (allowed.length === 1) {
      setSystem(allowed[0]);
    } else if (allowed.length === 0) {
      setSystem("");
    }
    // Owners with both systems: keep empty so they choose.
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSystem = (s) => {
    if (!s) {
      localStorage.removeItem(STORAGE_KEY);
      setSystemState("");
      return;
    }
    localStorage.setItem(STORAGE_KEY, s);
    setSystemState(s);
  };

  const currentMeta = SYSTEMS[system] || null;

  return (
    <SystemContext.Provider
      value={{
        system,
        setSystem,
        meta: currentMeta,
        systems: SYSTEMS,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem must be used within SystemProvider");
  return ctx;
}

export function getStoredSystem() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export { SYSTEMS };
