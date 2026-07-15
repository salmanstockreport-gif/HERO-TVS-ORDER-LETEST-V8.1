import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SystemProvider } from "@/context/SystemContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import SelectSystem from "@/pages/SelectSystem";
import Dashboard from "@/pages/Dashboard";
import OrdersList from "@/pages/OrdersList";
import OrderEditor from "@/pages/OrderEditor";
import Inventory from "@/pages/Inventory";
import Settings from "@/pages/Settings";
import ImportantParts from "@/pages/ImportantParts";
import MandatoryParts from "@/pages/MandatoryParts";
import Employees from "@/pages/Employees";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="p-10">
        <div className="overline">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <SystemProvider>
        <BrowserRouter>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#141414",
                border: "1px solid #2a2a2a",
                color: "#ffffff",
                fontFamily: "IBM Plex Sans, sans-serif",
                fontSize: "13px",
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/select-system"
              element={
                <Protected>
                  <SelectSystem />
                </Protected>
              }
            />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="/orders/new" element={<OrderEditor />} />
              <Route path="/orders/current" element={<OrdersList status="current" />} />
              <Route path="/orders/sent" element={<OrdersList status="sent" />} />
              <Route path="/orders/:orderId" element={<OrderEditor />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/important-parts" element={<ImportantParts />} />
              <Route path="/mandatory-parts" element={<MandatoryParts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/employees" element={<Employees />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SystemProvider>
    </AuthProvider>
  );
}

export default App;
