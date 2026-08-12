import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PushPin, Plus, Trash, Info, Warning, ShoppingCart } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { IDS } from "@/lib/testIds";
import { useSystem } from "@/context/SystemContext";
import AddToOrderDialog from "@/components/AddToOrderDialog";

export default function MandatoryParts() {
  const [items, setItems] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [form, setForm] = useState({
    part_no: "",
    description: "",
    mrp: 0,
    qty: 1,
    threshold_qty: 0,
  });
  const [saving, setSaving] = useState(false);
  const [addToOrderPart, setAddToOrderPart] = useState(null); // the part being added to an order
  const { meta } = useSystem();
  const navigate = useNavigate();

  const load = () =>
    api.get("/mandatory-parts").then((r) => {
      setItems(r.data.parts || []);
      setEnabled(!!r.data.enabled);
    });

  useEffect(() => {
    load();
  }, [meta?.key]);

  const lowCount = items.filter((i) => i.is_low).length;

  const toggleEnabled = async (val) => {
    setEnabled(val); // optimistic
    try {
      await api.put("/mandatory-toggle", { enabled: val });
      toast.success(
        val
          ? "Mandatory parts will be auto-added to every new order"
          : "Mandatory parts auto-add disabled",
      );
    } catch (e) {
      setEnabled(!val);
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const add = async () => {
    if (!form.part_no.trim()) return toast.error("Part number is required");
    setSaving(true);
    try {
      await api.post("/mandatory-parts", {
        part_no: form.part_no.trim(),
        description: form.description.trim(),
        mrp: Number(form.mrp || 0),
        qty: Number(form.qty || 1),
        threshold_qty: Number(form.threshold_qty || 0),
      });
      toast.success(`Added ${form.part_no.trim()} to mandatory parts`);
      setForm({ part_no: "", description: "", mrp: 0, qty: 1, threshold_qty: 0 });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (id, patch) => {
    const existing = items.find((i) => i.id === id);
    if (!existing) return;
    try {
      await api.put(`/mandatory-parts/${id}`, {
        part_no: "-",
        description: patch.description ?? existing.description,
        mrp: Number(patch.mrp ?? existing.mrp),
        qty: Number(patch.qty ?? existing.qty),
        threshold_qty: Number(patch.threshold_qty ?? existing.threshold_qty ?? 0),
      });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this mandatory part?")) return;
    await api.delete(`/mandatory-parts/${id}`);
    toast.success("Removed");
    load();
  };

  const stockBadge = (it) => {
    if (it.is_low) {
      return (
        <span className="badge badge-stock-low" data-testid={`mandatory-low-${it.id}`}>
          Low: {it.current_stock}
        </span>
      );
    }
    if (Number(it.threshold_qty || 0) <= 0) {
      return (
        <span className="badge" style={{ color: "var(--hero-muted)" }}>
          {it.current_stock ?? 0}
        </span>
      );
    }
    return <span className="badge badge-stock-ok">{it.current_stock}</span>;
  };

  return (
    <div data-testid={IDS.mandatoryPage} className="page p-10 max-w-5xl">
      <div className="overline mb-2">Order defaults</div>
      <h1 className="font-display font-bold text-4xl mb-2 page-title">
        Mandatory Parts
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--hero-muted)", maxWidth: 640 }}>
        Parts here are auto-included in every new order sheet you create. Set a
        reorder <b>threshold</b> to be alerted when stock runs low — you can then
        add the part straight into an order of your choice.
      </p>

      {/* Low-stock alert banner */}
      {lowCount > 0 && (
        <div
          className="card p-4 mb-6 flex items-center gap-3"
          data-testid="mandatory-low-banner"
          style={{
            border: "1px solid rgba(245,158,11,0.5)",
            background: "rgba(245,158,11,0.08)",
          }}
        >
          <Warning size={18} color="#f59e0b" weight="fill" />
          <div className="text-sm" style={{ color: "#fcd34d" }}>
            {lowCount} mandatory part{lowCount === 1 ? "" : "s"} below threshold.
            Use <b>Add to order</b> to reorder.
          </div>
        </div>
      )}

      {/* Toggle card */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <PushPin size={18} color="var(--hero-primary)" weight="fill" />
            <div>
              <div className="font-display font-semibold text-base">
                Auto-add mandatory parts to new orders
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--hero-muted)" }}>
                {enabled
                  ? `All ${items.length} mandatory part${items.length === 1 ? "" : "s"} will be pre-filled in every new order sheet.`
                  : "Currently OFF — new orders start empty."}
              </div>
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              data-testid={IDS.mandatoryToggle}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      {/* Add form */}
      <div className="card p-5 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Plus size={16} color="var(--hero-primary)" />
          <div className="font-display font-semibold text-lg">
            Add mandatory part
          </div>
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        >
          <div>
            <label className="overline block mb-2">Part No *</label>
            <input
              data-testid={IDS.mandatoryPartNo}
              className="field mono"
              value={form.part_no}
              onChange={(e) => setForm({ ...form, part_no: e.target.value })}
              placeholder="e.g. 87500KWWH01"
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="overline block mb-2">Description</label>
            <input
              data-testid={IDS.mandatoryDesc}
              className="field"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="overline block mb-2">MRP</label>
            <input
              data-testid={IDS.mandatoryMrp}
              className="field mono"
              type="number"
              min="0"
              step="0.01"
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            />
          </div>
          <div>
            <label className="overline block mb-2">Qty *</label>
            <input
              data-testid={IDS.mandatoryQty}
              className="field mono"
              type="number"
              min="1"
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
            />
          </div>
          <div>
            <label className="overline block mb-2">Reorder threshold</label>
            <input
              data-testid="mandatory-threshold"
              className="field mono"
              type="number"
              min="0"
              value={form.threshold_qty}
              onChange={(e) => setForm({ ...form, threshold_qty: e.target.value })}
              placeholder="0 = no alert"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            data-testid={IDS.mandatoryAddBtn}
            className="btn btn-primary"
            onClick={add}
            disabled={saving || !form.part_no.trim()}
          >
            <Plus size={14} weight="bold" />
            <span>{saving ? "Adding…" : "Add mandatory part"}</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--hero-border)" }}
        >
          <div className="flex items-center gap-2">
            <PushPin size={14} color="var(--hero-primary)" />
            <div className="overline">Mandatory list ({items.length})</div>
          </div>
          <div className="text-xs" style={{ color: "var(--hero-muted)" }}>
            <Info size={11} style={{ display: "inline", marginRight: 4 }} />
            Stock compared against current inventory.
          </div>
        </div>
        {items.length === 0 ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No mandatory parts configured yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="hero-table" data-testid={IDS.mandatoryTable}>
              <thead>
                <tr>
                  <th>Part No.</th>
                  <th>Description</th>
                  <th className="num">MRP</th>
                  <th className="num">Default Qty</th>
                  <th className="num">Threshold</th>
                  <th className="center">Stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} data-testid={`mandatory-row-${it.id}`}>
                    <td className="font-mono">{it.part_no}</td>
                    <td>
                      <input
                        className="field field-sm"
                        defaultValue={it.description || ""}
                        onBlur={(e) =>
                          e.target.value !== (it.description || "") &&
                          update(it.id, { description: e.target.value })
                        }
                        placeholder="—"
                      />
                    </td>
                    <td className="num">
                      <input
                        className="field field-sm mono num"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={it.mrp}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(it.mrp) &&
                          update(it.id, { mrp: Number(e.target.value) })
                        }
                        style={{ width: 100, textAlign: "right" }}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="field field-sm mono num"
                        type="number"
                        min="1"
                        defaultValue={it.qty}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(it.qty) &&
                          update(it.id, { qty: Number(e.target.value) })
                        }
                        style={{ width: 80, textAlign: "right" }}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="field field-sm mono num"
                        data-testid={`mandatory-threshold-${it.id}`}
                        type="number"
                        min="0"
                        defaultValue={it.threshold_qty || 0}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(it.threshold_qty || 0) &&
                          update(it.id, { threshold_qty: Number(e.target.value) })
                        }
                        style={{ width: 80, textAlign: "right" }}
                      />
                    </td>
                    <td className="center">{stockBadge(it)}</td>
                    <td className="center">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          className={`btn ${it.is_low ? "btn-primary" : "btn-outline"}`}
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => setAddToOrderPart(it)}
                          data-testid={`mandatory-addtoorder-${it.id}`}
                          title="Add this part to an order"
                        >
                          <ShoppingCart size={12} />
                          Add to order
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 6px", color: "#f87171" }}
                          onClick={() => remove(it.id)}
                          data-testid={`mandatory-remove-${it.id}`}
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addToOrderPart && (
        <AddToOrderDialog
          part={addToOrderPart}
          onClose={() => setAddToOrderPart(null)}
          onDone={(orderId) => {
            setAddToOrderPart(null);
            if (orderId) navigate(`/orders/${orderId}`);
          }}
        />
      )}
    </div>
  );
}
