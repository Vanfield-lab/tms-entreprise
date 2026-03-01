// src/modules/shifts/pages/ScheduleManager.tsx
// Full driver schedule management: auto-generate, week/month grid, override, export
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type ShiftRow = {
  driver_id: string;
  driver_name: string;
  license_number: string;
  shift_date: string;
  effective_shift_code: string;
  base_shift_code: string;
  override_shift_code: string | null;
  shift_label: string;
  start_time: string | null;
  end_time: string | null;
  color_class: string;
  is_working: boolean;
  is_overridden: boolean;
};

type ShiftConfig = {
  shift_code: string;
  shift_label: string;
  start_time: string | null;
  end_time: string | null;
  color_class: string;
  is_working: boolean;
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

// Color map for shift codes
const SHIFT_COLORS: Record<string, string> = {
  A:    "bg-amber-100 text-amber-800 border-amber-200",
  B:    "bg-blue-100 text-blue-800 border-blue-200",
  C:    "bg-violet-100 text-violet-800 border-violet-200",
  D:    "bg-cyan-100 text-cyan-800 border-cyan-200",
  OFF:  "bg-gray-100 text-gray-500 border-gray-200",
  REST: "bg-gray-50 text-gray-400 border-gray-100",
};

const SHIFT_LABELS: Record<string, string> = {
  A: "Morning 06–14",
  B: "Afternoon 14–22",
  C: "Night 22–06",
  D: "Standby 08–16",
  OFF: "Day Off",
  REST: "Rest",
};

const CODES = ["A", "B", "C", "D", "OFF", "REST"];

function getWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

export default function ScheduleManager() {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [configs, setConfigs] = useState<ShiftConfig[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<"week" | "list">("week");
  const [driverFilter, setDriverFilter] = useState("all");
  const [override, setOverride] = useState<OverrideModal>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genStart, setGenStart] = useState(fmtDate(new Date()));
  const [genEnd, setGenEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 90); return fmtDate(d);
  });
  const [genName, setGenName] = useState("Auto Schedule");
  const [genSaving, setGenSaving] = useState(false);
  const [genResult, setGenResult] = useState<{ shifts_generated: number } | null>(null);

  const weekDates = getWeekDates(anchor);
  const weekStart = fmtDate(weekDates[0]);
  const weekEnd = fmtDate(weekDates[6]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
      supabase
        .from("v_driver_shifts_full")
        .select("*")
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .order("driver_name")
        .order("shift_date"),
      supabase.from("driver_schedule_config").select("*").order("shift_code"),
      supabase
        .from("driver_schedule_plans")
        .select("id,plan_name,start_date,end_date,generated_at")
        .order("generated_at", { ascending: false })
        .limit(10),
    ]);
    setShifts((s as ShiftRow[]) || []);
    setConfigs((c as ShiftConfig[]) || []);
    setPlans((p as Plan[]) || []);
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  // Drivers unique list
  const drivers = [...new Map(shifts.map((s) => [s.driver_id, { id: s.driver_id, name: s.driver_name }])).values()];

  // Build grid: { driver_id: { date: ShiftRow } }
  const grid: Record<string, Record<string, ShiftRow>> = {};
  for (const s of shifts) {
    if (!grid[s.driver_id]) grid[s.driver_id] = {};
    grid[s.driver_id][s.shift_date] = s;
  }

  const filteredDrivers = driverFilter === "all" ? drivers : drivers.filter((d) => d.id === driverFilter);

  // Today's coverage stats
  const today = fmtDate(new Date());
  const todayShifts = shifts.filter((s) => s.shift_date === today);
  const workingToday = todayShifts.filter((s) => s.is_working).length;
  const offToday = todayShifts.filter((s) => !s.is_working).length;

  const applyOverride = async () => {
    if (!override || !overrideCode) return;
    setOverrideSaving(true);
    try {
      await supabase.rpc("override_shift", {
        p_driver_id: override.driver_id,
        p_shift_date: override.shift_date,
        p_new_shift_code: overrideCode,
        p_reason: overrideReason || null,
      });
      setOverride(null);
      setOverrideCode("");
      setOverrideReason("");
      await load();
    } finally {
      setOverrideSaving(false);
    }
  };

  const generateSchedule = async () => {
    setGenSaving(true);
    try {
      const { data, error } = await supabase.rpc("rpc_generate_schedule", {
        p_start_date: genStart,
        p_end_date: genEnd,
        p_plan_name: genName,
        p_notes: null,
      });
      if (error) throw error;
      setGenResult(data as any);
      await load();
    } catch (e: any) {
      alert(`Schedule generation failed: ${e.message}`);
    } finally {
      setGenSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Driver Schedule</h1>
          <p className="page-sub">Auto-generated rotating shift schedule</p>
        </div>
        <button
          onClick={() => { setShowGenerate(true); setGenResult(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Generate Schedule
        </button>
      </div>

      {/* Today's stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="On Duty Today" value={workingToday} color="text-emerald-600" />
        <StatCard label="Off / Rest Today" value={offToday} color="text-gray-500" />
        <StatCard label="Total Drivers" value={drivers.length} color="text-gray-900" />
        <StatCard label="Schedule Plans" value={plans.length} color="text-blue-600" />
      </div>

      {/* Shift legend */}
      <div className="flex flex-wrap gap-2">
        {CODES.map((c) => (
          <span key={c} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${SHIFT_COLORS[c]}`}>
            <span className="font-mono font-bold">{c}</span>
            <span className="opacity-70">{SHIFT_LABELS[c]}</span>
          </span>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Week navigation */}
        <button
          onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >←</button>
        <span className="text-sm font-medium text-gray-700 px-2">
          {weekDates[0].toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {weekDates[6].toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        <button
          onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >→</button>
        <button
          onClick={() => setAnchor(new Date())}
          className="px-3 py-2 text-xs border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600"
        >
          Today
        </button>

        <div className="ml-auto flex gap-2 items-center">
          <select
            className="tms-select text-sm"
            style={{ maxWidth: 200 }}
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
          >
            <option value="all">All Drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Week Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden md:block overflow-x-auto">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden min-w-[700px]">
              {/* Header row */}
              <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}>
                <div className="px-4 py-3 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-100">Driver</div>
                {weekDates.map((d) => {
                  const isToday = fmtDate(d) === today;
                  return (
                    <div key={fmtDate(d)} className={`px-2 py-3 text-center text-xs font-semibold ${isToday ? "bg-black text-white" : "bg-gray-50 text-gray-600"}`}>
                      <div>{d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                      <div className={`text-base font-bold ${isToday ? "text-white" : "text-gray-900"}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Driver rows */}
              {filteredDrivers.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-gray-400">No schedule data for this week.</div>
              ) : (
                filteredDrivers.map((driver, i) => (
                  <div key={driver.id} className={`grid border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors`} style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}>
                    <div className="px-4 py-3 border-r border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{driver.name}</p>
                    </div>
                    {weekDates.map((d) => {
                      const dateStr = fmtDate(d);
                      const shift = grid[driver.id]?.[dateStr];
                      const code = shift?.effective_shift_code ?? "—";
                      const isOverridden = shift?.is_overridden;
                      return (
                        <div
                          key={dateStr}
                          className="px-1 py-2 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            setOverride({ driver_id: driver.id, driver_name: driver.name, shift_date: dateStr, current_code: code });
                            setOverrideCode(code !== "—" ? code : "");
                          }}
                          title={shift ? `${SHIFT_LABELS[code] ?? code}${isOverridden ? " (overridden)" : ""}` : "No shift"}
                        >
                          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border text-xs font-bold relative ${code !== "—" ? SHIFT_COLORS[code] : "bg-gray-50 text-gray-300 border-gray-100"}`}>
                            {code}
                            {isOverridden && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" title="Override applied" />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filteredDrivers.map((driver) => (
              <div key={driver.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-900">{driver.name}</p>
                </div>
                <div className="px-4 py-3 grid grid-cols-7 gap-1">
                  {weekDates.map((d) => {
                    const dateStr = fmtDate(d);
                    const shift = grid[driver.id]?.[dateStr];
                    const code = shift?.effective_shift_code ?? "—";
                    const isToday = dateStr === today;
                    return (
                      <div
                        key={dateStr}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                        onClick={() => {
                          setOverride({ driver_id: driver.id, driver_name: driver.name, shift_date: dateStr, current_code: code });
                          setOverrideCode(code !== "—" ? code : "");
                        }}
                      >
                        <span className={`text-[10px] font-medium ${isToday ? "text-black" : "text-gray-400"}`}>
                          {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                        </span>
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold border ${code !== "—" ? SHIFT_COLORS[code] : "bg-gray-50 text-gray-300 border-gray-100"} ${isToday ? "ring-2 ring-black ring-offset-1" : ""}`}>
                          {code}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredDrivers.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400">No schedule data for this week.</div>
            )}
          </div>
        </>
      )}

      {/* Recent plans */}
      {plans.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">Schedule Plans</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {plans.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.plan_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {p.start_date} → {p.end_date}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(p.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Override Modal */}
      {override && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setOverride(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Override Shift</h3>
                <p className="text-xs text-gray-400 mt-0.5">{override.driver_name} · {override.shift_date}</p>
              </div>
              <button onClick={() => setOverride(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Current: <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${SHIFT_COLORS[override.current_code] ?? "bg-gray-100 text-gray-500"}`}>{override.current_code}</span></p>
                <p className="text-xs font-medium text-gray-500 mb-2">Select new shift:</p>
                <div className="grid grid-cols-3 gap-2">
                  {CODES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setOverrideCode(c)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        overrideCode === c
                          ? SHIFT_COLORS[c] + " ring-2 ring-black ring-offset-1"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <div>{c}</div>
                      <div className="text-[9px] opacity-60 font-normal mt-0.5">
                        {c === "A" ? "06-14" : c === "B" ? "14-22" : c === "C" ? "22-06" : c === "D" ? "08-16" : c === "OFF" ? "Off" : "Rest"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">Reason (optional)</label>
                <input
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. Emergency cover, Medical leave"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={() => setOverride(null)} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={applyOverride}
                  disabled={!overrideCode || overrideSaving}
                  className="py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
                >
                  {overrideSaving ? "Saving…" : "Apply Override"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Schedule Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Generate Schedule</h3>
                <p className="text-xs text-gray-400 mt-0.5">Auto-generate fair rotating shifts for all active drivers</p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {genResult ? (
                <div className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-900">Schedule Generated!</p>
                  <p className="text-sm text-gray-500">
                    <span className="font-bold text-black">{genResult.shifts_generated}</span> shift entries created
                  </p>
                  <p className="text-xs text-gray-400">Manual overrides were preserved.</p>
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-6 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* How it works info */}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-blue-700">How the algorithm works</p>
                    <p className="text-xs text-blue-600">
                      Each driver is assigned a staggered 6-day rotating cycle (Morning → Afternoon → Night → Standby → Off → Rest).
                      Starting positions are offset so all shifts are covered every day. Manual overrides are never overwritten.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500">Schedule Name</label>
                    <input
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      value={genName}
                      onChange={(e) => setGenName(e.target.value)}
                      placeholder="e.g. March 2025 Schedule"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Start Date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                        value={genStart}
                        onChange={(e) => setGenStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">End Date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                        value={genEnd}
                        onChange={(e) => setGenEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button onClick={() => setShowGenerate(false)} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={generateSchedule}
                      disabled={!genStart || !genEnd || genSaving}
                      className="py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                      {genSaving ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating…
                        </span>
                      ) : "Generate Now"}
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}