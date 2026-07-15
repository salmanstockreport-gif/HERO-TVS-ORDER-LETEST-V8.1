import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Star, Plus, Trash, Warning } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { IDS } from "@/lib/testIds";
import { useSystem } from "@/context/SystemContext";

export default function ImportantParts() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ part_no: "", description: "", threshold_qty: 1 });
  const [saving, setSaving] = useState(false);
  const { meta } = useSystem();

  const load = () =>
    api.get("/important-parts").then((r) => setItems(r.data));

  useEffect(() => {
    load();
  }, [meta?.key]);

  const add = async () => {
    if (!form.part_no.trim()) return toast.error("Part number is required");
    setSaving(true);
    try {
      await api.post("/important-parts", {
        part_no: form.part_no.trim(),
        description: form.description.trim(),
        threshold_qty: Number(form.threshold_qty || 1),
      });
      toast.success(`Added ${form.part_no.trim()} to important parts`);
      setForm({ part_no: "", description: "", threshold_qty: 1 });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateThreshold = async (id, threshold_qty, description) => {
    try {
      await api.put(`/important-parts/${id}`, {
        part_no: "-", // ignored by backend on update
        description: description || "",
        threshold_qty: Number(threshold_qty || 1),
      });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this part from the important list?")) return;
    await api.delete(`/important-parts/${id}`);
    toast.success("Removed");
    load();
  };

  const lowCount = items.filter((i) => i.is_low).length;

  return (
    <div data-testid={IDS.importantPage} className="page p-10 max-w-5xl">
      <div className="overline mb-2">Watch list</div>
      <h1 className="font-display font-bold text-4xl mb-2 page-title">
        Important Parts
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--hero-muted)", maxWidth: 620 }}>
        Track critical part numbers and set a low-stock threshold for each. When
        stock (from your uploaded inventory) drops below the threshold, the part
        appears on the Dashboard as an alert.
      </p>

      {/* Add form */}
      <div className="card p-5 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Star size={16} color="var(--hero-primary)" weight="fill" />
          <div className="font-display font-semibold text-lg">
            Add important part
          </div>
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          <div>
            <label className="overline block mb-2">Part No *</label>
            <input
              data-testid={IDS.importantPartNo}
              className="field mono"
              value={form.part_no}
              onChange={(e) => setForm({ ...form, part_no: e.target.value })}
              placeholder="e.g. 23121KST901"
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="overline block mb-2">Description</label>
            <input
              data-testid={IDS.importantDesc}
              className="field"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="overline block mb-2">Alert if stock &lt; </label>
            <input
              data-testid={IDS.importantThreshold}
              className="field mono"
              type="number"
              min="0"
              step="1"
              value={form.threshold_qty}
              onChange={(e) => setForm({ ...form, threshold_qty: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            data-testid={IDS.importantAddBtn}
            className="btn btn-primary"
            onClick={add}
            disabled={saving || !form.part_no.trim()}
          >
            <Plus size={14} weight="bold" />
            <span>{saving ? "Adding…" : "Add to watch list"}</span>
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
            <Star size={14} color="var(--hero-primary)" />
            <div className="overline">Watch list ({items.length})</div>
          </div>
          {lowCount > 0 && (
            <div
              className="badge"
              style={{
                background: "rgba(227,24,55,0.12)",
                color: "var(--hero-primary)",
                borderColor: "rgba(227,24,55,0.4)",
              }}
            >
              <Warning size={11} /> {lowCount} below threshold
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No important parts yet. Add key part numbers above to monitor stock.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="hero-table" data-testid={IDS.importantTable}>
              <thead>
                <tr>
                  <th>Part No.</th>
                  <th>Description</th>
                  <th className="num">Threshold</th>
                  <th className="num">Current stock</th>
                  <th className="center">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="font-mono">{it.part_no}</td>
                    <td>{it.description || "-"}</td>
                    <td className="num">
                      <input
                        className="field field-sm mono num"
                        type="number"
                        min="0"
                        defaultValue={it.threshold_qty}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(it.threshold_qty) &&
                          updateThreshold(it.id, e.target.value, it.description)
                        }
                        style={{ width: 80, textAlign: "right" }}
                      />
                    </td>
                    <td
                      className="num"
                      style={{
                        color: it.is_low
                          ? "var(--hero-primary)"
                          : "var(--hero-success)",
                        fontWeight: 600,
                      }}
                    >
                      {it.current_stock}
                    </td>
                    <td className="center">
                      {it.is_low ? (
                        <span className="badge" style={{
                          color: "var(--hero-primary)",
                          borderColor: "rgba(227,24,55,0.4)",
                          background: "rgba(227,24,55,0.1)",
                        }}>
                          LOW
                        </span>
                      ) : (
                        <span className="badge badge-stock-ok">OK</span>
                      )}
                    </td>
                    <td className="center">
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "4px 6px", color: "#f87171" }}
                        onClick={() => remove(it.id)}
                        data-testid={`important-remove-${it.id}`}
                      >
                        <Trash size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
