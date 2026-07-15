import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Navigate } from "react-router-dom";
import { IDS } from "@/lib/testIds";
import { formatApiError } from "@/lib/api";
import { Wrench, ArrowRight } from "@phosphor-icons/react";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(username, password);
      const u = data.user;
      // Auto-pick sole system for single-system employees; else send to selector.
      if (u.role !== "owner" && Array.isArray(u.systems) && u.systems.length === 1) {
        localStorage.setItem("hmc_system", u.systems[0]);
        navigate("/");
      } else {
        navigate("/select-system");
      }
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid={IDS.loginPage} className="login-shell"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 480px",
        backgroundColor: "var(--hero-bg)",
      }}
    >
      <div className="login-hero"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('https://images.unsplash.com/photo-1596466588448-6e6ceb1da41c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwxfHxtb3RvcmN5Y2xlJTIwZW5naW5lJTIwcGFydHMlMjBtYWNybyUyMHBob3RvZ3JhcGh5fGVufDB8fHx8MTc4MzkzMzYwOHww&ixlib=rb-4.1.0&q=85')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: "64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div className="overline mb-4">Kabir Auto Parts · Multi-brand Portal</div>
        <h1
          className="font-display"
          style={{ fontSize: "56px", lineHeight: "1.05", fontWeight: 900 }}
        >
          Hero &amp; TVS
          <br />
          <span style={{ color: "var(--hero-primary)" }}>Parts Ordering</span>
        </h1>
        <p
          className="mt-6 max-w-md"
          style={{ color: "var(--hero-muted)", fontSize: "14px" }}
        >
          One portal for Hero MotoCorp and TVS Motor parts. Search either
          eCatalogue, share one inventory sheet, and manage orders with fine
          employee-level permissions.
        </p>
      </div>
      <div className="login-form-panel"
        style={{
          padding: "64px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderLeft: "1px solid var(--hero-border)",
        }}
      >
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/kabir-logo.jpg"
            alt="Kabir Auto Parts"
            style={{
              width: 44,
              height: 44,
              objectFit: "cover",
              borderRadius: "3px",
              background: "#fff",
            }}
          />
          <div>
            <div className="overline">Kabir Auto Parts</div>
            <div className="font-display font-bold text-lg">Sign in</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="overline block mb-2">Username</label>
            <input
              data-testid={IDS.loginUsername}
              className="field mono"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="overline block mb-2">Password</label>
            <input
              data-testid={IDS.loginPassword}
              className="field mono"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div
              data-testid={IDS.loginError}
              style={{
                border: "1px solid rgba(220,38,38,0.4)",
                background: "rgba(220,38,38,0.08)",
                color: "#fca5a5",
                padding: "10px 12px",
                fontSize: "12px",
                borderRadius: "2px",
              }}
            >
              {error}
            </div>
          )}
          <button
            data-testid={IDS.loginSubmit}
            className="btn btn-primary mt-2"
            disabled={loading}
          >
            <span>{loading ? "Signing in..." : "Sign in"}</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <div
          className="mt-10 text-xs"
          style={{ color: "var(--hero-muted)", lineHeight: 1.6 }}
        >
          Default:{" "}
          <span className="font-mono" style={{ color: "var(--hero-text)" }}>
            admin
          </span>{" "}
          /{" "}
          <span className="font-mono" style={{ color: "var(--hero-text)" }}>
            admin123
          </span>
        </div>
      </div>
    </div>
  );
}
