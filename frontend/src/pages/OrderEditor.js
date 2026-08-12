import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  MagnifyingGlass,
  Plus,
  Trash,
  FileXls,
  FilePdf,
  PaperPlaneTilt,
  FloppyDisk,
  Warning,
  ArrowCounterClockwise,
  ClipboardText,
  Package,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import api, { API, formatApiError } from "@/lib/api";
import { IDS } from "@/lib/testIds";
import { formatPartNo, formatPartNoForSystem, partNoKey } from "@/lib/partNo";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useSystem } from "@/context/SystemContext";

const emptyItem = () => ({
  part_no: "",
  description: "",
  mrp: 0,
  qty: 1,
  discount_percent: 0,
  landed_price: 0,
  line_total: 0,
  moq: null,
  note: "",
});

export default function OrderEditor() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const isNew = !orderId;
  const { meta } = useSystem();
  const searchEndpoint = meta?.searchEndpoint || "/hero/search";
  const brandName = meta?.label || "the vendor";

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addQty, setAddQty] = useState({}); // part_no -> qty for search-result rows
  const [selected, setSelected] = useState({}); // part_no -> bool for bulk add

  const [duplicateWarn, setDuplicateWarn] = useState("");
  const [previouslyOrdered, setPreviouslyOrdered] = useState(null);
  const [inventoryMap, setInventoryMap] = useState({}); // part_no_norm -> stock
  const [manualOpen, setManualOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    part_no: "",
    description: "",
    mrp: 0,
    moq: "",
    qty: 1,
  });
  const [limitError, setLimitError] = useState(null); // {message, limit, current_count}

  const readonly = order?.status === "sent";

  // Load initial data
  useEffect(() => {
    api.get("/settings").then((r) =>
      setGlobalDiscount(Number(r.data.discount_percent || 0)),
    );
    if (isNew) {
      // Create draft order immediately
      api
        .post("/orders", { items: [], remarks: "" })
        .then((r) => {
          setOrder(r.data);
          setItems([]);
          setRemarks(r.data.remarks || "");
          navigate(`/orders/${r.data.id}`, { replace: true });
        })
        .catch((e) => {
          const detail = e.response?.data?.detail;
          if (
            e.response?.status === 409 &&
            detail &&
            typeof detail === "object" &&
            detail.code === "current_orders_limit"
          ) {
            setLimitError(detail);
            return;
          }
          toast.error(formatApiError(detail) || e.message);
        });
    } else {
      api.get(`/orders/${orderId}`).then((r) => {
        setOrder(r.data);
        setItems(r.data.items || []);
        setRemarks(r.data.remarks || "");
      });
    }
  }, [orderId, isNew, navigate]);

  // Lookup inventory for all items on load
  useEffect(() => {
    const partNos = [...new Set(items.map((it) => it.part_no).filter(Boolean))];
    partNos.forEach(async (pn) => {
      const norm = partNoKey(pn);
      if (inventoryMap[norm] !== undefined) return;
      try {
        const { data } = await api.get(
          `/inventory/lookup/${encodeURIComponent(pn)}`,
        );
        setInventoryMap((m) => ({ ...m, [norm]: data.found ? data.stock_qty : 0 }));
      } catch (e) {
        // ignore
      }
    });
  }, [items, inventoryMap]);

  // Lookup inventory for search results too, so stock shows BEFORE clicking Add
  useEffect(() => {
    const partNos = [
      ...new Set(searchResults.map((p) => p.part_no).filter(Boolean)),
    ];
    partNos.forEach(async (pn) => {
      const norm = partNoKey(pn);
      if (inventoryMap[norm] !== undefined) return;
      try {
        const { data } = await api.get(
          `/inventory/lookup/${encodeURIComponent(pn)}`,
        );
        setInventoryMap((m) => ({ ...m, [norm]: data.found ? data.stock_qty : 0 }));
      } catch (e) {
        // ignore
      }
    });
  }, [searchResults, inventoryMap]);

  // Lookup inventory for the manual-add form's typed part_no
  useEffect(() => {
    const pn = manualForm.part_no.trim();
    if (!pn) return;
    const norm = partNoKey(pn);
    if (inventoryMap[norm] !== undefined) return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(
          `/inventory/lookup/${encodeURIComponent(pn)}`,
        );
        setInventoryMap((m) => ({ ...m, [norm]: data.found ? data.stock_qty : 0 }));
      } catch (e) {
        // ignore
      }
    }, 350);
    return () => clearTimeout(t);
  }, [manualForm.part_no, inventoryMap]);

  const orderTotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.line_total || 0), 0),
    [items],
  );

  const recomputeItem = (it) => {
    const mrp = Number(it.mrp || 0);
    const disc =
      it.discount_percent === "" || it.discount_percent === null
        ? Number(globalDiscount)
        : Number(it.discount_percent);
    const landed = +(mrp * (1 - disc / 100)).toFixed(2);
    const line = +(landed * Number(it.qty || 0)).toFixed(2);
    return { ...it, discount_percent: disc, landed_price: landed, line_total: line };
  };

  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    setAddQty({});
    setSelected({});
    setDuplicateWarn("");
    setPreviouslyOrdered(null);
    setManualOpen(false);
    try {
      const { data } = await api.get(
        `${searchEndpoint}?q=${encodeURIComponent(q)}`,
      );
      if (!data.parts || data.parts.length === 0) {
        setSearchError(
          `No parts found for "${q}" in the ${brandName} eCatalogue. You can add it manually below.`,
        );
        setManualForm((f) => ({ ...f, part_no: q, description: "", mrp: 0, moq: "", qty: 1 }));
        setManualOpen(true);
      } else {
        setSearchResults(data.parts);
        // check duplicate & previous
        const firstPart = data.parts[0].part_no;
        checkPartHistory(firstPart);
      }
    } catch (err) {
      setSearchError(
        formatApiError(err.response?.data?.detail) ||
          `${brandName} eCatalogue unreachable. You can still add the part manually below.`,
      );
      setManualForm((f) => ({ ...f, part_no: q }));
      setManualOpen(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const openManualEntry = () => {
    setManualForm({
      part_no: searchQuery.trim(),
      description: "",
      mrp: 0,
      moq: "",
      qty: 1,
    });
    setSearchResults([]);
    setSearchError("");
    setManualOpen(true);
  };

  const addManualPart = () => {
    const raw = manualForm.part_no.trim();
    if (!raw) {
      toast.error("Part number is required");
      return;
    }
    const pn = formatPartNoForSystem(raw, meta?.key);
    const norm = partNoKey(pn);
    if (items.some((it) => partNoKey(it.part_no) === norm)) {
      toast.error(`Duplicate: ${pn} is already in this order.`);
      return;
    }
    const newItem = recomputeItem({
      ...emptyItem(),
      part_no: pn,
      description: manualForm.description || "",
      mrp: Number(manualForm.mrp || 0),
      moq: manualForm.moq ? Number(manualForm.moq) : null,
      qty: Number(manualForm.qty || 1),
      discount_percent: Number(globalDiscount),
    });
    setItems((prev) => [...prev, newItem]);
    setManualOpen(false);
    setSearchQuery("");
    setSearchError("");
    setManualForm({ part_no: "", description: "", mrp: 0, moq: "", qty: 1 });
    toast.success(`Added ${pn} (manual)`);
    // Warn if previously ordered
    checkPartHistory(pn);
  };

  const checkPartHistory = async (partNo) => {
    if (!partNo) return;
    const norm = partNoKey(partNo);
    // duplicate in current order
    const dup = items.find(
      (it) => partNoKey(it.part_no) === norm,
    );
    if (dup) {
      setDuplicateWarn(
        `Part ${partNo} is already in this order (qty ${dup.qty}).`,
      );
    }
    // previously ordered
    try {
      const excl = order?.id ? `?exclude_order_id=${order.id}` : "";
      const { data } = await api.get(
        `/orders/check-part/${encodeURIComponent(partNo)}${excl}`,
      );
      if (data.previously_ordered) setPreviouslyOrdered(data);
    } catch (e) {
      // ignore
    }
  };

  const addPart = (part, qtyOverride) => {
    const formatted = formatPartNoForSystem(part.part_no, meta?.key);
    const norm = partNoKey(formatted);
    const exists = items.some(
      (it) => partNoKey(it.part_no) === norm,
    );
    if (exists) {
      toast.error(`Duplicate: ${formatted} is already in this order.`);
      return;
    }
    const qty = Math.max(1, Math.floor(Number(qtyOverride ?? addQty[part.part_no] ?? 1) || 1));
    const newItem = recomputeItem({
      ...emptyItem(),
      part_no: formatted,
      description: part.description || "",
      mrp: Number(part.mrp || 0),
      moq: part.moq || null,
      qty,
      discount_percent: Number(globalDiscount),
    });
    setItems((prev) => [...prev, newItem]);
    // clear
    setSearchResults([]);
    setSearchQuery("");
    setDuplicateWarn("");
    setPreviouslyOrdered(null);
    setAddQty({});
    toast.success(`Added ${formatted} × ${qty}`);
  };

  // Bulk add: add every checked search result (with its per-row qty) to the
  // order in one action. Skips parts already in the order.
  const addSelected = () => {
    const chosen = searchResults.filter((p) => selected[p.part_no]);
    if (chosen.length === 0) {
      toast.error("Select at least one part first.");
      return;
    }
    const existingNorms = new Set(items.map((it) => partNoKey(it.part_no)));
    const toAdd = [];
    let skipped = 0;
    for (const p of chosen) {
      const formatted = formatPartNoForSystem(p.part_no, meta?.key);
      const norm = partNoKey(formatted);
      if (existingNorms.has(norm)) {
        skipped += 1;
        continue;
      }
      existingNorms.add(norm);
      const qty = Math.max(
        1,
        Math.floor(Number(addQty[p.part_no] ?? p.moq ?? 1) || 1),
      );
      toAdd.push(
        recomputeItem({
          ...emptyItem(),
          part_no: formatted,
          description: p.description || "",
          mrp: Number(p.mrp || 0),
          moq: p.moq || null,
          qty,
          discount_percent: Number(globalDiscount),
        }),
      );
    }
    if (toAdd.length === 0) {
      toast.error("All selected parts are already in this order.");
      return;
    }
    setItems((prev) => [...prev, ...toAdd]);
    setSearchResults([]);
    setSearchQuery("");
    setSelected({});
    setAddQty({});
    setDuplicateWarn("");
    setPreviouslyOrdered(null);
    toast.success(
      `Added ${toAdd.length} part${toAdd.length > 1 ? "s" : ""}${skipped ? ` (${skipped} skipped as duplicates)` : ""}`,
    );
  };

  const selectedCount = searchResults.filter((p) => selected[p.part_no]).length;
  const allSelected =
    searchResults.length > 0 && selectedCount === searchResults.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const next = {};
      searchResults.forEach((p) => {
        next[p.part_no] = true;
      });
      setSelected(next);
    }
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = recomputeItem({ ...next[idx], ...patch });
      return next;
    });
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!order) return;
    if (items.length === 0) {
      toast.error("Cannot save an empty order. Add at least one part.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/orders/${order.id}`, {
        items,
        remarks,
      });
      setOrder(data);
      setItems(data.items || []);
      toast.success("Order saved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const markSent = async () => {
    if (!order) return;
    if (!window.confirm("Mark this order as SENT? You won't be able to edit it.")) return;
    // Save first
    try {
      await api.put(`/orders/${order.id}`, { items, remarks });
      const { data } = await api.post(`/orders/${order.id}/mark-sent`);
      setOrder(data);
      toast.success(`Order ${data.order_no} marked as sent`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const reopen = async () => {
    if (!order) return;
    if (!window.confirm("Move this order back to Current (editable)?")) return;
    const { data } = await api.post(`/orders/${order.id}/reopen`);
    setOrder(data);
    toast.success("Order reopened");
  };

  const downloadFile = async (kind) => {
    if (!order) return;
    const token = localStorage.getItem("hmc_token");
    const url = `${API}/orders/${order.id}/export/${kind}`;
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Failed");
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${order.order_no}.${kind === "excel" ? "xlsx" : "pdf"}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error("Download failed");
    }
  };

  const deleteOrder = async () => {
    if (!order) return;
    try {
      await api.delete(`/orders/${order.id}`, {
        params: { confirm: "delete" },
      });
      toast.success("Deleted");
      navigate("/orders/current");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
      throw e;
    }
  };

  const partNoLookupStock = (pn) => {
    const norm = partNoKey(pn);
    return inventoryMap[norm];
  };

  if (limitError) {
    return (
      <div className="page p-10 max-w-3xl" data-testid="order-limit-lock">
        <div className="overline mb-2">Locked</div>
        <h1 className="font-display font-bold text-4xl mb-4 page-title">
          Cannot start a new order
        </h1>
        <div
          className="card p-6"
          style={{
            border: "1px solid rgba(227,24,55,0.4)",
            background: "rgba(227,24,55,0.05)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(227,24,55,0.12)",
                border: "1px solid rgba(227,24,55,0.5)",
                color: "var(--hero-primary)",
              }}
            >
              !
            </div>
            <div>
              <div
                className="font-display text-lg font-semibold"
                style={{ color: "var(--hero-primary)" }}
              >
                Current-orders limit reached
              </div>
              <div
                className="text-sm mt-2"
                style={{ color: "var(--hero-muted)" }}
              >
                {limitError.message}
              </div>
            </div>
          </div>
          <div
            className="grid gap-2 p-3 mb-4 font-mono text-xs"
            style={{
              gridTemplateColumns: "repeat(2, 1fr)",
              background: "var(--hero-surface-2)",
              border: "1px solid var(--hero-border)",
            }}
          >
            <div>
              <div className="overline">Current</div>
              <div>{limitError.current_count}</div>
            </div>
            <div>
              <div className="overline">Limit</div>
              <div>{limitError.limit}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-primary"
              data-testid="order-limit-go-current"
              onClick={() => navigate("/orders/current")}
            >
              Open current orders
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate("/")}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-10">
        <div className="overline">Loading…</div>
      </div>
    );
  }

  return (
    <div data-testid={IDS.editorPage} className="page p-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap actions-row">
        <div>
          <div className="overline mb-2 flex items-center gap-2">
            <ClipboardText size={12} />
            {readonly ? "Sent order" : "Draft order"}
          </div>
          <h1
            className="font-display font-bold text-4xl tabular page-title"
            data-testid={IDS.editorOrderNo}
          >
            {order.order_no}
          </h1>
          <div className="flex gap-2 mt-3">
            <span
              className={`badge ${order.status === "current" ? "badge-current" : "badge-sent"}`}
            >
              {order.status}
            </span>
            <span
              className="badge"
              style={{
                color: "var(--hero-muted)",
                borderColor: "var(--hero-border)",
                background: "var(--hero-surface)",
              }}
            >
              Global disc {globalDiscount}%
            </span>
            <span
              className="badge"
              style={{
                color: "var(--hero-muted)",
                borderColor: "var(--hero-border)",
                background: "var(--hero-surface)",
              }}
            >
              {items.length} items
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!readonly && (
            <button
              data-testid={IDS.editorSaveBtn}
              onClick={save}
              disabled={saving || items.length === 0}
              title={items.length === 0 ? "Add at least one part to save" : ""}
              className="btn btn-outline"
              style={{
                opacity: items.length === 0 ? 0.5 : 1,
                cursor: items.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <FloppyDisk size={14} />
              <span>{saving ? "Saving…" : "Save"}</span>
            </button>
          )}
          <button
            data-testid={IDS.editorExcelBtn}
            onClick={() => downloadFile("excel")}
            className="btn btn-outline"
          >
            <FileXls size={14} />
            <span>Excel</span>
          </button>
          <button
            data-testid={IDS.editorPdfBtn}
            onClick={() => downloadFile("pdf")}
            className="btn btn-outline"
          >
            <FilePdf size={14} />
            <span>PDF</span>
          </button>
          {!readonly ? (
            <button
              data-testid={IDS.editorMarkSentBtn}
              onClick={markSent}
              disabled={items.length === 0}
              className="btn btn-primary"
            >
              <PaperPlaneTilt size={14} weight="bold" />
              <span>Mark Sent</span>
            </button>
          ) : (
            <button
              data-testid={IDS.editorReopenBtn}
              onClick={reopen}
              className="btn btn-primary"
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              <span>Reopen</span>
            </button>
          )}
          <button
            data-testid={IDS.editorDeleteBtn}
            onClick={() => setDeleteOpen(true)}
            className="btn btn-danger"
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {!readonly && (
        <div className="card p-5 mb-6">
          <div className="overline mb-3">Add part from {brandName} eCatalogue</div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative" style={{ flex: "1 1 220px", minWidth: 200 }}>
              <input
                data-testid={IDS.editorSearchInput}
                className="field mono"
                placeholder="Type part number e.g. 23121KST901S"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
            </div>
            <button
              data-testid={IDS.editorSearchBtn}
              onClick={doSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="btn btn-primary"
            >
              <MagnifyingGlass size={14} weight="bold" />
              <span>{searchLoading ? "Searching…" : "Search"}</span>
            </button>
            <button
              data-testid="editor-add-manual-btn"
              onClick={openManualEntry}
              className="btn btn-outline"
              title="Add a part manually (skip catalogue search)"
            >
              <Plus size={14} weight="bold" />
              <span>Add manually</span>
            </button>
          </div>

          {searchError && (
            <div
              className="mt-3 text-xs"
              style={{ color: "#f87171" }}
            >
              {searchError}
            </div>
          )}

          {/* Manual entry form */}
          {manualOpen && (
            <div
              data-testid="editor-manual-form"
              className="mt-4 p-4"
              style={{
                background: "var(--hero-surface-2)",
                border: "1px dashed var(--hero-border)",
                borderRadius: "2px",
              }}
            >
              <div className="overline mb-3">Manual part entry</div>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                }}
              >
                <div>
                  <label className="overline block mb-1">Part No *</label>
                  <input
                    data-testid="manual-part-no"
                    className="field field-sm mono"
                    value={manualForm.part_no}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, part_no: e.target.value })
                    }
                    placeholder="e.g. 23121-KST-901"
                  />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label className="overline block mb-1">Description</label>
                  <input
                    data-testid="manual-desc"
                    className="field field-sm"
                    value={manualForm.description}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, description: e.target.value })
                    }
                    placeholder="Part description"
                  />
                </div>
                <div>
                  <label className="overline block mb-1">MRP</label>
                  <input
                    data-testid="manual-mrp"
                    className="field field-sm mono"
                    type="number"
                    step="0.01"
                    value={manualForm.mrp}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, mrp: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="overline block mb-1">MOQ</label>
                  <input
                    data-testid="manual-moq"
                    className="field field-sm mono"
                    type="number"
                    value={manualForm.moq}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, moq: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="overline block mb-1">Qty *</label>
                  <input
                    data-testid="manual-qty"
                    className="field field-sm mono"
                    type="number"
                    min="1"
                    value={manualForm.qty}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, qty: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2 items-center flex-wrap">
                <button
                  data-testid="manual-add-btn"
                  className="btn btn-primary"
                  onClick={addManualPart}
                  disabled={!manualForm.part_no.trim()}
                >
                  <Plus size={14} weight="bold" />
                  <span>Add to order</span>
                </button>
                {(() => {
                  const pn = manualForm.part_no.trim();
                  if (!pn) return null;
                  const stock = partNoLookupStock(pn);
                  const askQty = Number(manualForm.qty) || 1;
                  let cls = "badge";
                  let text = "…";
                  if (stock === undefined) {
                    cls = "badge";
                    text = "checking stock…";
                  } else if (stock <= 0) {
                    cls = "badge badge-stock-none";
                    text = "Out of stock";
                  } else if (stock < askQty) {
                    cls = "badge badge-stock-low";
                    text = `Low: ${stock} in stock`;
                  } else {
                    cls = "badge badge-stock-ok";
                    text = `In stock: ${stock}`;
                  }
                  return (
                    <span
                      className={cls}
                      data-testid="manual-stock-hint"
                      style={{ marginLeft: 4 }}
                    >
                      {text}
                    </span>
                  );
                })()}
                <button
                  className="btn btn-ghost"
                  onClick={() => setManualOpen(false)}
                >
                  Cancel
                </button>
                <span
                  className="text-xs"
                  style={{ color: "var(--hero-muted)" }}
                >
                  Landed = MRP × (1 − {globalDiscount}%) auto-computed
                </span>
              </div>
            </div>
          )}

          {/* Warnings */}
          {duplicateWarn && (
            <div
              data-testid={IDS.editorDuplicateWarning}
              className="mt-3 flex items-start gap-2"
              style={{
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.4)",
                padding: "10px 12px",
                borderRadius: "2px",
                fontSize: "12px",
                color: "#fca5a5",
              }}
            >
              <Warning size={14} />
              {duplicateWarn}
            </div>
          )}

          {previouslyOrdered && previouslyOrdered.orders?.length > 0 && (
            <div
              data-testid={IDS.editorPreviousWarning}
              className="mt-3 flex items-start gap-2"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.4)",
                padding: "10px 12px",
                borderRadius: "2px",
                fontSize: "12px",
                color: "#fcd34d",
              }}
            >
              <Warning size={14} />
              <div>
                Part <b>{previouslyOrdered.part_no}</b> was in your last order sheet{" "}
                <b>{previouslyOrdered.orders[0].order_no}</b>{" "}
                ({previouslyOrdered.orders[0].status}, qty {previouslyOrdered.orders[0].qty}).
              </div>
            </div>
          )}

          {/* Results */}
          {searchResults.length > 0 && (
            <div
              data-testid={IDS.editorSearchResult}
              className="mt-4"
            >
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="overline">
                  {searchResults.length} match{searchResults.length > 1 ? "es" : ""}
                  {searchResults.length > 1 && (
                    <span style={{ color: "var(--hero-muted)", marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
                      — tick the parts you want and add them together
                    </span>
                  )}
                </div>
                <button
                  data-testid="editor-add-selected-btn"
                  className="btn btn-primary"
                  onClick={addSelected}
                  disabled={selectedCount === 0}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    opacity: selectedCount === 0 ? 0.5 : 1,
                    cursor: selectedCount === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  <Plus size={14} weight="bold" />
                  <span>
                    Add selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
                  </span>
                </button>
              </div>
              <div className="table-scroll">
              <table className="hero-table">
                <thead>
                  <tr>
                    <th className="center" style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        data-testid="editor-select-all"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>Part No.</th>
                    <th>Description</th>
                    <th className="num">MOQ</th>
                    <th className="num">MRP</th>
                    <th className="num">
                      Landed ({globalDiscount}% off)
                    </th>
                    <th className="center">Stock</th>
                    <th className="num">Qty</th>
                    <th className="center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((p) => {
                    const landed = +(p.mrp * (1 - globalDiscount / 100)).toFixed(2);
                    const formatted = formatPartNoForSystem(p.part_no, meta?.key);
                    const qtyVal = addQty[p.part_no] ?? (p.moq || 1);
                    const setQ = (v) =>
                      setAddQty((prev) => ({ ...prev, [p.part_no]: v }));
                    const stock = partNoLookupStock(p.part_no);
                    const askQty = Number(qtyVal) || 1;
                    let stockBadge;
                    if (stock === undefined) {
                      stockBadge = (
                        <span
                          className="badge"
                          style={{ color: "var(--hero-muted)" }}
                        >
                          …
                        </span>
                      );
                    } else if (stock <= 0) {
                      stockBadge = (
                        <span className="badge badge-stock-none">Out</span>
                      );
                    } else if (stock < askQty) {
                      stockBadge = (
                        <span className="badge badge-stock-low">
                          Low: {stock}
                        </span>
                      );
                    } else {
                      stockBadge = (
                        <span className="badge badge-stock-ok">{stock}</span>
                      );
                    }
                    return (
                      <tr key={p.part_no}>
                        <td className="center">
                          <input
                            type="checkbox"
                            data-testid={`search-select-${p.part_no}`}
                            checked={!!selected[p.part_no]}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [p.part_no]: e.target.checked,
                              }))
                            }
                            aria-label={`Select ${formatted}`}
                          />
                        </td>
                        <td className="font-mono">{formatted}</td>
                        <td>{p.description}</td>
                        <td className="num">{p.moq ?? "-"}</td>
                        <td className="num">₹{Number(p.mrp).toFixed(2)}</td>
                        <td className="num" style={{ color: "var(--hero-success)" }}>
                          ₹{landed.toFixed(2)}
                        </td>
                        <td
                          className="center"
                          data-testid={`search-stock-${p.part_no}`}
                        >
                          {stockBadge}
                        </td>
                        <td className="num">
                          <input
                            data-testid={`search-qty-${p.part_no}`}
                            className="field field-sm mono num"
                            type="number"
                            min="1"
                            step="1"
                            value={qtyVal}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addPart(p);
                            }}
                            style={{ width: 70, textAlign: "right" }}
                          />
                        </td>
                        <td className="center">
                          <button
                            data-testid={IDS.editorAddPartBtn}
                            className="btn btn-primary"
                            style={{ padding: "4px 10px", fontSize: "11px" }}
                            onClick={() => addPart(p)}
                          >
                            <Plus size={12} weight="bold" />
                            Add
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items table */}
      <div className="card">
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--hero-border)" }}
        >
          <div className="overline">Order items</div>
          <div className="font-mono text-sm">
            <span style={{ color: "var(--hero-muted)" }}>Total:</span>{" "}
            <span
              style={{ color: "var(--hero-primary)", fontWeight: 600 }}
            >
              ₹{orderTotal.toFixed(2)}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No parts added yet. Search above to add parts from the {brandName} eCatalogue.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="hero-table" data-testid={IDS.editorItemsTable}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ minWidth: 130 }}>Part No.</th>
                  <th style={{ minWidth: 260 }}>Description</th>
                  <th className="num">MRP</th>
                  <th className="num">Disc %</th>
                  <th className="num">Landed</th>
                  <th className="num">Qty</th>
                  <th className="num">Line Total</th>
                  <th className="center">Stock</th>
                  {!readonly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const stock = partNoLookupStock(it.part_no);
                  let stockBadge = null;
                  if (stock === undefined) stockBadge = null;
                  else if (stock <= 0)
                    stockBadge = (
                      <span className="badge badge-stock-none">Out</span>
                    );
                  else if (stock < it.qty)
                    stockBadge = (
                      <span className="badge badge-stock-low">
                        Low: {stock}
                      </span>
                    );
                  else
                    stockBadge = (
                      <span className="badge badge-stock-ok">
                        {stock}
                      </span>
                    );

                  return (
                    <tr key={idx} data-testid={`order-item-row-${idx}`}>
                      <td className="num" style={{ color: "var(--hero-muted)" }}>
                        {idx + 1}
                      </td>
                      <td className="font-mono">{it.part_no}</td>
                      <td>
                        {readonly ? (
                          it.description
                        ) : (
                          <input
                            className="field field-sm"
                            value={it.description}
                            onChange={(e) =>
                              updateItem(idx, { description: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="num">
                        {readonly ? (
                          `₹${Number(it.mrp).toFixed(2)}`
                        ) : (
                          <input
                            className="field field-sm mono num"
                            type="number"
                            step="0.01"
                            value={it.mrp}
                            onChange={(e) =>
                              updateItem(idx, { mrp: Number(e.target.value) })
                            }
                            style={{ width: 90, textAlign: "right" }}
                          />
                        )}
                      </td>
                      <td className="num">
                        {readonly ? (
                          `${Number(it.discount_percent).toFixed(2)}%`
                        ) : (
                          <input
                            className="field field-sm mono"
                            type="number"
                            step="0.1"
                            value={it.discount_percent}
                            onChange={(e) =>
                              updateItem(idx, {
                                discount_percent: Number(e.target.value),
                              })
                            }
                            style={{ width: 70, textAlign: "right" }}
                          />
                        )}
                      </td>
                      <td className="num" style={{ color: "var(--hero-success)" }}>
                        ₹{Number(it.landed_price).toFixed(2)}
                      </td>
                      <td className="num">
                        {readonly ? (
                          it.qty
                        ) : (
                          <input
                            className="field field-sm mono"
                            type="number"
                            min="1"
                            value={it.qty}
                            onChange={(e) =>
                              updateItem(idx, {
                                qty: parseInt(e.target.value || "0", 10),
                              })
                            }
                            style={{ width: 70, textAlign: "right" }}
                            data-testid={`order-item-qty-${idx}`}
                          />
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 500 }}>
                        ₹{Number(it.line_total).toFixed(2)}
                      </td>
                      <td className="center">{stockBadge}</td>
                      {!readonly && (
                        <td className="center">
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "4px 6px", color: "#f87171" }}
                            onClick={() => removeItem(idx)}
                            data-testid={`remove-item-${idx}`}
                          >
                            <Trash size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remarks */}
      <div className="card mt-6 p-5">
        <div className="overline mb-3">Remarks</div>
        <textarea
          data-testid={IDS.editorRemarks}
          className="field mono"
          rows={3}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={readonly}
          placeholder="Optional notes for this order sheet…"
        />
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        orderNo={order?.order_no || ""}
        onConfirm={deleteOrder}
        testIdPrefix="editor-confirm-delete"
      />
    </div>
  );
}
