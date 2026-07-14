import React from "react";
import { Link } from "react-router-dom";
import { Warning, CheckCircle, Clock } from "@phosphor-icons/react";
import { IDS } from "@/lib/testIds";

/**
 * Compact banner that shows inventory freshness at the top of every page.
 * Green when fresh, red when expired.
 */
export default function InventoryFreshnessBadge({ status }) {
  if (!status) return null;
  const fresh = status.fresh;
  const hours = Number(status.hours_remaining || 0);

  return (
    <div
      data-testid={IDS.inventoryFreshBadge}
      className={`inv-badge ${fresh ? "fresh" : "stale"}`}
    >
      {fresh ? (
        <CheckCircle size={13} weight="fill" />
      ) : (
        <Warning size={13} weight="fill" />
      )}
      <span className="inv-badge-label">
        {fresh
          ? `Inventory fresh · ${hours.toFixed(1)}h left`
          : status.never_uploaded
          ? "Inventory not uploaded"
          : "Inventory expired"}
      </span>
      {!fresh && (
        <Link to="/inventory" className="inv-badge-link">
          Upload now →
        </Link>
      )}
    </div>
  );
}

export function InventoryBanner({ status }) {
  if (!status || status.fresh) return null;
  return (
    <div
      data-testid={IDS.inventoryLockBanner}
      className="inv-banner"
    >
      <Warning size={16} weight="fill" />
      <div style={{ flex: 1 }}>
        <b>Inventory expired.</b> Upload today's stock file to unlock the system.
      </div>
      <Link to="/inventory" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11 }}>
        <Clock size={12} /> Upload
      </Link>
    </div>
  );
}
