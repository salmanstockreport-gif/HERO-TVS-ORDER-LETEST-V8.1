import React, { useEffect, useState } from "react";
import { Plus, Trash, PencilSimple, X, Check, User } from "@phosphor-icons/react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";

const emptyPerms = () => ({
  orders_create_edit: true,
  orders_delete: false,
  orders_mark_sent: true,
  search_ecatalogue: true,
  inventory_view: true,
  inventory_upload: false,
  manage_important_parts: false,
  manage_mandatory_parts: false,
  change_discount: false,
  backup_restore: false,
});

export default function Employees() {
  const { isOwner } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [permKeys, setPermKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, ...form}

  const load = () => {
    setLoading(true);
    Promise.all([api.get("/employees"), api.get("/permissions/keys")])
      .then(([e, p]) => {
        setEmployees(e.data);
        setPermKeys(p.data.keys);
      })
      .catch((err) => toast.error(formatApiError(err.response?.data?.detail)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (!isOwner) return <Navigate to="/" replace />;

  const startCreate = () => {
    setEditing({
      id: null,
      username: "",
      password: "",
      systems: ["hero"],
      permissions: emptyPerms(),
    });
  };

  const startEdit = (emp) => {
    setEditing({
      id: emp.id,
      username: emp.username,
      password: "",
      systems: [...(emp.systems || ["hero"])],
      permissions: { ...emptyPerms(), ...(emp.permissions || {}) },
    });
  };

  const closeEditor = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        const body = {
          systems: editing.systems,
          permissions: editing.permissions,
        };
        if (editing.password) body.password = editing.password;
        await api.put(`/employees/${editing.id}`, body);
        toast.success("Employee updated");
      } else {
        if (!editing.username.trim() || !editing.password) {
          toast.error("Username and password are required");
          return;
        }
        await api.post("/employees", {
          username: editing.username.trim(),
          password: editing.password,
          systems: editing.systems,
          permissions: editing.permissions,
        });
        toast.success("Employee created");
      }
      closeEditor();
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const remove = async (emp) => {
    if (!window.confirm(`Delete employee "${emp.username}"?`)) return;
    try {
      await api.delete(`/employees/${emp.id}`);
      toast.success("Employee deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const toggleSystem = (sys) => {
    setEditing((e) => {
      const set = new Set(e.systems);
      if (set.has(sys)) set.delete(sys);
      else set.add(sys);
      let arr = Array.from(set);
      if (arr.length === 0) arr = [sys]; // enforce at least one
      return { ...e, systems: arr };
    });
  };

  const togglePerm = (key) => {
    setEditing((e) => ({
      ...e,
      permissions: { ...e.permissions, [key]: !e.permissions[key] },
    }));
  };

  return (
    <div className="page p-10 max-w-6xl" data-testid="employees-page">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap actions-row">
        <div>
          <div className="overline mb-2">Team</div>
          <h1 className="font-display font-bold text-4xl page-title">Employees</h1>
          <p className="text-sm mt-2" style={{ color: "var(--hero-muted)" }}>
            Give your team members their own login with fine-grained
            permissions and system access.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={startCreate}
          data-testid="employees-add-btn"
        >
          <Plus size={16} weight="bold" /> Add employee
        </button>
      </div>

      <div className="card" data-testid="employees-table">
        {loading ? (
          <div
            className="p-12 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            Loading…
          </div>
        ) : employees.length === 0 ? (
          <div
            className="p-12 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No employees yet. Add one to give a team member their own login.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="hero-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Systems</th>
                  <th>Permissions</th>
                  <th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const permCount = Object.values(e.permissions || {}).filter(Boolean).length;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <User size={14} weight="bold" />
                          <span className="font-mono">{e.username}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {(e.systems || []).map((s) => (
                            <span
                              key={s}
                              className="badge"
                              style={{
                                background:
                                  s === "hero"
                                    ? "rgba(227,24,55,0.15)"
                                    : "rgba(30,58,138,0.20)",
                                color: s === "hero" ? "#fca5a5" : "#93c5fd",
                                borderColor:
                                  s === "hero"
                                    ? "rgba(227,24,55,0.4)"
                                    : "rgba(30,58,138,0.5)",
                              }}
                            >
                              {s.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-xs" style={{ color: "var(--hero-muted)" }}>
                        {permCount} / {permKeys.length} enabled
                      </td>
                      <td className="center">
                        <div className="flex justify-center gap-2">
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => startEdit(e)}
                            data-testid={`employees-edit-${e.username}`}
                          >
                            <PencilSimple size={12} /> Edit
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{
                              padding: "4px 8px",
                              fontSize: 11,
                              color: "#f87171",
                            }}
                            onClick={() => remove(e)}
                            data-testid={`employees-delete-${e.username}`}
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={closeEditor}
        >
          <div
            className="card"
            style={{
              width: "min(720px, 95vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--hero-surface)",
              border: "1px solid var(--hero-border)",
              padding: 28,
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="employees-editor"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="overline">
                  {editing.id ? "Edit employee" : "New employee"}
                </div>
                <div className="font-display font-bold text-xl">
                  {editing.id ? editing.username : "Add a team member"}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={closeEditor}>
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {!editing.id && (
                <div>
                  <label className="overline block mb-2">Username</label>
                  <input
                    className="field mono"
                    value={editing.username}
                    onChange={(ev) =>
                      setEditing((e) => ({
                        ...e,
                        username: ev.target.value,
                      }))
                    }
                    autoComplete="off"
                    data-testid="employees-form-username"
                  />
                </div>
              )}
              <div>
                <label className="overline block mb-2">
                  {editing.id ? "New password (leave blank to keep)" : "Password"}
                </label>
                <input
                  className="field mono"
                  type="password"
                  value={editing.password}
                  onChange={(ev) =>
                    setEditing((e) => ({ ...e, password: ev.target.value }))
                  }
                  autoComplete="new-password"
                  data-testid="employees-form-password"
                />
              </div>

              <div>
                <label className="overline block mb-2">Systems</label>
                <div className="flex gap-2 flex-wrap">
                  {["hero", "tvs"].map((s) => {
                    const active = editing.systems.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSystem(s)}
                        className={`btn ${active ? "btn-primary" : "btn-outline"}`}
                        style={{ padding: "6px 14px", fontSize: 12 }}
                        data-testid={`employees-form-system-${s}`}
                      >
                        {active && <Check size={12} weight="bold" />}
                        {s.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="overline block mb-3">Permissions</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {permKeys.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                      style={{
                        background: "var(--hero-surface-2)",
                        border: "1px solid var(--hero-border)",
                        padding: "10px 12px",
                        borderRadius: 3,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!editing.permissions[p.key]}
                        onChange={() => togglePerm(p.key)}
                        data-testid={`employees-form-perm-${p.key}`}
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button className="btn btn-outline" onClick={closeEditor}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={save}
                  data-testid="employees-form-save"
                >
                  {editing.id ? "Save changes" : "Create employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
