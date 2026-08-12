import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";

/**
 * Reusable dialog to add a single part to a CURRENT (draft) order of the
 * user's choice, or to create a brand-new order containing it.
 *
 * Props:
 *   part:    { part_no, description, mrp?, qty? }
 *   onClose: () => void
 *   onDone:  (orderId | null) => void   // called after a successful add/create
 */
export default function AddToOrderDialog({ part, onClose, onDone }) {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(Number(part.qty || 1));

  useEffect(() => {
    api
      .get("/orders", { params: { status: "current" } })
      .then((r) => setOrders(r.data || []))
      .catch(() => setOrders([]));
  }, []);

  const payloadItem = () => ({
    part_no: part.part_no,
    description: part.description || "",
    mrp: Number(part.mrp || 0),
    qty: Math.max(1, Number(qty || 1)),
  });

  const addToExisting = async (orderId) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${orderId}/add-items`, {
        items: [payloadItem()],
      });
      if (data.added > 0) {
        toast.success(`Added ${part.part_no} to order`);
      } else {
        toast.info(`${part.part_no} is already in that order`);
      }
      onDone(orderId);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/orders", {
        items: [payloadItem()],
        remarks: "",
      });
      toast.success(`Created ${data.order_no} with ${part.part_no}`);
      onDone(data.id);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="addtoorder-dialog"
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
        style={{ maxWidth: 460, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="overline mb-1">Add to order</div>
            <div className="font-mono text-base">{part.part_no}</div>
            <div className="text-xs" style={{ color: "var(--hero-muted)" }}>
              {part.description || "—"}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="overline">Qty</label>
          <input
            className="field field-sm mono num"
            data-testid="addtoorder-qty"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ width: 90, textAlign: "right" }}
          />
        </div>

        <div className="overline mb-2">Choose a current order</div>
        {orders === null ? (
          <div className="text-sm" style={{ color: "var(--hero-muted)" }}>
            Loading current orders…
          </div>
        ) : (
          <div className="grid gap-2 mb-4" style={{ maxHeight: 220, overflowY: "auto" }}>
            {orders.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--hero-muted)" }}>
                No current (draft) orders. Create a new one below.
              </div>
            ) : (
              orders.map((o) => (
                <button
                  key={o.id}
                  className="btn btn-outline"
                  data-testid={`addtoorder-existing-${o.id}`}
                  disabled={busy}
                  onClick={() => addToExisting(o.id)}
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="font-mono">{o.order_no}</span>
                  <span style={{ color: "var(--hero-muted)", fontSize: 12 }}>
                    {(o.items || []).length} items
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <button
          className="btn btn-primary"
          data-testid="addtoorder-new"
          disabled={busy}
          onClick={createNew}
          style={{ width: "100%" }}
        >
          <Plus size={14} weight="bold" />
          <span>{busy ? "Working…" : "Create new order with this part"}</span>
        </button>
      </div>
    </div>
  );
}
