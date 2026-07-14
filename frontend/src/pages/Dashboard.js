import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardText,
  PaperPlaneTilt,
  Package,
  CurrencyInr,
  Plus,
  ArrowRight,
  Warning,
  Star,
  Lock,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import api from "@/lib/api";
import { IDS } from "@/lib/testIds";

const Stat = ({ label, value, icon: Icon, accent = false, testId, href }) => (
  <Link
    to={href}
    className="card hoverable p-6 flex flex-col gap-4"
    data-testid={testId}
    style={{ textDecoration: "none", color: "var(--hero-text)" }}
  >
    <div className="flex items-start justify-between">
      <div className="overline">{label}</div>
      <div
        className="w-9 h-9 flex items-center justify-center"
        style={{
          background: accent ? "var(--hero-primary)" : "var(--hero-surface-2)",
          border: "1px solid var(--hero-border)",
        }}
      >
        <Icon size={18} color={accent ? "#fff" : "var(--hero-muted)"} />
      </div>
    </div>
    <div>
      <div
        className="font-display font-bold tabular stat-value"
        style={{ fontSize: "40px", lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  </Link>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
    api.get("/orders").then((r) => setRecentOrders(r.data.slice(0, 6)));
  }, []);

  const lowStock = stats?.low_stock_alerts || [];
  const ordersFull = !!stats?.current_orders_full;
  const ordersLimit = stats?.current_orders_limit ?? 2;

  const handleNewOrder = (e) => {
    if (ordersFull) {
      e.preventDefault();
      toast.error(
        `Limit reached: only ${ordersLimit} current orders allowed. Mark one as sent first.`,
      );
      navigate("/orders/current");
    }
  };

  return (
    <div data-testid={IDS.dashboardPage} className="page p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-10 gap-3 flex-wrap actions-row">
        <div>
          <div className="overline mb-2">Overview</div>
          <h1 className="font-display font-bold text-4xl page-title">Dashboard</h1>
        </div>
        <Link
          to="/orders/new"
          className={`btn btn-primary ${ordersFull ? "is-disabled" : ""}`}
          data-testid="dashboard-new-order-btn"
          onClick={handleNewOrder}
          aria-disabled={ordersFull}
          title={
            ordersFull
              ? `Limit reached: ${ordersLimit} current orders max`
              : undefined
          }
        >
          {ordersFull ? <Lock size={16} weight="bold" /> : <Plus size={16} weight="bold" />}
          <span>{ordersFull ? "Limit reached" : "New Order"}</span>
        </Link>
      </div>

      {ordersFull && (
        <div
          data-testid="dashboard-limit-banner"
          className="inv-banner"
          style={{ marginLeft: 0, marginRight: 0, marginBottom: 24 }}
        >
          <Lock size={16} weight="fill" />
          <div style={{ flex: 1 }}>
            <b>New orders locked.</b> You already have {stats?.current_orders} current orders (limit {ordersLimit}). Send one to Hero or delete it before starting a new one.
          </div>
          <Link
            to="/orders/current"
            className="btn btn-primary"
            style={{ padding: "6px 12px", fontSize: 11 }}
          >
            Open current
          </Link>
        </div>
      )}

      <div className="stat-grid grid grid-cols-4 gap-4 mb-10">
        <Stat
          label="Current Orders"
          value={stats?.current_orders ?? "—"}
          icon={ClipboardText}
          accent
          testId={IDS.statCurrent}
          href="/orders/current"
        />
        <Stat
          label="Sent Orders"
          value={stats?.sent_orders ?? "—"}
          icon={PaperPlaneTilt}
          testId={IDS.statSent}
          href="/orders/sent"
        />
        <Stat
          label="Inventory Items"
          value={stats?.inventory_items ?? "—"}
          icon={Package}
          testId={IDS.statInventory}
          href="/inventory"
        />
        <Stat
          label="Total Sent Value"
          value={
            stats
              ? `₹${Number(stats.total_sent_value).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}`
              : "—"
          }
          icon={CurrencyInr}
          testId={IDS.statTotalValue}
          href="/orders/sent"
        />
      </div>

      {/* Low stock alerts */}
      <div className="card mb-10" data-testid={IDS.lowStockCard}>
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--hero-border)" }}
        >
          <div className="flex items-center gap-2">
            <Star size={14} color="var(--hero-primary)" weight="fill" />
            <div className="overline">Low stock alerts</div>
            {lowStock.length > 0 && (
              <span
                className="badge"
                style={{
                  background: "rgba(227,24,55,0.12)",
                  color: "var(--hero-primary)",
                  borderColor: "rgba(227,24,55,0.4)",
                }}
              >
                <Warning size={11} /> {lowStock.length}
              </span>
            )}
          </div>
          <Link
            to="/important-parts"
            className="btn btn-ghost"
            style={{ fontSize: "12px" }}
          >
            Manage <ArrowRight size={14} />
          </Link>
        </div>
        {lowStock.length === 0 ? (
          <div
            className="text-sm py-10 text-center"
            style={{ color: "var(--hero-muted)" }}
          >
            {stats
              ? "No parts below threshold. Add important parts to monitor here."
              : "Loading…"}
          </div>
        ) : (
          <div>
            <div
              className="alert-row overline"
              style={{
                background: "var(--hero-surface-2)",
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              <div>Part No · Description</div>
              <div className="num">Threshold</div>
              <div className="num">In stock</div>
              <div className="num">Short by</div>
            </div>
            {lowStock.map((a) => {
              const shortBy = Math.max(0, a.threshold_qty - a.current_stock);
              return (
                <div key={a.id} className="alert-row">
                  <div>
                    <div className="font-mono">{a.part_no}</div>
                    {a.description && (
                      <div
                        className="col-desc text-xs"
                        style={{ color: "var(--hero-muted)", marginTop: 2 }}
                      >
                        {a.description}
                      </div>
                    )}
                  </div>
                  <div className="num">{a.threshold_qty}</div>
                  <div className="num stock-critical">{a.current_stock}</div>
                  <div className="num stock-critical">−{shortBy}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="overline mb-1">Recent orders</div>
            <div className="font-display font-bold text-xl">Latest activity</div>
          </div>
          <Link
            to="/orders/current"
            className="btn btn-ghost"
            style={{ fontSize: "12px" }}
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div
            className="text-sm py-16 text-center"
            style={{ color: "var(--hero-muted)" }}
          >
            No orders yet. Create your first order to get started.
          </div>
        ) : (
          <div className="table-scroll">
          <table className="hero-table">
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Status</th>
                <th>Items</th>
                <th className="num">Total</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => {
                const total = (o.items || []).reduce(
                  (s, it) => s + (it.line_total || 0),
                  0,
                );
                return (
                  <tr key={o.id}>
                    <td className="font-mono">{o.order_no}</td>
                    <td>
                      <span
                        className={`badge ${o.status === "current" ? "badge-current" : "badge-sent"}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="font-mono">{(o.items || []).length}</td>
                    <td className="num">₹{total.toFixed(2)}</td>
                    <td
                      className="font-mono text-xs"
                      style={{ color: "var(--hero-muted)" }}
                    >
                      {o.created_at?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="center">
                      <Link
                        to={`/orders/${o.id}`}
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                      >
                        Open <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
