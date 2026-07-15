import React, { useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Motorcycle, ArrowRight, Gear, SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useSystem, SYSTEMS } from "@/context/SystemContext";

function SystemCard({ meta, onPick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      data-testid={`select-system-${meta.key}`}
      className="system-card"
      style={{
        textAlign: "left",
        background: "var(--hero-surface)",
        border: "1px solid var(--hero-border)",
        borderRadius: "6px",
        padding: "36px 32px",
        color: "var(--hero-text)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "transform 0.18s ease, border-color 0.18s ease",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        minHeight: 240,
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = meta.accent;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--hero-border)";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: meta.accent,
        }}
      />
      <div className="flex items-start justify-between">
        <div
          className="w-14 h-14 flex items-center justify-center"
          style={{
            background: `${meta.accent}22`,
            border: `1px solid ${meta.accent}66`,
            borderRadius: 4,
          }}
        >
          <Motorcycle size={26} color={meta.accent} weight="fill" />
        </div>
        <div className="overline" style={{ color: meta.accent }}>
          {meta.key.toUpperCase()}
        </div>
      </div>
      <div>
        <div className="font-display font-bold" style={{ fontSize: 26, lineHeight: 1.1 }}>
          {meta.label}
        </div>
        <div className="text-sm mt-2" style={{ color: "var(--hero-muted)" }}>
          {meta.subtitle}
        </div>
      </div>
      <div
        className="flex items-center gap-2 text-sm"
        style={{ marginTop: "auto", color: meta.accent, fontWeight: 600 }}
      >
        <span>Open {meta.partsLabel}</span>
        <ArrowRight size={14} weight="bold" />
      </div>
    </button>
  );
}

export default function SelectSystem() {
  const { user, isOwner, logout } = useAuth();
  const { system, setSystem } = useSystem();
  const navigate = useNavigate();

  const allowed = user?.systems || [];

  // If already have a system selected, redirect to dashboard.
  useEffect(() => {
    if (system && allowed.includes(system)) {
      navigate("/", { replace: true });
    } else if (!isOwner && allowed.length === 1) {
      setSystem(allowed[0]);
      navigate("/", { replace: true });
    }
  }, [system, allowed, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Navigate to="/login" replace />;

  const pick = (key) => {
    setSystem(key);
    navigate("/", { replace: true });
  };

  return (
    <div
      data-testid="select-system-page"
      style={{
        minHeight: "100vh",
        background: "var(--hero-bg)",
        color: "var(--hero-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="px-10 py-6 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--hero-border)" }}
      >
        <div className="flex items-center gap-3">
          <img
            src="/kabir-logo.jpg"
            alt="Kabir Auto Parts"
            style={{
              width: 40,
              height: 40,
              objectFit: "cover",
              borderRadius: 3,
              background: "#fff",
            }}
          />
          <div>
            <div className="overline">Kabir Auto Parts</div>
            <div className="font-display font-bold text-sm">Multi-brand Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs" style={{ color: "var(--hero-muted)" }}>
            Signed in as{" "}
            <span className="font-mono" style={{ color: "var(--hero-text)" }}>
              {user.username}
            </span>
          </div>
          {isOwner && (
            <button
              className="btn btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => navigate("/settings/employees")}
              data-testid="select-system-employees-btn"
            >
              <Gear size={14} /> Employees
            </button>
          )}
          <button
            className="btn btn-outline"
            style={{ padding: "6px 12px", fontSize: 12 }}
            onClick={logout}
          >
            <SignOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center px-6"
        style={{ padding: "80px 24px" }}
      >
        <div className="overline mb-3">Choose a system</div>
        <h1
          className="font-display font-bold text-center mb-2"
          style={{ fontSize: 42, lineHeight: 1.1 }}
        >
          Which parts brand today?
        </h1>
        <p
          className="text-center text-sm max-w-md mb-10"
          style={{ color: "var(--hero-muted)" }}
        >
          You can switch anytime from the sidebar. Inventory is shared across
          both systems.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(280px, 340px))",
            gap: 24,
            width: "100%",
            maxWidth: 760,
          }}
        >
          {Object.values(SYSTEMS).map((meta) => (
            <SystemCard
              key={meta.key}
              meta={meta}
              onPick={() => pick(meta.key)}
              disabled={!isOwner && !allowed.includes(meta.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
