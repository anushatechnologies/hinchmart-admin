import { Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useToast } from "./ToastContext";
import "../styles/layout.css";

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const toast = useToast();

  // Listen for 403 Forbidden events from API interceptor
  useEffect(() => {
    const handleForbidden = (e) => {
      const msg = e?.detail?.message || "Access Denied: You do not have permissions for this action.";
      toast?.error(msg);
    };
    window.addEventListener("auth:forbidden", handleForbidden);
    return () => window.removeEventListener("auth:forbidden", handleForbidden);
  }, [toast]);

  // Close mobile drawer automatically when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Handle ESC key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className={`admin-layout ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className="main-area">
        <Topbar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          mobileOpen={mobileOpen}
          onToggleMobileMenu={() => setMobileOpen(!mobileOpen)}
        />

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

