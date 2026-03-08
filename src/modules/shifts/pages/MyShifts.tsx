// src/modules/shifts/pages/MyShifts.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Card } from "@/components/TmsUI";

type ShiftEntry = {
  shift_date: string;
  shift_code: string;
  is_override: boolean;
  team_name: string | null;
  cell_label: string | null;
  department_name: string | null;
  evening_route_name: string | null;
};

const SHIFT_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  morning: { bg: "var(--amber-dim)", color: "var(--amber)", label: "Morning", icon: "🌅" },
  evening: { bg: "var(--accent-dim)", color: "var(--accent)", label: "Evening", icon: "🌆" },
  off:     { bg: "var(--surface-2)", color: "var(--text-dim)", label: "Off Duty", icon: "😴" },
};

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function MyShifts() {
  const [schedule, setSchedule] = useState<Record<string, ShiftEntry>>({});
  const [loading, setLoading] = useState(true);
  const [calStart, setCalStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  const today = fmt(new Date());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: dr } = await supabase.from("drivers").select("id").eq("user_id", user.id).single();
      const driverId = (dr as any)?.id;
      if (!driverId) { setLoading(false); return; }

      // Load 3 months of schedule
      const start = new Date(); start.setMonth(start.getMonth() - 1); start.setDate(1);
      const end = new Date(); end.setMonth(end.getMonth() + 2); end.setDate(0);

      const { data } = await supabase.from("v_schedule_calendar")
        .select("shift_date,shift_code,is_override,team_name,cell_label,department_name,evening_route_name")
        .eq("driver_id", driverId)
        .gte("shift_date", fmt(start))
        .lte("shift_date", fmt(end))
        .order("shift_date");

      const map: Record<string, ShiftEntry> = {};
      for (const row of (data as ShiftEntry[]) || []) {
        map[row.shift_date] = row;
      }
      setSchedule(map);
      setLoading(false);
    })();
  }, []);

  // Build calendar days for current month view
  const year = calStart.getFullYear();
  const month = calStart.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calCells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(new Date(year, month, d));

  const todayEntry = schedule[today];

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">My Shifts</h1>
      </div>

      {/* Today's duty card */}
      <Card>
        <div className="p-4">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>TODAY'S DUTY</p>
          {todayEntry ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: SHIFT_STYLES[todayEntry.shift_code]?.bg ?? "var(--surface-2)" }}>
                {SHIFT_STYLES[todayEntry.shift_code]?.icon ?? "📋"}
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: SHIFT_STYLES[todayEntry.shift_code]?.color ?? "var(--text)" }}>
                  {SHIFT_STYLES[todayEntry.shift_code]?.label ?? todayEntry.shift_code}
                </p>
                {todayEntry.cell_label && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>{todayEntry.cell_label}</p>
                )}
                {todayEntry.team_name && (
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Team {todayEntry.team_name}</p>
                )}
                {todayEntry.is_override && (
                  <span className="text-xs px-2 py-0.5 rounded mt-1 inline-block"
                    style={{ background: "var(--amber-dim)", color: "var(--amber)" }}>Override</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "var(--surface-2)" }}>📅</div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No schedule found for today</p>
            </div>
          )}
        </div>
      </Card>

      {/* Calendar navigation */}
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost btn-sm"
          onClick={() => { const d = new Date(calStart); d.setMonth(d.getMonth()-1); setCalStart(d); }}>
          ← Prev
        </button>
        <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
          {MONTHS[month]} {year}
        </p>
        <button className="btn btn-ghost btn-sm"
          onClick={() => { const d = new Date(calStart); d.setMonth(d.getMonth()+1); setCalStart(d); }}>
          Next →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card p-3">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold py-1"
              style={{ color: "var(--text-dim)" }}>{d}</div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 gap-1">
          {calCells.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />;
            const ds = fmt(d);
            const entry = schedule[ds];
            const isToday = ds === today;
            const style = entry ? SHIFT_STYLES[entry.shift_code] : null;

            return (
              <div key={ds}
                className="rounded-xl flex flex-col items-center justify-center min-h-[52px] p-1 text-center relative"
                style={{
                  background: style?.bg ?? (isToday ? "var(--accent-dim)" : "transparent"),
                  border: isToday ? `2px solid var(--accent)` : "2px solid transparent",
                }}>
                <span className="text-xs font-bold" style={{ color: isToday ? "var(--accent)" : "var(--text-muted)" }}>
                  {d.getDate()}
                </span>
                {entry ? (
                  <>
                    <span className="text-base leading-none">{style?.icon}</span>
                    <span className="text-xs leading-none mt-0.5 font-medium" style={{ color: style?.color, fontSize: 9 }}>
                      {style?.label ?? entry.shift_code}
                    </span>
                    {entry.is_override && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--amber)" }} title="Override" />
                    )}
                  </>
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-dim)", fontSize: 9 }}>—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(SHIFT_STYLES).map(([code, s]) => (
          <div key={code} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded" style={{ background: s.bg, border: `1px solid ${s.color}` }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full" style={{ background: "var(--amber)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Override</span>
        </div>
      </div>

      {/* Upcoming list */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>UPCOMING 7 DAYS</p>
        <div className="space-y-1">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() + i);
            const ds = fmt(d);
            const entry = schedule[ds];
            const style = entry ? SHIFT_STYLES[entry.shift_code] : null;
            return (
              <div key={ds} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: ds === today ? "var(--accent-dim)" : "var(--surface-2)" }}>
                <div className="w-8 text-center">
                  <p className="text-xs font-bold" style={{ color: ds === today ? "var(--accent)" : "var(--text)" }}>
                    {DAYS[d.getDay()]}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>{d.getDate()}</p>
                </div>
                {entry ? (
                  <>
                    <span className="text-lg">{style?.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: style?.color }}>{style?.label}</p>
                      {entry.cell_label && entry.cell_label !== style?.label && (
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{entry.cell_label}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-dim)" }}>No schedule</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}