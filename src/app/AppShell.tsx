// src/app/AppShell.tsx
// Updated: notification bell added to header
import { ReactNode, useMemo, useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";

const ProfilePage = lazy(() => import("../pages/profile/ProfilePage"));

type ClickNavItem = { label: string; onClick: () => void };
type ElementNavItem = { label: string; element: ReactNode };
type NavItem = ClickNavItem | ElementNavItem;

type Props = {
  title: string;
  nav?: ClickNavItem[];
  navItems?: ElementNavItem[];
  children?: ReactNode;
};

function isElementItem(item: NavItem): item is ElementNavItem {
  return "element" in item;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-rose-500",
  corporate_approver: "bg-violet-500",
  transport_supervisor: "bg-amber-500",
  driver: "bg-emerald-500",
  unit_head: "bg-sky-500",
  staff: "bg-slate-400",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  corporate_approver: "Corporate Approver",
  transport_supervisor: "Transport Supervisor",
  driver: "Driver",
  unit_head: "Unit Head",
  staff: "Staff",
};

const PROFILE_ITEM: ElementNavItem = {
  label: "My Profile",
  element: (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/></div>}>
      <ProfilePage />
    </Suspense>
  ),
};

export default function AppShell({ title, nav, navItems, children }: Props) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const baseItems = useMemo<NavItem[]>(() => {
    if (navItems?.length) return navItems;
    if (nav?.length) return nav;
    return [];
  }, [nav, navItems]);

  const items = useMemo<NavItem[]>(() => [...baseItems, PROFILE_ITEM], [baseItems]);

  const activeItem = items[activeIndex];
  const activeLabel = activeItem?.label ?? title;

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const go = (i: number) => {
    setActiveIndex(i);
    setSidebarOpen(false);
    const item = items[i];
    if (item && !isElementItem(item)) item.onClick();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const roleColor = ROLE_COLORS[profile?.system_role ?? ""] ?? "bg-slate-400";
  const roleLabel = ROLE_LABELS[profile?.system_role ?? ""] ?? (profile?.system_role ?? "");
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">TMS</p>
            <p className="text-xs text-gray-400">{title}</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {items.map((item, i) => {
            const isLast = i === items.length - 1; // Profile is last
            const isActive = i === activeIndex;
            return (
              <button
                key={item.label}
                onClick={() => go(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? "bg-black text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                } ${isLast ? "mt-2 border-t border-gray-100 pt-4" : ""}`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full ${roleColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 truncate">{profile?.full_name ?? "—"}</p>
              <p className="text-[10px] text-gray-400">{roleLabel}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          <h2 className="font-semibold text-gray-900 flex-1 truncate">{activeLabel}</h2>

          {/* Notification bell */}
          <NotificationBell />

          {/* Avatar (mobile shortcut to profile) */}
          <button
            onClick={() => go(items.length - 1)}
            className="w-8 h-8 rounded-full shrink-0"
          >
            <div className={`w-8 h-8 rounded-full ${roleColor} flex items-center justify-center text-white text-xs font-bold`}>
              {initials}
            </div>
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 sm:px-6 py-5 overflow-y-auto">
          <ErrorBoundary>
            {isElementItem(activeItem) ? activeItem.element : children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}