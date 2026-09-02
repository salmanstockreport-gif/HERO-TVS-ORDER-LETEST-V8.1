import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, CheckCircle, Info } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";

export const receiptBadge = (status) => {
  if (status === "received")
    return <span className="badge badge-stock-ok">Received</span>;
  if (status === "partial")
    return <span className="badge badge-stock-low">Partial</span>;
  return <span className="badge badge-stock-none">Not received</span>;
};

/**
 * Review dialog shown when marking a SENT order as received. Rows are
 * pre-filled from the backend stock comparison; the user can override.
 */
export default function ReceiveOrderDialog({ order, onClose, onDone }) {
  const [check, setCheck] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/orders/${order.id}/receive-check`)
      .then((r) => {
        setCheck(r.data);
        setRows(
          (r.data.items || []).map((it) => ({
            ...it,
            received: it.received_qty > 0,
            received_qty: it.received_qty,
          })),
        );
      })
      .catch((e) => {
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
        onClose();
      });
  }, [order.id]);

  const setRow = (idx, patch) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const toggle = (idx, checked) =>
    setRow(idx, { received: checked, received_qty: checked ? rows[idx].qty : 0 });

  const setAll = (checked) =>
    setRows((prev) =>
      prev.map((r) => ({ ...r, received: checked, received_qty: checked ? r.qty : 0 })),
    );

  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/mark-received`, {
        items: rows.map((r) => ({
          part_no: r.part_no,
          received: r.received && Number(r.received_qty) > 0,
          received_qty: r.received ? Number(r.received_qty) : 0,
        })),
      });
      const pending = data.receipt?.pending_count || 0;
      toast.success(
        pending === 0
          ? "All items received"
          : `Receipt saved — ${pending} item${pending === 1 ? "" : "s"} still pending`,
      );
      onDone(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = rows.filter((r) => !r.received || Number(r.received_qty) < r.qty).length;

  return (
    <div
      data-testid="receive-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card p-6"
        style={{ maxWidth: 860, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="overline mb-1">Mark as received</div>
            <div className="font-mono text-base">{order.order_no}</div>
            <div className="text-xs mt-1" style={{ color: "var(--hero-muted)" }}>
              {check?.has_snapshot
                ? "Pre-filled by comparing current stock with stock at the time of sending."
                : "Pre-filled by checking whether current stock covers the ordered quantity."}{" "}
              Untick anything that hasn't arrived.
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose} data-testid="receive-dialog-close">
            <X size={16} />
          </button>
        </div>

        {check === null ? (
          <div className="text-sm" style={{ color: "var(--hero-muted)" }}>
            Checking stock…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2 text-xs">
              <button className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={() => setAll(true)} data-testid="receive-select-all">
                Mark all received
              </button>
              <button className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={() => setAll(false)} data-testid="receive-select-none">
                Mark none
              </button>
            </div>
            <div className="table-scroll" style={{ overflowY: "auto", flex: 1 }}>
              <table className="hero-table" data-testid="receive-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Part No.</th>
                    <th>Description</th>
                    <th className="num">Ordered</th>
                    <th className="num">Stock at sent</th>
                    <th className="num">Stock now</th>
                    <th className="num">Received qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.part_no} data-testid={`receive-row-${idx}`}>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={r.received}
                          onChange={(e) => toggle(idx, e.target.checked)}
                          data-testid={`receive-check-${idx}`}
                        />
                      </td>
                      <td className="font-mono">{r.part_no}</td>
                      <td className="text-xs">{r.description}</td>
                      <td className="num">{r.qty}</td>
                      <td className="num" style={{ color: "var(--hero-muted)" }}>
                        {r.stock_at_sent == null ? "—" : r.stock_at_sent}
                      </td>
                      <td className="num">{r.current_stock}</td>
                      <td className="num">
                        <input
                          className="field field-sm mono num"
                          type="number"
                          min="0"
                          max={r.qty}
                          disabled={!r.received}
                          value={r.received_qty}
                          onChange={(e) =>
                            setRow(idx, {
                              received_qty: Math.max(0, Math.min(r.qty, parseInt(e.target.value || "0", 10))),
                            })
                          }
                          style={{ width: 70, textAlign: "right" }}
                          data-testid={`receive-qty-${idx}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <div className="text-xs flex items-center gap-1" style={{ color: "var(--hero-muted)" }}>
                <Info size={12} />
                {pendingCount === 0
                  ? "Everything received."
                  : `${pendingCount} item${pendingCount === 1 ? "" : "s"} will be marked pending for reorder.`}
              </div>
              <button
                className="btn btn-primary"
                onClick={confirm}
                disabled={busy}
                data-testid="receive-confirm"
              >
                <CheckCircle size={14} weight="bold" />
                <span>{busy ? "Saving…" : "Confirm receipt"}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
