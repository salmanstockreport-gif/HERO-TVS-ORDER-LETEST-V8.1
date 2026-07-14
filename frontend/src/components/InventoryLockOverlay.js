import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Warning, Clock, UploadSimple } from "@phosphor-icons/react";
import { IDS } from "@/lib/testIds";

/**
 * Full-screen lock overlay shown when inventory is stale (>24h) or was never
 * uploaded. Only route allowed is /inventory. Login is untouched (this is
 * rendered inside authenticated Layout only).
 */
export default function InventoryLockOverlay({ status }) {
  const location = useLocation();
  if (!status || status.fresh) return null;
  // Allow the user to reach the inventory page (to upload) even while locked
  if (location.pathname.startsWith("/inventory")) return null;

  const never = status.never_uploaded;
  const lastLine = status.last_uploaded_at
    ? new Date(status.last_uploaded_at).toLocaleString()
    : "—";

  return (
    <div
      data-testid={IDS.inventoryLockOverlay}
      className="lock-overlay"
    >
      <div className="lock-card">
        <div className="lock-icon">
          <Warning size={28} weight="fill" />
        </div>
        <div className="overline mt-4" style={{ color: "var(--hero-primary)" }}>
          System locked
        </div>
        <h2 className="font-display font-bold text-3xl mt-2">
          Daily inventory upload required
        </h2>
        <p className="text-sm mt-3" style={{ color: "var(--hero-muted)", lineHeight: 1.6 }}>
          {never ? (
            <>
              Your inventory Excel has <b>never been uploaded</b>. Upload a fresh
              stock file to unlock orders, catalogue search, and exports.
            </>
          ) : (
            <>
              Your inventory Excel has <b>expired</b>. Files are valid for{" "}
              {status.ttl_hours} hours from upload. Please upload a fresh stock
              file to continue.
            </>
          )}
        </p>

        <div className="lock-meta mt-6">
          <div>
            <div className="overline">Last uploaded</div>
            <div className="font-mono text-sm mt-1">{lastLine}</div>
          </div>
          <div>
            <div className="overline">TTL</div>
            <div className="font-mono text-sm mt-1">
              {status.ttl_hours} hours
            </div>
          </div>
          <div>
            <div className="overline">Status</div>
            <div
              className="font-mono text-sm mt-1"
              style={{ color: "var(--hero-primary)" }}
            >
              EXPIRED
            </div>
          </div>
        </div>

        <Link
          to="/inventory"
          className="btn btn-primary mt-8"
          data-testid={IDS.inventoryLockUploadBtn}
          style={{ padding: "12px 20px", fontSize: 13 }}
        >
          <UploadSimple size={16} weight="bold" />
          <span>Upload today's inventory</span>
        </Link>

        <div
          className="mt-6 text-xs flex items-center gap-2"
          style={{ color: "var(--hero-muted)" }}
        >
          <Clock size={12} />
          <span>All order-related actions are disabled until upload completes.</span>
        </div>
      </div>
    </div>
  );
}
