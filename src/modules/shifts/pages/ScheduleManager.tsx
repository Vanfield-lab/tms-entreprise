import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────
type CalRow = {
  driver_id: string;
  driver_name: string;
  license_number: string;
  team_id: string | null;
  team_name: string | null;
  shift_date: string;
  shift_code: "morning" | "evening" | "off";
  cell_label: string;
  department_name: string | null; // kept from current SQL view, but treated as generic deployment label
  block_start_date: string | null;
  evening_route_name: string | null;
  evening_route_id: string | null;
  is_override: boolean;
};

type Driver = {
  id: string;
  name: string;
  license: string;
  team_id: string | null;
  team_name: string | null;
};

type EveningRoute = {
  id: string;
  name: string;
};

type GenerateResult = {
  shifts_created?: number;
  teams_processed?: number;
  plan_name?: string;
  department_assignments?: {
    assignments_created?: number;
  };
};

type OverrideModal = {
  driver_id: string;
  driver_name: string;
  shift_date: string;
  current: "morning" | "evening" | "off";
} | null;

type RouteModal = {
  driver_id: string;
  driver_name: string;
  shift_date: string;
  current_route_id: string | null;
  current_route_name: string | null;
} | null;

// ── Design tokens ─────────────────────────────────────────────
const SHIFT_CODES = ["morning", "evening", "off"] as const;

const SHIFT_STYLE: Record<
  "morning" | "evening" | "off",
  { bg: string; text: string; border: string; icon: string; label: string }
> = {
  morning: {
    bg: "var(--amber-dim)",
    text: "var(--amber)",
    border: "var(--amber)",
    icon: "🌅",
    label: "Morning",
  },
  evening: {
    bg: "var(--accent-dim)",
    text: "var(--accent)",
    border: "var(--accent)",
    icon: "🌙",
    label: "Evening",
  },
  off: {
    bg: "var(--surface-2)",
    text: "var(--text-muted)",
    border: "var(--border)",
    icon: "💤",
    label: "Off",
  },
};

// These are common labels you already use.
// Unknown units/divisions will still render nicely using fallback styling.
const DEPLOYMENT_COLORS: Record<string, { bg: string; text: string }> = {
  "Joy News": { bg: "var(--accent-dim)", text: "var(--accent)" },
  "Adom News": { bg: "var(--amber-dim)", text: "var(--amber)" },
  "Joy Business": { bg: "var(--green-dim)", text: "var(--green)" },
  Production: { bg: "var(--purple-dim)", text: "var(--purple)" },
};

const DEPLOYMENT_SORT_ORDER: Record<string, number> = {
  "Joy News": 1,
  "Adom News": 2,
  "Joy Business": 3,
  Production: 4,
};

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getDeploymentColors(name: string | null) {
  if (!name) return null;
  return (
    DEPLOYMENT_COLORS[name] ?? {
      bg: "var(--surface-2)",
      text: "var(--text)",
    }
  );
}

function getMorningDisplayLabel(row: CalRow): string {
  return row.department_name ?? "Morning";
}

function getEveningDisplayLabel(row: CalRow): string {
  return row.evening_route_name ?? "Evening";
}

function getCellDisplayLabel(row: CalRow): string {
  if (row.shift_code === "off") return "Off";
  if (row.shift_code === "morning") return getMorningDisplayLabel(row);
  return getEveningDisplayLabel(row);
}

// ── Cells ─────────────────────────────────────────────────────
function ShiftCell({
  row,
  onClick,
}: {
  row: CalRow;
  onClick: () => void;
}) {
  const shift = SHIFT_STYLE[row.shift_code];
  const deploymentColor =
    row.shift_code === "morning" ? getDeploymentColors(row.department_name) : null;

  const displayLabel = getCellDisplayLabel(row);

  return (
    <button
      onClick={onClick}
      title={`${shift.label}${displayLabel ? ` · ${displayLabel}` : ""}${
        row.is_override ? " (override)" : ""
      }`}
      style={{
        width: "100%",
        minHeight: 50,
        padding: "4px 3px",
        background: deploymentColor ? deploymentColor.bg : shift.bg,
        border: `1px solid ${deploymentColor ? deploymentColor.text : shift.border}`,
        borderRadius: 8,
        cursor: "pointer",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{shift.icon}</span>

      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1.2,
          color: deploymentColor ? deploymentColor.text : shift.text,
          textAlign: "center",
          maxWidth: "100%",
          wordBreak: "break-word",
        }}
      >
        {displayLabel}
      </span>

      {row.is_override && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--amber)",
            border: "2px solid var(--surface)",
          }}
        />
      )}
    </button>
  );
}

