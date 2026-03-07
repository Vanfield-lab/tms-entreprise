// src/app/AppShell.tsx
import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/context/ThemeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Types ────────────────────────────────────────────────────────────────────
type ClickNavItem   = { label: string; onClick: () => void };
type ElementNavItem = { label: string; element: ReactNode };
type NavItem        = ClickNavItem | ElementNavItem;

type Props = {
  title: string;
  nav?: ClickNavItem[];
  navItems?: ElementNavItem[];
  children?: ReactNode;
};

function isElementItem(item: NavItem): item is ElementNavItem {
  return "element" in item;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin:                "Administrator",
  corporate_approver:   "Corporate Resource Manager",
  transport_supervisor: "Transport Supervisor",
  driver:               "Driver",
  unit_head:            "Unit Head",
  staff:                "Staff",
};

const ROLE_COLORS: Record<string, string> = {
  admin:                "bg-[color:var(--purple)]",
  corporate_approver:   "bg-[color:var(--accent)]",
  transport_supervisor: "bg-[color:var(--green)]",
  driver:               "bg-[color:var(--cyan)]",
  unit_head:            "bg-[color:var(--amber)]",
  staff:                "bg-[color:var(--text-muted)]",
};

// ─── AppShell ─────────────────────────────────────────────────────────────────
export default function AppShell({ title, nav, navItems, children }: Props) {
  const { theme, toggleTheme } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [profile, setProfile] = useState<{ full_name: string; system_role: string } | null>(null);

  const items = useMemo<NavItem[]>(() => {
    if (navItems?.length) return navItems;
    if (nav?.length)      return nav;
    return [];
  }, [nav, navItems]);

  const hasProfile    = items.length > 0 && items[items.length - 1].label.toLowerCase().includes("profile");
  const baseItems     = hasProfile ? items.slice(0, -1) : items;
  const isProfileActive = hasProfile && activeIndex === items.length - 1;

  const go = (i: number) => {
    setActiveIndex(i);
    setSidebarOpen(false);
    const item = items[i];
    if (item && !isElementItem(item)) item.onClick();
  };

  const activeItem  = items[activeIndex];
  const activeLabel = activeItem?.label ?? title;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, system_role")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as any);
    })();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const roleLabel = ROLE_LABELS[profile?.system_role ?? ""] ?? profile?.system_role ?? "";
  const roleColor = ROLE_COLORS[profile?.system_role ?? ""] ?? "bg-[color:var(--text-muted)]";
  const initials  = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const ThemeToggle = () => (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="p-2 rounded-lg text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)] transition-colors"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="5" strokeWidth="2"/>
          <path strokeLinecap="round" strokeWidth="2" d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
        </svg>
      )}
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-[color:var(--bg)] overflow-hidden">

      {/* ── Mobile top bar ── */}
      <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-[color:var(--border)] bg-[color:var(--surface)] shrink-0 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] transition-colors"
          aria-label="Open menu"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>

        <span className="text-sm font-semibold text-[color:var(--text)]">{activeLabel}</span>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          {profile && (
            <div className={`w-8 h-8 rounded-full ${roleColor} flex items-center justify-center text-white text-xs font-bold`}>
              {initials}
            </div>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          w-72 lg:w-64 xl:w-72
          bg-[color:var(--surface)] border-r border-[color:var(--border)]
          transition-transform duration-200 ease-in-out
          lg:static lg:z-auto lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>

          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-[color:var(--border)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[color:var(--text)] flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1" fill="var(--bg)"/>
                  <rect x="9" y="1" width="6" height="6" rx="1" fill="var(--bg)" opacity=".5"/>
                  <rect x="1" y="9" width="6" height="6" rx="1" fill="var(--bg)" opacity=".5"/>
                  <rect x="9" y="9" width="6" height="6" rx="1" fill="var(--bg)"/>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[color:var(--text)] leading-tight">TMS Portal</div>
                <div className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-widest truncate">{title}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle />
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-[color:var(--surface-2)] text-[color:var(--text-muted)] transition-colors"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 18 18">
                  <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {baseItems.map((item, i) => {
              const isActive = i === activeIndex && !isProfileActive;
              return (
                <button
                  key={i}
                  onClick={() => go(i)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left
                    transition-all min-h-[44px] group
                    ${isActive
                      ? "bg-[color:var(--text)] text-[color:var(--bg)] shadow-sm"
                      : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
                    }
                  `}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors
                    ${isActive
                      ? "bg-[color:var(--bg)]"
                      : "bg-[color:var(--border-bright)] group-hover:bg-[color:var(--text-muted)]"
                    }`}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-[color:var(--border)] px-4 py-4 shrink-0 space-y-1">
          

            {!hasProfile && profile && (
              <div className="flex items-center gap-3 p-2">
                <div className={`w-9 h-9 rounded-full ${roleColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[color:var(--text)] truncate">{profile.full_name}</div>
                  <div className="text-[11px] text-[color:var(--text-muted)] truncate">{roleLabel}</div>
                </div>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--red)]/10 hover:text-[color:var(--red)] transition-colors min-h-[44px]"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-[color:var(--bg)]">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">

            {/* Desktop page header */}
            <div className="hidden lg:flex items-center justify-between mb-6">
  <div>
    <h1 className="text-xl font-bold text-[color:var(--text)] tracking-tight">{activeLabel}</h1>
    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">{roleLabel}</p>
  </div>
  {profile && (
    <button
      onClick={() => hasProfile ? go(items.length - 1) : undefined}
      title={hasProfile ? "Edit profile" : profile.full_name}
      className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-[color:var(--surface-2)] transition-colors group"
    >
      <span className="text-sm text-[color:var(--text-muted)] group-hover:text-[color:var(--text)] transition-colors">
        {profile.full_name}
      </span>
      <div className={`w-9 h-9 rounded-full ${roleColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
        {initials}
      </div>
    </button>
  )}
</div>

            <ErrorBoundary>
              {activeItem && isElementItem(activeItem) ? activeItem.element : children}
            </ErrorBoundary>
          </div>
        </main>

      </div>
    </div>
  );
}