// src/modules/shifts/pages/ScheduleManager.tsx
// FIX #1: Full dark mode CSS variables (no hardcoded Tailwind colors)
// FIX #7: Only Morning / Evening / Off on calendar; fixed RPC name to rpc_generate_schedule
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type ShiftRow = {
  driver_id: string;
  driver_name: string;
  license_number: string;
  shift_date: string;
  effective_shift_code: string;
  base_shift_code: string;
  override_shift_code: string | null;
  is_working: boolean;
  is_overridden: boolean;
};

type Plan = {
  id: string;
  plan_name: string;
  start_date: string;
  end_date: string;
  generated_at: string;
};

type OverrideModal = {
  driver_id: string;
  driver_name: string;
  shift_date: string;
  current_code: string;
} | null;

// FIX #7: Only Morning, Evening, Off — no Afternoon Standby or Rest
const SHIFT_CODES = ["MORNING", "EVENING", "OFF"] as const;
type ShiftCode = typeof SHIFT_CODES[number];

const SHIFT_META: Record<ShiftCode, { label: string; color: string; bg: string; textColor: string }> = {
  MORNING: { label: "Morning  06:00–18:00", color: "var(--amber)",  bg: "rgba(217,119,6,0.12)",  textColor: "var(--amber)"  },
  EVENING: { label: "Evening  18:00–06:00", color: "var(--accent)", bg: "rgba(37,99,235,0.12)",  textColor: "var(--accent)" },
  OFF:     { label: "Off Duty",             color: "var(--text-muted)", bg: "var(--surface-2)",  textColor: "var(--text-muted)" },
};

function ShiftChip({ code }: { code: string }) {
  const meta = SHIFT_META[code as ShiftCode] ?? SHIFT_META.OFF;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: meta.bg, color: meta.textColor,
    }}>
      {code === "MORNING" ? "🌅" : code === "EVENING" ? "🌙" : "💤"} {code}
    </span>
  );
}

