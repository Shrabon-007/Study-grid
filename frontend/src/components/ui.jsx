import { Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, initials } from "../lib/api";
import { DASHBOARD_PATHS, NAV_ITEMS, ROLE_LABELS } from "../lib/constants";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ role, children }) {
  const { session, loading } = useAuth();
  if (loading) return <main className="screen-center"><Spinner label="Restoring your session…" /></main>;
  if (!session) return <Navigate to="/login" replace />;
  if (role && session.role !== role) return <Navigate to={DASHBOARD_PATHS[session.role] || "/login"} replace />;
  return children;
}

export function PortalLayout({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = session?.role;
  const handleLogout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* local logout still succeeds */ }
    logout();
    navigate("/login");
  };
  const navItems = NAV_ITEMS[role] || [];
  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to={DASHBOARD_PATHS[role]} onClick={() => setMenuOpen(false)}>
          <span>Academic Radar</span><small>{ROLE_LABELS[role]} Portal</small>
        </Link>
        <div className="user-menu">
          <span className={`avatar avatar-${role}`}>{initials(session?.name)}</span>
          <span className="user-name">{session?.name}<small>{ROLE_LABELS[role]}</small></span>
          <button className="icon-button menu-toggle" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Toggle navigation">☰</button>
          <button className="logout-button" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    </header>
    <nav className={`nav-links ${menuOpen ? "nav-open" : ""}`} aria-label="Portal navigation">
      {navItems.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => `nav-link ${isActive || (path.endsWith("dashboard") && location.pathname === "/") ? "active" : ""}`} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
      <button className="mobile-logout" onClick={handleLogout}>Log out</button>
    </nav>
    <main className="page">{children}</main>
  </div>;
}

export function PageTitle({ title, subtitle, actions }) {
  return <div className="page-heading"><div><h1 className="section-title">{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Card({ children, className = "" }) { return <section className={`card ${className}`}>{children}</section>; }
export function EmptyState({ children = "Nothing to show yet." }) { return <p className="empty-state">{children}</p>; }
export function Spinner({ label = "Loading…" }) { return <div className="spinner-wrap"><span className="spinner" />{label}</div>; }

export function NoticeBadge({ priority = "normal" }) { return <span className={`badge priority-${String(priority).toLowerCase()}`}>{priority}</span>; }
export function RiskBadge({ value = "—" }) { return <span className={`badge risk-${String(value).toLowerCase()}`}>{value}</span>; }

export function DataTable({ columns, children, empty, className = "" }) {
  return <div className={`table-wrap ${className}`}><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{children || <tr><td colSpan={columns.length}><EmptyState>{empty}</EmptyState></td></tr>}</tbody></table></div>;
}

export function Toast({ message, type = "success", onClose }) {
  if (!message) return null;
  return <div className={`toast toast-${type}`} role="status"><span>{message}</span><button onClick={onClose} aria-label="Close notification">×</button></div>;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  };
  return { toast, show, close: () => setToast(null) };
}
