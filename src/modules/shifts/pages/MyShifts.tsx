// src/modules/shifts/pages/MyShifts.tsx
// FIX #1: Full dark mode via CSS variables (no hardcoded Tailwind colors)
// FIX #7: Only Morning, Evening, Off shift labels
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Shift = {
  shift_date: string;
  effective_shift_code: string;
  base_shift_code: string;
  override_shift_code: string | null;
  is_working: boolean;
  is_overridden: boolean;
};

const SHIFT_META: Record<string, { label: string; time: string; icon: string; color: string; bg: string }> = {
  MORNING: { label: "Morning Shift",  time: "06:00 – 18:00", icon: "🌅", color: "var(--amber)",  bg: "rgba(217,119,6,0.10)"  },
  EVENING: { label: "Evening Shift",  time: "18:00 – 06:00", icon: "🌙", color: "var(--accent)", bg: "rgba(37,99,235,0.10)"  },
  OFF:     { label: "Off Duty",       time: "Rest day",       icon: "💤", color: "var(--text-muted)", bg: "var(--surface-2)" },
  // Fallback for any legacy codes from DB
  A:       { label: "Morning Shift",  time: "06:00 – 14:00", icon: "🌅", color: "var(--amber)",  bg: "rgba(217,119,6,0.10)"  },
  B:       { label: "Evening Shift",  time: "14:00 – 22:00", icon: "🌙", color: "var(--accent)", bg: "rgba(37,99,235,0.10)"  },
  C:       { label: "Night Shift",    time: "22:00 – 06:00", icon: "🌙", color: "var(--purple)", bg: "rgba(124,58,237,0.10)" },
  D:       { label: "Standby",        time: "08:00 – 16:00", icon: "📡", color: "var(--cyan)",   bg: "rgba(8,145,178,0.10)"  },
  REST:    { label: "Off Duty",       time: "Rest day",       icon: "💤", color: "var(--text-muted)", bg: "var(--surface-2)" },
};

function getShiftMeta(code: string) {
  return SHIFT_META[code] ?? { label: code, time: "", icon: "📋", color: "var(--text-muted)", bg: "var(--surface-2)" };
}

const todayStr = new Date().toISOString().slice(0, 10);

export default function MyShifts() {
  const [shifts,  setShifts]  = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;

      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", me.user.id)
        .single();

      if (!driver) { setLoading(false); return; }

      const { data } = await supabase
        .from("v_driver_shifts")
        .select("shift_date,effective_shift_code,base_shift_code,override_shift_code,is_working,is_overridden")
        .eq("driver_id", driver.id)
        .order("shift_date");

      setShifts((data as Shift[]) || []);
      setLoading(false);
    })();
  }, []);

  const upcoming = shifts.filter(s => s.shift_date >= todayStr);
  const past     = shifts.filter(s => s.shift_date <  todayStr).reverse();
  const visible  = view === "upcoming" ? upcoming : past;

  // Today's shift
  const todayShift = shifts.find(s => s.shift_date === todayStr);
  const todayMeta  = todayShift ? getShiftMeta(todayShift.effective_shift_code) : null;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">My Shifts</h1>
        <p className="page-sub">{upcoming.length} upcoming · {past.length} past</p>
      </div>

      {/* Today's shift hero */}
      {todayMeta && (
        <div style={{
          padding: "20px 24px",
          borderRadius: 16,
          background: todayMeta.bg,
          border: `1px solid ${todayMeta.color}33`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>{todayMeta.icon}</div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>TODAY</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: todayMeta.color }}>{todayMeta.label}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{todayMeta.time}</div>
            {todayShift?.is_overridden && (
              <span style={{ fontSize: 11, background: "var(--amber-dim)", color: "var(--amber)", padding: "2px 8px", borderRadius: 8, marginTop: 6, display: "inline-block" }}>
                ✏️ Override applied
              </span>
            )}
          </div>
        </div>
      )}

      {!todayShift && (
        <div className="alert alert-info">
          <span className="alert-icon">ℹ</span>
          <span className="alert-content">No shift assigned for today yet.</span>
        </div>
      )}

      {/* Tab toggle */}
      <div className="tab-group">
        <button className={`tab-item ${view === "upcoming" ? "active" : ""}`} onClick={() => setView("upcoming")}>
          Upcoming
          {upcoming.length > 0 && <span className="count-pill">{upcoming.length}</span>}
        </button>
        <button className={`tab-item ${view === "past" ? "active" : ""}`} onClick={() => setView("past")}>
          Past
          {past.length > 0 && <span className="count-pill">{past.length}</span>}
        </button>
      </div>

      {/* Shifts list */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--text-muted)" }}>
          No {view} shifts.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(s => {
            const meta   = getShiftMeta(s.effective_shift_code);
            const isToday = s.shift_date === todayStr;
            return (
              <div key={s.shift_date} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 14,
                background: isToday ? meta.bg : "var(--surface)",
                border: `1px solid ${isToday ? meta.color + "44" : "var(--border)"}`,
              }}>
                {/* Date */}
                <div style={{ minWidth: 52, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? meta.color : "var(--text)" }}>
                    {new Date(s.shift_date + "T00:00:00").getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    {new Date(s.shift_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 36, background: "var(--border)" }} />

                {/* Shift info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{meta.label}</span>
                    {isToday && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: meta.color, color: "#fff", fontWeight: 700 }}>TODAY</span>
                    )}
                    {s.is_overridden && (
                      <span style={{ fontSize: 10, color: "var(--amber)" }}>✏️ override</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {meta.time} · {new Date(s.shift_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" })}
                  </div>
                </div>

                {/* Working indicator */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: s.is_working ? "var(--green)" : "var(--border)",
                }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}