export default function ScheduleManager() {
  const [shifts,       setShifts]       = useState<ShiftRow[]>([]);
  const [drivers,      setDrivers]      = useState<Array<{ id: string; name: string; license: string }>>([]);
  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [viewMode,     setViewMode]     = useState<"week" | "month">("week");
  const [weekStart,    setWeekStart]    = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d;
  });
  const [driverFilter, setDriverFilter] = useState("");
  const [override,     setOverride]     = useState<OverrideModal>(null);
  const [overrideCode, setOverrideCode] = useState<ShiftCode>("OFF");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Generate modal state
  const [showGenerate, setShowGenerate] = useState(false);
  const [genStart,     setGenStart]     = useState("");
  const [genEnd,       setGenEnd]       = useState("");
  const [genName,      setGenName]      = useState("Auto Schedule");
  const [genSaving,    setGenSaving]    = useState(false);
  const [genResult,    setGenResult]    = useState<{ shifts_generated: number } | null>(null);
  const [genError,     setGenError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("v_driver_shifts")
        .select("driver_id,driver_name,license_number,shift_date,effective_shift_code,base_shift_code,override_shift_code,is_working,is_overridden")
        .order("shift_date")
        .limit(500),
      supabase.from("drivers")
        .select("id,license_number,user_id")
        .eq("employment_status", "active")
        .order("license_number"),
    ]);

    const driverRows = (d as any[]) || [];
    const userIds = driverRows.map(x => x.user_id).filter(Boolean);
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,full_name")
        .in("user_id", userIds);
      nameMap = Object.fromEntries(((profiles as any[]) || []).map(p => [p.user_id, p.full_name]));
    }

    setDrivers(driverRows.map(dr => ({
      id:      dr.id,
      name:    dr.user_id ? (nameMap[dr.user_id] ?? dr.license_number) : dr.license_number,
      license: dr.license_number,
    })));

    setShifts((s as ShiftRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build date columns for the grid
  const getDays = (start: Date, count: number): Date[] =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });

  const days = getDays(weekStart, viewMode === "week" ? 7 : 30);

  const shiftMap = new Map<string, string>(); // `driverId|date` => effective_shift_code
  for (const s of shifts) {
    shiftMap.set(`${s.driver_id}|${s.shift_date}`, s.effective_shift_code);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayShifts = shifts.filter(s => s.shift_date === todayStr);
  const morningToday = todayShifts.filter(s => s.effective_shift_code === "MORNING").length;
  const eveningToday = todayShifts.filter(s => s.effective_shift_code === "EVENING").length;
  const offToday     = todayShifts.filter(s => s.effective_shift_code === "OFF").length;

  const visibleDrivers = driverFilter
    ? drivers.filter(d => d.id === driverFilter)
    : drivers;

  const applyOverride = async () => {
    if (!override || !overrideCode) return;
    setOverrideSaving(true);
    try {
      await supabase.rpc("override_shift", {
        p_driver_id:     override.driver_id,
        p_shift_date:    override.shift_date,
        p_new_shift_code: overrideCode,
        p_reason:        overrideReason || null,
      });
      setOverride(null); setOverrideCode("OFF"); setOverrideReason("");
      await load();
    } finally {
      setOverrideSaving(false);
    }
  };

  // FIX #7: RPC name is rpc_generate_schedule
  const generateSchedule = async () => {
    if (!genStart || !genEnd) { setGenError("Start and end date are required."); return; }
    setGenSaving(true); setGenError(null);
    try {
      const { data, error } = await supabase.rpc("rpc_generate_schedule", {
        p_start_date: genStart,
        p_end_date:   genEnd,
        p_plan_name:  genName || "Auto Schedule",
        p_notes:      null,
      });
      if (error) throw error;
      setGenResult(data as any);
      await load();
    } catch (e: any) {
      setGenError(e.message ?? "Schedule generation failed.");
    } finally {
      setGenSaving(false);
    }
  };

  const navWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * (viewMode === "week" ? 7 : 30));
    setWeekStart(d);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Driver Schedule</h1>
          <p className="page-sub">Rotating shift schedule — Morning · Evening · Off</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowGenerate(true); setGenResult(null); setGenError(null); }}
        >
          ⟳ Generate Schedule
        </button>
      </div>

      {/* Today stats */}
      <div className="grid-3">
        {[
          { label: "Morning Today", count: morningToday, code: "MORNING" },
          { label: "Evening Today", count: eveningToday, code: "EVENING" },
          { label: "Off Duty Today", count: offToday,    code: "OFF"     },
        ].map(s => {
          const meta = SHIFT_META[s.code as ShiftCode];
          return (
            <div key={s.code} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: meta.textColor }}>{s.count}</div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SHIFT_CODES.map(code => {
          const meta = SHIFT_META[code];
          return (
            <span key={code} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: meta.bg, color: meta.textColor,
              border: `1px solid ${meta.color}33`,
            }}>
              {code === "MORNING" ? "🌅" : code === "EVENING" ? "🌙" : "💤"} {meta.label}
            </span>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <select
          className="tms-select"
          style={{ width: "auto" }}
          value={viewMode}
          onChange={e => setViewMode(e.target.value as "week" | "month")}
        >
          <option value="week">7-day view</option>
          <option value="month">30-day view</option>
        </select>

        <select
          className="tms-select"
          style={{ width: "auto" }}
          value={driverFilter}
          onChange={e => setDriverFilter(e.target.value)}
        >
          <option value="">All Drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(-1)}>← Prev</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setWeekStart(new Date()); }}>Today</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(1)}>Next →</button>
        </div>
      </div>

      {/* Schedule grid */}
      <div className="card overflow-hidden">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><div className="spinner" /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", minWidth: 140, background: "var(--surface)" }}>
                    Driver
                  </th>
                  {days.map(d => {
                    const ds = d.toISOString().slice(0, 10);
                    const isToday = ds === todayStr;
                    return (
                      <th key={ds} style={{
                        padding: "8px 6px", textAlign: "center", fontWeight: 600,
                        color: isToday ? "var(--accent)" : "var(--text-muted)",
                        background: isToday ? "var(--accent-dim)" : "var(--surface)",
                        minWidth: 64,
                        borderLeft: "1px solid var(--border)",
                      }}>
                        <div>{d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                        <div style={{ fontSize: 10, fontWeight: 400 }}>{d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleDrivers.length === 0 ? (
                  <tr><td colSpan={days.length + 1} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No drivers.</td></tr>
                ) : visibleDrivers.map(driver => (
                  <tr key={driver.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 14px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", background: "var(--surface)" }}>
                      <div>{driver.name}</div>
                      <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-dim)" }}>{driver.license}</div>
                    </td>
                    {days.map(d => {
                      const ds    = d.toISOString().slice(0, 10);
                      const code  = shiftMap.get(`${driver.id}|${ds}`) as ShiftCode | undefined;
                      const meta  = code ? SHIFT_META[code] : null;
                      const isToday = ds === todayStr;
                      return (
                        <td key={ds} style={{
                          padding: 4, textAlign: "center",
                          background: isToday ? "rgba(59,130,246,0.05)" : undefined,
                          borderLeft: "1px solid var(--border)",
                        }}>
                          <button
                            onClick={() => code && setOverride({ driver_id: driver.id, driver_name: driver.name, shift_date: ds, current_code: code })}
                            style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              padding: "3px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                              background: meta ? meta.bg : "transparent",
                              color: meta ? meta.textColor : "var(--text-dim)",
                              border: "none", cursor: code ? "pointer" : "default",
                              width: "100%",
                            }}
                            title={code ? `Click to override — ${driver.name} on ${ds}` : "No shift"}
                          >
                            {code === "MORNING" ? "🌅" : code === "EVENING" ? "🌙" : code === "OFF" ? "💤" : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Override modal */}
      {override && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setOverride(null)}
        >
          <div
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 420 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Override Shift</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {override.driver_name} · {fmtDate(override.shift_date)}
              </p>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)", fontSize: 13, color: "var(--text-muted)" }}>
                Current: <ShiftChip code={override.current_code} />
              </div>
              <div>
                <label className="form-label">New Shift</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SHIFT_CODES.map(code => {
                    const meta = SHIFT_META[code];
                    return (
                      <button
                        key={code}
                        onClick={() => setOverrideCode(code)}
                        style={{
                          padding: "8px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                          border: `2px solid ${overrideCode === code ? meta.color : "var(--border)"}`,
                          background: overrideCode === code ? meta.bg : "var(--surface-2)",
                          color: overrideCode === code ? meta.textColor : "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {code === "MORNING" ? "🌅" : code === "EVENING" ? "🌙" : "💤"} {code}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="form-label">Reason (optional)</label>
                <textarea
                  className="tms-textarea"
                  rows={2}
                  placeholder="e.g. Driver requested swap"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setOverride(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={overrideSaving} onClick={applyOverride}>
                  {overrideSaving ? "Saving…" : "Apply Override"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate schedule modal */}
      {showGenerate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowGenerate(false)}
        >
          <div
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 460 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Generate Schedule</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Auto-assign Morning / Evening / Off shifts to all active drivers</p>
              </div>
              <button onClick={() => setShowGenerate(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {genResult ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Schedule Generated!</p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                    <strong style={{ color: "var(--text)" }}>{genResult.shifts_generated}</strong> shift entries created.
                    Manual overrides were preserved.
                  </p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowGenerate(false)}>Done</button>
                </div>
              ) : (
                <>
                  <div className="alert alert-info">
                    <span className="alert-icon">ℹ</span>
                    <span className="alert-content">
                      Each driver gets a staggered 12-day cycle: 4 Morning → 2 Off → 4 Evening → 2 Off. Only Morning, Evening, and Off are used. Manual overrides are preserved.
                    </span>
                  </div>
                  <div>
                    <label className="form-label">Schedule Name</label>
                    <input className="tms-input" value={genName} onChange={e => setGenName(e.target.value)} placeholder="e.g. March 2025 Schedule" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="form-label">Start Date</label>
                      <input className="tms-input" type="date" value={genStart} onChange={e => setGenStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">End Date</label>
                      <input className="tms-input" type="date" value={genEnd} onChange={e => setGenEnd(e.target.value)} />
                    </div>
                  </div>
                  {genError && (
                    <div className="alert alert-error">
                      <span className="alert-icon">✕</span>
                      <span className="alert-content">{genError}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => setShowGenerate(false)}>Cancel</button>
                    <button className="btn btn-primary" disabled={genSaving || !genStart || !genEnd} onClick={generateSchedule}>
                      {genSaving ? "Generating…" : "Generate"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}