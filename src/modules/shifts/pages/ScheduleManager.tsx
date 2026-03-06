// src/modules/shifts/pages/ScheduleManager.tsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────
type CalRow = {
  driver_id:       string;
  driver_name:     string;
  license_number:  string;
  team_id:         string | null;
  team_name:       string | null;
  shift_date:      string;
  shift_code:      string;       // morning | evening | off
  cell_label:      string;
  department_name: string | null;
  is_override:     boolean;
};

type Driver = {
  id: string; name: string; license: string;
  team_id: string | null; team_name: string | null;
};

type OverrideModal = {
  driver_id: string; driver_name: string;
  shift_date: string; current: string;
} | null;

// ── Design tokens ─────────────────────────────────────────────
const DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  "Joy News":     { bg: "var(--accent-dim)",  text: "var(--accent)"  },
  "Adom News":    { bg: "var(--amber-dim)",   text: "var(--amber)"   },
  "Joy Business": { bg: "var(--green-dim)",   text: "var(--green)"   },
  "Production":   { bg: "var(--purple-dim)",  text: "var(--purple)"  },
};

const SHIFT_STYLE: Record<string, { bg: string; text: string; border: string; icon: string; label: string }> = {
  morning: { bg: "var(--amber-dim)",  text: "var(--amber)",      border: "var(--amber)",  icon: "🌅", label: "Morning" },
  evening: { bg: "var(--accent-dim)", text: "var(--accent)",     border: "var(--accent)", icon: "🌙", label: "Evening" },
  off:     { bg: "var(--surface-2)",  text: "var(--text-muted)", border: "var(--border)", icon: "💤", label: "Off"     },
};

const SHIFT_CODES = ["morning", "evening", "off"] as const;

function fmt(d: Date) { return d.toISOString().slice(0, 10); }

function getWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
}

// ── Calendar cell ─────────────────────────────────────────────
function ShiftCell({
  shift_code, department_name, is_override, onClick,
}: {
  shift_code: string; department_name: string | null;
  is_override: boolean; onClick: () => void;
}) {
  const s    = SHIFT_STYLE[shift_code] ?? SHIFT_STYLE.off;
  const dept = shift_code === "morning" && department_name ? DEPT_COLORS[department_name] : null;

  return (
    <button
      onClick={onClick}
      title={`${s.label}${department_name ? " · " + department_name : ""}${is_override ? " (override)" : ""}`}
      style={{
        width: "100%", minHeight: 48, padding: "4px 3px",
        background: dept ? dept.bg : s.bg,
        border: `1px solid ${dept ? dept.text : s.border}`,
        borderRadius: 8, cursor: "pointer", position: "relative",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{s.icon}</span>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.04em", lineHeight: 1.2,
        color: dept ? dept.text : s.text,
      }}>
        {shift_code === "off" ? "Off" : (department_name ?? s.label)}
      </span>
      {is_override && (
        <span style={{
          position: "absolute", top: 3, right: 3,
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--amber)", border: "2px solid var(--surface)",
        }} />
      )}
    </button>
  );
}

