import React, { useEffect, useState } from "react";

/**
 * Type-to-confirm delete dialog.
 * User must type exactly "delete" (case-insensitive) to enable the Delete button.
 *
 * Props:
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   orderNo: string          // shown in the message
 *   onConfirm: () => Promise<void> | void
 *   testIdPrefix?: string    // for data-testids, defaults to "confirm-delete"
 */
export default function ConfirmDeleteDialog({
  open,
  onOpenChange,
  orderNo,
  onConfirm,
  testIdPrefix = "confirm-delete",
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const isMatch = typed.trim().toLowerCase() === "delete";

  const handleConfirm = async () => {
    if (!isMatch || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div
      data-testid={`${testIdPrefix}-overlay`}
      onClick={() => !busy && onOpenChange(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        data-testid={`${testIdPrefix}-dialog`}
        onClick={stop}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-title`}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--hero-surface)",
          border: "1px solid var(--hero-border)",
          borderRadius: 12,
          padding: 24,
          color: "var(--hero-text)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="overline"
          style={{ color: "#f87171", marginBottom: 10 }}
        >
          Permanent action
        </div>
        <h2
          id={`${testIdPrefix}-title`}
          className="font-display font-bold"
          style={{ fontSize: 22, lineHeight: 1.25, marginBottom: 10 }}
        >
          Delete order {orderNo}?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--hero-muted)",
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          This cannot be undone. To confirm, type{" "}
          <span
            className="font-mono"
            style={{ color: "var(--hero-text)", fontWeight: 600 }}
          >
            delete
          </span>{" "}
          below.
        </p>

        <input
          data-testid={`${testIdPrefix}-input`}
          autoFocus
          className="field mono"
          placeholder='Type "delete" to confirm'
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onOpenChange(false);
          }}
          disabled={busy}
          style={{ marginBottom: 18 }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            data-testid={`${testIdPrefix}-cancel-btn`}
            className="btn btn-ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            data-testid={`${testIdPrefix}-confirm-btn`}
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={!isMatch || busy}
            style={{
              opacity: !isMatch || busy ? 0.5 : 1,
              cursor: !isMatch || busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Deleting…" : "Delete order"}
          </button>
        </div>
      </div>
    </div>
  );
}
