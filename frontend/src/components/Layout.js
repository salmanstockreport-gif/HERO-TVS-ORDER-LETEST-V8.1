import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  ArrowsLeftRight,
  Users,
  Motorcycle,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useSystem, SYSTEMS } from "@/context/SystemContext";
import { IDS } from "@/lib/testIds";
import useInventoryStatus from "@/hooks/useInventoryStatus";
import InventoryLockOverlay from "@/components/InventoryLockOverlay";
import InventoryFreshnessBadge, {
  InventoryBanner,
} from "@/components/InventoryFreshnessBadge";

const NavItem = ({ to, icon: Icon, label, testId, end, onClick, hidden }) => {
  if (hidden) return null;
  return (
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
};

export default function Layout() {
  const { user, logout, isOwner, hasPermission } = useAuth();
  const { system, meta, setSystem } = useSystem();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { status: invStatus } = useInventoryStatus();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // If no system chosen yet, kick to selector.
  if (!system || !meta) {
    const allowed = user?.systems || [];
    if (!isOwner && allowed.length === 1) {
      // Should be auto-set by SystemProvider; render nothing this tick.
      return null;
    }
    navigate("/select-system", { replace: true });
    return null;
  }

  const close = () => setMobileOpen(false);

  // Owners can always switch. Employees with more than one system can also switch.
  const canSwitch = isOwner || (user?.systems || []).length > 1;

  const switchSystem = () => {
    setSystem("");
    navigate("/select-system", { replace: true });
  };

  const brandStyle = {
    "--hero-primary": meta.accent,
    "--hero-primary-dim": meta.accentDeep,
  };

  return (
    <div className="app-shell" style={brandStyle} data-system={system}>
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
            <div className="text-[10px]" style={{ color: meta.accent, fontWeight: 700 }}>
              {meta.label}
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
        <div className="px-6 pb-4 flex items-center justify-between gap-3">
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
                {meta.subtitle}
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

        {/* System pill / switcher */}
        <div className="px-6 mb-3">
          <button
            onClick={canSwitch ? switchSystem : undefined}
            disabled={!canSwitch}
            data-testid="sidebar-system-switcher"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: `${meta.accent}18`,
              border: `1px solid ${meta.accent}55`,
              borderRadius: 3,
              color: "var(--hero-text)",
              cursor: canSwitch ? "pointer" : "default",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                background: meta.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2,
                flexShrink: 0,
              }}
            >
              <Motorcycle size={14} color="#fff" weight="fill" />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div className="text-[10px] overline" style={{ color: meta.accent }}>
                Active system
              </div>
              <div
                className="font-display font-bold"
                style={{ fontSize: 13, lineHeight: 1.1 }}
              >
                {meta.label}
              </div>
            </div>
            {canSwitch && (
              <ArrowsLeftRight
                size={14}
                weight="bold"
                style={{ color: meta.accent }}
              />
            )}
          </button>
        </div>

        {/* Freshness badge */}
        <div className="px-6 mb-3">
          <InventoryFreshnessBadge status={invStatus} />
        </div>

        <div className="divider mx-6" />
        <div className="flex-1 flex flex-col gap-1">
          <NavItem end to="/" icon={Gauge} label="Dashboard" testId={IDS.sidebarDashboard} />
          <NavItem
            to="/orders/new"
            icon={Plus}
            label="New Order"
            testId={IDS.sidebarNewOrder}
            hidden={!isOwner && !hasPermission("orders_create_edit")}
          />
          <NavItem to="/orders/current" icon={ClipboardText} label="Current Orders" testId={IDS.sidebarCurrent} />
          <NavItem to="/orders/sent" icon={PaperPlaneTilt} label="Sent Orders" testId={IDS.sidebarSent} />
          <NavItem
            to="/inventory"
            icon={Package}
            label="Inventory"
            testId={IDS.sidebarInventory}
            hidden={!isOwner && !hasPermission("inventory_view")}
          />
          <NavItem
            to="/important-parts"
            icon={Star}
            label="Important Parts"
            testId={IDS.sidebarImportant}
          />
          <NavItem
            to="/mandatory-parts"
            icon={PushPin}
            label="Mandatory Parts"
            testId={IDS.sidebarMandatory}
          />
          <NavItem
            to="/settings"
            icon={Gear}
            label="Settings"
            testId={IDS.sidebarSettings}
          />
          <NavItem
            to="/settings/employees"
            icon={Users}
            label="Employees"
            testId="sidebar-employees"
            hidden={!isOwner}
          />
        </div>
        <div className="divider mx-6" />
        <div className="px-6 pb-4">
          <div className="text-[10px] overline mb-2">
            Signed in {isOwner ? "· Owner" : "· Employee"}
          </div>
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
