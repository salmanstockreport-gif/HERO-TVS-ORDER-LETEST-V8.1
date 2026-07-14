import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { IDS } from "@/lib/testIds";
import { toast } from "sonner";

export default function OrdersList({ status }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api
      .get(`/orders?status=${status}`)
      .then((r) => setOrders(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const remove = async (id, orderNo) => {
    if (!window.confirm(`Delete order ${orderNo}?`)) return;
    await api.delete(`/orders/${id}`);
    toast.success("Order deleted");
    load();
  };

  const title = status === "current" ? "Current Orders" : "Sent Orders";
  const subtitle =
    status === "current"
      ? "Drafts you're still editing before dispatch."
      : "Orders you've marked as sent to Hero MotoCorp.";

  return (
    <div className="page p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-10 gap-4 flex-wrap actions-row">
        <div>
          <div className="overline mb-2">
            {status === "current" ? "Working set" : "Archive"}
          </div>
          <h1 className="font-display font-bold text-4xl page-title">{title}</h1>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--hero-muted)" }}
          >
            {subtitle}
          </p>
        </div>
        {status === "current" && (
          <button
            data-testid={IDS.createOrderBtn}
            className="btn btn-primary"
            onClick={() => navigate("/orders/new")}
          >
            <Plus size={16} weight="bold" />
            <span>New Order</span>
          </button>
        )}
      </div>

      <div data-testid={IDS.ordersList} className="card">
        {loading ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <div
            className="p-16 text-center text-sm"
            style={{ color: "var(--hero-muted)" }}
          >
            No {status} orders yet.
          </div>
        ) : (
          <div className="table-scroll">
          <table className="hero-table">
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Created</th>
                {status === "sent" && <th>Sent</th>}
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const total = (o.items || []).reduce(
                  (s, it) => s + (it.line_total || 0),
                  0,
                );
                return (
                  <tr key={o.id} data-testid={`${IDS.orderRowPrefix}${o.order_no}`}>
                    <td className="font-mono">
                      <Link
                        to={`/orders/${o.id}`}
                        style={{ color: "var(--hero-text)" }}
                      >
                        {o.order_no}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`badge ${o.status === "current" ? "badge-current" : "badge-sent"}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="num">{(o.items || []).length}</td>
                    <td className="num">₹{total.toFixed(2)}</td>
                    <td
                      className="font-mono text-xs"
                      style={{ color: "var(--hero-muted)" }}
                    >
                      {o.created_at?.slice(0, 16).replace("T", " ")}
                    </td>
                    {status === "sent" && (
                      <td
                        className="font-mono text-xs"
                        style={{ color: "var(--hero-muted)" }}
                      >
                        {o.sent_at?.slice(0, 16).replace("T", " ") || "-"}
                      </td>
                    )}
                    <td className="center">
                      <div className="flex justify-center gap-2">
                        <Link
                          to={`/orders/${o.id}`}
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          Open <ArrowRight size={12} />
                        </Link>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "11px", color: "#f87171" }}
                          onClick={() => remove(o.id, o.order_no)}
                          data-testid={`delete-order-${o.order_no}`}
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
    </div>
  );
}
