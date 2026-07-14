import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  UploadSimple,
  MagnifyingGlass,
  Package,
  FloppyDisk,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { IDS } from "@/lib/testIds";
import useInventoryStatus from "@/hooks/useInventoryStatus";

const REQUIRED_FIELDS = [
  { key: "part_no", label: "Part Number", required: true, testId: IDS.inventoryMappingPartNo },
  {
    key: "stock_qty",
    label: "Stock Qty",
    required: true,
    testId: IDS.inventoryMappingQty,
  },
  {
    key: "description",
    label: "Description",
    required: false,
    testId: IDS.inventoryMappingDesc,
  },
  {
    key: "location",
    label: "Location / Bin",
    required: false,
    testId: IDS.inventoryMappingLoc,
  },
  { key: "rate", label: "Rate", required: false, testId: IDS.inventoryMappingRate },
];

export default function Inventory() {
  const fileRef = useRef(null);
  const { refresh: refreshInventoryStatus } = useInventoryStatus();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({
    part_no: "",
    description: "",
    stock_qty: "",
    location: "",
    rate: "",
  });
  const [savedMapping, setSavedMapping] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadItems = () => {
    api.get(`/inventory?q=${encodeURIComponent(search)}`).then((r) => setItems(r.data));
  };

  useEffect(() => {
    api.get("/inventory/mapping").then((r) => {
      setSavedMapping(r.data);
      setMapping((m) => ({ ...m, ...r.data }));
    });
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(loadItems, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
  };

  const runPreview = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/inventory/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      // auto-map: reset any saved mapping that isn't in the new file's columns
      const cols = data.columns;
      const auto = { ...mapping };
      // If a saved mapping isn't in the file, clear it so auto-detect can pick
      ["part_no", "stock_qty", "description", "location", "rate"].forEach((k) => {
        if (auto[k] && !cols.includes(auto[k])) auto[k] = "";
      });
      cols.forEach((c) => {
        const lc = c.toLowerCase();
        if (!auto.part_no && lc.includes("part") && (lc.includes("no") || lc.includes("num") || lc.includes("code")))
          auto.part_no = c;
        if (!auto.stock_qty && (lc.includes("stock") || lc.includes("qty") || lc.includes("quantity") || lc.includes("balance") || lc.includes("on hand")))
          auto.stock_qty = c;
        if (!auto.description && (lc.includes("desc") || lc.includes("name") || lc === "item"))
          auto.description = c;
        if (!auto.location && (lc.includes("loc") || lc.includes("bin") || lc.includes("rack") || lc.includes("shelf")))
          auto.location = c;
        if (!auto.rate && (lc.includes("rate") || lc.includes("price") || lc.includes("cost") || lc.includes("mrp")))
          auto.rate = c;
      });
      setMapping(auto);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const doUpload = async () => {
    if (!file) return toast.error("Choose a file first");
    if (!mapping.part_no || !mapping.stock_qty)
      return toast.error("Map at least Part Number and Stock Qty columns");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("part_no", mapping.part_no);
    fd.append("stock_qty", mapping.stock_qty);
    fd.append("description", mapping.description || "");
    fd.append("location", mapping.location || "");
    fd.append("rate", mapping.rate || "");
    fd.append("replace", "true");
    try {
      const { data } = await api.post("/inventory/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Imported ${data.imported} inventory items`);
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      loadItems();
      refreshInventoryStatus();
      window.dispatchEvent(new CustomEvent("inventory:updated"));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setUploading(false);
    }
  };

  const saveMappingOnly = async () => {
    try {
      await api.put("/inventory/mapping", {
        part_no: mapping.part_no,
        description: mapping.description || "",
        stock_qty: mapping.stock_qty,
        location: mapping.location || "",
        rate: mapping.rate || "",
      });
      toast.success("Mapping saved");
      setSavedMapping(mapping);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div data-testid={IDS.inventoryPage} className="page p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap actions-row">
        <div>
          <div className="overline mb-2">Stock on hand</div>
          <h1 className="font-display font-bold text-4xl page-title">Inventory</h1>
          <p
            className="text-sm mt-2 max-w-2xl"
            style={{ color: "var(--hero-muted)" }}
          >
            Upload your latest inventory Excel/CSV. Map the columns from your
            file to the system fields — the mapping is remembered for next time.
          </p>
        </div>
      </div>

      {/* Upload */}
      <div className="card p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <UploadSimple size={16} color="var(--hero-primary)" />
          <div className="font-display font-semibold text-lg">Upload Excel / CSV</div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <input
            ref={fileRef}
            data-testid={IDS.inventoryFileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="field"
            style={{ maxWidth: 400 }}
          />
          <button
            data-testid={IDS.inventoryPreviewBtn}
            className="btn btn-outline"
            onClick={runPreview}
            disabled={!file}
          >
            Preview columns
          </button>
        </div>

        {preview && (
          <div className="mt-6">
            <div className="overline mb-3">
              Detected {preview.columns.length} columns · {preview.row_count} rows
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
            >
              {REQUIRED_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="overline block mb-2">
                    {f.label} {f.required && <span style={{ color: "var(--hero-primary)" }}>*</span>}
                  </label>
                  <select
                    data-testid={f.testId}
                    className="field"
                    value={mapping[f.key] || ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                  >
                    <option value="">— Not mapped —</option>
                    {preview.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                data-testid={IDS.inventoryUploadBtn}
                className="btn btn-primary"
                onClick={doUpload}
                disabled={uploading || !mapping.part_no || !mapping.stock_qty}
              >
                <UploadSimple size={14} weight="bold" />
                <span>{uploading ? "Uploading…" : "Import Inventory"}</span>
              </button>
              <button className="btn btn-outline" onClick={saveMappingOnly}>
                <FloppyDisk size={14} />
                <span>Save mapping only</span>
              </button>
            </div>

            {/* Sample preview */}
            <div className="mt-6 overflow-x-auto">
              <div className="overline mb-2">First 5 rows</div>
              <table className="hero-table">
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i}>
                      {preview.columns.map((c) => (
                        <td key={c} className="font-mono text-xs">
                          {r[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {savedMapping && !preview && (
          <div
            className="mt-4 text-xs font-mono"
            style={{ color: "var(--hero-muted)" }}
          >
            Saved mapping:{" "}
            {Object.entries(savedMapping)
              .filter(([k, v]) => v && ["part_no", "description", "stock_qty", "location", "rate"].includes(k))
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ") || "— none —"}
          </div>
        )}
      </div>

      {/* Inventory list */}
      <div className="card">
        <div
          className="p-4 flex items-center justify-between gap-4"
          style={{ borderBottom: "1px solid var(--hero-border)" }}
        >
          <div className="flex items-center gap-2">
            <Package size={14} color="var(--hero-primary)" />
            <div className="overline">Inventory ({items.length})</div>
          </div>
          <div className="relative">
            <MagnifyingGlass
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--hero-muted)",
              }}
            />
            <input
              data-testid={IDS.inventorySearch}
              className="field field-sm mono"
              placeholder="Search part no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30, width: 260 }}
            />
          </div>
        </div>
        {items.length === 0 ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No inventory items yet. Upload an Excel file above.
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
            <table className="hero-table" data-testid={IDS.inventoryTable}>
              <thead>
                <tr>
                  <th>Part No.</th>
                  <th>Description</th>
                  <th className="num">Stock Qty</th>
                  <th>Location</th>
                  <th className="num">Rate</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="font-mono">{it.part_no}</td>
                    <td>{it.description}</td>
                    <td className="num">{it.stock_qty}</td>
                    <td className="font-mono">{it.location || "-"}</td>
                    <td className="num">{it.rate || "-"}</td>
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