function EmptyCell({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 50,
        background: "none",
        border: "1px dashed var(--border)",
        borderRadius: 8,
        cursor: "pointer",
        color: "var(--text-dim)",
        fontSize: 11,
      }}
    >
      —
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function ScheduleManager() {
  const [rows, setRows] = useState<CalRow[]>([]);
  const [routes, setRoutes] = useState<EveningRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(new Date());
  const [teamFilter, setTeamFilter] = useState("all");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate modal
  const [showGen, setShowGen] = useState(false);
  const [genStart, setGenStart] = useState(fmt(new Date()));
  const [genEnd, setGenEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return fmt(d);
  });
  const [genName, setGenName] = useState("Auto Schedule");
  const [genSaving, setGenSaving] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // Shift override modal
  const [overrideModal, setOverrideModal] = useState<OverrideModal>(null);
  const [overrideCode, setOverrideCode] = useState<"morning" | "evening" | "off">("morning");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Route override modal
  const [routeModal, setRouteModal] = useState<RouteModal>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [routeReason, setRouteReason] = useState("");
  const [routeSaving, setRouteSaving] = useState(false);

  const weekDates = useMemo(() => getWeekDates(anchor), [anchor]);
  const weekStart = fmt(weekDates[0]);
  const weekEnd = fmt(weekDates[6]);
  const today = fmt(new Date());

  // ── Loaders ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("v_schedule_calendar")
      .select("*")
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd)
      .order("team_name", { ascending: true })
      .order("shift_date", { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const calRows: CalRow[] = Array.isArray(data)
      ? (data as unknown as CalRow[])
      : [];

    setRows(calRows);

    const tMap = new Map<string, string>();
    calRows.forEach((r) => {
      if (r.team_id && r.team_name) tMap.set(r.team_id, r.team_name);
    });

    setTeams(
      [...tMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );

    setLoading(false);
  }, [weekStart, weekEnd]);

  const loadRoutes = useCallback(async () => {
    const { data, error } = await supabase
      .from("evening_routes")
      .select("id, name")
      .order("name", { ascending: true });

    if (!error) {
      setRoutes(Array.isArray(data) ? (data as EveningRoute[]) : []);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadRoutes();
  }, [load, loadRoutes]);

  // ── Grid ───────────────────────────────────────────────────
  const grid = useMemo(() => {
    const g: Record<string, Record<string, CalRow>> = {};
    rows.forEach((r) => {
      if (!g[r.driver_id]) g[r.driver_id] = {};
      g[r.driver_id][r.shift_date] = r;
    });
    return g;
  }, [rows]);

  const allDrivers = useMemo<Driver[]>(() => {
    const map = new Map<string, Driver>();

    rows.forEach((r) => {
      if (!map.has(r.driver_id)) {
        map.set(r.driver_id, {
          id: r.driver_id,
          name: r.driver_name,
          license: r.license_number,
          team_id: r.team_id,
          team_name: r.team_name,
        });
      }
    });

    return [...map.values()].filter(
      (d) => teamFilter === "all" || d.team_id === teamFilter
    );
  }, [rows, teamFilter]);

  // ── Sorting helpers ───────────────────────────────────────
  function getDriverWeekPriority(driverId: string): { bucket: number; label: string } {
    for (const d of weekDates) {
      const row = grid[driverId]?.[fmt(d)];
      if (!row) continue;

      if (row.shift_code === "morning") {
        return {
          bucket: DEPLOYMENT_SORT_ORDER[row.department_name ?? ""] ?? 20,
          label: row.department_name ?? "Morning",
        };
      }

      if (row.shift_code === "evening") {
        return {
          bucket: 50,
          label: row.evening_route_name ?? "Evening",
        };
      }
    }

    return { bucket: 99, label: "Off" };
  }

  const { byTeam, noTeam } = useMemo(() => {
    const grouped = new Map<string, { name: string; drivers: Driver[] }>();
    const unassigned: Driver[] = [];

    allDrivers.forEach((d) => {
      if (d.team_id && d.team_name) {
        if (!grouped.has(d.team_id)) {
          grouped.set(d.team_id, { name: d.team_name, drivers: [] });
        }
        grouped.get(d.team_id)!.drivers.push(d);
      } else {
        unassigned.push(d);
      }
    });

    for (const [, group] of grouped.entries()) {
      group.drivers.sort((a, b) => {
        const pa = getDriverWeekPriority(a.id);
        const pb = getDriverWeekPriority(b.id);

        if (pa.bucket !== pb.bucket) return pa.bucket - pb.bucket;
        if (pa.label !== pb.label) return pa.label.localeCompare(pb.label);
        return a.name.localeCompare(b.name);
      });
    }

    unassigned.sort((a, b) => a.name.localeCompare(b.name));

    return { byTeam: grouped, noTeam: unassigned };
  }, [allDrivers, weekDates, grid]);

  // ── Actions ───────────────────────────────────────────────
  const generate = async () => {
    setGenSaving(true);
    setError(null);
    setGenResult(null);

    const { data, error: err } = await supabase.rpc("rpc_generate_schedule", {
      p_start_date: genStart,
      p_end_date: genEnd,
      p_plan_name: genName,
    });

    setGenSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    const d = (data ?? {}) as GenerateResult;
    setGenResult(
      `✓ ${d.shifts_created ?? 0} shifts across ${d.teams_processed ?? 0} teams · ${
        d.department_assignments?.assignments_created ?? 0
      } deployments`
    );

    await load();
  };

  const applyOverride = async () => {
    if (!overrideModal) return;

    setOverrideSaving(true);
    setError(null);

    const { error: err } = await supabase.rpc("override_shift", {
      p_driver_id: overrideModal.driver_id,
      p_shift_date: overrideModal.shift_date,
      p_new_shift_code: overrideCode,
      p_reason: overrideReason || null,
    });

    setOverrideSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    setOverrideModal(null);
    setOverrideReason("");
    await load();
  };

  const applyRouteSwap = async () => {
    if (!routeModal || !selectedRouteId) return;

    setRouteSaving(true);
    setError(null);

    const { error: err } = await supabase.rpc("override_evening_route", {
      p_driver_id: routeModal.driver_id,
      p_shift_date: routeModal.shift_date,
      p_route_id: selectedRouteId,
      p_reason: routeReason || null,
    });

    setRouteSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    setRouteModal(null);
    setSelectedRouteId("");
    setRouteReason("");
    await load();
  };

  const openOverride = (
    driver: Driver,
    date: Date,
    current: "morning" | "evening" | "off"
  ) => {
    setOverrideModal({
      driver_id: driver.id,
      driver_name: driver.name,
      shift_date: fmt(date),
      current,
    });
    setOverrideCode(current);
    setOverrideReason("");
  };

  const openRouteSwap = (row: CalRow) => {
    setRouteModal({
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      shift_date: row.shift_date,
      current_route_id: row.evening_route_id,
      current_route_name: row.evening_route_name,
    });
    setSelectedRouteId(row.evening_route_id ?? "");
    setRouteReason("");
  };

  // ── Display helpers ───────────────────────────────────────
  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });

  function dominantShift(drivers: Driver[]): "morning" | "evening" | "off" {
    const counts: Record<"morning" | "evening" | "off", number> = {
      morning: 0,
      evening: 0,
      off: 0,
    };

    drivers.forEach((d) =>
      weekDates.forEach((wd) => {
        const code = grid[d.id]?.[fmt(wd)]?.shift_code;
        if (code) counts[code] += 1;
      })
    );

    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "off") as "morning" | "evening" | "off";
  }

  const deploymentLegend = useMemo(() => {
    const names = new Set<string>();

    rows.forEach((r) => {
      if (r.shift_code === "morning" && r.department_name) names.add(r.department_name);
    });

    return [...names].sort((a, b) => {
      const oa = DEPLOYMENT_SORT_ORDER[a] ?? 99;
      const ob = DEPLOYMENT_SORT_ORDER[b] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }, [rows]);

  // ── Shared table ──────────────────────────────────────────
  const renderDriverTable = (drivers: Driver[]) => (
    <>
      {/* Desktop */}
      <div className="desk-only" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  width: 220,
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                Driver
              </th>

              {weekDates.map((d) => (
                <th
                  key={fmt(d)}
                  style={{
                    padding: "10px 4px",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    minWidth: 92,
                    color: fmt(d) === today ? "var(--accent)" : "var(--text-muted)",
                    background:
                      fmt(d) === today
                        ? "color-mix(in srgb, var(--accent-dim) 50%, var(--surface-2))"
                        : "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {drivers.map((driver, idx) => (
              <tr
                key={driver.id}
                style={{
                  background: idx % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "10px 16px" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: "var(--text)",
                    }}
                  >
                    {driver.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      marginTop: 2,
                    }}
                  >
                    {driver.license}
                  </div>
                </td>

                {weekDates.map((d) => {
                  const row = grid[driver.id]?.[fmt(d)];

                  return (
                    <td
                      key={fmt(d)}
                      style={{
                        padding: "5px 4px",
                        background:
                          fmt(d) === today
                            ? "color-mix(in srgb, var(--accent-dim) 12%, transparent)"
                            : undefined,
                        verticalAlign: "top",
                      }}
                    >
                      {row ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <ShiftCell
                            row={row}
                            onClick={() => openOverride(driver, d, row.shift_code)}
                          />

                          {row.shift_code === "evening" && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 10, padding: "2px 6px" }}
                              onClick={() => openRouteSwap(row)}
                            >
                              Swap Route
                            </button>
                          )}
                        </div>
                      ) : (
                        <EmptyCell onClick={() => openOverride(driver, d, "off")} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="mob-only">
        {drivers.map((driver) => (
          <div
            key={driver.id}
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: "var(--text)",
                marginBottom: 8,
              }}
            >
              {driver.name}
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginLeft: 8,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {driver.license}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 3,
              }}
            >
              {weekDates.map((d) => {
                const row = grid[driver.id]?.[fmt(d)];

                return (
                  <div key={fmt(d)}>
                    <div
                      style={{
                        fontSize: 9,
                        textAlign: "center",
                        marginBottom: 2,
                        fontWeight: 700,
                        color: fmt(d) === today ? "var(--accent)" : "var(--text-dim)",
                      }}
                    >
                      {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                    </div>

                    {row ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <ShiftCell
                          row={row}
                          onClick={() => openOverride(driver, d, row.shift_code)}
                        />
                        {row.shift_code === "evening" && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 9, padding: "2px 4px" }}
                            onClick={() => openRouteSwap(row)}
                          >
                            Route
                          </button>
                        )}
                      </div>
                    ) : (
                      <EmptyCell onClick={() => openOverride(driver, d, "off")} />
                    )}
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
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 className="page-title">Shift Schedule</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            Team-based 12-day cycle · Morning 4d → Off 2d → Evening 4d → Off 2d
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setShowGen(true);
            setGenResult(null);
            setError(null);
          }}
        >
          ⚡ Generate Schedule
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setAnchor((d) => {
              const n = new Date(d);
              n.setDate(n.getDate() - 7);
              return n;
            })
          }
        >
          ← Prev
        </button>

        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            minWidth: 170,
            textAlign: "center",
          }}
        >
          {weekDates[0].toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })}
          {" – "}
          {weekDates[6].toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setAnchor((d) => {
              const n = new Date(d);
              n.setDate(n.getDate() + 7);
              return n;
            })
          }
        >
          Next →
        </button>

        <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>
          Today
        </button>

        <div style={{ marginLeft: "auto" }}>
          <select
            className="tms-select"
            style={{ fontSize: 13, padding: "6px 12px" }}
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legends */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        {Object.entries(SHIFT_STYLE).map(([k, v]) => (
          <span
            key={k}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              background: v.bg,
              color: v.text,
              border: `1px solid ${v.border}`,
            }}
          >
            {v.icon} {v.label}
          </span>
        ))}

        <span
          style={{
            width: 1,
            height: 14,
            background: "var(--border)",
            margin: "0 2px",
          }}
        />

        {deploymentLegend.map((name) => {
          const c = getDeploymentColors(name)!;
          return (
            <span
              key={name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: c.bg,
                color: c.text,
                border: `1px solid ${c.text}`,
              }}
            >
              {name}
            </span>
          );
        })}

        <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
          Morning cells show unit/division deployment · Evening cells show route
        </span>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
          <div className="spinner" />
        </div>
      ) : allDrivers.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 56,
            color: "var(--text-muted)",
            fontSize: 14,
            background: "var(--surface)",
            borderRadius: 16,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          No schedule data for this week.
          <br />
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>
            Click <strong style={{ color: "var(--text)" }}>Generate Schedule</strong> to create one.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[...byTeam.entries()].map(([teamId, { name: teamName, drivers }]) => {
            const dom = dominantShift(drivers);
            const ds = SHIFT_STYLE[dom];

            return (
              <div
                key={teamId}
                style={{
                  background: "var(--surface)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: "var(--text)",
                    }}
                  >
                    👥 {teamName}
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 12px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: ds.bg,
                      color: ds.text,
                      border: `1px solid ${ds.border}`,
                    }}
                  >
                    {ds.icon} {ds.label} this week
                  </span>

                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                    }}
                  >
                    {drivers.length} driver{drivers.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {renderDriverTable(drivers)}
              </div>
            );
          })}

          {noTeam.length > 0 && (
            <div
              style={{
                background: "var(--surface)",
                borderRadius: 16,
                border: "1px dashed var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--text-muted)",
                  }}
                >
                  ⚠️ No Team Assigned
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {noTeam.length} driver{noTeam.length !== 1 ? "s" : ""}
                </span>
              </div>

              {renderDriverTable(noTeam)}
            </div>
          )}
        </div>
      )}

      {/* Generate modal */}
      {showGen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowGen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 500,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                  Generate Schedule
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 3,
                  }}
                >
                  Team-based cycle + deployment grouping + route visibility
                </div>
              </div>

              <button
                onClick={() => setShowGen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Plan Name</label>
                <input
                  className="tms-input"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    className="tms-input"
                    value={genStart}
                    onChange={(e) => setGenStart(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">End Date</label>
                  <input
                    type="date"
                    className="tms-input"
                    value={genEnd}
                    onChange={(e) => setGenEnd(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--surface-2)",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--text)",
                    marginBottom: 8,
                  }}
                >
                  Morning deployment quota
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[
                    ["Joy News", "3"],
                    ["Adom News", "2"],
                    ["Joy Business", "1"],
                    ["Production", "rest"],
                  ].map(([name, count]) => {
                    const c = getDeploymentColors(name)!;
                    return (
                      <span
                        key={name}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          background: c.bg,
                          color: c.text,
                        }}
                      >
                        {name} → {count}
                      </span>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--text-dim)",
                    lineHeight: 1.6,
                  }}
                >
                  Morning deployments may include units and divisions where applicable.
                  Evening rows will show assigned route names.
                </div>
              </div>

              {genResult && (
                <div className="alert alert-success">
                  <span>{genResult}</span>
                </div>
              )}

              {error && (
                <div className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button className="btn btn-ghost" onClick={() => setShowGen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={generate} disabled={genSaving}>
                {genSaving ? "Generating…" : "⚡ Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift override modal */}
      {overrideModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setOverrideModal(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 420,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              marginBottom: 8,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                  Override Shift
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  {overrideModal.driver_name} · {overrideModal.shift_date}
                </div>
              </div>

              <button
                onClick={() => setOverrideModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">New Shift</label>

                <div style={{ display: "flex", gap: 8 }}>
                  {SHIFT_CODES.map((code) => {
                    const s = SHIFT_STYLE[code];
                    const active = overrideCode === code;

                    return (
                      <button
                        key={code}
                        onClick={() => setOverrideCode(code)}
                        style={{
                          flex: 1,
                          padding: "12px 8px",
                          borderRadius: 12,
                          cursor: "pointer",
                          border: `2px solid ${active ? s.border : "var(--border)"}`,
                          background: active ? s.bg : "var(--surface-2)",
                          color: active ? s.text : "var(--text-muted)",
                          fontWeight: 700,
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="form-label">
                  Reason <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="tms-input"
                  placeholder="e.g. Medical leave, swap request..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>

              {error && (
                <div className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button className="btn btn-ghost" onClick={() => setOverrideModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={applyOverride}
                disabled={overrideSaving}
              >
                {overrideSaving ? "Saving…" : "Apply Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route swap modal */}
      {routeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setRouteModal(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 420,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                Temporary Route Swap
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                {routeModal.driver_name} · {routeModal.shift_date}
              </div>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Evening Route</label>
                <select
                  className="tms-select"
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                >
                  <option value="">Select route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">
                  Reason <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="tms-input"
                  value={routeReason}
                  onChange={(e) => setRouteReason(e.target.value)}
                  placeholder="e.g. temporary swap"
                />
              </div>
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button className="btn btn-ghost" onClick={() => setRouteModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={applyRouteSwap}
                disabled={routeSaving || !selectedRouteId}
              >
                {routeSaving ? "Saving…" : "Apply Route Swap"}
              </button>
            </div>
          </div>
        </div>
      )}

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