// ── Empty cell ────────────────────────────────────────────────
function EmptyCell({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", minHeight: 48, background: "none",
      border: "1px dashed var(--border)", borderRadius: 8,
      cursor: "pointer", color: "var(--text-dim)", fontSize: 11,
    }}>—</button>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function ScheduleManager() {
  const [rows,       setRows]       = useState<CalRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [anchor,     setAnchor]     = useState(new Date());
  const [teamFilter, setTeamFilter] = useState("all");
  const [teams,      setTeams]      = useState<{ id: string; name: string }[]>([]);
  const [error,      setError]      = useState<string | null>(null);

  // Generate modal
  const [showGen,   setShowGen]   = useState(false);
  const [genStart,  setGenStart]  = useState(fmt(new Date()));
  const [genEnd,    setGenEnd]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 90); return fmt(d);
  });
  const [genName,   setGenName]   = useState("Auto Schedule");
  const [genSaving, setGenSaving] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // Override modal
  const [overrideModal,  setOverrideModal]  = useState<OverrideModal>(null);
  const [overrideCode,   setOverrideCode]   = useState<string>("morning");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  const weekDates = getWeekDates(anchor);
  const weekStart = fmt(weekDates[0]);
  const weekEnd   = fmt(weekDates[6]);
  const today     = fmt(new Date());

  // ── Load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("v_schedule_calendar")
      .select("*")
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd)
      .order("team_name",   { ascending: true })
      .order("driver_name", { ascending: true })
      .order("shift_date",  { ascending: true });

    if (err) { setError(err.message); setLoading(false); return; }

    const calRows = (data as CalRow[]) ?? [];
    setRows(calRows);

    // Extract unique teams from data
    const tMap = new Map<string, string>();
    calRows.forEach(r => { if (r.team_id && r.team_name) tMap.set(r.team_id, r.team_name); });
    setTeams([...tMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  // ── Derived data ──────────────────────────────────────────
  const grid: Record<string, Record<string, CalRow>> = {};
  for (const r of rows) {
    if (!grid[r.driver_id]) grid[r.driver_id] = {};
    grid[r.driver_id][r.shift_date] = r;
  }

  const allDrivers: Driver[] = [...new Map(
    rows.map(r => [r.driver_id, {
      id: r.driver_id, name: r.driver_name, license: r.license_number,
      team_id: r.team_id, team_name: r.team_name,
    }])
  ).values()].filter(d => teamFilter === "all" || d.team_id === teamFilter);

  // Group by team
  const byTeam = new Map<string, { name: string; drivers: Driver[] }>();
  const noTeam: Driver[] = [];
  for (const d of allDrivers) {
    if (d.team_id && d.team_name) {
      if (!byTeam.has(d.team_id)) byTeam.set(d.team_id, { name: d.team_name, drivers: [] });
      byTeam.get(d.team_id)!.drivers.push(d);
    } else {
      noTeam.push(d);
    }
  }

  // ── Actions ───────────────────────────────────────────────
  const generate = async () => {
    setGenSaving(true); setError(null); setGenResult(null);
    const { data, error: err } = await supabase.rpc("rpc_generate_schedule", {
      p_start_date: genStart,
      p_end_date:   genEnd,
      p_plan_name:  genName,
    });
    setGenSaving(false);
    if (err) { setError(err.message); return; }
    const d = data as any;
    setGenResult(
      `✓ ${d.shifts_created} shifts across ${d.teams_processed} teams` +
      (d.department_assignments?.assignments_created
        ? ` · ${d.department_assignments.assignments_created} dept assignments`
        : "")
    );
    await load();
  };

  const applyOverride = async () => {
    if (!overrideModal) return;
    setOverrideSaving(true); setError(null);
    const { error: err } = await supabase.rpc("override_shift", {
      p_driver_id:      overrideModal.driver_id,
      p_shift_date:     overrideModal.shift_date,
      p_new_shift_code: overrideCode,
      p_reason:         overrideReason || null,
    });
    setOverrideSaving(false);
    if (err) { setError(err.message); return; }
    setOverrideModal(null); setOverrideReason("");
    await load();
  };

  const openOverride = (driver: Driver, d: Date, current: string) => {
    setOverrideModal({ driver_id: driver.id, driver_name: driver.name, shift_date: fmt(d), current });
    setOverrideCode(current in SHIFT_STYLE ? current : "off");
    setOverrideReason("");
  };

  // ── Team shift badge for the week ─────────────────────────
  function dominantShift(drivers: Driver[]): string {
    const counts: Record<string, number> = {};
    drivers.forEach(d => weekDates.forEach(wd => {
      const code = grid[d.id]?.[fmt(wd)]?.shift_code;
      if (code) counts[code] = (counts[code] ?? 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "off";
  }

  // ── Day column header ─────────────────────────────────────
  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });

  // ── Driver table (shared for desktop + mobile) ─────────────
  const renderDriverTable = (drivers: Driver[]) => (
    <>
      {/* ── Desktop table ── */}
      <div className="desk-only" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{
                padding: "10px 16px", textAlign: "left", fontSize: 11,
                fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase",
                letterSpacing: "0.05em", width: 200,
                background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
              }}>
                Driver
              </th>
              {weekDates.map(d => (
                <th key={fmt(d)} style={{
                  padding: "10px 4px", textAlign: "center", fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 86,
                  color: fmt(d) === today ? "var(--accent)" : "var(--text-muted)",
                  background: fmt(d) === today
                    ? "color-mix(in srgb, var(--accent-dim) 50%, var(--surface-2))"
                    : "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver, idx) => (
              <tr key={driver.id} style={{
                background: idx % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
              }}>
                {/* Driver info */}
                <td style={{ padding: "10px 16px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                    {driver.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {driver.license}
                  </div>
                </td>
                {/* Shift cells */}
                {weekDates.map(d => {
                  const row = grid[driver.id]?.[fmt(d)];
                  return (
                    <td key={fmt(d)} style={{
                      padding: "5px 4px",
                      background: fmt(d) === today
                        ? "color-mix(in srgb, var(--accent-dim) 12%, transparent)"
                        : undefined,
                    }}>
                      {row
                        ? <ShiftCell
                            shift_code={row.shift_code}
                            department_name={row.department_name}
                            is_override={row.is_override}
                            onClick={() => openOverride(driver, d, row.shift_code)}
                          />
                        : <EmptyCell onClick={() => openOverride(driver, d, "off")} />
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile list ── */}
      <div className="mob-only">
        {drivers.map(driver => (
          <div key={driver.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
              {driver.name}
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8, fontFamily: "var(--font-mono)" }}>
                {driver.license}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {weekDates.map(d => {
                const row = grid[driver.id]?.[fmt(d)];
                return (
                  <div key={fmt(d)}>
                    <div style={{
                      fontSize: 9, textAlign: "center", marginBottom: 2, fontWeight: 700,
                      color: fmt(d) === today ? "var(--accent)" : "var(--text-dim)",
                    }}>
                      {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                    </div>
                    {row
                      ? <ShiftCell shift_code={row.shift_code} department_name={row.department_name} is_override={row.is_override} onClick={() => openOverride(driver, d, row.shift_code)} />
                      : <EmptyCell onClick={() => openOverride(driver, d, "off")} />
                    }
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 48 }}>

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Shift Schedule</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            Team-based 12-day cycle · Morning 4d → Off 2d → Evening 4d → Off 2d
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowGen(true); setGenResult(null); setError(null); }}>
          ⚡ Generate Schedule
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Week navigator + team filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm"
          onClick={() => setAnchor(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}>
          ← Prev
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 170, textAlign: "center" }}>
          {weekDates[0].toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          {" – "}
          {weekDates[6].toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        <button className="btn btn-ghost btn-sm"
          onClick={() => setAnchor(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}>
          Next →
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>Today</button>
        <div style={{ marginLeft: "auto" }}>
          <select className="tms-select" style={{ fontSize: 13, padding: "6px 12px" }}
            value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
            <option value="all">All Teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, alignItems: "center" }}>
        {Object.entries(SHIFT_STYLE).map(([k, v]) => (
          <span key={k} style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: v.bg, color: v.text, border: `1px solid ${v.border}`,
          }}>
            {v.icon} {v.label}
          </span>
        ))}
        <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 2px" }} />
        {Object.entries(DEPT_COLORS).map(([k, v]) => (
          <span key={k} style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: v.bg, color: v.text, border: `1px solid ${v.text}`,
          }}>
            {k}
          </span>
        ))}
        <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
          🟡 dot = manual override · Click any cell to override
        </span>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
          <div className="spinner" />
        </div>
      ) : allDrivers.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 56, color: "var(--text-muted)", fontSize: 14,
          background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          No schedule data for this week.<br />
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>
            Click <strong style={{ color: "var(--text)" }}>Generate Schedule</strong> to create one.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* One card per team */}
          {[...byTeam.entries()].map(([teamId, { name: teamName, drivers: teamDrivers }]) => {
            const dom = dominantShift(teamDrivers);
            const ds  = SHIFT_STYLE[dom];
            return (
              <div key={teamId} style={{
                background: "var(--surface)", borderRadius: 16,
                border: "1px solid var(--border)", overflow: "hidden",
              }}>
                {/* Team header */}
                <div style={{
                  padding: "12px 16px", background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                    👥 {teamName}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: ds.bg, color: ds.text, border: `1px solid ${ds.border}`,
                  }}>
                    {ds.icon} {ds.label} this week
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {teamDrivers.length} driver{teamDrivers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {renderDriverTable(teamDrivers)}
              </div>
            );
          })}

          {/* Unassigned drivers */}
          {noTeam.length > 0 && (
            <div style={{
              background: "var(--surface)", borderRadius: 16,
              border: "1px dashed var(--border)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-muted)" }}>
                  ⚠️ No Team Assigned
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {noTeam.length} driver{noTeam.length !== 1 ? "s" : ""} — assign to a team for schedule generation
                </span>
              </div>
              {renderDriverTable(noTeam)}
            </div>
          )}
        </div>
      )}

      {/* ── Generate modal ── */}
      {showGen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowGen(false)}>
          <div style={{
            background: "var(--surface)", borderRadius: 20, width: "100%", maxWidth: 480,
            boxShadow: "var(--shadow-lg)", overflow: "hidden",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Generate Schedule</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  Team-based 12-day cycle + department rotation
                </div>
              </div>
              <button onClick={() => setShowGen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", padding: 0, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Plan Name</label>
                <input className="tms-input" value={genName} onChange={e => setGenName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="form-label">Start Date</label>
                  <input type="date" className="tms-input" value={genStart} onChange={e => setGenStart(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">End Date</label>
                  <input type="date" className="tms-input" value={genEnd} onChange={e => setGenEnd(e.target.value)} />
                </div>
              </div>

              {/* Info box */}
              <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)", marginBottom: 8 }}>How it works</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  Each team's shift is computed from its <code style={{ fontSize: 11, color: "var(--accent)" }}>cycle_start_date</code> + <code style={{ fontSize: 11, color: "var(--accent)" }}>cycle_phase_offset</code>. All drivers in the same team always share the same shift on the same day.
                </div>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[["Joy News","3 drivers"], ["Adom News","2 drivers"], ["Joy Business","1 driver"], ["Production","rest"]].map(([name, count]) => {
                    const c = DEPT_COLORS[name];
                    return (
                      <span key={name} style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
                        {name} → {count}
                      </span>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                  No driver repeats their immediate previous morning department.
                </div>
              </div>

              {genResult && <div className="alert alert-success"><span>{genResult}</span></div>}
              {error     && <div className="alert alert-error"><span>{error}</span></div>}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setShowGen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={generate} disabled={genSaving}>
                {genSaving ? "Generating…" : "⚡ Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Override modal ── */}
      {overrideModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16,
        }} onClick={() => setOverrideModal(null)}>
          <div style={{
            background: "var(--surface)", borderRadius: 20, width: "100%", maxWidth: 420,
            boxShadow: "var(--shadow-lg)", overflow: "hidden", marginBottom: 8,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Override Shift</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  {overrideModal.driver_name} · {overrideModal.shift_date}
                </div>
              </div>
              <button onClick={() => setOverrideModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", padding: 0, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">New Shift</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {SHIFT_CODES.map(code => {
                    const s = SHIFT_STYLE[code];
                    const active = overrideCode === code;
                    return (
                      <button key={code} onClick={() => setOverrideCode(code)} style={{
                        flex: 1, padding: "12px 8px", borderRadius: 12, cursor: "pointer",
                        border: `2px solid ${active ? s.border : "var(--border)"}`,
                        background: active ? s.bg : "var(--surface-2)",
                        color: active ? s.text : "var(--text-muted)",
                        fontWeight: 700, fontSize: 12, textAlign: "center",
                        transition: "all 0.12s",
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="form-label">Reason <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
                <input className="tms-input" placeholder="e.g. Medical leave, swap request…"
                  value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
              </div>
              {error && <div className="alert alert-error"><span>{error}</span></div>}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setOverrideModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={applyOverride} disabled={overrideSaving}>
                {overrideSaving ? "Saving…" : "Apply Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive helpers */}
      <style>{`
        @media (max-width: 767px) {
          .desk-only { display: none !important; }
          .mob-only  { display: block !important; }
        }
        @media (min-width: 768px) {
          .desk-only { display: block !important; }
          .mob-only  { display: none !important; }
        }
      `}</style>
    </div>
  );
}