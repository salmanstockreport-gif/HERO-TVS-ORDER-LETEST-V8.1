import { useEffect, useState, useCallback } from "react";
import api, { onInventoryLock } from "@/lib/api";

/**
 * useInventoryStatus polls /inventory/status on mount and whenever a 423 is
 * received globally. Returns { status, refresh }.
 */
export default function useInventoryStatus() {
  const [status, setStatus] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/status");
      setStatus(data);
      return data;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const off = onInventoryLock((detail) => {
      // Backend already gives us the freshness payload
      setStatus({
        fresh: false,
        last_uploaded_at: detail.last_uploaded_at,
        expires_at: detail.expires_at,
        hours_remaining: detail.hours_remaining,
        ttl_hours: detail.ttl_hours,
        never_uploaded: !!detail.never_uploaded,
      });
    });
    const onUpdated = () => refresh();
    window.addEventListener("inventory:updated", onUpdated);
    // Periodic refresh every 60s to keep countdown accurate
    const t = setInterval(refresh, 60_000);
    return () => {
      off();
      window.removeEventListener("inventory:updated", onUpdated);
      clearInterval(t);
    };
  }, [refresh]);

  return { status, refresh };
}
