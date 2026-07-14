import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Gauge,
  ClipboardText,
  Package,
  Gear,
  SignOut,
  Plus,
  PaperPlaneTilt,
  List,
  X,
  Star,
  PushPin,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { IDS } from "@/lib/testIds";
import useInventoryStatus from "@/hooks/useInventoryStatus";
import InventoryLockOverlay from "@/components/InventoryLockOverlay";
import InventoryFreshnessBadge, {
  InventoryBanner,
} from "@/components/InventoryFreshnessBadge";

const NavItem = ({ to, icon: Icon, label, testId, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    data-testid={testId}
    onClick={onClick}
    className={({ isActive }) =>
      `sidebar-item ${isActive ? "active" : ""}`
    }
  >
    <Icon size={18} weight="regular" />
    <span>{label}</span>
  </NavLink>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { status: invStatus } = useInventoryStatus();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const close = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button
          data-testid="mobile-menu-toggle"
          onClick={() => setMobileOpen(true)}
          className="btn btn-ghost"
          style={{ padding: "6px 10px" }}
        >
          <List size={18} weight="bold" />
        </button>
        <div className="flex items-center gap-2">
          <img
            src="/kabir-logo.jpg"
            alt="Kabir Auto Parts"
            style={{
              width: 28,
              height: 28,
              objectFit: "cover",
              borderRadius: "2px",
              background: "#fff",
            }}
          />
          <div>
            <div
              className="font-display font-bold"
              style={{ fontSize: 13, lineHeight: 1 }}
            >
              Kabir Auto Parts
            </div>
          </div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div
        className={`sidebar-backdrop ${mobileOpen ? "visible" : ""}`}
        onClick={close}
      />

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/kabir-logo.jpg"
              alt="Kabir Auto Parts"
              style={{
                width: 40,
                height: 40,
                objectFit: "cover",
                borderRadius: "3px",
                background: "#fff",
              }}
            />
            <div>
              <div className="text-[10px] overline">Kabir Auto Parts</div>
              <div className="font-display font-bold text-sm">
                Hero Parts Ordering
              </div>
            </div>
          </div>
          <button
            onClick={close}
            className="btn btn-ghost md:hidden"
            style={{ padding: "4px", display: "none" }}
            data-mobile-close
          >
            <X size={16} />
          </button>
        </div>

        {/* Freshness badge */}
        <div className="px-6 mb-3">
          <InventoryFreshnessBadge status={invStatus} />
        </div>

        <div className="divider mx-6" />
        <div className="flex-1 flex flex-col gap-1">
          <NavItem end to="/" icon={Gauge} label="Dashboard" testId={IDS.sidebarDashboard} />
          <NavItem to="/orders/new" icon={Plus} label="New Order" testId={IDS.sidebarNewOrder} />
          <NavItem to="/orders/current" icon={ClipboardText} label="Current Orders" testId={IDS.sidebarCurrent} />
          <NavItem to="/orders/sent" icon={PaperPlaneTilt} label="Sent Orders" testId={IDS.sidebarSent} />
          <NavItem to="/inventory" icon={Package} label="Inventory" testId={IDS.sidebarInventory} />
          <NavItem to="/important-parts" icon={Star} label="Important Parts" testId={IDS.sidebarImportant} />
          <NavItem to="/mandatory-parts" icon={PushPin} label="Mandatory Parts" testId={IDS.sidebarMandatory} />
          <NavItem to="/settings" icon={Gear} label="Settings" testId={IDS.sidebarSettings} />
        </div>
        <div className="divider mx-6" />
        <div className="px-6 pb-4">
          <div className="text-[10px] overline mb-2">Signed in</div>
          <div
            className="font-mono text-sm mb-3"
            style={{ color: "var(--hero-text)" }}
          >
            {user?.username || "-"}
          </div>
          <button
            data-testid={IDS.headerLogout}
            onClick={logout}
            className="btn btn-outline w-full"
            style={{ padding: "6px 10px" }}
          >
            <SignOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 overflow-x-hidden">
        <InventoryBanner status={invStatus} />
        <Outlet />
      </main>

      {/* Full-screen lock overlay (rendered only when stale AND not on /inventory) */}
      <InventoryLockOverlay status={invStatus} />
    </div>
  );
}
