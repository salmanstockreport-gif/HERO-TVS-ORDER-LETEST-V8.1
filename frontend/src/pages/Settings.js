import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Percent,
  FloppyDisk,
  User,
  Key,
  Database,
  DownloadSimple,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import api, { formatApiError, API } from "@/lib/api";
import { IDS } from "@/lib/testIds";
import { useAuth } from "@/context/AuthContext";
import { useSystem } from "@/context/SystemContext";

export default function Settings() {
  const { user } = useAuth();
  const { meta } = useSystem();
  const brandName = meta?.label || "this system";
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);

  const [creds, setCreds] = useState({
    current_password: "",
    new_username: "",
    new_password: "",
    confirm_password: "",
  });
  const [credsSaving, setCredsSaving] = useState(false);

  // Database export/import state
  const dbFileRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // {file, meta}

  useEffect(() => {
    api.get("/settings").then((r) =>
      setDiscount(Number(r.data.discount_percent || 0)),
    );
  }, [meta?.key]);

  useEffect(() => {
    if (user?.username) {
      setCreds((c) => ({ ...c, new_username: user.username }));
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/discount", { discount_percent: Number(discount) });
      toast.success(`${brandName} DLP / discount saved`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCreds = async () => {
    if (!creds.current_password) {
      toast.error("Enter your current password");
      return;
    }
    if (creds.new_password && creds.new_password !== creds.confirm_password) {
      toast.error("New passwords do not match");
      return;
    }
    const payload = { current_password: creds.current_password };
    const nu = creds.new_username.trim().toLowerCase();
    if (nu && nu !== user?.username) payload.new_username = nu;
    if (creds.new_password) payload.new_password = creds.new_password;
    if (!payload.new_username && !payload.new_password) {
      toast.error("Change username or password to save");
      return;
    }
    setCredsSaving(true);
    try {
      const { data } = await api.put("/auth/change-credentials", payload);
      if (data.access_token) {
        localStorage.setItem("hmc_token", data.access_token);
        localStorage.setItem("hmc_user", JSON.stringify(data.user));
      }
      toast.success("Credentials updated · signing back in with new details");
      setTimeout(() => {
        localStorage.removeItem("hmc_token");
        localStorage.removeItem("hmc_user");
        window.location.href = "/login";
      }, 1200);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setCredsSaving(false);
    }
  };

  const exportDb = async () => {
    setExporting(true);
    try {
      const res = await api.get("/db/export", { responseType: "blob" });
      const cd = res.headers["content-disposition"] || "";
      const match = /filename="?([^";]+)"?/i.exec(cd);
      const name = match?.[1] || `hmcl-backup-${Date.now()}.json`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Database exported → ${name}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setExporting(false);
    }
  };

  const onImportFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null; // possibly truncated — we'll let the server repair it
      }

      if (parsed) {
        if (parsed?.app !== "hero-parts-ordering") {
          toast.error("Not a Hero Parts Ordering backup file.");
          if (dbFileRef.current) dbFileRef.current.value = "";
          return;
        }
        const counts = Object.entries(parsed.collections || {}).map(
          ([k, v]) => [k, Array.isArray(v) ? v.length : 0],
        );
        setImportPreview({
          file,
          meta: {
            exported_at: parsed.exported_at,
            exported_by: parsed.exported_by,
            counts,
            truncated: false,
          },
        });
        return;
      }

      // Could not parse strictly. If it still looks like our backup, allow the
      // server to auto-repair a truncated download instead of blocking.
      if (text.includes('"hero-parts-ordering"')) {
        setImportPreview({
          file,
          meta: { exported_at: null, exported_by: null, counts: [], truncated: true },
        });
        toast.warning(
          "This backup looks incomplete/truncated — we'll try to repair it and restore what we can.",
        );
        return;
      }

      toast.error("Could not read backup file. Is it a valid Hero Parts Ordering backup?");
      if (dbFileRef.current) dbFileRef.current.value = "";
    } catch (err) {
      toast.error("Could not read backup file.");
      if (dbFileRef.current) dbFileRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!importPreview?.file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importPreview.file);
      const { data } = await api.post("/db/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const summary = Object.entries(data.imported || {})
        .map(([k, n]) => `${k} ${n}`)
        .join(" · ");
      if (data.recovered) {
        toast.warning(`Repaired & restored: ${summary}. Some trailing records may be missing.`);
      } else {
        toast.success(`Restored: ${summary}`);
      }
      setImportPreview(null);
      if (dbFileRef.current) dbFileRef.current.value = "";
      // Force sign-out because users collection may have been replaced
      setTimeout(() => {
        localStorage.removeItem("hmc_token");
        localStorage.removeItem("hmc_user");
        window.location.href = "/login";
      }, 1500);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div data-testid={IDS.settingsPage} className="page p-10 max-w-3xl">
      <div className="overline mb-2">Configuration</div>
      <h1 className="font-display font-bold text-4xl mb-8 page-title">Settings</h1>

      {/* Global Discount */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Percent size={16} color="var(--hero-primary)" />
          <div className="font-display text-lg font-semibold">
            {brandName} DLP / Discount
          </div>
        </div>
        <p
          className="text-xs mb-6"
          style={{ color: "var(--hero-muted)" }}
        >
          This DLP (discount) applies only to <b>{brandName}</b> — Hero and TVS
          each keep their own separate value. Applied by default to every part
          you add. Landed Price = MRP × (1 − discount / 100). You can still
          override per line-item inside an order.
        </p>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1" style={{ minWidth: 180 }}>
            <label className="overline block mb-2">Discount %</label>
            <input
              data-testid={IDS.settingsDiscount}
              className="field mono"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <button
            data-testid={IDS.settingsSaveDiscount}
            className="btn btn-primary"
            onClick={save}
            disabled={saving}
          >
            <FloppyDisk size={14} />
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>

        <div
          className="mt-6 p-4"
          style={{
            background: "var(--hero-surface-2)",
            border: "1px solid var(--hero-border)",
          }}
        >
          <div className="overline mb-2">Example</div>
          <div className="font-mono text-sm" style={{ color: "var(--hero-text)" }}>
            MRP <span style={{ color: "var(--hero-muted)" }}>₹1,000</span> →
            Landed{" "}
            <span style={{ color: "var(--hero-success)" }}>
              ₹{(1000 * (1 - Number(discount || 0) / 100)).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Account / Credentials */}
      <div className="card p-6" data-testid="settings-credentials-card">
        <div className="flex items-center gap-3 mb-1">
          <Key size={16} color="var(--hero-primary)" />
          <div className="font-display text-lg font-semibold">
            Account &amp; Credentials
          </div>
        </div>
        <p
          className="text-xs mb-6"
          style={{ color: "var(--hero-muted)" }}
        >
          Change your login username and/or password. You&apos;ll be signed out and
          asked to sign in again with the new details.
        </p>

        <div
          className="grid gap-4 mb-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          <div>
            <label className="overline block mb-2">Current password *</label>
            <input
              data-testid="settings-current-password"
              className="field mono"
              type="password"
              value={creds.current_password}
              onChange={(e) =>
                setCreds({ ...creds, current_password: e.target.value })
              }
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="overline block mb-2">Username</label>
            <input
              data-testid="settings-new-username"
              className="field mono"
              value={creds.new_username}
              onChange={(e) => setCreds({ ...creds, new_username: e.target.value })}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="overline block mb-2">New password</label>
            <input
              data-testid="settings-new-password"
              className="field mono"
              type="password"
              value={creds.new_password}
              onChange={(e) => setCreds({ ...creds, new_password: e.target.value })}
              placeholder="Leave blank to keep current"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="overline block mb-2">Confirm new password</label>
            <input
              data-testid="settings-confirm-password"
              className="field mono"
              type="password"
              value={creds.confirm_password}
              onChange={(e) =>
                setCreds({ ...creds, confirm_password: e.target.value })
              }
              autoComplete="new-password"
            />
          </div>
        </div>
        <button
          data-testid="settings-save-credentials"
          className="btn btn-primary"
          onClick={saveCreds}
          disabled={credsSaving}
        >
          <User size={14} weight="bold" />
          <span>{credsSaving ? "Updating…" : "Update credentials"}</span>
        </button>
      </div>

      {/* Database Backup */}
      <div
        className="card p-6 mt-6"
        data-testid="settings-database-card"
      >
        <div className="flex items-center gap-3 mb-1">
          <Database size={16} color="var(--hero-primary)" />
          <div className="font-display text-lg font-semibold">
            Database Backup
          </div>
        </div>
        <p className="text-xs mb-6" style={{ color: "var(--hero-muted)" }}>
          Export a full snapshot of your database (orders, inventory, important
          &amp; mandatory parts, settings and users) to a single JSON file — or
          restore from a previous backup. Useful when moving between machines
          or before major changes.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            data-testid="settings-export-db-btn"
            className="btn btn-primary"
            onClick={exportDb}
            disabled={exporting}
          >
            <DownloadSimple size={14} weight="bold" />
            <span>{exporting ? "Exporting…" : "Export database"}</span>
          </button>

          <input
            ref={dbFileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImportFileSelected}
            style={{ display: "none" }}
            data-testid="settings-import-db-file"
          />
          <button
            data-testid="settings-import-db-btn"
            className="btn btn-outline"
            onClick={() => dbFileRef.current?.click()}
            disabled={importing}
          >
            <UploadSimple size={14} weight="bold" />
            <span>Import database…</span>
          </button>
        </div>

        {/* Import preview / confirm */}
        {importPreview && (
          <div
            data-testid="settings-import-confirm"
            className="mt-6 p-4"
            style={{
              background: "rgba(227,24,55,0.06)",
              border: "1px solid rgba(227,24,55,0.35)",
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <Warning size={16} color="var(--hero-primary)" weight="fill" />
              <div>
                <div
                  className="font-display font-semibold"
                  style={{ color: "var(--hero-primary)" }}
                >
                  Confirm database restore
                </div>
                <div
                  className="text-xs mt-1"
                  style={{ color: "var(--hero-muted)" }}
                >
                  This will <b>wipe</b> the current database and replace it with
                  the file below. You will be signed out after restore.
                </div>
              </div>
            </div>
            <div
              className="text-xs font-mono mb-3"
              style={{ color: "var(--hero-text)" }}
            >
              <div>
                <b>File:</b> {importPreview.file.name} (
                {(importPreview.file.size / 1024).toFixed(1)} KB)
              </div>
              <div>
                <b>Exported at:</b> {importPreview.meta.exported_at || "—"}
              </div>
              <div>
                <b>Exported by:</b> {importPreview.meta.exported_by || "—"}
              </div>
              <div className="mt-2">
                <b>Collections:</b>
                <div className="mt-1">
                  {importPreview.meta.truncated ? (
                    <span
                      className="badge badge-stock-low"
                      style={{ marginRight: 6, marginBottom: 6 }}
                    >
                      file incomplete — will auto-repair &amp; restore recoverable records
                    </span>
                  ) : (
                    importPreview.meta.counts.map(([k, n]) => (
                      <span
                        key={k}
                        className="badge"
                        style={{ marginRight: 6, marginBottom: 6 }}
                      >
                        {k} · {n}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                data-testid="settings-import-confirm-btn"
                className="btn btn-primary"
                onClick={confirmImport}
                disabled={importing}
              >
                <UploadSimple size={14} weight="bold" />
                <span>
                  {importing ? "Restoring…" : "Yes, wipe & restore"}
                </span>
              </button>
              <button
                data-testid="settings-import-cancel-btn"
                className="btn btn-outline"
                onClick={() => {
                  setImportPreview(null);
                  if (dbFileRef.current) dbFileRef.current.value = "";
                }}
                disabled={importing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
